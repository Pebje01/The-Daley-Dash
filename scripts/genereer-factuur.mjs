#!/usr/bin/env node
/**
 * CLI om een TDE / Daley Photography factuur-PDF te genereren met exact dezelfde
 * opmaak als The Daley Dash. Beide gebruiken lib/pdf/factuurTemplate.mjs, dus er
 * is één ontwerp dat niet uit elkaar loopt.
 *
 * Gebruik:
 *   node scripts/genereer-factuur.mjs <input.json>
 *   cat input.json | node scripts/genereer-factuur.mjs -
 *
 * input.json:
 * {
 *   "company": "tde" | "daleyphotography",
 *   "factuurnummer": "F-260703-01",
 *   "klant": { "bedrijfsnaam": "...", "contactpersoon": "...", "adres": "...",
 *              "postcode": "1234AB", "stad": "...", "klantnummer": "..." },
 *   "regels": [ { "omschrijving": "...", "detail": "...", "datum": "2026-06-01",
 *                 "aantal": 1, "prijsPerStuk": 100, "perUur": false } ],
 *   "factuurdatum": "2026-07-03",
 *   "vervaldatum": "2026-07-17",
 *   "betaallink": "https://betaalverzoek.knab.nl/...",   // optioneel
 *   "btwPercentage": 21,
 *   "klantNaamVoorBestand": "Fitness de Kloek",
 *   "betaaldSuffix": "",           // optioneel, bv " betaling voldaan 12-02-2026"
 *   "open": true                    // optioneel, PDF na afloop openen (default true)
 * }
 *
 * Print het pad van de opgeslagen PDF naar stdout.
 */
import { readFile, writeFile, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { exec } from 'child_process'
import { GENERIC_COMPANY_CONFIG, buildFactuurHtml } from '../lib/pdf/factuurTemplate.mjs'

async function leesInput() {
  const arg = process.argv[2]
  if (!arg) throw new Error('Geef een input-JSON pad mee, of "-" voor stdin.')
  if (arg === '-') {
    const chunks = []
    for await (const c of process.stdin) chunks.push(c)
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  }
  return JSON.parse(await readFile(arg, 'utf-8'))
}

const p = await leesInput()
const cfg = GENERIC_COMPANY_CONFIG[p.company]
if (!cfg) throw new Error(`Onbekend bedrijf: ${p.company} (kies tde of daleyphotography)`)

const daleyWerkRoot = process.env.DALEY_WERK_ROOT ?? `${homedir()}/Documents/DALEY WERK`
const verkoopfacturenBase = `${daleyWerkRoot}/Bedrijf Administratie/Verkoopfacturen`

// Alle bedrijven hebben hun logo ingebed in factuurTemplate.mjs (cfg.logoOverride).
// Het uit een HTML-bestand lezen is er bewust uit: dat bestand werd bij elke
// generatie overschreven, waardoor het logo een keer verdween.
const logoSrc = cfg.logoOverride
if (!logoSrc) {
  throw new Error(`Geen logo voor ${cfg.naam}. Zet het als data-URI in lib/pdf en koppel het aan logoOverride.`)
}

const html = buildFactuurHtml({
  cfg,
  factuurnummer: p.factuurnummer,
  klant: p.klant,
  regels: p.regels,
  factuurdatum: p.factuurdatum,
  vervaldatum: p.vervaldatum,
  betaallink: p.betaallink,
  btwPercentage: p.btwPercentage ?? 21,
  logoSrc,
})

// Werkbestand voor Chrome, in de cachemap en NIET in het factuurarchief: daar
// horen alleen PDF's te staan. Zelfde plek als The Daley Dash gebruikt.
const werkMap = `${homedir()}/Library/Caches/daley-dash`
await mkdir(werkMap, { recursive: true })
const previewFile = `${werkMap}/${cfg.templateFile}`
await writeFile(previewFile, html, 'utf-8')

const datum = new Date(`${p.factuurdatum}T12:00:00`)
const jaar = datum.getFullYear()
const kwartaal = Math.ceil((datum.getMonth() + 1) / 3)
const pdfDir = `${verkoopfacturenBase}/${jaar}-Q${kwartaal}`
await mkdir(pdfDir, { recursive: true })
const suffix = p.betaaldSuffix ?? ''
const pdfPath = `${pdfDir}/${p.factuurnummer} ${p.klantNaamVoorBestand}${suffix}.pdf`

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
await new Promise((resolve) => {
  exec(`"${chrome}" --headless=new --disable-gpu --no-margins --virtual-time-budget=10000 --run-all-compositor-stages-before-draw --print-to-pdf="${pdfPath}" --no-pdf-header-footer "file://${previewFile}"`, () => resolve())
})

if (p.open !== false) exec(`open "${pdfPath}"`)

process.stdout.write(pdfPath + '\n')
