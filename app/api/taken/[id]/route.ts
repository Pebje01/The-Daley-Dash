import { NextRequest, NextResponse } from 'next/server'
import { updateTaak, deleteTaak } from '@/lib/supabase/taken'
import { STATUSSEN, prioriteitInfo } from '@/lib/taken'
import { COMPANIES } from '@/lib/companies'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json()
  if (body.title !== undefined && !String(body.title).trim()) {
    return NextResponse.json({ error: 'Een taak zonder titel kan niet' }, { status: 400 })
  }
  if (body.prioriteit && !prioriteitInfo(body.prioriteit)) {
    return NextResponse.json({ error: 'Onbekende prioriteit' }, { status: 400 })
  }
  if (body.status && !STATUSSEN.some(s => s.waarde === body.status)) {
    return NextResponse.json({ error: 'Onbekende status' }, { status: 400 })
  }
  if (body.bedrijf && !COMPANIES.some(c => c.id === body.bedrijf)) {
    return NextResponse.json({ error: 'Onbekend bedrijf' }, { status: 400 })
  }
  if (body.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(body.deadline)) {
    return NextResponse.json({ error: 'Ongeldige deadline' }, { status: 400 })
  }
  try {
    const taak = await updateTaak(params.id, body)
    return NextResponse.json(taak)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Opslaan mislukt' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  await deleteTaak(params.id)
  return NextResponse.json({ ok: true })
}
