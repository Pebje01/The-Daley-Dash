import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { haalFacturatie, ontbrekendeRestantKolom, selecteerOffertesMetRestant } from '@/lib/offertes/facturatie'

export const dynamic = 'force-dynamic'

/** Hoeveel er van deze offerte gefactureerd is en wat er nog openstaat. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const [offerte] = await selecteerOffertesMetRestant<{ id: string; total: number; subtotal: number; restant_vervallen_op?: string | null; restant_vervallen_reden?: string | null }>(
    (kolommen) => supabase.from('offertes').select(kolommen).eq('id', params.id),
    'id, total, subtotal',
  )
  if (!offerte) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 })
  const facturatie = await haalFacturatie([offerte])
  return NextResponse.json(facturatie.get(offerte.id))
}

/**
 * Restant laten vervallen of weer openzetten, met { restantVervalt: boolean, reden }.
 * Voor een project dat kleiner uitviel of korting: anders staat dat restant
 * eeuwig bij "nog te factureren".
 *
 * Vervallen kan alleen met een reden, ook buiten het scherm om. Zonder reden
 * weet je over een jaar niet meer waarom een offerte maar half gefactureerd is.
 * Openzetten wist datum en reden allebei.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { restantVervalt, reden } = await request.json().catch(() => ({}))
  if (typeof restantVervalt !== 'boolean') {
    return NextResponse.json({ error: 'restantVervalt (true of false) ontbreekt' }, { status: 400 })
  }
  const schoneReden = typeof reden === 'string' ? reden.trim().slice(0, 500) : ''
  if (restantVervalt && !schoneReden) {
    return NextResponse.json({ error: 'Geef een reden op waarom het restant vervalt' }, { status: 400 })
  }
  const { error } = await createClient()
    .from('offertes')
    .update(restantVervalt
      ? { restant_vervallen_op: new Date().toISOString(), restant_vervallen_reden: schoneReden }
      : { restant_vervallen_op: null, restant_vervallen_reden: null })
    .eq('id', params.id)
  if (error) {
    const melding = ontbrekendeRestantKolom(error)
      ? 'Dit kan nog niet: draai eerst de migratie 20260918_offerte_restant.sql in Supabase.'
      : error.message
    return NextResponse.json({ error: melding }, { status: 500 })
  }
  return GET(request, { params })
}
