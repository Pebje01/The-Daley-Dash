import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const { data } = await createClient()
    .from('assistent_voorstellen')
    .update({ status: 'geannuleerd' })
    .eq('id', params.id)
    .in('status', ['open', 'mislukt'])
    .select()
    .maybeSingle()
  if (!data) return NextResponse.json({ error: 'Dit voorstel staat niet meer open' }, { status: 409 })
  return NextResponse.json(data)
}
