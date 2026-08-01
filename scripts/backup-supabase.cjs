#!/usr/bin/env node
/**
 * Volledige lokale back-up van de Daley Dash Supabase-database.
 *
 * Wat het doet:
 *  - Leest URL + secret key uit .env.local (geen wachtwoord nodig)
 *  - Haalt automatisch alle tabellen op via de OpenAPI-definitie
 *  - Schrijft elke tabel als JSON naar een map met datum en tijd
 *  - Bewaart de laatste 30 VOLLEDIGE back-ups, ruimt oudere en mislukte op
 *
 * Waarom het zo omslachtig is opgeschreven:
 * In juli 2026 stond dit een maand lang stuk zonder dat iemand het zag. Van de
 * 31 bewaarde back-ups bevatte er 1 alle tabellen, de rest alleen de eerste twee
 * op alfabet. De Mac sliep om 03:00, het proces werd halverwege afgebroken, en
 * omdat Node zijn stdout naar een bestand buffert ging ook de log verloren.
 * Ondertussen gooide de opruimregel elke nacht een goede back-up weg. Toen er
 * echt een factuur uit de database verdween, was er niets om op terug te vallen.
 *
 * Daarom nu:
 *  - Schrijven gebeurt in een `.bezig-` map die pas bij succes zijn echte naam krijgt
 *  - Een halve map blijft dus nooit als geldige back-up achter
 *  - Logregels gaan direct naar schijf, niet via een buffer die bij een kill verdampt
 *  - Een afgebroken run wordt door de VOLGENDE run gezien en gemeld als taak in de Dash
 *  - Opruimen telt alleen back-ups met een compleet manifest
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
const LOG_PATH = path.join(BACKUP_ROOT, '..', 'backup.log')
const STATUS_PATH = path.join(BACKUP_ROOT, '_status.json')
const BEWAAR_AANTAL = 30
const PAGINA_GROOTTE = 1000
const BEZIG_PREFIX = '.bezig-'

/**
 * Direct naar schijf schrijven in plaats van via console.log. Wordt het proces
 * hardhandig afgebroken, dan staat er tenminste tot dat moment een spoor.
 */
function log(regel) {
  const tekst = `[${new Date().toISOString()}] ${regel}\n`
  // Onder launchd gaat stdout naar hetzelfde logbestand. Dan alleen zelf
  // schrijven, anders staat elke regel er dubbel in.
  if (process.stdout.isTTY) process.stdout.write(tekst)
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    fs.appendFileSync(LOG_PATH, tekst, 'utf8')
  } catch {
    // Log niet kunnen schrijven mag de back-up zelf nooit tegenhouden
  }
}

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
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Een back-up telt pas mee als het manifest er staat: dan is de run afgemaakt. */
function isVolledig(map) {
  return fs.existsSync(path.join(BACKUP_ROOT, map, '_manifest.json'))
}

function schrijfStatus(status) {
  try {
    fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf8')
  } catch {
    // niet fataal
  }
}

/** Zet een taak in de Dash, zodat een mislukte back-up niet alleen in een log staat. */
async function meldInDash(url, key, titel, omschrijving) {
  try {
    const res = await fetch(`${url}/rest/v1/taken`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        title: titel,
        description: omschrijving,
        scheduled_date: new Date().toISOString().split('T')[0],
      }),
    })
    if (!res.ok) log(`  Waarschuwing: taak aanmaken mislukt (HTTP ${res.status})`)
    else log('  Taak in de Dash aangemaakt')
  } catch (e) {
    log(`  Waarschuwing: taak aanmaken mislukt (${e.message})`)
  }
}

/**
 * Ruimt restanten op van runs die halverwege zijn afgebroken en meldt ze.
 * Dit is de vangnetlaag: wordt het proces gekild, dan kan het zelf niets meer
 * doen, maar de eerstvolgende run ziet de achtergebleven `.bezig-` map.
 */
async function meldAfgebrokenRuns(url, key) {
  let restanten = []
  try {
    restanten = fs.readdirSync(BACKUP_ROOT).filter((n) => n.startsWith(BEZIG_PREFIX))
  } catch {
    return
  }
  if (restanten.length === 0) return

  log(`LET OP: ${restanten.length} eerdere back-up(s) zijn halverwege afgebroken: ${restanten.join(', ')}`)
  await meldInDash(
    url,
    key,
    'Back-up van de Dash is een keer afgebroken',
    `Er stond nog een halve back-up klaar (${restanten.join(', ')}). ` +
      'Meestal betekent dit dat de Mac tijdens de back-up in slaap ging. ' +
      'Controleer of de laatste back-up wel compleet is.'
  )
  for (const rest of restanten) {
    fs.rmSync(path.join(BACKUP_ROOT, rest), { recursive: true, force: true })
  }
}

async function main() {
  const url = leesEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = leesEnv('SUPABASE_SECRET_KEY')
  if (!url || !key) {
    log('FOUT: kan SUPABASE_URL of SECRET_KEY niet uit .env.local lezen')
    process.exit(1)
  }

  fs.mkdirSync(BACKUP_ROOT, { recursive: true })
  log('===== Back-up gestart =====')
  await meldAfgebrokenRuns(url, key)

  const specRes = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  })
  const spec = await specRes.json()
  const tabellen = Object.keys(spec.definitions || {}).sort()
  if (!tabellen.length) {
    log('FOUT: geen tabellen gevonden')
    schrijfStatus({ laatsteRun: new Date().toISOString(), geslaagd: false, reden: 'geen tabellen gevonden' })
    await meldInDash(url, key, 'Back-up van de Dash is mislukt', 'De lijst met tabellen kwam leeg terug uit Supabase.')
    process.exit(1)
  }

  const stamp = tijdstempel()
  // Eerst onder een naam die niet als geldige back-up telt. Pas als alles binnen
  // is krijgt de map zijn echte naam. Een halve map kan zo nooit een goede
  // back-up verdringen bij het opruimen.
  const werkMap = path.join(BACKUP_ROOT, BEZIG_PREFIX + stamp)
  const doelMap = path.join(BACKUP_ROOT, stamp)
  fs.mkdirSync(werkMap, { recursive: true })

  let totaalRijen = 0
  let mislukt = 0
  const samenvatting = {}
  for (const tabel of tabellen) {
    try {
      const rijen = await haalAlleRijen(url, key, tabel)
      fs.writeFileSync(
        path.join(werkMap, `${tabel}.json`),
        JSON.stringify(rijen, null, 2),
        'utf8'
      )
      samenvatting[tabel] = rijen.length
      totaalRijen += rijen.length
      log(`  ${tabel.padEnd(26)} ${rijen.length} rijen`)
    } catch (e) {
      mislukt++
      log(`  ${tabel.padEnd(26)} FOUT: ${e.message}`)
      samenvatting[tabel] = `FOUT: ${e.message}`
    }
  }

  fs.writeFileSync(
    path.join(werkMap, '_manifest.json'),
    JSON.stringify(
      {
        gemaakt: new Date().toISOString(),
        tabellen: tabellen.length,
        geslaagdeTabellen: tabellen.length - mislukt,
        totaalRijen,
        perTabel: samenvatting,
      },
      null,
      2
    ),
    'utf8'
  )

  fs.renameSync(werkMap, doelMap)
  log(`Klaar: ${tabellen.length - mislukt} van ${tabellen.length} tabellen, ${totaalRijen} rijen totaal`)
  log(`Opgeslagen in: ${doelMap}`)

  if (mislukt > 0) {
    // De map blijft staan (halve data is beter dan geen data), maar we ruimen
    // niets op en melden het, want dit is geen bruikbare back-up.
    schrijfStatus({
      laatsteRun: new Date().toISOString(),
      geslaagd: false,
      reden: `${mislukt} tabel(len) mislukt`,
      map: doelMap,
    })
    await meldInDash(
      url,
      key,
      'Back-up van de Dash is niet compleet',
      `${mislukt} van de ${tabellen.length} tabellen kon niet opgehaald worden. De back-up van ${stamp} is dus niet bruikbaar om op terug te vallen.`
    )
    process.exit(1)
  }

  schrijfStatus({
    laatsteRun: new Date().toISOString(),
    geslaagd: true,
    tabellen: tabellen.length,
    totaalRijen,
    map: doelMap,
  })

  // Pas opruimen na een geslaagde run, en alleen tellen wat compleet is.
  // Hiervoor telden halve back-ups gewoon mee en drukten ze de goede eruit.
  const alle = fs
    .readdirSync(BACKUP_ROOT)
    .filter((n) => /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(n))
    .sort()
  const volledig = alle.filter(isVolledig)
  const onvolledig = alle.filter((n) => !isVolledig(n))

  for (const kapot of onvolledig) {
    fs.rmSync(path.join(BACKUP_ROOT, kapot), { recursive: true, force: true })
    log(`Onvolledige back-up opgeruimd: ${kapot}`)
  }
  for (const oud of volledig.slice(0, Math.max(0, volledig.length - BEWAAR_AANTAL))) {
    fs.rmSync(path.join(BACKUP_ROOT, oud), { recursive: true, force: true })
    log(`Oude back-up verwijderd: ${oud}`)
  }
  log(`===== Back-up klaar, ${Math.min(volledig.length, BEWAAR_AANTAL)} volledige back-ups bewaard =====`)
}

main().catch(async (e) => {
  log(`Back-up mislukt: ${e.message}`)
  schrijfStatus({ laatsteRun: new Date().toISOString(), geslaagd: false, reden: e.message })
  try {
    const url = leesEnv('NEXT_PUBLIC_SUPABASE_URL')
    const key = leesEnv('SUPABASE_SECRET_KEY')
    if (url && key) {
      await meldInDash(url, key, 'Back-up van de Dash is mislukt', e.message)
    }
  } catch {
    // niets meer aan te doen
  }
  process.exit(1)
})
