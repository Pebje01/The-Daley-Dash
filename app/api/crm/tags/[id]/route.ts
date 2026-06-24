import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const TOEGESTANE_KLEUREN = [
  'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red',
]

// PATCH: tag hernoemen of van kleur veranderen.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()
  const body = await request.json().catch(() => ({}))

  const update: Record<string, unknown> = {}
  if (typeof body.naam === 'string' && body.naam.trim()) update.naam = body.naam.trim()
  if (TOEGESTANE_KLEUREN.includes(body.kleur)) update.kleur = body.kleur
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Niets om bij te werken' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('crm_dash_tags')
    .update(update)
    .eq('id', id)
    .select('id, naam, kleur, sort_order')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE: tag verwijderen én uit dash_tags van alle records halen.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  // Strip de tag-id uit alle records die hem gebruiken.
  const { data: records } = await supabase
    .from('clickup_crm_records')
    .select('id, dash_tags')
    .contains('dash_tags', [id])
  if (records?.length) {
    await Promise.all(records.map((r: any) =>
      supabase
        .from('clickup_crm_records')
        .update({ dash_tags: (r.dash_tags || []).filter((t: string) => t !== id) })
        .eq('id', r.id)
    ))
  }

  const { error } = await supabase.from('crm_dash_tags').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
