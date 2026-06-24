#!/usr/bin/env node
/**
 * Datafixes uit de audit van 2026-06-09.
 *
 * Draaien: node scripts/fix-data-audit.mjs          (dry-run, toont wat er zou gebeuren)
 *          node scripts/fix-data-audit.mjs --apply  (voert de fixes echt uit)
 *
 * Wat dit script doet:
 *  A) BTW-splitsing terugrekenen voor geimporteerde offertes/facturen waar
 *     subtotal=0 maar total>1 (op basis van btw_percentage in de rij zelf)
 *  B) paid_at invullen voor facturen met status "betaald" zonder betaaldatum
 *     (schatting: de factuurdatum)
 *  C) Eén factuurregel toevoegen aan facturen die wel een subtotaal hebben
 *     maar nul regels (geimporteerde facturen)
 *  D) Klantnummers toekennen aan uren_klanten zonder nummer, en doorzetten
 *     naar het gekoppelde crm_bedrijf
 *
 * NIET in dit script (handmatige beslissing nodig, zie audit-rapport):
 *  - Facturen/offertes met placeholderbedragen (total <= 1,00)
 *  - Factuur met nummer "KLANTNUMMER:" (MIA MAE, junk-importrij)
 *  - F-260603-01 Dokter Richard: regels tellen op tot 1385,40 maar subtotaal
 *    is 1350,40 (verschil = de 0,5 uur regel). Factuur is al betaald.
 *  - 53 duplicaatgroepen in ClickUp (dubbele import op 2025-11-12)
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SECRET_KEY
const APPLY = process.argv.includes('--apply')

async function api(method, path, body) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
}

async function get(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
  return res.json()
}

const acties = []
function plan(omschrijving, doe) {
  acties.push({ omschrijving, doe })
}

// A) BTW-splitsing
for (const table of ['offertes', 'facturen']) {
  const rows = await get(`${table}?select=id,number,total,btw_percentage&subtotal=eq.0&total=gt.1`)
  for (const r of rows) {
    const pct = Number(r.btw_percentage ?? 21)
    const sub = Math.round((r.total / (1 + pct / 100)) * 100) / 100
    const btw = Math.round((r.total - sub) * 100) / 100
    plan(
      `${table} ${r.number}: subtotal 0 -> ${sub}, btw -> ${btw} (total ${r.total}, ${pct}%)`,
      () => api('PATCH', `${table}?id=eq.${r.id}`, { subtotal: sub, btw_amount: btw })
    )
  }
}

// B) paid_at backfill
{
  const rows = await get('facturen?select=id,number,date&status=eq.betaald&paid_at=is.null')
  for (const r of rows) {
    plan(
      `factuur ${r.number}: paid_at -> ${r.date} (factuurdatum, schatting)`,
      () => api('PATCH', `facturen?id=eq.${r.id}`, { paid_at: `${r.date}T12:00:00Z` })
    )
  }
}

// C) Ontbrekende factuurregels
{
  const fac = await get('facturen?select=id,number,subtotal&subtotal=gt.0')
  const items = await get('factuur_line_items?select=factuur_id')
  const have = new Set(items.map((i) => i.factuur_id))
  for (const f of fac) {
    if (have.has(f.id)) continue
    plan(
      `factuur ${f.number}: regel toevoegen voor subtotaal ${f.subtotal}`,
      () => api('POST', 'factuur_line_items', {
        factuur_id: f.id,
        description: 'Factuurbedrag (geimporteerde factuur, zie originele PDF)',
        quantity: 1,
        unit_price: f.subtotal,
        sort_order: 0,
      })
    )
  }
}

// D) Klantnummers (afgeleid via lib/klantnummer.ts logica)
{
  const nieuwe = { 'Moet & Wielaard': 'MWI001', 'Fitness de Kloek': 'FKL001' }
  const rows = await get('uren_klanten?select=id,naam,klantnummer,crm_bedrijf_id&klantnummer=is.null')
  for (const r of rows) {
    const nr = nieuwe[r.naam]
    if (!nr) continue
    plan(`uren_klant ${r.naam}: klantnummer -> ${nr}`, async () => {
      await api('PATCH', `uren_klanten?id=eq.${r.id}`, { klantnummer: nr })
      if (r.crm_bedrijf_id) {
        await api('PATCH', `crm_bedrijven?id=eq.${r.crm_bedrijf_id}`, { klantnummer: nr })
      }
    })
  }
}

console.log(`${acties.length} fixes ${APPLY ? 'uitvoeren' : 'gepland (dry-run, draai met --apply)'}:\n`)
for (const a of acties) {
  console.log(' -', a.omschrijving)
  if (APPLY) await a.doe()
}
if (APPLY) console.log('\nKlaar. Alle fixes zijn doorgevoerd.')
