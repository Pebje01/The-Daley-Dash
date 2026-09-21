/**
 * Details opdracht opgaan in Beschrijving (september 2026).
 *
 * Leads en opdrachten hadden twee velden voor hetzelfde: Beschrijving
 * (raw.description) en het custom field Details opdracht uit de oude
 * ClickUp-import. Vaak stond er in allebei iets, soms hetzelfde. Voortaan is
 * Beschrijving het enige veld.
 *
 * Per record:
 *  - alleen Details opdracht gevuld: die tekst wordt de beschrijving
 *  - allebei gevuld en de details staan al letterlijk in de beschrijving: niets toevoegen
 *  - allebei gevuld en verschillend: details komen onder de beschrijving
 * Daarna wordt Details opdracht leeggemaakt. Er gaat geen tekst verloren.
 *
 *   node --env-file=.env.local scripts/details-naar-beschrijving.mjs          proef
 *   node --env-file=.env.local scripts/details-naar-beschrijving.mjs --apply  uitvoeren
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const APPLY = process.argv.includes('--apply')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase()
const isDetails = (f) => (f?.name || '').toLowerCase() === 'details opdracht'

const { data, error } = await s.from('clickup_crm_records').select('id, entity_type, name, raw, custom_fields')
if (error) throw error

const plan = []
for (const r of data) {
  const velden = (r.custom_fields || []).filter(isDetails)
  const details = velden.map((f) => String(f.value ?? '').trim()).filter(Boolean)
  if (!details.length) continue
  const huidig = (r.raw?.description || '').trim()
  const toevoegen = [...new Set(details)].filter((d) => !norm(huidig).includes(norm(d)))
  const nieuw = [huidig, ...toevoegen].filter(Boolean).join('\n\n')
  plan.push({ r, huidig, nieuw, soort: !huidig ? 'overgenomen' : toevoegen.length ? 'aangevuld' : 'stond er al' })
}

console.log(APPLY ? 'UITVOEREN\n' : 'PROEF (niets veranderd, draai met --apply)\n')
const tel = {}
for (const p of plan) {
  tel[p.soort] = (tel[p.soort] || 0) + 1
  console.log(`[${p.r.entity_type}] ${p.r.name}  (${p.soort})`)
  if (p.soort !== 'stond er al') console.log('   wordt: ' + p.nieuw.replace(/\n/g, ' / ').slice(0, 160))
}
console.log('\nTotaal:', plan.length, tel)
if (!APPLY || !plan.length) process.exit(0)

// Reservekopie van wat er nu staat, voor als er iets terug moet
const kopie = `${process.env.HOME}/Library/Caches/daley-dash/details-naar-beschrijving-${new Date().toISOString().slice(0, 10)}.json`
fs.mkdirSync(`${process.env.HOME}/Library/Caches/daley-dash`, { recursive: true })
fs.writeFileSync(kopie, JSON.stringify(plan.map((p) => ({ id: p.r.id, name: p.r.name, raw: p.r.raw, custom_fields: p.r.custom_fields })), null, 2))
console.log('Reservekopie:', kopie)

const nu = new Date().toISOString()
for (const p of plan) {
  const velden = p.r.custom_fields.map((f) => (isDetails(f) ? { ...f, value: null } : f))
  const { error } = await s
    .from('clickup_crm_records')
    .update({ raw: { ...(p.r.raw || {}), description: p.nieuw }, custom_fields: velden, updated_at: nu })
    .eq('id', p.r.id)
  console.log(error ? `MISLUKT ${p.r.name}: ${error.message}` : `ok ${p.r.name}`)
}
