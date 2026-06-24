import { NextRequest, NextResponse } from 'next/server'
import { getBetalingen, createBetaling } from '@/lib/supabase/betalingen'

export const dynamic = 'force-dynamic'

function isMissingBetalingenTableError(error: any) {
  return (
    error?.code === 'PGRST205' ||
    (error?.code === '42P01' && /betalingen/.test(error?.message || ''))
  )
}

export async function GET(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'alle'
  const companyId = searchParams.get('company') ?? 'alle'
  const search = searchParams.get('search') ?? ''

  try {
    const betalingen = await getBetalingen({
      status: status as any,
      companyId: companyId as any,
      search,
    })
    return NextResponse.json(betalingen)
  } catch (e: any) {
    if (isMissingBetalingenTableError(e)) {
      return NextResponse.json([])
    }

    return NextResponse.json(
      { error: e?.message || 'Betalingen laden mislukt' },
      { status: 500 }
    )
  }
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
