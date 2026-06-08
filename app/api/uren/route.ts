import { NextRequest, NextResponse } from 'next/server'
import { getUren, createUur } from '@/lib/supabase/uren'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company') ?? 'alle'
  const datumVan = searchParams.get('datumVan') ?? undefined
  const datumTot = searchParams.get('datumTot') ?? undefined
  const klant = searchParams.get('klant') ?? undefined
  const gefactureerd = searchParams.get('gefactureerd') === 'true'

  const uren = await getUren({
    companyId: companyId as any,
    datumVan,
    datumTot,
    klant,
    alleenGefactureerd: gefactureerd,
  })

  return NextResponse.json(uren)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { companyId, datum, klant, project, uren, omschrijving, uurtarief } = body

  if (!companyId || !datum || !klant || !uren || uurtarief === undefined) {
    return NextResponse.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
  }

  const entry = await createUur({
    companyId,
    datum,
    klant,
    project,
    uren: Number(uren),
    omschrijving,
    uurtarief: Number(uurtarief),
  })

  return NextResponse.json(entry, { status: 201 })
}
