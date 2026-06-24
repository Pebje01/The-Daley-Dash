import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// Toegestane Notion-kleurnamen voor nieuwe tags.
const TOEGESTANE_KLEUREN = [
  'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red',
]

// GET: hele tag-catalogus, op volgorde.
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_dash_tags')
    .select('id, naam, kleur, sort_order')
    .order('sort_order', { ascending: true })
    .order('naam', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST: nieuwe tag aanmaken (Notion-stijl "create one"). Bestaat de naam al,
// dan geven we de bestaande tag terug i.p.v. een fout.
export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  const body = await request.json().catch(() => ({}))
  const naam = String(body.naam ?? '').trim()
  if (!naam) return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })

  const kleur = TOEGESTANE_KLEUREN.includes(body.kleur) ? body.kleur : 'gray'

  // Bestaat de tag al (case-insensitive)? Geef die terug.
  const { data: bestaand } = await supabase
    .from('crm_dash_tags')
    .select('id, naam, kleur, sort_order')
    .ilike('naam', naam)
    .maybeSingle()
  if (bestaand) return NextResponse.json(bestaand)

  // Volgende sort_order = hoogste + 1.
  const { data: laatste } = await supabase
    .from('crm_dash_tags')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = (laatste?.sort_order ?? 0) + 1

  const { data, error } = await supabase
    .from('crm_dash_tags')
    .insert({ naam, kleur, sort_order: sortOrder })
    .select('id, naam, kleur, sort_order')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
