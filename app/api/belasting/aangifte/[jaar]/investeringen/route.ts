import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: { jaar: string } }
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
    .from('belasting_investering')
    .insert({ ...body, aangifte_id: aangifte.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
