/**
 * Eén klantnummer per bedrijf, op één plek (september 2026).
 *
 * Klantnummers stonden op drie plekken: in uren_klanten (die komen op de
 * urenfactuur), in het CRM-veld Klantnummer van bedrijven (oude ClickUp-import)
 * en op oude factuur-PDF's. Ze liepen uiteen: Fitness de Kloek was FKL001 op
 * de facturen en FKL003 in het CRM.
 *
 * De enige plek is nu uren_klanten, gekoppeld aan het CRM-bedrijf via
 * crm_record_id. Volgorde van gelijk: wat op de factuur staat, dan wat al in
 * uren_klanten stond, dan het CRM-veld. Een bedrijf met een klantnummer maar
 * zonder uren-klant krijgt er een, gearchiveerd, zodat hij niet tussen de
 * tabs van /uren komt te staan. Daarna wordt het CRM-veld leeggemaakt.
 *
 * Vereist de migraties 20260911_uren_klanten_archief.sql en
 * 20260918_uren_klanten_crm_record.sql.
 *
 *   node --env-file=.env.local scripts/klantnummers-samenvoegen.mjs          proef
 *   node --env-file=.env.local scripts/klantnummers-samenvoegen.mjs --apply  uitvoeren
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

// Gelezen uit de factuur-PDF's in DALEY WERK op 18 september 2026 (pdftotext).
// Sleutel is de naam van het CRM-bedrijf. Stucstunter (STU001) en X-park
// (XPA0001) staan niet in het CRM en blijven dus buiten beschouwing.
const OP_FACTUUR = {
  'Dokter Richard': 'DRR001',
  'Fitness de Kloek': 'FKL001',
  'Hairless & Skin': 'HAS0001',
  'Padel de Kloek': 'PKL001',
  'De Kloek': 'SDK002',
  'BONVUE': 'BON0001',
  'Taxameter': 'TAX0001',
  'Brickyard': 'BRY0001',
}

const norm = (x) => (x || '').trim().toLowerCase()
const leeg = (v) => v === null || v === undefined || v === ''

const { data: bedrijven, error: e1 } = await s
  .from('clickup_crm_records')
  .select('id, name, custom_fields')
  .eq('entity_type', 'company')
if (e1) throw e1

const { data: urenKlanten, error: e2 } = await s
  .from('uren_klanten')
  .select('id, naam, klantnummer, crm_record_id, gearchiveerd_op')
if (e2) {
  console.error(`Kan uren_klanten niet lezen: ${e2.message}`)
  console.error('Draai eerst 20260911_uren_klanten_archief.sql en 20260918_uren_klanten_crm_record.sql.')
  process.exit(1)
}

const veldVan = (b) => (b.custom_fields || []).find((f) => norm(f?.name) === 'klantnummer')
const plan = []

for (const b of bedrijven) {
  const veld = veldVan(b)
  const crmNr = leeg(veld?.value) ? null : String(veld.value).trim()
  const uk = urenKlanten.find((k) => k.crm_record_id === b.id)
  const factuurNr = OP_FACTUUR[b.name] ?? null
  const juist = factuurNr ?? uk?.klantnummer ?? crmNr
  if (!juist && !crmNr) continue

  if (uk && uk.klantnummer !== juist) {
    plan.push({ soort: 'wijzig', bedrijf: b.name, van: uk.klantnummer, naar: juist, uk })
  }
  if (!uk && juist) {
    plan.push({ soort: 'nieuw', bedrijf: b.name, naar: juist, b })
  }
  if (crmNr) {
    plan.push({ soort: 'veld leeg', bedrijf: b.name, van: crmNr, afwijkend: crmNr !== juist, b, veld })
  }
}

// Een nummer mag maar bij één bedrijf horen
const tel = {}
for (const k of urenKlanten) if (k.klantnummer) tel[k.klantnummer] = [...(tel[k.klantnummer] || []), k.naam]
for (const p of plan) if (p.soort === 'nieuw' || p.soort === 'wijzig') {
  const al = (tel[p.naar] || []).filter((n) => n !== p.uk?.naam)
  if (al.length) { console.error(`Botsing: ${p.naar} voor ${p.bedrijf} zit al bij ${al.join(', ')}`); process.exit(1) }
}

console.log(APPLY ? 'UITVOEREN\n' : 'PROEF (niets veranderd, draai met --apply)\n')
for (const p of plan) {
  if (p.soort === 'wijzig') console.log(`  uren-klant   ${p.bedrijf}: ${p.van} -> ${p.naar}`)
  if (p.soort === 'nieuw') console.log(`  nieuw        ${p.bedrijf}: ${p.naar} (gearchiveerd, dus niet tussen de urentabs)`)
  if (p.soort === 'veld leeg') console.log(`  CRM-veld     ${p.bedrijf}: ${p.van} weg${p.afwijkend ? '  (klopte niet met de factuur)' : ''}`)
}
if (!plan.length) console.log('  Niets te doen, alles staat al op één plek.')
if (!APPLY) process.exit(0)

const nu = new Date().toISOString()
// Het CRM-veld pas leegmaken als het nummer veilig op zijn nieuwe plek staat
const mislukt = new Set()
const volgorde = [...plan.filter((p) => p.soort !== 'veld leeg'), ...plan.filter((p) => p.soort === 'veld leeg')]
for (const p of volgorde) {
  if (p.soort === 'veld leeg' && mislukt.has(p.bedrijf)) {
    console.log(`overgeslagen  veld leeg ${p.bedrijf}: nummer staat nog niet op zijn nieuwe plek`)
    continue
  }
  let error
  if (p.soort === 'wijzig') {
    ;({ error } = await s.from('uren_klanten').update({ klantnummer: p.naar, updated_at: nu }).eq('id', p.uk.id))
  } else if (p.soort === 'nieuw') {
    ;({ error } = await s.from('uren_klanten').insert({
      naam: p.bedrijf, klantnummer: p.naar, crm_record_id: p.b.id,
      standaard_uurtarief: 0, gearchiveerd_op: nu, created_at: nu, updated_at: nu,
    }))
  } else {
    const velden = p.b.custom_fields.map((f) => (f === p.veld ? { ...f, value: null } : f))
    ;({ error } = await s.from('clickup_crm_records').update({ custom_fields: velden, updated_at: nu }).eq('id', p.b.id))
  }
  if (error) mislukt.add(p.bedrijf)
  console.log(`${error ? 'MISLUKT' : 'ok'}  ${p.soort} ${p.bedrijf}${error ? `: ${error.message}` : ''}`)
}
