import { NextRequest, NextResponse } from 'next/server'
import { getBetaling, updateBetaling, deleteBetaling } from '@/lib/supabase/betalingen'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  const betaling = await getBetaling(params.id)
  if (!betaling) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(betaling)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  const body = await request.json()
  const betaling = await updateBetaling(params.id, body)
  return NextResponse.json(betaling)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  await deleteBetaling(params.id)
  return NextResponse.json({ ok: true })
}
