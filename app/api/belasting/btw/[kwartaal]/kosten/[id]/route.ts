import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { splitsKostenBtw, type BtwBehandeling } from '@/lib/btw'

export const dynamic = 'force-dynamic'

/** Kostenpost bijwerken. */
export async function PATCH(
  req: Request,
  { params }: { params: { kwartaal: string; id: string } },
) {
  const supabase = createClient()
  const body = await req.json()

  const update: Record<string, any> = {}
  for (const k of ['leverancier', 'datum', 'land', 'categorie', 'notitie', 'bron']) {
    if (k in body) update[k] = body[k]
  }
  if ('aftrekbaar_pct' in body) update.aftrekbaar_pct = Number(body.aftrekbaar_pct)

  // Bij wijziging van bedrag of behandeling: btw-splitsing herberekenen.
  if ('bedrag' in body || 'btw_behandeling' in body) {
    const behandeling: BtwBehandeling = body.btw_behandeling
      ?? (await supabase.from('btw_kostenpost').select('btw_behandeling').eq('id', params.id).single()).data?.btw_behandeling
      ?? 'nl_21'
    update.btw_behandeling = behandeling
    if ('bedrag' in body) {
      Object.assign(update, splitsKostenBtw(Number(body.bedrag), behandeling))
    }
  }
  // Directe overschrijving van losse bedragen (indien meegegeven)
  for (const k of ['bedrag_incl', 'bedrag_excl', 'btw_bedrag']) {
    if (k in body) update[k] = Number(body[k])
  }

  const { data, error } = await supabase
    .from('btw_kostenpost')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** Kostenpost verwijderen. */
export async function DELETE(
  _req: Request,
  { params }: { params: { kwartaal: string; id: string } },
) {
  const supabase = createClient()
  const { error } = await supabase.from('btw_kostenpost').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
