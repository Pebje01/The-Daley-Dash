import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/crm/relations?id=RECORD_UUID
 *
 * Leidt relaties af uit clickup_crm_records (de gesyncde ClickUp-data,
 * single source of truth). Relaties zitten in ClickUp als custom fields
 * van het type tasks of list_relationship; die bevatten gelinkte task-id's.
 *
 * We kijken twee kanten op:
 *  1. Vooruit: links in de custom fields van dit record zelf
 *  2. Terug:   alle records waarvan een custom field naar dit record wijst
 */

/**
 * Een "edge" beschrijft waar een koppeling fysiek is opgeslagen, zodat de UI
 * 'm ook weer kan verwijderen: op record `recordId`, in custom field `fieldId`,
 * staat task-stub `taskId` in de waarde-array.
 */
interface RelationEdge {
  recordId: string
  fieldId: string
  taskId: string
}

interface LinkedRecord {
  id: string
  naam: string
  status: string | null
  entity_type: string
  edges: RelationEdge[]
}

/** Relatievelden (tasks/list_relationship) met hun veld-id en gelinkte task-id's. */
function relationFields(customFields: any[]): Array<{ fieldId: string; ids: string[] }> {
  const out: Array<{ fieldId: string; ids: string[] }> = []
  for (const f of customFields || []) {
    if (f?.type !== 'tasks' && f?.type !== 'list_relationship') continue
    if (!Array.isArray(f.value)) continue
    const ids = f.value.map((v: any) => v?.id).filter(Boolean).map(String)
    if (ids.length) out.push({ fieldId: f.id, ids })
  }
  return out
}

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 })

  const { data: record, error: recError } = await supabase
    .from('clickup_crm_records')
    .select('id, entity_type, clickup_task_id, name, custom_fields')
    .eq('id', id)
    .single()

  if (recError || !record) {
    return NextResponse.json({ error: 'Record niet gevonden' }, { status: 404 })
  }

  const { data: all, error: allError } = await supabase
    .from('clickup_crm_records')
    .select('id, entity_type, clickup_task_id, name, status, custom_fields')
    .limit(2000)

  if (allError) {
    return NextResponse.json({ error: allError.message }, { status: 500 })
  }

  const byTaskId = new Map<string, any>()
  for (const r of all || []) byTaskId.set(String(r.clickup_task_id), r)

  const related = new Map<string, LinkedRecord>()

  const ensure = (r: any): LinkedRecord | null => {
    if (!r || r.id === record.id) return null
    let lr = related.get(r.id)
    if (!lr) {
      lr = { id: r.id, naam: r.name, status: r.status ?? null, entity_type: r.entity_type, edges: [] }
      related.set(r.id, lr)
    }
    return lr
  }

  // 1. Vooruit: links vanuit dit record (koppeling staat op dit record zelf)
  for (const { fieldId, ids } of relationFields(record.custom_fields || [])) {
    for (const taskId of ids) {
      const lr = ensure(byTaskId.get(taskId))
      if (lr) lr.edges.push({ recordId: record.id, fieldId, taskId })
    }
  }

  // 2. Terug: records die naar dit record linken (koppeling staat op het andere record)
  const myTaskId = String(record.clickup_task_id)
  for (const r of all || []) {
    if (r.id === record.id) continue
    for (const { fieldId, ids } of relationFields(r.custom_fields || [])) {
      if (ids.includes(myTaskId)) {
        const lr = ensure(r)
        if (lr) lr.edges.push({ recordId: r.id, fieldId, taskId: myTaskId })
      }
    }
  }

  const list = Array.from(related.values())
  const pick = (t: string) => list.filter((r) => r.entity_type === t)

  const bedrijven = pick('company')
  const contacten = pick('contact')

  return NextResponse.json({
    // Enkelvoudige velden voor lead/opdracht/factuur-weergave
    bedrijf: record.entity_type !== 'company' ? (bedrijven[0] ?? null) : null,
    contactpersoon:
      record.entity_type !== 'contact' && record.entity_type !== 'company'
        ? (contacten[0] ?? null)
        : null,
    // Lijsten
    bedrijven,
    contacten,
    leads: pick('lead'),
    opdrachten: pick('assignment'),
    facturen: pick('clickup_invoice'),
  })
}
