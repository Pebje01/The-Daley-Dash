import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendFactuurHerinnering } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  // Haal de actie op
  const { data: actie, error: actieError } = await supabase
    .from('acties')
    .select('*')
    .eq('id', params.id)
    .single()

  if (actieError || !actie) {
    return NextResponse.json({ error: 'Actie niet gevonden' }, { status: 404 })
  }

  if (actie.type !== 'factuur-herinnering') {
    return NextResponse.json({ error: 'Alleen factuur-herinneringen kunnen worden verstuurd' }, { status: 400 })
  }

  if (actie.status === 'verzonden') {
    return NextResponse.json({ error: 'Al verzonden' }, { status: 409 })
  }

  if (!actie.factuur_id) {
    return NextResponse.json({ error: 'Geen factuur gekoppeld' }, { status: 400 })
  }

  // Haal factuurgegevens op
  const { data: factuur, error: factuurError } = await supabase
    .from('facturen')
    .select('number, total, due_date, client, company_id, status')
    .eq('id', actie.factuur_id)
    .single()

  if (factuurError || !factuur) {
    return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 })
  }

  const client = typeof factuur.client === 'string' ? JSON.parse(factuur.client) : factuur.client

  if (!client?.email) {
    return NextResponse.json({ error: 'Klant heeft geen e-mailadres' }, { status: 400 })
  }

  // Verstuur de herinnering
  try {
    await sendFactuurHerinnering({
      toEmail: client.email,
      toName: client.contactPerson || client.name,
      factuurNumber: factuur.number,
      amount: factuur.total,
      dueDate: factuur.due_date,
      companyId: factuur.company_id,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Verzenden mislukt' }, { status: 500 })
  }

  // Markeer actie als verzonden
  await supabase
    .from('acties')
    .update({ status: 'verzonden', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  // Factuur is opgevolgd: zet de status op herinnering-verzonden (alleen vanuit open statussen)
  if (factuur.status === 'verzonden' || factuur.status === 'te-laat') {
    await supabase
      .from('facturen')
      .update({ status: 'herinnering-verzonden', updated_at: new Date().toISOString() })
      .eq('id', actie.factuur_id)
  }

  return NextResponse.json({ ok: true })
}
