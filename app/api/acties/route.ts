import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('acties')
    .select('*')
    .eq('status', 'gepland')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const acties = (data ?? []).map((r: any) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    factuurId: r.factuur_id,
    offerteId: r.offerte_id,
    actieDatum: r.actie_datum,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))

  return NextResponse.json(acties)
}
