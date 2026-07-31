import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/crm/blocklist
 *
 * Alle relaties die op "niet meer benaderen" staan, over leads, contacten en
 * bedrijven heen. Eén centrale blocklist, los van waar ze in hun eigen module staan.
 */
export async function GET() {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('clickup_crm_records')
    .select('id, entity_type, name, status, contact_status_reden, laatste_contact, updated_at')
    .eq('contact_status', 'blokkade')
    .in('entity_type', ['lead', 'contact', 'company'])
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}
