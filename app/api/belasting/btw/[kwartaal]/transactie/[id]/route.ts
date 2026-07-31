import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Pas een banktransactie aan: handmatige categorie of factuur-koppeling. */
export async function PATCH(
  req: Request,
  { params }: { params: { kwartaal: string; id: string } },
) {
  const supabase = createClient()
  const body = await req.json()

  const update: Record<string, any> = {}
  if ('categorie' in body) {
    update.categorie = body.categorie
    update.categorie_handmatig = true
  }
  if ('factuur_id' in body) update.factuur_id = body.factuur_id || null

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Niets om bij te werken' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('btw_bank_transactie')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
