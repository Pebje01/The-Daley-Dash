import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Eén gesprek met berichten en de voorstellen die erin staan. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const [{ data: gesprek }, { data: berichten }, { data: voorstellen }] = await Promise.all([
    supabase.from('assistent_gesprekken').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('assistent_berichten').select('*').eq('gesprek_id', params.id).order('created_at', { ascending: true }),
    supabase.from('assistent_voorstellen').select('*').eq('gesprek_id', params.id),
  ])
  if (!gesprek) return NextResponse.json({ error: 'Gesprek niet gevonden' }, { status: 404 })
  return NextResponse.json({ gesprek, berichten: berichten ?? [], voorstellen: voorstellen ?? [] })
}
