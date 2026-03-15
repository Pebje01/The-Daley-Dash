import { NextRequest, NextResponse } from 'next/server'
import { updateTaak, deleteTaak } from '@/lib/supabase/taken'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json()
  const taak = await updateTaak(params.id, body)
  return NextResponse.json(taak)
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  await deleteTaak(params.id)
  return NextResponse.json({ ok: true })
}
