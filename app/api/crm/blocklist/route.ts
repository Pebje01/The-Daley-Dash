import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/crm/blocklist
 *
 * Bedrijven en contacten die op "niet meer benaderen" staan.
 *
 * Bewust alleen partijen, geen leads of opdrachten: de blocklist gaat over met
 * wie je geen zaken meer doet. Een geblokkeerde lead is een stuk werk dat daaruit
 * volgt en blijft op het bord staan, in de kolom Blocklist met de reden erbij.
 */
export async function GET() {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('clickup_crm_records')
    .select('id, entity_type, name, status, contact_status_reden, laatste_contact, updated_at')
    .eq('contact_status', 'blokkade')
    .in('entity_type', ['contact', 'company'])
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}
