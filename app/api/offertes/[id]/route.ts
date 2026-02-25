import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOfferte, updateOfferte, deleteOfferte } from '@/lib/supabase/offertes'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  const offerte = await getOfferte(params.id)
  if (!offerte) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(offerte)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  const body = await request.json()
  const offerte = await updateOfferte(params.id, body)
  return NextResponse.json(offerte)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  await deleteOfferte(params.id)
  return NextResponse.json({ ok: true })
}
