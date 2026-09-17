/**
 * De motor van de assistent: één chatbericht = één run van de lokale claude CLI.
 *
 * Draait op het Claude-abonnement, net als de leadkwalificatie
 * (lib/ai/claude-cli.ts). Verschil: hier streamt het antwoord mee, loopt het
 * gesprek door via --resume, en krijgt Claude uitsluitend de Dash-acties uit
 * scripts/dash-mcp.mjs. Alle ingebouwde tools (Bash, Read, Edit, WebFetch...)
 * staan uit met --tools "", dus hij kan geen code of bestanden aanraken.
 */
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { zoekClaude } from '@/lib/ai/claude-cli'

export type AssistentEvent =
  | { type: 'tekst'; delta: string }
  | { type: 'actie'; label: string }
  | { type: 'voorstel'; voorstelId: string }

export type Segment = { soort: 'tekst'; tekst: string } | { soort: 'voorstel'; voorstelId: string }

export interface RunResultaat {
  sessieId: string | null
  segmenten: Segment[]
  fout?: string
}

const STANDAARD_MODEL = 'claude-sonnet-5'
const TIMEOUT_MS = 5 * 60_000

/** Wat Daley ziet terwijl een actie loopt. */
const ACTIE_LABELS: Record<string, string> = {
  zoek_klant: 'Klant opzoeken',
  open_uren: 'Open uren bekijken',
  open_projecten: 'Projecten bekijken',
  zoek_facturen: 'Facturen zoeken',
  factuur_details: 'Factuur bekijken',
  akkoord_offertes: 'Offertes bekijken',
  stel_factuur_voor: 'Factuur klaarzetten',
  stel_factuurwijziging_voor: 'Wijziging klaarzetten',
  stel_pdf_opnieuw_voor: 'PDF klaarzetten',
  stel_koppeling_voor: 'Koppeling klaarzetten',
}

function dashUrl() {
  return process.env.DASH_URL || `http://127.0.0.1:${process.env.PORT || 3003}`
}

export async function draaiAssistent(opties: {
  bericht: string
  instructies: string
  gesprekId: string
  sessieId?: string | null
  onEvent: (e: AssistentEvent) => void
  signal?: AbortSignal
}): Promise<RunResultaat> {
  // De MCP-config bevat het script-geheim, dus niet als argument (zichtbaar in
  // ps) maar als bestand dat alleen deze gebruiker kan lezen.
  const configPad = join(tmpdir(), `dash-assistent-${randomUUID()}.json`)
  await writeFile(configPad, JSON.stringify({
    mcpServers: {
      dash: {
        command: process.execPath,
        args: [join(process.cwd(), 'scripts/dash-mcp.mjs')],
        env: {
          DASH_URL: dashUrl(),
          DASH_SECRET: process.env.CRON_SECRET ?? '',
          DASH_GESPREK_ID: opties.gesprekId,
        },
      },
    },
  }), { mode: 0o600 })

  try {
    const eerste = await run({ ...opties, configPad })
    // Een sessie die de CLI niet meer kent (opgeruimd, andere Mac): opnieuw
    // beginnen in plaats van het gesprek te laten vastlopen.
    if (opties.sessieId && eerste.fout && /no conversation found/i.test(eerste.fout) && !eerste.segmenten.length) {
      return run({ ...opties, sessieId: null, configPad })
    }
    return eerste
  } finally {
    await unlink(configPad).catch(() => {})
  }
}

function run(opties: {
  bericht: string
  instructies: string
  sessieId?: string | null
  configPad: string
  onEvent: (e: AssistentEvent) => void
  signal?: AbortSignal
}): Promise<RunResultaat> {
  const args = [
    '-p', opties.bericht,
    '--model', process.env.ASSISTENT_MODEL || process.env.CLAUDE_CLI_MODEL || STANDAARD_MODEL,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--append-system-prompt', opties.instructies,
    '--mcp-config', opties.configPad,
    '--strict-mcp-config',
    '--tools', '',
    '--allowed-tools', 'mcp__dash',
  ]
  if (opties.sessieId) args.push('--resume', opties.sessieId)

  return new Promise((resolve) => {
    // Vanuit de tmp-map, zodat de CLAUDE.md van dit project niet meegeladen wordt
    const proces = spawn(zoekClaude(), args, {
      cwd: tmpdir(),
      env: {
        ...process.env,
        CLAUDECODE: '',
        CLAUDE_CODE_ENTRYPOINT: 'daley-dash-assistent',
        // Alle Dash-acties direct beschikbaar, niet eerst via een zoekstap
        ENABLE_TOOL_SEARCH: 'false',
      },
    })

    const segmenten: Segment[] = []
    const toolNamen = new Map<string, string>()
    let sessieId: string | null = opties.sessieId ?? null
    let fout: string | undefined
    let buffer = ''
    let stderr = ''
    let klaar = false

    const voegTekstToe = (delta: string) => {
      const laatste = segmenten[segmenten.length - 1]
      if (laatste?.soort === 'tekst') laatste.tekst += delta
      else segmenten.push({ soort: 'tekst', tekst: delta })
      opties.onEvent({ type: 'tekst', delta })
    }

    const verwerk = (regel: string) => {
      let d: any
      try { d = JSON.parse(regel) } catch { return }

      if (d.session_id) sessieId = d.session_id

      if (d.type === 'stream_event') {
        const ev = d.event
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          voegTekstToe(ev.delta.text)
        } else if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          const kort = String(ev.content_block.name).replace(/^mcp__dash__/, '')
          opties.onEvent({ type: 'actie', label: ACTIE_LABELS[kort] ?? kort })
        } else if (ev?.type === 'message_start') {
          // Nieuwe beurt na een actie: tekst niet aan de vorige zin plakken
          const laatste = segmenten[segmenten.length - 1]
          if (laatste?.soort === 'tekst' && !/\s$/.test(laatste.tekst)) voegTekstToe('\n\n')
        }
      } else if (d.type === 'assistant') {
        for (const blok of d.message?.content ?? []) {
          if (blok.type === 'tool_use') toolNamen.set(blok.id, String(blok.name).replace(/^mcp__dash__/, ''))
        }
      } else if (d.type === 'user') {
        for (const blok of d.message?.content ?? []) {
          if (blok?.type !== 'tool_result') continue
          const naam = toolNamen.get(blok.tool_use_id)
          if (!naam?.startsWith('stel_') || blok.is_error) continue
          const tekst = Array.isArray(blok.content) ? blok.content.map((c: any) => c.text ?? '').join('') : String(blok.content ?? '')
          const voorstelId = tekst.match(/"voorstelId":\s*"([0-9a-f-]{36})"/)?.[1]
          if (voorstelId) {
            segmenten.push({ soort: 'voorstel', voorstelId })
            opties.onEvent({ type: 'voorstel', voorstelId })
          }
        }
      } else if (d.type === 'result') {
        if (d.is_error || d.subtype !== 'success') {
          fout = typeof d.result === 'string' && d.result ? d.result : `Claude stopte (${d.subtype ?? 'onbekend'})`
        }
      }
    }

    const klok = setTimeout(() => {
      fout = 'Dit duurde langer dan 5 minuten en is afgebroken'
      proces.kill('SIGKILL')
    }, TIMEOUT_MS)

    const stop = () => {
      fout = fout ?? 'Afgebroken'
      proces.kill('SIGTERM')
    }
    opties.signal?.addEventListener('abort', stop)

    proces.stdout.on('data', (chunk) => {
      buffer += chunk
      let i: number
      while ((i = buffer.indexOf('\n')) >= 0) {
        const regel = buffer.slice(0, i).trim()
        buffer = buffer.slice(i + 1)
        if (regel) verwerk(regel)
      }
    })
    proces.stderr.on('data', (chunk) => { stderr += chunk })

    const afronden = () => {
      if (klaar) return
      klaar = true
      clearTimeout(klok)
      opties.signal?.removeEventListener('abort', stop)
      if (buffer.trim()) verwerk(buffer.trim())
      resolve({ sessieId, segmenten, fout })
    }

    proces.on('error', (err: NodeJS.ErrnoException) => {
      fout = err.code === 'ENOENT'
        ? `De claude CLI is niet gevonden op ${zoekClaude()}. Zet CLAUDE_CLI_PATH in .env.local.`
        : `Kon Claude niet starten: ${err.message}`
      afronden()
    })
    proces.on('close', (code) => {
      if (code !== 0 && !fout) fout = stderr.trim().slice(0, 300) || `Claude stopte met code ${code}`
      afronden()
    })
  })
}
