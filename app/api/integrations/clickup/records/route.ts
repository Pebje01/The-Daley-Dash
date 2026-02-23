import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_ENTITY_TYPES = new Set(['daley_list', 'lead', 'company', 'contact', 'assignment', 'clickup_invoice'])

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
