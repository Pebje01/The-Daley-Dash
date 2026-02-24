import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { mapDbToOfferte } from '@/lib/supabase/offertes'

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('offertes')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Offerte not found' }, { status: 404 })
  }

  const { data: items } = await supabase
    .from('line_items')
    .select('*')
    .eq('offerte_id', data.id)
    .order('sort_order')

  const offerte = mapDbToOfferte(data, items ?? [])

  if (!offerte) {
    return NextResponse.json({ error: 'Offerte not found' }, { status: 404 })
  }

  if (!offerte.isPublic) {
    return NextResponse.json({ error: 'Offerte is not public' }, { status: 403 })
  }

  // Strip sensitive fields
  const { passwordHash: _hash, ...safeOfferte } = offerte

  return NextResponse.json(safeOfferte)
}
