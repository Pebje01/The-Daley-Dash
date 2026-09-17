#!/usr/bin/env node
/**
 * Vangnet en backfill voor de AI-kwalificatie van leads.
 *
 * Leads die je in de Dash aanmaakt gaan meteen de wachtrij in. Dit script is
 * er voor de rest: geimporteerde leads, leads die zijn aangemaakt terwijl de
 * Dash stil lag, en eerdere pogingen die zijn mislukt.
 *
 * Praat bewust met de draaiende Dash op 127.0.0.1 in plaats van de logica te
 * dupliceren. Eén implementatie van de kwalificatie, niet twee die uit elkaar
 * groeien.
 *
 * Gebruik:
 *   node scripts/kwalificeer-leads.mjs               # 10 leads, dan klaar
 *   node scripts/kwalificeer-leads.mjs --limit 40    # grotere hap
 *   node scripts/kwalificeer-leads.mjs --watch       # blijft draaien, kijkt elk kwartier
 *   node scripts/kwalificeer-leads.mjs --status      # alleen tellen, niets doen
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASIS = process.env.DASH_URL || 'http://127.0.0.1:3003'

// De Dash vraagt sinds september 2026 om een login. Scripts sturen in plaats
// daarvan het geheim uit .env.local mee (header x-dash-secret, zie
// lib/supabase/middleware.ts). De LaunchAgent erft geen env, dus we lezen het
// bestand zelf als de variabele ontbreekt.
function leesSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET
  try {
    const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local'), 'utf8')
    const m = env.match(/^CRON_SECRET=(.*)$/m)
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
  } catch {
    return ''
  }
}
const DASH_SECRET = leesSecret()

const args = process.argv.slice(2)
const heeft = (vlag) => args.includes(vlag)
const waarde = (vlag, standaard) => {
  const i = args.indexOf(vlag)
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : standaard
}

const LIMIET = waarde('--limit', 10)
const INTERVAL_MIN = waarde('--interval', 15)

async function json(pad, opties = {}) {
  const res = await fetch(`${BASIS}${pad}`, {
    ...opties,
    headers: { ...(opties.headers || {}), 'x-dash-secret': DASH_SECRET },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `${res.status} op ${pad}`)
  return body
}

async function bereikbaar() {
  try {
    await json('/api/crm/leads/kwalificeer')
    return true
  } catch {
    return false
  }
}

async function ronde() {
  const { ingepland, wachtrij } = await json('/api/crm/leads/kwalificeer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alleOnbeoordeelde: true, limiet: LIMIET }),
  })

  if (!ingepland) {
    console.log(`[${nu()}] Niets te doen, alle leads zijn beoordeeld.`)
    return 0
  }

  console.log(`[${nu()}] ${ingepland} leads ingepland (${wachtrij.bezig} bezig).`)

  // Wachten tot de rij leeg is, zodat een --watch-run geen werk stapelt.
  let vorige = -1
  for (;;) {
    await pauze(10_000)
    const { wachtrij: stand } = await json('/api/crm/leads/kwalificeer')
    const open = stand.wachtend + stand.bezig
    if (open === 0) break
    if (open !== vorige) {
      console.log(`[${nu()}] nog ${open} te gaan`)
      vorige = open
    }
  }

  console.log(`[${nu()}] Ronde klaar.`)
  return ingepland
}

const nu = () => new Date().toLocaleTimeString('nl-NL')
const pauze = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  if (!(await bereikbaar())) {
    console.error(
      `De Dash is niet bereikbaar op ${BASIS}. Start hem eerst, of zet DASH_URL goed.`
    )
    process.exit(1)
  }

  if (heeft('--status')) {
    const { wachtrij } = await json('/api/crm/leads/kwalificeer')
    console.log(`Wachtrij: ${wachtrij.wachtend} wachtend, ${wachtrij.bezig} bezig.`)
    return
  }

  if (heeft('--watch')) {
    console.log(`Vangnet actief. Kijkt elke ${INTERVAL_MIN} minuten, max ${LIMIET} per ronde.`)
    for (;;) {
      try {
        await ronde()
      } catch (e) {
        console.error(`[${nu()}] Ronde mislukt: ${e.message}`)
      }
      // Mail met leads: verzonden (uit een concept of zelf geschreven) en reacties. De Dash legt het vast.
      try {
        const { concepten, verstuurd, losseMails, reacties, fouten } = await json('/api/crm/benaderen/controleer', { method: 'POST' })
        if (verstuurd || losseMails || reacties) {
          console.log(`[${nu()}] Mail: ${verstuurd} van ${concepten} concepten verstuurd, ${losseMails} losse mails vastgelegd, ${reacties} nieuwe reacties.`)
        }
        if (fouten?.length) console.error(`[${nu()}] Spark: ${fouten[0]}`)
      } catch (e) {
        console.error(`[${nu()}] Verzonden mail nakijken mislukt: ${e.message}`)
      }
      await pauze(INTERVAL_MIN * 60_000)
    }
  }

  await ronde()
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
