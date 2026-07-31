// Slaat de huidige blok-indeling van een factuur op als bedrijfsbrede standaard
// (tabel `factuur_layout_defaults`). Een database-trigger op `facturen` past die
// standaard automatisch toe op elke nieuwe factuur van hetzelfde bedrijf die
// zonder eigen `layout_overrides` wordt aangemaakt, ongeacht via welke weg
// (Daley Dash zelf, of een losse curl-insert vanuit een factuur-skill).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const body = await req.json().catch(() => ({}))
    const layoutOverrides = body?.layoutOverrides as Record<string, number> | undefined
    if (!layoutOverrides) {
      return NextResponse.json({ error: 'layoutOverrides ontbreekt' }, { status: 400 })
    }

    const { data: f, error } = await supabase.from('facturen').select('company_id').eq('id', params.id).single()
    if (error || !f) return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 })

    const { error: upsertError } = await supabase
      .from('factuur_layout_defaults')
      .upsert({ company_id: f.company_id, layout_overrides: layoutOverrides, updated_at: new Date().toISOString() })
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

    return NextResponse.json({ ok: true, company_id: f.company_id })
  } catch (e: any) {
    console.error('layout-default fout:', e)
    return NextResponse.json({ error: e?.message ?? 'Standaardindeling opslaan mislukt' }, { status: 500 })
  }
}
