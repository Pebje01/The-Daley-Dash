import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mapDbToOfferte } from '@/lib/supabase/offertes'

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      return NextResponse.json(
        { error: 'Server configuration error', detail: 'Missing Supabase env vars' },
        { status: 500 }
      )
    }

    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data, error } = await supabase
      .from('offertes')
      .select('*')
      .eq('slug', params.slug)
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
