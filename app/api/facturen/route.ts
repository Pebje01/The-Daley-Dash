import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFacturen, createFactuur, getTodayFactuurCount } from '@/lib/supabase/facturen'
import { generateFactuurNumber } from '@/lib/factuur-utils'

export async function GET(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'alle'
  const companyId = searchParams.get('company') ?? 'alle'
  const search = searchParams.get('search') ?? ''

  const facturen = await getFacturen({
    status: status as any,
    companyId: companyId as any,
    search,
  })

  return NextResponse.json(facturen)
}

export async function POST(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld

  const body = await request.json()
  const { companyId, client, items, btwPercentage, notes, offerteId } = body

  if (!companyId || !client?.name || !items?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0)
  const btwAmount = subtotal * ((btwPercentage ?? 21) / 100)
  const total = subtotal + btwAmount

  const now = new Date()
  const dueDate = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0]
  const todayCount = await getTodayFactuurCount() // globale dag-sequentie over alle bedrijven

  let createdFactuur = null
  let retries = 0

  while (retries < 8) {
    const number = generateFactuurNumber('F', todayCount + retries)
    const slug = number.toLowerCase()

    try {
      createdFactuur = await createFactuur({
        number,
        companyId,
        client,
        date: now.toISOString().split('T')[0],
        dueDate,
        items,
        subtotal,
        btwPercentage: btwPercentage ?? 21,
        btwAmount,
        total,
        notes,
        offerteId,
        slug,
      })
      break
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        retries++
        continue
      }
      throw e
    }
  }

  if (!createdFactuur) {
    return NextResponse.json({ error: 'Kon geen uniek factuurnummer maken' }, { status: 409 })
  }

  return NextResponse.json(createdFactuur, { status: 201 })
}
