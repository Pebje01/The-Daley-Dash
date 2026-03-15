import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapDbToOfferte } from '@/lib/supabase/offertes'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)

    const { data, error } = await supabase
      .from('offertes')
      .select('*')
      .eq(isUuid ? 'id' : 'slug', params.id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Offerte not found', detail: error?.message },
        { status: 404 }
      )
    }

    const { data: items } = await supabase
      .from('line_items')
      .select('*')
      .eq('offerte_id', data.id)
      .order('sort_order')

    const offerte = mapDbToOfferte(data, items ?? [])

    if (!offerte.isPublic) {
      return NextResponse.json({ error: 'Offerte is not public' }, { status: 403 })
    }

    const { passwordHash: _hash, ...safeOfferte } = offerte

    return NextResponse.json(safeOfferte)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: 'Server error', detail: message }, { status: 500 })
  }
}
