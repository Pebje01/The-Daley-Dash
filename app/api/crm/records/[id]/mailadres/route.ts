import { NextRequest, NextResponse } from 'next/server'
import { mailAdresKeuze, zetMailAdres } from '@/lib/crm/benaderen'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** GET: het gekozen mailadres van deze lead plus suggesties uit gekoppelde records. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    return NextResponse.json(await mailAdresKeuze(id))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Laden mislukt' }, { status: 500 })
  }
}

/** PATCH { email }: zet of wis het mailadres. Leeg wist hem. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  try {
    return NextResponse.json({ gekozen: await zetMailAdres(id, body.email ?? null) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Opslaan mislukt' }, { status: 400 })
  }
}
