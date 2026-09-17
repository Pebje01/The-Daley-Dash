import { NextRequest, NextResponse } from 'next/server'
import { updateUurKlant, deleteUurKlant } from '@/lib/supabase/uren-klanten'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  try {
    const klant = await updateUurKlant(id, body)
    return NextResponse.json(klant)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Opslaan mislukt' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteUurKlant(id)
  return NextResponse.json({ ok: true })
}
