import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const lite = searchParams.get('lite') === 'true'

  if (lite) {
    // Lichtgewicht variant voor uren-klant zoeken
    const { data, error } = await supabase
      .from('crm_bedrijven')
      .select('id, naam, klantnummer, status')
      .order('naam')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('crm_bedrijven')
    .select(`
      *,
      contacten:crm_contacten(id, naam, email, telefoon),
      opdrachten:crm_opdrachten(id, naam, status, prijs_incl_btw),
      leads:crm_leads(id, naam, status, prijs_incl_btw)
    `)
    .order('naam')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  const { id, ...update } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase
    .from('crm_bedrijven')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
