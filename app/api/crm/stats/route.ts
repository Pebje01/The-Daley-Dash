import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
// Response van Supabase is > 2MB door custom_fields; Next's fetch-cache kan dat
// niet opslaan en spamt anders warnings. Caching staat hier bewust uit.
export const fetchCache = 'force-no-store'

/**
 * GET /api/crm/stats
 *
 * KPI's voor het dashboard, berekend uit clickup_crm_records.
 */

const OPEN_LEAD_STATUSES = new Set(['nieuwe kans', 'in gesprek', 'on hold', 'klant on hold'])
const WON_STATUSES = new Set(['gewonnen'])
const LOST_STATUSES = new Set(['verloren', 'niets uitgekomen'])
const OPEN_ASSIGNMENT_STATUSES = new Set(['nieuwe opdracht', 'in uitvoering', 'on hold'])

function prijsVan(customFields: any[]): number {
  for (const f of customFields || []) {
    if ((f?.name || '').toLowerCase() !== 'prijs incl. btw') continue
    const n = parseFloat(String(f?.value ?? ''))
    if (Number.isFinite(n)) return n
  }
  return 0
}

export async function GET() {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('clickup_crm_records')
    .select('entity_type, status, custom_fields')
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let openLeads = 0
  let openLeadsWaarde = 0
  let inGesprek = 0
  let gewonnen = 0
  let verloren = 0
  let openOpdrachten = 0
  let openOpdrachtenWaarde = 0
  let openClickUpFacturen = 0

  for (const r of data || []) {
    const status = (r.status || '').toLowerCase()
    if (r.entity_type === 'lead') {
      if (OPEN_LEAD_STATUSES.has(status)) {
        openLeads++
        openLeadsWaarde += prijsVan(r.custom_fields)
        if (status === 'in gesprek') inGesprek++
      } else if (WON_STATUSES.has(status)) gewonnen++
      else if (LOST_STATUSES.has(status)) verloren++
    } else if (r.entity_type === 'assignment') {
      if (OPEN_ASSIGNMENT_STATUSES.has(status)) {
        openOpdrachten++
        openOpdrachtenWaarde += prijsVan(r.custom_fields)
      }
    } else if (r.entity_type === 'clickup_invoice') {
      if (status === 'factuur open') openClickUpFacturen++
    }
  }

  const beslist = gewonnen + verloren
  const conversie = beslist > 0 ? Math.round((gewonnen / beslist) * 100) : null

  return NextResponse.json({
    openLeads,
    openLeadsWaarde,
    inGesprek,
    gewonnen,
    verloren,
    conversie,
    openOpdrachten,
    openOpdrachtenWaarde,
    openClickUpFacturen,
  })
}
