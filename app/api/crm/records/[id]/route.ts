import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateCrmRecord, deleteCrmRecord } from '@/lib/crm/store'
import { CRM_ENTITY_TYPES } from '@/lib/crm/types'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from('clickup_crm_records')
    .select('*, raw')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Niet gevonden' }, { status: 404 })
  }

  return NextResponse.json({ item: data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const {
      name, status, description, due_date, custom_fields, notes, dash_tags,
      volgende_actie, volgende_actie_notitie,
      contact_status, contact_status_tot, contact_status_reden, afsluit_reden,
      entity_type,
      ruwe_contact_email, ruwe_website, ruwe_bron, ruwe_fit_reden, ruwe_prioriteit,
      ruwe_contactpersoon, ruwe_telefoon, company_id,
    } = body

    if (
      ruwe_prioriteit !== undefined &&
      ruwe_prioriteit !== null &&
      !['ster', 'normaal', 'laag'].includes(ruwe_prioriteit)
    ) {
      return NextResponse.json({ error: 'Onbekende prioriteit' }, { status: 400 })
    }

    if (contact_status !== undefined && !['open', 'pauze', 'blokkade'].includes(contact_status)) {
      return NextResponse.json({ error: 'Onbekende contactstatus' }, { status: 400 })
    }
    if (entity_type !== undefined && !CRM_ENTITY_TYPES.includes(entity_type)) {
      return NextResponse.json({ error: 'Onbekend entity_type' }, { status: 400 })
    }

    // Supabase is de source of truth, alles gaat direct naar de database
    const record = await updateCrmRecord(id, {
      name,
      status,
      description,
      notes,
      due_date,
      custom_fields,
      dash_tags,
      volgende_actie,
      volgende_actie_notitie,
      contact_status,
      contact_status_tot,
      contact_status_reden,
      afsluit_reden,
      entity_type,
      ruwe_contact_email,
      ruwe_website,
      ruwe_bron,
      ruwe_fit_reden,
      ruwe_prioriteit,
      ruwe_contactpersoon,
      ruwe_telefoon,
      company_id,
    })

    return NextResponse.json({ item: record })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Update mislukt' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await deleteCrmRecord(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Verwijderen mislukt' }, { status: 500 })
  }
}
