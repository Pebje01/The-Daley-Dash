import { NextRequest, NextResponse } from 'next/server'
import { getFacturen, createFactuur } from '@/lib/supabase/facturen'
import { volgendNummer } from '@/lib/supabase/factuurNummer'
import { COMPANY_CONFIG, type CompanyKey } from '@/lib/pdf/factuurGenerator'

export const dynamic = 'force-dynamic'

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
  const { companyId, client, items, btwPercentage, notes, offerteId, date: customDate, dueDate: customDueDate, dueDays, status } = body

  if (!companyId || !client?.name || !items?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0)
  const btwAmount = subtotal * ((btwPercentage ?? 21) / 100)
  const total = subtotal + btwAmount

  const now = new Date()
  const factuurDate = customDate || now.toISOString().split('T')[0]
  const dueDate = customDueDate || new Date(new Date(factuurDate).getTime() + (dueDays || 30) * 86400000).toISOString().split('T')[0]
  const prefix = (companyId in COMPANY_CONFIG) ? COMPANY_CONFIG[companyId as CompanyKey].factuurPrefix : 'F'

  let createdFactuur = null
  let retries = 0

  // Zelfde nummerbron als de urenroute: telt op het datumdeel in `number`,
  // niet op `created_at`, dus geen dubbele nummers ongeacht welke route het
  // laatste nummer van de dag claimt.
  while (retries < 3) {
    const number = await volgendNummer(prefix, factuurDate)
    const slug = number.toLowerCase()

    try {
      createdFactuur = await createFactuur({
        number,
        companyId,
        client,
        date: factuurDate,
        dueDate,
        items,
        subtotal,
        btwPercentage: btwPercentage ?? 21,
        btwAmount,
        total,
        notes,
        offerteId,
        slug,
        status: status ?? 'concept',
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
