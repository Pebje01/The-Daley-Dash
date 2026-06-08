import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateClickUpRecord, deleteClickUpRecord } from '@/lib/clickup/sync'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from('clickup_crm_records')
    .select('*, raw')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Niet gevonden' }, { status: 404 })
  }

  return NextResponse.json({ item: data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createClient()

  try {
    const body = await request.json()
    const { name, status, description, due_date, custom_fields, notes } = body

    let clickupSyncError: string | null = null
    let record: any = null

    // Push changes to ClickUp first, then mirror back to Supabase.
    // ClickUp is the source of truth for everything except notes.
    const hasClickUpChanges =
      name !== undefined ||
      status !== undefined ||
      description !== undefined ||
      due_date !== undefined ||
      (Array.isArray(custom_fields) && custom_fields.length > 0)

    if (hasClickUpChanges) {
      try {
        record = await updateClickUpRecord(id, { name, status, description, due_date, custom_fields })
      } catch (e: any) {
        clickupSyncError = e?.message || 'ClickUp sync mislukt'
      }
    }

    // Notes are dashboard-only and live in raw JSONB
    if (notes !== undefined) {
      const { data: current } = await supabase
        .from('clickup_crm_records')
        .select('raw')
        .eq('id', id)
        .single()

      const { data: updated, error } = await supabase
        .from('clickup_crm_records')
        .update({
          raw: { ...(current?.raw || {}), notes },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, entity_type, clickup_task_id, name, status, url, archived, active, assignees, tags, custom_fields, due_date, clickup_date_updated, synced_at, raw')
        .single()

      if (error) throw error
      record = updated
    }

    // If neither ClickUp push nor notes ran (or push failed), still return the current Supabase row
    if (!record) {
      const { data: fallback } = await supabase
        .from('clickup_crm_records')
        .select('id, entity_type, clickup_task_id, name, status, url, archived, active, assignees, tags, custom_fields, due_date, clickup_date_updated, synced_at, raw')
        .eq('id', id)
        .single()
      record = fallback
    }

    return NextResponse.json({ item: record, clickupSyncError })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Update mislukt' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await deleteClickUpRecord(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Verwijderen mislukt' }, { status: 500 })
  }
}
