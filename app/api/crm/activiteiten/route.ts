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

/**
 * Opmerkingen: losse, gedateerde notities in de activiteitenfeed (september
 * 2026). Ze vervingen het ene grote Notities-veld, dat niemand gebruikte:
 * een opmerking hoort bij een moment, niet in een tekstvak dat je overschrijft.
 *
 * Alleen opmerkingen zijn aan te passen of weg te halen. De rest van de feed
 * (fasewissels, contact, promoties) is een logboek en blijft staan.
 */
const MAX_LENGTE = 5000

function tekstUit(body: any): string | null {
  const tekst = typeof body?.tekst === 'string' ? body.tekst.trim() : ''
  return tekst ? tekst.slice(0, MAX_LENGTE) : null
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const tekst = tekstUit(body)
  if (!body?.recordId || !tekst) {
    return NextResponse.json({ error: 'recordId en tekst zijn verplicht' }, { status: 400 })
  }
  const supabase = createClient()
  const { data, error } = await supabase
    .from('crm_activiteiten')
    .insert({ record_id: body.recordId, soort: 'opmerking', omschrijving: 'Opmerking', nieuwe_waarde: tekst })
    .select('id, soort, omschrijving, oude_waarde, nieuwe_waarde, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const tekst = tekstUit(body)
  if (!body?.id || !tekst) {
    return NextResponse.json({ error: 'id en tekst zijn verplicht' }, { status: 400 })
  }
  const supabase = createClient()
  const { data, error } = await supabase
    .from('crm_activiteiten')
    .update({ nieuwe_waarde: tekst })
    .eq('id', body.id)
    .eq('soort', 'opmerking')
    .select('id, soort, omschrijving, oude_waarde, nieuwe_waarde, created_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Alleen opmerkingen zijn aan te passen' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('crm_activiteiten')
    .delete()
    .eq('id', id)
    .eq('soort', 'opmerking')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Alleen opmerkingen zijn weg te halen' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
