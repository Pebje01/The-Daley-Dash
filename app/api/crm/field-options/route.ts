import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/crm/field-options
 * Centrale keuze-opties voor CRM-velden. Teruggegeven als map per field_id,
 * zodat de UI per veld direct z'n opties heeft.
 */
export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('crm_field_options')
    .select('id, field_id, entity_type, field_name, field_type, label, color, orderindex')
    .eq('active', true)
    .order('orderindex', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byField: Record<string, any[]> = {}
  for (const o of data || []) {
    ;(byField[o.field_id] ||= []).push(o)
  }
  return NextResponse.json({ byField, options: data || [] })
}

/**
 * POST /api/crm/field-options
 * Voegt een nieuwe optie toe aan een keuzeveld. Idempotent op (field_id, label).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const field_id: string = body.field_id
    const label: string = (body.label || '').trim()
    if (!field_id || !label) {
      return NextResponse.json({ error: 'field_id en label zijn verplicht' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Bestaat deze optie al (zelfde veld + zelfde label)? Geef 'm dan terug.
    const { data: dup } = await supabase
      .from('crm_field_options')
      .select('id, field_id, entity_type, field_name, field_type, label, color, orderindex')
      .eq('field_id', field_id)
      .ilike('label', label)
      .eq('active', true)
      .maybeSingle()
    if (dup) return NextResponse.json({ option: dup, existed: true })

    // Volgende orderindex binnen dit veld
    const { data: last } = await supabase
      .from('crm_field_options')
      .select('orderindex')
      .eq('field_id', field_id)
      .order('orderindex', { ascending: false })
      .limit(1)
    const nextOrder = ((last?.[0]?.orderindex as number) ?? -1) + 1

    const row = {
      id: randomUUID(),
      field_id,
      entity_type: body.entity_type ?? null,
      field_name: body.field_name ?? null,
      field_type: body.field_type ?? 'labels',
      label,
      color: body.color ?? null,
      orderindex: nextOrder,
      active: true,
    }

    const { data, error } = await supabase
      .from('crm_field_options')
      .insert(row)
      .select('id, field_id, entity_type, field_name, field_type, label, color, orderindex')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ option: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Toevoegen mislukt' }, { status: 500 })
  }
}
