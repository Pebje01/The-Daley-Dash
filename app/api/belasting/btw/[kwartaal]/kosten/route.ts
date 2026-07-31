import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseKwartaal, splitsKostenBtw, type BtwBehandeling } from '@/lib/btw'

export const dynamic = 'force-dynamic'

/** Nieuwe kostenpost (voorbelasting) toevoegen. */
export async function POST(
  req: Request,
  { params }: { params: { kwartaal: string } },
) {
  const info = parseKwartaal(params.kwartaal)
  if (!info) return NextResponse.json({ error: 'Ongeldig kwartaal' }, { status: 400 })

  const supabase = createClient()
  const body = await req.json()

  const behandeling: BtwBehandeling = body.btw_behandeling || 'nl_21'
  // Bedragen berekenen uit het factuurbedrag, tenzij expliciet meegegeven.
  const split = body.bedrag != null
    ? splitsKostenBtw(Number(body.bedrag), behandeling)
    : {
        bedrag_incl: Number(body.bedrag_incl || 0),
        bedrag_excl: Number(body.bedrag_excl || 0),
        btw_bedrag: Number(body.btw_bedrag || 0),
      }

  const { data, error } = await supabase
    .from('btw_kostenpost')
    .insert({
      kwartaal: info.kwartaal,
      leverancier: body.leverancier || 'Onbekend',
      datum: body.datum || null,
      ...split,
      btw_behandeling: behandeling,
      land: body.land || null,
      categorie: body.categorie || null,
      aftrekbaar_pct: body.aftrekbaar_pct != null ? Number(body.aftrekbaar_pct) : 100,
      bron: body.bron || 'handmatig',
      bron_transactie_id: body.bron_transactie_id || null,
      notitie: body.notitie || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
