import { NextRequest, NextResponse } from 'next/server'
import { getAbonnementen, createAbonnement } from '@/lib/supabase/abonnementen'

export async function GET(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'alle'
  const companyId = searchParams.get('company') ?? 'alle'
  const search = searchParams.get('search') ?? ''

  const abonnementen = await getAbonnementen({
    status: status as any,
    companyId: companyId as any,
    search,
  })

  return NextResponse.json(abonnementen)
}

export async function POST(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld

  const body = await request.json()
  const { companyId, client, description, amount, btwPercentage, interval, startDate, notes } = body

  if (!companyId || !client?.name || !description || amount === undefined || !interval || !startDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const abonnement = await createAbonnement({
    companyId,
    client,
    description,
    amount,
    btwPercentage: btwPercentage ?? 21,
    interval,
    startDate,
    notes,
  })

  return NextResponse.json(abonnement, { status: 201 })
}
