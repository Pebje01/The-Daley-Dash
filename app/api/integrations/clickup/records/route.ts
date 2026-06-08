import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClickUpRecord } from '@/lib/clickup/sync'
import type { ClickUpCrmEntityType } from '@/lib/clickup/config'

const ALLOWED_ENTITY_TYPES = new Set(['daley_list', 'lead', 'company', 'contact', 'assignment', 'clickup_invoice'])

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()

  const { searchParams } = new URL(request.url)
  const entity = (searchParams.get('entity') || '').toLowerCase()
  const search = (searchParams.get('search') || '').trim()
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 100), 1), 500)

  if (!ALLOWED_ENTITY_TYPES.has(entity)) {
    return NextResponse.json({ error: 'Invalid entity.' }, { status: 400 })
  }

  let query = supabase
    .from('clickup_crm_records')
    .select('id, entity_type, clickup_task_id, clickup_list_id, name, status, url, archived, active, assignees, tags, custom_fields, due_date, clickup_date_updated, synced_at')
    .eq('entity_type', entity)
    .order('clickup_date_updated', { ascending: false, nullsFirst: false })
    .order('synced_at', { ascending: false })
    .limit(limit)

  if (search) {
    query = query.or(`name.ilike.%${search}%,status.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data || [] })
}

export async function POST(request: NextRequest) {

  try {
    const body = await request.json()
    const { entity_type, name, status, description, due_date, custom_fields } = body

    if (!entity_type || !ALLOWED_ENTITY_TYPES.has(entity_type)) {
      return NextResponse.json({ error: 'Invalid entity_type' }, { status: 400 })
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const record = await createClickUpRecord(entity_type as ClickUpCrmEntityType, {
      name: name.trim(),
      status,
      description,
      due_date,
      custom_fields,
    })

    return NextResponse.json({ item: record }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Aanmaken mislukt' }, { status: 500 })
  }
}
