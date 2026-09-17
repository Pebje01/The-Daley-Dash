import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { voerVoorstelUit, type VoorstelRij } from '@/lib/assistent/voorstellen'

export const dynamic = 'force-dynamic'

/**
 * Voert een voorstel uit. Alleen vanuit de knop in de chat.
 *
 * Eerst claimen (open -> bezig) in één update: een dubbelklik of twee
 * geopende tabbladen kunnen zo nooit twee facturen maken van één voorstel.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: geclaimd } = await supabase
    .from('assistent_voorstellen')
    .update({ status: 'bezig' })
    .eq('id', params.id)
    .eq('status', 'open')
    .select()
    .maybeSingle()

  if (!geclaimd) {
    const { data: huidig } = await supabase.from('assistent_voorstellen').select('status').eq('id', params.id).maybeSingle()
    return NextResponse.json(
      { error: huidig ? `Dit voorstel is al ${huidig.status}` : 'Voorstel niet gevonden' },
      { status: huidig ? 409 : 404 }
    )
  }

  try {
    const resultaat = await voerVoorstelUit(geclaimd as VoorstelRij)
    const { data } = await supabase
      .from('assistent_voorstellen')
      .update({ status: 'uitgevoerd', resultaat, uitgevoerd_op: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()
    return NextResponse.json(data)
  } catch (e) {
    const fout = e instanceof Error ? e.message : String(e)
    const { data } = await supabase
      .from('assistent_voorstellen')
      .update({ status: 'mislukt', resultaat: { fout } })
      .eq('id', params.id)
      .select()
      .single()
    return NextResponse.json({ ...data, error: fout }, { status: 500 })
  }
}
