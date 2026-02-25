import { NextRequest, NextResponse } from 'next/server'
import { getAbonnement, updateAbonnement, deleteAbonnement } from '@/lib/supabase/abonnementen'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  const abonnement = await getAbonnement(params.id)
  if (!abonnement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(abonnement)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  const body = await request.json()
  const abonnement = await updateAbonnement(params.id, body)
  return NextResponse.json(abonnement)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth tijdelijk uitgeschakeld

  await deleteAbonnement(params.id)
  return NextResponse.json({ ok: true })
}
