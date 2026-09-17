#!/usr/bin/env node
/**
 * Legt de Werkbank (/bedrijfsinfo) naast de werkelijkheid en print een rapport.
 *
 * Leest alleen, verandert niets. De routine werkbank-check leest dit rapport en
 * beslist wat ermee gebeurt: de poortentabel mag hij zelf bijwerken, want dat
 * zijn kale feiten. De rest wordt een taak in de to-do list.
 *
 * Exitcodes: 0 alles klopt, 1 er zijn verschillen, 2 kon niet bij de Dash.
 *
 * Gebruik: node scripts/werkbank-check.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { execFileSync } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'

const HOME = homedir()
const DASH = 'http://127.0.0.1:3003'
const ONTWIKKEL = join(HOME, 'Developer')

function geheim() {
  const env = readFileSync(join(HOME, 'Developer', 'the-daley-dash', '.env.local'), 'utf8')
  const regel = env.split('\n').find(r => r.startsWith('CRON_SECRET='))
  if (!regel) throw new Error('CRON_SECRET staat niet in .env.local')
  return regel.slice('CRON_SECRET='.length).trim()
}

/* ------------------------------------------------------------------ poorten */

/** Alle poorten die ergens op schijf geclaimd worden, met wie hem claimt. */
function poortenOpSchijf() {
  const claims = new Map()   // poort -> [{ naam, bron }]
  const zet = (poort, naam, bron) => {
    const p = String(poort)
    if (!/^\d{2,5}$/.test(p)) return
    if (!claims.has(p)) claims.set(p, [])
    if (!claims.get(p).some(c => c.naam === naam && c.bron === bron)) {
      claims.get(p).push({ naam, bron })
    }
  }

  const launchPoorten = (pad, herkomst) => {
    try {
      const conf = JSON.parse(readFileSync(pad, 'utf8'))
      for (const c of conf.configurations ?? []) {
        if (c.port) zet(c.port, c.name || herkomst, 'launch.json')
      }
    } catch { /* geen of stuk bestand: overslaan */ }
  }

  for (const map of readdirSync(ONTWIKKEL, { withFileTypes: true })) {
    if (!map.isDirectory() || map.name.startsWith('.')) continue
    const projectPad = join(ONTWIKKEL, map.name)

    const pkgPad = join(projectPad, 'package.json')
    if (existsSync(pkgPad)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPad, 'utf8'))
        for (const script of Object.values(pkg.scripts ?? {})) {
          const m = String(script).match(/-p\s+(\d{2,5})/)
          if (m) { zet(m[1], map.name, 'package.json'); break }
        }
      } catch { /* stuk package.json: overslaan */ }
    }
    launchPoorten(join(projectPad, '.claude', 'launch.json'), map.name)
  }

  // De losse projecten buiten ~/Developer staan alleen in de globale launch.json
  launchPoorten(join(HOME, '.claude', 'launch.json'), 'globaal')
  return claims
}

/** De tabel zoals hij nu in de Werkbank staat: poort -> { project, soort }. */
function tabelUitWerkbank(inhoud) {
  const rijen = new Map()
  for (const regel of inhoud.split('\n')) {
    const m = regel.match(/^\|\s*(\d{2,5})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/)
    if (m) rijen.set(m[1], { project: m[2].trim(), soort: m[3].trim() })
  }
  return rijen
}

/**
 * Twee namen voor hetzelfde project. "Montung-website" en "montung-dev" zijn
 * dezelfde poort van hetzelfde project, geen botsing. Zonder dit stond de halve
 * lijst vol met botsingen die geen botsing zijn.
 */
function sleutel(naam) {
  return naam.toLowerCase().replace(/[^a-z0-9]/g, '')
    .replace(/(dev|website|site|landing|preview|astro|app|tool|overzicht)$/, '')
}

function groepeer(namen) {
  const groepen = []
  for (const n of namen) {
    const s = sleutel(n)
    const g = groepen.find(g => g.some(m => {
      const t = sleutel(m)
      return s === t || s.includes(t) || t.includes(s)
    }))
    if (g) g.push(n)
    else groepen.push([n])
  }
  return groepen
}

function soortVan(naam) {
  const pad = join(ONTWIKKEL, naam, 'package.json')
  try {
    const pkg = JSON.parse(readFileSync(pad, 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps.next) return 'Next.js'
    if (deps.astro) return 'Astro'
    if (deps.vite) return 'Vite'
  } catch { /* niets */ }
  return 'web'
}

/* --------------------------------------------------------------------- rest */

function nasCheck() {
  // Bewust licht: alleen vrije ruimte en belasting. Een telling van node_modules
  // over SMB is een zware zoekopdracht, en dat is precies wat de Werkbank zelf
  // afraadt. Die blijft handwerk.
  try {
    const uit = execFileSync('ssh', [
      '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'diskstation',
      'df -h /volume1 | tail -1; cat /proc/loadavg',
    ], { encoding: 'utf8', timeout: 20000 })
    return { bereikbaar: true, uit: uit.trim() }
  } catch (e) {
    return { bereikbaar: false, uit: (e.message || '').split('\n')[0] }
  }
}

const SLEUTELPADEN = [
  { pad: join(HOME, '.config', 'transip'), wat: 'TransIP private key' },
  { pad: join(HOME, '.config', 'gemini', 'thedaleyedit.env'), wat: 'Gemini key voor beeldwerk' },
]

/* -------------------------------------------------------------------- main */

const secret = geheim()
let secties
try {
  const r = await fetch(`${DASH}/api/werkbank`, { headers: { 'x-dash-secret': secret } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  secties = await r.json()
} catch (e) {
  console.error(`Kon de Werkbank niet ophalen van ${DASH}: ${e.message}`)
  console.error('Draait de Dash op poort 3003? Zonder die lijst valt er niets te vergelijken.')
  process.exit(2)
}

const regels = []
let drift = false
const zeg = r => regels.push(r)

zeg(`# Werkbank-controle ${new Date().toISOString().slice(0, 10)}`)
zeg('')

/* --- poorten --- */
const poortSectie = secties.find(s => /poort/i.test(s.titel))
const opSchijf = poortenOpSchijf()

if (!poortSectie) {
  zeg('## Poorten')
  zeg('')
  zeg('Geen sectie met "poort" in de titel gevonden. Overgeslagen.')
  zeg('')
} else {
  const inTabel = tabelUitWerkbank(poortSectie.inhoud)
  const toevoegen = []     // ondubbelzinnig: één project, staat nog niet in de tabel
  const zelfKijken = []    // oordeel nodig, dus nooit automatisch
  const botsingen = []

  for (const [poort, claims] of [...opSchijf].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const namen = [...new Set(claims.map(c => c.naam))]
    const groepen = groepeer(namen)
    if (groepen.length > 1) {
      botsingen.push({ poort, groepen: groepen.map(g => g[0]) })
    }
    if (!inTabel.has(poort)) {
      if (groepen.length === 1) {
        toevoegen.push({ poort, project: namen[0], soort: soortVan(namen[0]) })
      } else {
        zelfKijken.push(`${poort}: staat niet in de tabel en wordt geclaimd door ${groepen.map(g => g[0]).join(' en ')}. Welke hoort er te staan?`)
      }
    }
  }

  for (const [poort, rij] of inTabel) {
    // Een rij die met opzet niets claimt (8000 is gereserveerd voor Hetzner)
    // hoort niet elke week als verschil terug te komen.
    const gereserveerd = /gereserveerd|niet gebruiken/i.test(`${rij.project} ${rij.soort}`)
    if (!opSchijf.has(poort) && !gereserveerd) {
      zelfKijken.push(`${poort} (${rij.project}) staat in de tabel maar nergens op schijf. Project weg, verhuisd, of het draait buiten ~/Developer?`)
    }
  }

  const verschil = toevoegen.length || zelfKijken.length || botsingen.length
  if (verschil) drift = true

  zeg('## Poorten')
  zeg('')

  if (toevoegen.length) {
    zeg('**Deze rijen mogen er zo bij** (één project claimt de poort, hij staat nog niet in de tabel):')
    zeg('')
    for (const r of toevoegen) zeg(`| ${r.poort} | ${r.project} | ${r.soort} |`)
    zeg('')
  } else {
    zeg('Geen nieuwe poorten om toe te voegen.')
    zeg('')
  }

  if (zelfKijken.length) {
    zeg('**Hier is een oordeel voor nodig, niet zelf invullen:**')
    for (const r of zelfKijken) zeg(`- ${r}`)
    zeg('')
  }

  zeg('### Voorgestelde driftlijst')
  zeg('')
  if (botsingen.length) {
    for (const b of botsingen) zeg(`- **${b.poort}** wordt geclaimd door ${b.groepen.join(', ')}.`)
  } else {
    zeg('- Geen enkele poort wordt door meer dan één project geclaimd.')
  }
  zeg('')
}

/* --- NAS --- */
const nas = nasCheck()
zeg('## NAS')
zeg('')
if (nas.bereikbaar) {
  zeg('```')
  zeg(nas.uit)
  zeg('```')
  zeg('')
  const vol = nas.uit.match(/(\d+)%/)
  if (vol && Number(vol[1]) >= 90) {
    drift = true
    zeg(`**De schijf zit op ${vol[1]}%.** Dat is geen detail: een volle NAS betekent dat de backup stilletjes stopt met werken.`)
    zeg('')
  }
  zeg('De telling van node_modules in de backup staat bewust niet in deze controle: dat is een zware zoekopdracht over SMB, en de Werkbank raadt dat zelf af. Die blijft handwerk.')
} else {
  drift = true
  zeg(`Niet bereikbaar via \`ssh diskstation\`: ${nas.uit}`)
}
zeg('')

/* --- sleutels --- */
zeg('## Sleutels en wachtwoorden')
zeg('')
let sleutelFout = false
for (const s of SLEUTELPADEN) {
  const er = existsSync(s.pad)
  if (!er) { sleutelFout = true; drift = true }
  zeg(`- ${er ? 'staat er' : 'WEG'}: ${s.wat} (\`${s.pad.replace(HOME, '~')}\`)`)
}
if (!sleutelFout) zeg('')
zeg('Notion en Coolify zijn hiermee niet te controleren, dat blijft handwerk.')
zeg('')

/* --- ouderdom --- */
zeg('## Ouderdom van de secties')
zeg('')
const vandaag = new Date()
for (const s of secties.sort((a, b) => a.volgorde - b.volgorde)) {
  if (s.status === 'nagekeken' && s.gecontroleerdOp) {
    const dagen = Math.floor((vandaag - new Date(s.gecontroleerdOp)) / 86400000)
    const oud = dagen > 90
    if (oud) drift = true
    zeg(`- ${s.titel}: ${dagen} dagen geleden nagekeken${oud ? ' (ouder dan 90 dagen)' : ''}`)
  } else {
    zeg(`- ${s.titel}: status "${s.status}", nooit nagekeken`)
  }
}
zeg('')

/* --- openstaand --- */
const open = secties.find(s => s.status === 'openstaand')
if (open) {
  zeg(`## Nog openstaand: ${open.titel}`)
  zeg('')
  zeg(open.inhoud.trim())
  zeg('')
}

zeg(drift ? '## Uitkomst: er zijn verschillen' : '## Uitkomst: alles klopt')

console.log(regels.join('\n'))
process.exit(drift ? 1 : 0)
