import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/crm/activiteiten?recordId=RECORD_UUID
 *
 * Activiteitenfeed van een CRM-record, nieuwste eerst.
 * Gevuld door lib/crm/store.ts bij aanmaken, wijzigen en promoten.
 */
export async function GET(request: NextRequest) {
  const recordId = request.nextUrl.searchParams.get('recordId')
  if (!recordId) {
    return NextResponse.json({ error: 'recordId is verplicht' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('crm_activiteiten')
    .select('id, soort, omschrijving, oude_waarde, nieuwe_waarde, created_at')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
