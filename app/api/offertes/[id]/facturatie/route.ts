import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { haalFacturatie, ontbrekendeRestantKolom, selecteerOffertesMetRestant } from '@/lib/offertes/facturatie'

export const dynamic = 'force-dynamic'

/** Hoeveel er van deze offerte gefactureerd is en wat er nog openstaat. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const [offerte] = await selecteerOffertesMetRestant<{ id: string; total: number; subtotal: number; restant_vervallen_op?: string | null }>(
    (kolommen) => supabase.from('offertes').select(kolommen).eq('id', params.id),
    'id, total, subtotal',
  )
  if (!offerte) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 })
  const facturatie = await haalFacturatie([offerte])
  return NextResponse.json(facturatie.get(offerte.id))
}

/**
 * Restant laten vervallen of weer openzetten, met { restantVervalt: boolean }.
 * Voor een project dat kleiner uitviel of korting: anders staat dat restant
 * eeuwig bij "nog te factureren".
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { restantVervalt } = await request.json().catch(() => ({}))
  if (typeof restantVervalt !== 'boolean') {
    return NextResponse.json({ error: 'restantVervalt (true of false) ontbreekt' }, { status: 400 })
  }
  const { error } = await createClient()
    .from('offertes')
    .update({ restant_vervallen_op: restantVervalt ? new Date().toISOString() : null })
    .eq('id', params.id)
  if (error) {
    const melding = ontbrekendeRestantKolom(error)
      ? 'Dit kan nog niet: draai eerst de migratie 20260918_offerte_restant.sql in Supabase.'
      : error.message
    return NextResponse.json({ error: melding }, { status: 500 })
  }
  return GET(request, { params })
}
