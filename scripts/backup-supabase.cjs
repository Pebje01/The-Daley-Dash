#!/usr/bin/env node
/**
 * Volledige lokale back-up van de Daley Dash Supabase-database.
 *
 * Wat het doet:
 *  - Leest URL + secret key uit .env.local (geen wachtwoord nodig)
 *  - Haalt automatisch alle tabellen op via de OpenAPI-definitie
 *  - Schrijft elke tabel als JSON naar een map met datum en tijd
 *  - Bewaart de laatste 30 back-ups, ruimt oudere automatisch op
 *
 * Draaien: node scripts/backup-supabase.cjs
 */

const fs = require('fs')
const path = require('path')

const PROJECT_DIR = path.resolve(__dirname, '..')
const ENV_PATH = path.join(PROJECT_DIR, '.env.local')
const BACKUP_ROOT = path.join(
  process.env.HOME,
  'Documents/DALEY WERK/Bedrijf Administratie/Supabase-Backups/the-daley-dash'
)
const BEWAAR_AANTAL = 30
const PAGINA_GROOTTE = 1000

function leesEnv(key) {
  const env = fs.readFileSync(ENV_PATH, 'utf8')
  const match = env.match(new RegExp('^' + key + '=(.+)$', 'm'))
  return match ? match[1].trim() : null
}

async function haalAlleRijen(url, key, tabel) {
  const rijen = []
  let van = 0
  for (;;) {
    const tot = van + PAGINA_GROOTTE - 1
    const res = await fetch(`${url}/rest/v1/${tabel}?select=*`, {
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        Range: `${van}-${tot}`,
        'Range-Unit': 'items',
      },
    })
    if (!res.ok) throw new Error(`${tabel}: HTTP ${res.status} ${await res.text()}`)
    const batch = await res.json()
    rijen.push(...batch)
    if (batch.length < PAGINA_GROOTTE) break
    van += PAGINA_GROOTTE
  }
  return rijen
}

function tijdstempel() {
  // Pas de UTC-tijd aan naar lokale tijd via Date is hier niet beschikbaar in workflow,
  // maar in een gewoon Node-proces wel. Format: YYYY-MM-DD_HHMMSS
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function main() {
  const url = leesEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = leesEnv('SUPABASE_SECRET_KEY')
  if (!url || !key) {
    console.error('FOUT: kan SUPABASE_URL of SECRET_KEY niet uit .env.local lezen')
    process.exit(1)
  }

  // Tabellen ophalen via OpenAPI
  const specRes = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  })
  const spec = await specRes.json()
  const tabellen = Object.keys(spec.definitions || {}).sort()
  if (!tabellen.length) {
    console.error('FOUT: geen tabellen gevonden')
    process.exit(1)
  }

  const stamp = tijdstempel()
  const doelMap = path.join(BACKUP_ROOT, stamp)
  fs.mkdirSync(doelMap, { recursive: true })

  let totaalRijen = 0
  const samenvatting = {}
  for (const tabel of tabellen) {
    try {
      const rijen = await haalAlleRijen(url, key, tabel)
      fs.writeFileSync(
        path.join(doelMap, `${tabel}.json`),
        JSON.stringify(rijen, null, 2),
        'utf8'
      )
      samenvatting[tabel] = rijen.length
      totaalRijen += rijen.length
      console.log(`  ${tabel.padEnd(26)} ${rijen.length} rijen`)
    } catch (e) {
      console.error(`  ${tabel.padEnd(26)} FOUT: ${e.message}`)
      samenvatting[tabel] = `FOUT: ${e.message}`
    }
  }

  // Manifest met overzicht
  fs.writeFileSync(
    path.join(doelMap, '_manifest.json'),
    JSON.stringify(
      { gemaakt: new Date().toISOString(), tabellen: tabellen.length, totaalRijen, perTabel: samenvatting },
      null,
      2
    ),
    'utf8'
  )

  console.log(`\nKlaar: ${tabellen.length} tabellen, ${totaalRijen} rijen totaal`)
  console.log(`Opgeslagen in: ${doelMap}`)

  // Oude back-ups opruimen (bewaar laatste N)
  const alleBackups = fs
    .readdirSync(BACKUP_ROOT)
    .filter((n) => /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(n))
    .sort()
  const teVerwijderen = alleBackups.slice(0, Math.max(0, alleBackups.length - BEWAAR_AANTAL))
  for (const oud of teVerwijderen) {
    fs.rmSync(path.join(BACKUP_ROOT, oud), { recursive: true, force: true })
    console.log(`Oude back-up verwijderd: ${oud}`)
  }
}

main().catch((e) => {
  console.error('Back-up mislukt:', e.message)
  process.exit(1)
})
