import { NextRequest, NextResponse } from 'next/server'
import { recordWaarde } from '@/lib/crm/pipeline'
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

export async function GET(request: NextRequest) {
  const supabase = createClient()

  // Alleen leads zijn bedrijfsgericht. Opdrachten en facturen blijven gedeeld,
  // dus die tellen altijd volledig mee.
  const bedrijf = (request.nextUrl.searchParams.get('company') || '').trim()
  const company = bedrijf && bedrijf !== 'alle' ? bedrijf : null

  // Zonder de kolom company_id (migratie 20260909_crm_bedrijf.sql nog niet
  // gedraaid) valt de teller terug op alle leads samen.
  let metBedrijf = true
  let { data, error } = await supabase
    .from('clickup_crm_records')
    .select('entity_type, status, custom_fields, company_id')
    .limit(2000)
  if (error && (error.code === '42703' || /company_id/.test(error.message || ''))) {
    metBedrijf = false
    ;({ data, error } = await supabase
      .from('clickup_crm_records')
      .select('entity_type, status, custom_fields')
      .limit(2000) as any)
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let openLeads = 0
  let openLeadsWaarde = 0
  let inGesprek = 0
  let gewonnen = 0
  let verloren = 0
  let openOpdrachten = 0
  let openOpdrachtenWaarde = 0
  let openCrmFacturen = 0

  for (const r of (data || []) as any[]) {
    const status = (r.status || '').toLowerCase()
    if (r.entity_type === 'lead') {
      if (metBedrijf && company && r.company_id !== company) continue
      if (OPEN_LEAD_STATUSES.has(status)) {
        openLeads++
        openLeadsWaarde += recordWaarde(r.custom_fields)
        if (status === 'in gesprek') inGesprek++
      } else if (WON_STATUSES.has(status)) gewonnen++
      else if (LOST_STATUSES.has(status)) verloren++
    } else if (r.entity_type === 'assignment') {
      if (OPEN_ASSIGNMENT_STATUSES.has(status)) {
        openOpdrachten++
        openOpdrachtenWaarde += recordWaarde(r.custom_fields)
      }
    } else if (r.entity_type === 'clickup_invoice') {
      if (status === 'factuur open') openCrmFacturen++
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
    openCrmFacturen,
  })
}
