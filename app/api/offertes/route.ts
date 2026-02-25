import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOffertes, createOfferte, getTodayOfferteCount } from '@/lib/supabase/offertes'
import { generateOfferteNumber } from '@/lib/offerte-utils'

export async function GET(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'alle'
  const companyId = searchParams.get('company') ?? 'alle'
  const search = searchParams.get('search') ?? ''

  const offertes = await getOffertes({
    status: status as any,
    companyId: companyId as any,
    search,
  })

  return NextResponse.json(offertes)
}

export async function POST(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld

  const body = await request.json()
  const { companyId, client, items, btwPercentage, notes, introText, termsText } = body

  if (!companyId || !client?.name || !items?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0)
  const btwAmount = subtotal * ((btwPercentage ?? 21) / 100)
  const total = subtotal + btwAmount

  const now = new Date()
  const validUntil = new Date(now.getTime() + 14 * 86400000).toISOString().split('T')[0]
  const todayCount = await getTodayOfferteCount() // globale dag-sequentie over alle bedrijven

  let createdOfferte = null
  let retries = 0

  while (retries < 8) {
    const number = generateOfferteNumber('OF', todayCount + retries)
    const slug = number.toLowerCase()

    try {
      createdOfferte = await createOfferte({
        number,
        companyId,
        client,
        date: now.toISOString().split('T')[0],
        validUntil,
        items,
        subtotal,
        btwPercentage: btwPercentage ?? 21,
        btwAmount,
        total,
        notes,
        introText,
        termsText,
        slug,
        isPublic: true,
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

  if (!createdOfferte) {
    return NextResponse.json({ error: 'Kon geen uniek offertenummer maken' }, { status: 409 })
  }

  return NextResponse.json(createdOfferte, { status: 201 })
}
