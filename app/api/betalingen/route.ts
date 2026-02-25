import { NextRequest, NextResponse } from 'next/server'
import { getBetalingen, createBetaling } from '@/lib/supabase/betalingen'

export async function GET(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'alle'
  const companyId = searchParams.get('company') ?? 'alle'
  const search = searchParams.get('search') ?? ''

  const betalingen = await getBetalingen({
    status: status as any,
    companyId: companyId as any,
    search,
  })

  return NextResponse.json(betalingen)
}

export async function POST(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld

  const body = await request.json()
  const { companyId, client, amount, method, reference, factuurId, notes } = body

  if (!companyId || !client?.name || amount === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const betaling = await createBetaling({
    companyId,
    client,
    amount,
    method,
    reference,
    factuurId,
    notes,
  })

  return NextResponse.json(betaling, { status: 201 })
}
