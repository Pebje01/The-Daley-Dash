import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function isMissingActiesTableError(error: any) {
  return (
    error?.code === 'PGRST205' ||
    (error?.code === '42P01' && /acties/.test(error?.message || '')) ||
    /Could not find the table 'public\.acties'/.test(error?.message || '')
  )
}

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('acties')
    .select('*')
    .eq('status', 'gepland')
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingActiesTableError(error)) return NextResponse.json([])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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
