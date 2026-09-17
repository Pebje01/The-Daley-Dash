/**
 * Claude aanroepen via de lokale CLI in plaats van via de API.
 *
 * Waarom: de CLI draait op het Claude-abonnement, niet op API-credits, en
 * heeft WebSearch en WebFetch al aan boord. Dat laatste is precies wat we
 * nodig hebben om de website van een lead op te zoeken en te lezen.
 *
 * Voorwaarde: de Dash draait lokaal op de Mac waar `claude` is ingelogd.
 * Op een server werkt dit niet, daar zou je alsnog een API-key nodig hebben.
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'

/** Standaardmodel. Overschrijf met CLAUDE_CLI_MODEL in .env.local. */
const STANDAARD_MODEL = 'claude-sonnet-5'

/**
 * De Dash draait als LaunchAgent en erft dan een kale PATH zonder ~/.local/bin.
 * Daarom zoeken we het binary zelf op in plaats van te vertrouwen op PATH.
 * Staat hij ergens anders, zet dan CLAUDE_CLI_PATH in .env.local.
 */
export function zoekClaude(): string {
  if (process.env.CLAUDE_CLI_PATH) return process.env.CLAUDE_CLI_PATH
  const kandidaten = [
    join(homedir(), '.local/bin/claude'),
    join(homedir(), '.claude/local/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ]
  return kandidaten.find((p) => existsSync(p)) || 'claude'
}

export interface ClaudeCliOpties {
  prompt: string
  /** JSON Schema dat het antwoord moet volgen. De CLI dwingt dit af. */
  schema: Record<string, unknown>
  systemPrompt?: string
  /** Bijvoorbeeld ['WebSearch', 'WebFetch']. Leeg = geen tools, puur tekst. */
  tools?: string[]
  model?: string
  /** Harde afbreekgrens in ms. Een websitecheck duurt al gauw een minuut. */
  timeoutMs?: number
}

export class ClaudeCliError extends Error {}

/**
 * Draait `claude -p` en geeft het gevalideerde JSON-antwoord terug.
 *
 * Draait bewust vanuit de tmp-map: zo pikt de CLI de CLAUDE.md van dit project
 * niet op. Die staat vol instructies over facturen en offertes en heeft hier
 * niets te zoeken, kost alleen tokens en leidt af.
 */
export async function vraagClaude<T>({
  prompt,
  schema,
  systemPrompt,
  tools = [],
  model,
  timeoutMs = 5 * 60_000,
}: ClaudeCliOpties): Promise<T> {
  const args = [
    '-p',
    prompt,
    '--model',
    model || process.env.CLAUDE_CLI_MODEL || STANDAARD_MODEL,
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(schema),
    // Geen MCP-servers: die laden tientallen tool-definities die we hier niet
    // gebruiken en die het antwoord alleen maar trager maken.
    '--strict-mcp-config',
  ]

  if (systemPrompt) args.push('--append-system-prompt', systemPrompt)
  if (tools.length) args.push('--allowed-tools', ...tools)

  const rauw = await draai(args, timeoutMs)

  let envelop: any
  try {
    envelop = JSON.parse(rauw)
  } catch {
    throw new ClaudeCliError(`Onleesbaar antwoord van de Claude CLI: ${rauw.slice(0, 300)}`)
  }

  if (envelop.is_error || envelop.subtype !== 'success') {
    throw new ClaudeCliError(
      `Claude CLI gaf een fout terug (${envelop.subtype || 'onbekend'}): ${
        typeof envelop.result === 'string' ? envelop.result.slice(0, 300) : ''
      }`
    )
  }

  try {
    return JSON.parse(envelop.result) as T
  } catch {
    throw new ClaudeCliError(
      `Antwoord voldeed niet aan het schema: ${String(envelop.result).slice(0, 300)}`
    )
  }
}

function draai(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proces = spawn(zoekClaude(), args, {
      cwd: tmpdir(),
      env: {
        ...process.env,
        // De Dash draait zelf mogelijk al binnen een Claude-sessie. Zonder dit
        // denkt de CLI dat hij genest draait en gedraagt hij zich anders.
        CLAUDECODE: '',
        CLAUDE_CODE_ENTRYPOINT: 'daley-dash',
      },
    })

    let stdout = ''
    let stderr = ''
    let afgebroken = false

    const klok = setTimeout(() => {
      afgebroken = true
      proces.kill('SIGKILL')
    }, timeoutMs)

    proces.stdout.on('data', (d) => {
      stdout += d
    })
    proces.stderr.on('data', (d) => {
      stderr += d
    })

    proces.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(klok)
      if (err.code === 'ENOENT') {
        reject(
          new ClaudeCliError(
            `De claude CLI is niet gevonden op ${zoekClaude()}. Zet CLAUDE_CLI_PATH in .env.local.`
          )
        )
      } else {
        reject(new ClaudeCliError(`Kon de claude CLI niet starten: ${err.message}`))
      }
    })

    proces.on('close', (code) => {
      clearTimeout(klok)
      if (afgebroken) {
        reject(new ClaudeCliError(`Duurde langer dan ${Math.round(timeoutMs / 1000)} seconden`))
        return
      }
      if (code !== 0) {
        reject(new ClaudeCliError(stderr.trim().slice(0, 300) || `Afgesloten met code ${code}`))
        return
      }
      resolve(stdout.trim())
    })
  })
}
