import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: Request,
  { params }: { params: { jaar: string; factuur_id: string } }
) {
  const jaar = parseInt(params.jaar)
  const supabase = createClient()
  const body = await req.json()

  const { data: aangifte } = await supabase
    .from('belasting_aangifte')
    .select('id')
    .eq('jaar', jaar)
    .single()

  if (!aangifte) return NextResponse.json({ error: 'Aangifte niet gevonden' }, { status: 404 })

  const { data, error } = await supabase
    .from('belasting_debiteur_status')
    .upsert(
      {
        factuur_id: params.factuur_id,
        aangifte_id: aangifte.id,
        updated_at: new Date().toISOString(),
        ...body,
      },
      { onConflict: 'factuur_id,aangifte_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
