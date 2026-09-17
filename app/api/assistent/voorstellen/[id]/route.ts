import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { data } = await createClient().from('assistent_voorstellen').select('*').eq('id', params.id).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Voorstel niet gevonden' }, { status: 404 })
  return NextResponse.json(data)
}
