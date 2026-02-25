import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFactuur, updateFactuur, deleteFactuur } from '@/lib/supabase/facturen'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  const factuur = await getFactuur(params.id)
  if (!factuur) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(factuur)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  const body = await request.json()
  const factuur = await updateFactuur(params.id, body)
  return NextResponse.json(factuur)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  await deleteFactuur(params.id)
  return NextResponse.json({ ok: true })
}
