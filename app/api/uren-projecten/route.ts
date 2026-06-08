import { NextRequest, NextResponse } from 'next/server'
import { getUurProjecten, createUurProject } from '@/lib/supabase/uren-projecten'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company') ?? 'alle'
  const klant = searchParams.get('klant') ?? undefined
  const status = searchParams.get('status') ?? 'alle'

  const projecten = await getUurProjecten({
    companyId: companyId as any,
    klant,
    status: status as any,
  })

  return NextResponse.json(projecten)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { companyId, klant, naam, aantal, prijs, bedrag, datum, omschrijving, status } = body

  if (!companyId || !klant || !naam || bedrag === undefined || !datum) {
    return NextResponse.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
  }

  const project = await createUurProject({
    companyId,
    klant,
    naam,
    aantal: aantal !== undefined ? Number(aantal) : undefined,
    prijs: prijs !== undefined ? Number(prijs) : undefined,
    bedrag: Number(bedrag),
    datum,
    omschrijving,
    status,
  })

  return NextResponse.json(project, { status: 201 })
}
