import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: Request,
  { params }: { params: { jaar: string; id: string } }
) {
  const supabase = createClient()
  const body = await req.json()

  const { data, error } = await supabase
    .from('belasting_kosten_regel')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: { jaar: string; id: string } }
) {
  const supabase = createClient()

  const { error } = await supabase
    .from('belasting_kosten_regel')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
