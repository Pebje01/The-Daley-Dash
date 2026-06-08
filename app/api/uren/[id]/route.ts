import { NextRequest, NextResponse } from 'next/server'
import { getUur, updateUur, deleteUur } from '@/lib/supabase/uren'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const uur = await getUur(id)
  if (!uur) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json(uur)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const uur = await updateUur(id, body)
  return NextResponse.json(uur)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteUur(id)
  return NextResponse.json({ ok: true })
}
