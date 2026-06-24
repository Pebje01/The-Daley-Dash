// Supabase-only CRM-laag: vervangt de ClickUp-schrijfpaden uit lib/clickup/sync.ts.
// De tabel clickup_crm_records is de source of truth; er wordt niets meer naar
// ClickUp gepusht. Veldformaten blijven identiek aan wat de sync ooit opsloeg
// (drop_down = orderindex, relaties = array van task-stubs), zodat de bestaande
// UI en /api/crm/relations blijven werken.
import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import type { ClickUpCrmEntityType } from '@/lib/clickup/config'

export interface CrmRecordData {
  name?: string
  status?: string
  description?: string
  notes?: string
  due_date?: string | number
  custom_fields?: Array<{ id: string; value: any }>
  /** Notion-stijl labels (array van crm_dash_tags id's); eigen tagging in de Dash. */
  dash_tags?: string[]
}

const RECORD_COLUMNS =
  'id, entity_type, clickup_task_id, clickup_list_id, name, status, url, archived, active, assignees, tags, custom_fields, dash_tags, due_date, clickup_date_updated, synced_at, raw'

function toIso(value: string | number | undefined): string | null {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  const d = Number.isFinite(n) ? new Date(n < 1_000_000_000_000 ? n * 1000 : n) : new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ── Activiteitenlog ────────────────────────────────────────────────

interface ActiviteitInput {
  soort: 'aangemaakt' | 'status' | 'naam' | 'deadline' | 'notitie' | 'veld' | 'promotie'
  omschrijving: string
  oude_waarde?: string | null
  nieuwe_waarde?: string | null
}

/** Schrijft activiteiten weg; mag nooit de hoofdactie laten falen. */
async function logActiviteiten(recordId: string, items: ActiviteitInput[]) {
  if (!items.length) return
  try {
    const supabase = createServiceClient()
    await supabase.from('crm_activiteiten').insert(
      items.map((i) => ({ record_id: recordId, ...i }))
    )
  } catch {
    // Logging is best-effort
  }
}

/** Leesbare weergave van een opgeslagen veldwaarde, voor de activiteitenfeed. */
function fieldDisplay(field: any): string | null {
  const value = field?.value
  if (value === null || value === undefined || value === '') return null
  const options: any[] = field?.type_config?.options || []
  if (field.type === 'drop_down' && typeof value === 'number') {
    return options.find((o) => o.orderindex === value)?.name ?? String(value)
  }
  if (field.type === 'labels' && Array.isArray(value)) {
    const names = value.map((id: string) => options.find((o) => o.id === id)?.label).filter(Boolean)
    return names.length ? names.join(', ') : null
  }
  if ((field.type === 'tasks' || field.type === 'list_relationship') && Array.isArray(value)) {
    const names = value.map((v: any) => v?.name).filter(Boolean)
    return names.length ? names.join(', ') : null
  }
  if (field.type === 'date') {
    const iso = toIso(value)
    return iso ? iso.slice(0, 10) : String(value)
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Vergelijkt oude en nieuwe veldenlijsten en geeft één activiteit per gewijzigd veld. */
function diffFields(before: any[], after: any[]): ActiviteitInput[] {
  const out: ActiviteitInput[] = []
  for (const nieuw of after || []) {
    const oud = (before || []).find((f) => f.id === nieuw.id)
    const oudW = oud ? fieldDisplay(oud) : null
    const nieuwW = fieldDisplay(nieuw)
    if (oudW !== nieuwW) {
      out.push({
        soort: 'veld',
        omschrijving: nieuw.name || 'Veld',
        oude_waarde: oudW,
        nieuwe_waarde: nieuwW,
      })
    }
  }
  return out
}

/** Leeg sjabloon van velddefinities, gebaseerd op een bestaand record van hetzelfde type. */
async function getFieldTemplate(entityType: ClickUpCrmEntityType): Promise<any[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('clickup_crm_records')
    .select('custom_fields')
    .eq('entity_type', entityType)
    .not('custom_fields', 'eq', '[]')
    .limit(1)
    .maybeSingle()

  return ((data?.custom_fields as any[]) || []).map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    type_config: f.type_config ?? {},
    value: undefined,
  }))
}

/**
 * Past {id, value}-updates (ClickUp-schrijfformaat, zoals de UI ze stuurt) toe
 * op de opgeslagen veldenlijst (ClickUp-leesformaat).
 */
async function applyFieldUpdates(
  stored: any[],
  updates: Array<{ id: string; value: any }>
): Promise<any[]> {
  const supabase = createServiceClient()
  const fields = (stored || []).map((f) => ({ ...f }))

  for (const upd of updates) {
    const field = fields.find((f) => f.id === upd.id)
    if (!field) continue

    const type = field.type
    if (type === 'drop_down') {
      // UI schrijft option-id (uuid), opgeslagen formaat is orderindex (nummer)
      if (upd.value === '' || upd.value === null || upd.value === undefined) {
        field.value = null
      } else if (typeof upd.value === 'number') {
        field.value = upd.value
      } else {
        const opt = (field.type_config?.options || []).find((o: any) => o.id === upd.value)
        if (opt) {
          field.value = opt.orderindex
        } else {
          // Centraal toegevoegde optie: orderindex uit crm_field_options halen
          const { data: central } = await supabase
            .from('crm_field_options')
            .select('orderindex')
            .eq('id', upd.value)
            .maybeSingle()
          field.value = central ? central.orderindex : field.value
        }
      }
    } else if (type === 'tasks' || type === 'list_relationship') {
      // UI schrijft {add: [taskIds], rem: [taskIds]}, opgeslagen formaat is array van task-stubs
      const current: any[] = Array.isArray(field.value) ? [...field.value] : []
      const add: string[] = upd.value?.add || []
      const rem: string[] = upd.value?.rem || []
      let next = current.filter((t) => !rem.includes(t?.id))
      if (add.length) {
        const { data: related } = await supabase
          .from('clickup_crm_records')
          .select('clickup_task_id, name, status, url')
          .in('clickup_task_id', add)
        for (const taskId of add) {
          if (next.some((t) => t?.id === taskId)) continue
          const rel = (related || []).find((r) => r.clickup_task_id === taskId)
          next.push({ id: taskId, name: rel?.name || taskId, status: rel?.status || null, url: rel?.url || null })
        }
      }
      field.value = next
    } else if (type === 'date') {
      // ClickUp slaat datums op als ms-string
      field.value = upd.value === null || upd.value === '' ? null : String(upd.value)
    } else {
      field.value = upd.value
    }
  }

  return fields
}

export async function createCrmRecord(entityType: ClickUpCrmEntityType, data: CrmRecordData) {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  let customFields = await getFieldTemplate(entityType)
  if (data.custom_fields?.length) {
    customFields = await applyFieldUpdates(customFields, data.custom_fields)
  }

  const row = {
    entity_type: entityType,
    clickup_task_id: `local-${randomUUID()}`,
    clickup_list_id: 'local',
    clickup_space_id: null,
    clickup_folder_id: null,
    name: data.name || '(zonder naam)',
    status: data.status || 'open',
    url: null,
    archived: false,
    assignees: [],
    tags: [],
    custom_fields: customFields,
    raw: data.description ? { description: data.description } : {},
    clickup_date_created: now,
    clickup_date_updated: now,
    due_date: toIso(data.due_date),
    synced_at: now,
    updated_at: now,
    active: true,
  }

  const { data: record, error } = await supabase
    .from('clickup_crm_records')
    .insert(row)
    .select(RECORD_COLUMNS)
    .single()

  if (error) throw error
  await logActiviteiten(record.id, [
    { soort: 'aangemaakt', omschrijving: 'Record aangemaakt', nieuwe_waarde: record.name },
  ])
  return record
}

export async function updateCrmRecord(recordId: string, data: CrmRecordData) {
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase
    .from('clickup_crm_records')
    .select('*')
    .eq('id', recordId)
    .single()

  if (fetchError || !existing) throw new Error('Record niet gevonden')

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    clickup_date_updated: now,
    updated_at: now,
  }

  if (data.name !== undefined) update.name = data.name
  if (data.status !== undefined) update.status = data.status
  if (data.due_date !== undefined) update.due_date = toIso(data.due_date)
  if (data.description !== undefined || data.notes !== undefined) {
    const raw = { ...(existing.raw || {}) }
    if (data.description !== undefined) raw.description = data.description
    if (data.notes !== undefined) raw.notes = data.notes
    update.raw = raw
  }
  if (Array.isArray(data.custom_fields) && data.custom_fields.length > 0) {
    update.custom_fields = await applyFieldUpdates(existing.custom_fields || [], data.custom_fields)
  }
  if (Array.isArray(data.dash_tags)) {
    update.dash_tags = data.dash_tags
  }

  const { data: record, error } = await supabase
    .from('clickup_crm_records')
    .update(update)
    .eq('id', recordId)
    .select(RECORD_COLUMNS)
    .single()

  if (error) throw error

  // Activiteitenfeed: log wat er daadwerkelijk veranderd is
  const activiteiten: ActiviteitInput[] = []
  if (data.status !== undefined && data.status !== existing.status) {
    activiteiten.push({ soort: 'status', omschrijving: 'Status gewijzigd', oude_waarde: existing.status, nieuwe_waarde: data.status })
  }
  if (data.name !== undefined && data.name !== existing.name) {
    activiteiten.push({ soort: 'naam', omschrijving: 'Naam gewijzigd', oude_waarde: existing.name, nieuwe_waarde: data.name })
  }
  if (data.due_date !== undefined) {
    const oud = existing.due_date ? String(existing.due_date).slice(0, 10) : null
    const nieuw = toIso(data.due_date)?.slice(0, 10) ?? null
    if (oud !== nieuw) {
      activiteiten.push({ soort: 'deadline', omschrijving: 'Deadline gewijzigd', oude_waarde: oud, nieuwe_waarde: nieuw })
    }
  }
  if (data.notes !== undefined && data.notes !== ((existing.raw || {}).notes ?? '')) {
    activiteiten.push({ soort: 'notitie', omschrijving: 'Notities bijgewerkt' })
  }
  if (update.custom_fields) {
    activiteiten.push(...diffFields(existing.custom_fields || [], update.custom_fields as any[]))
  }
  await logActiviteiten(recordId, activiteiten)

  return record
}

export async function deleteCrmRecord(recordId: string) {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('clickup_crm_records')
    .delete()
    .eq('id', recordId)

  if (error) throw error
  return { ok: true }
}

// ── Promote: Lead → Opdracht, Opdracht → Factuur ─────────────────
// Zelfde veldmapping als de oude ClickUp-promote; waarden worden nu lokaal
// gekopieerd. Dropdowns kopiëren op orderindex (lijsten delen de optievolgorde).

interface PromoteTarget {
  target: ClickUpCrmEntityType
  namePrefix?: string
  fieldNames: string[]
  linkBackFieldName?: string
}

const PROMOTE_TARGETS: Record<string, PromoteTarget> = {
  lead: {
    target: 'assignment',
    fieldNames: [
      'Bedrijf', 'Contactpersoon', 'Producten', 'Prijs incl. BTW',
      'Details opdracht', 'Type kans', 'Bron', 'Op initiatief van',
    ],
    linkBackFieldName: 'Gekoppelde lead',
  },
  assignment: {
    target: 'clickup_invoice',
    namePrefix: 'Factuur: ',
    fieldNames: ['Bedrijf', 'Contactpersoon', 'Prijs incl. BTW', 'Details opdracht'],
  },
}

export async function promoteCrmRecord(recordId: string) {
  const supabase = createServiceClient()

  const { data: source, error: fetchError } = await supabase
    .from('clickup_crm_records')
    .select('*')
    .eq('id', recordId)
    .single()

  if (fetchError || !source) throw new Error('Bron record niet gevonden')

  const promote = PROMOTE_TARGETS[source.entity_type]
  if (!promote) throw new Error(`Promote niet ondersteund voor ${source.entity_type}`)

  const template = await getFieldTemplate(promote.target)
  const sourceFields: any[] = source.custom_fields || []
  const wanted = new Set(promote.fieldNames.map((n) => n.toLowerCase()))

  for (const field of template) {
    const name = (field.name || '').toLowerCase()
    if (wanted.has(name)) {
      const src = sourceFields.find((f) => (f?.name || '').toLowerCase() === name)
      if (src && src.value !== undefined && src.value !== null && src.value !== '') {
        field.value = src.value
      }
    }
    if (promote.linkBackFieldName && name === promote.linkBackFieldName.toLowerCase()) {
      field.value = [{ id: source.clickup_task_id, name: source.name, status: source.status, url: source.url }]
    }
  }

  const now = new Date().toISOString()
  const row = {
    entity_type: promote.target,
    clickup_task_id: `local-${randomUUID()}`,
    clickup_list_id: 'local',
    clickup_space_id: null,
    clickup_folder_id: null,
    name: `${promote.namePrefix || ''}${source.name}`,
    status: promote.target === 'clickup_invoice' ? 'factuur open' : 'nieuwe opdracht',
    url: null,
    archived: false,
    assignees: [],
    tags: [],
    custom_fields: template,
    raw: {},
    clickup_date_created: now,
    clickup_date_updated: now,
    due_date: null,
    synced_at: now,
    updated_at: now,
    active: true,
  }

  const { data: record, error } = await supabase
    .from('clickup_crm_records')
    .insert(row)
    .select(RECORD_COLUMNS)
    .single()

  if (error) throw error
  await logActiviteiten(record.id, [
    { soort: 'aangemaakt', omschrijving: 'Record aangemaakt', nieuwe_waarde: record.name },
  ])
  await logActiviteiten(recordId, [
    { soort: 'promotie', omschrijving: `Gepromoveerd naar ${promote.target === 'clickup_invoice' ? 'factuur' : 'opdracht'}`, nieuwe_waarde: record.name },
  ])
  return record
}
