import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { getClickUpConfig, type ClickUpCrmEntityType } from '@/lib/clickup/config'
import { getAllListTasks, createTask, updateTask, deleteTask, type ClickUpTask, type CreateTaskPayload, type UpdateTaskPayload } from '@/lib/clickup/client'
import { createServiceClient } from '@/lib/supabase/service'

type SyncSource = 'manual' | 'cron' | 'webhook'

interface SyncOptions {
  source: SyncSource
  triggerMeta?: Record<string, any>
}

function toIsoFromClickUpTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (Number.isFinite(n)) {
    const ms = n < 1_000_000_000_000 ? n * 1000 : n
    return new Date(ms).toISOString()
  }
  const d = new Date(String(value))
  if (!Number.isNaN(d.getTime())) return d.toISOString()
  return null
}

function normalizeTask(task: ClickUpTask, entityType: ClickUpCrmEntityType, listId: string) {
  const now = new Date().toISOString()
  const status =
    typeof task.status === 'string'
      ? task.status
      : task.status?.status || null

  return {
    entity_type: entityType,
    clickup_task_id: String(task.id),
    clickup_list_id: String(task.list?.id || listId),
    clickup_space_id: task.space?.id ? String(task.space.id) : null,
    clickup_folder_id: task.folder?.id ? String(task.folder.id) : null,
    name: task.name || '(zonder naam)',
    status,
    url: task.url || null,
    archived: Boolean(task.archived),
    assignees: task.assignees || [],
    tags: task.tags || [],
    custom_fields: task.custom_fields || [],
    raw: task,
    clickup_date_created: toIsoFromClickUpTimestamp(task.date_created),
    clickup_date_updated: toIsoFromClickUpTimestamp(task.date_updated),
    due_date: toIsoFromClickUpTimestamp(task.due_date),
    synced_at: now,
    updated_at: now,
    active: true,
  }
}

async function insertSyncRun(source: SyncSource, triggerMeta?: Record<string, any>) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('clickup_sync_runs')
    .insert({
      source,
      status: 'started',
      trigger_meta: triggerMeta ?? {},
      counts: {},
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) throw error
  return String(data.id)
}

async function finishSyncRun(runId: string, status: 'success' | 'error', counts: Record<string, any>, errorText?: string) {
  const supabase = createServiceClient()
  await supabase
    .from('clickup_sync_runs')
    .update({
      status,
      counts,
      error_message: errorText || null,
      ended_at: new Date().toISOString(),
    })
    .eq('id', runId)

  await supabase
    .from('clickup_sync_state')
    .upsert({
      integration: 'clickup',
      last_successful_sync_at: status === 'success' ? new Date().toISOString() : undefined,
      last_error: status === 'error' ? (errorText || 'Unknown error') : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'integration' })
}

export async function syncClickUpCrm(options: SyncOptions) {
  const config = getClickUpConfig()
  const supabase = createServiceClient()
  const runId = await insertSyncRun(options.source, options.triggerMeta)

  const counts: Record<string, number> = {
    lists: 0,
    tasksFetched: 0,
    tasksUpserted: 0,
    errors: 0,
  }

  try {
    for (const list of config.lists) {
      const tasks = await getAllListTasks(list.listId)
      counts.lists += 1
      counts.tasksFetched += tasks.length

      if (tasks.length === 0) continue

      const rows = tasks.map((task) => normalizeTask(task, list.entityType, list.listId))
      const { error } = await supabase
        .from('clickup_crm_records')
        .upsert(rows, { onConflict: 'clickup_task_id' })

      if (error) throw error
      counts.tasksUpserted += rows.length
    }

    await supabase
      .from('clickup_sync_state')
      .upsert({
        integration: 'clickup',
        last_full_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'integration' })

    await finishSyncRun(runId, 'success', counts)
    return { ok: true, runId, counts }
  } catch (e: any) {
    counts.errors += 1
    const message = e?.message || 'ClickUp sync failed'
    await finishSyncRun(runId, 'error', counts, message)
    throw e
  }
}

export async function logClickUpWebhookEvent(payload: any, headers: Headers) {
  const supabase = createServiceClient()
  const headerObj: Record<string, string> = {}
  headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith('x-')) headerObj[key] = value
  })

  const { data, error } = await supabase
    .from('clickup_webhook_events')
    .insert({
      event_type: String(payload?.event || payload?.type || 'unknown'),
      payload,
      headers: headerObj,
      received_at: new Date().toISOString(),
      processed: false,
    })
    .select('id')
    .single()
  if (error) throw error
  const eventId = String(data.id)

  await supabase
    .from('clickup_sync_state')
    .upsert({
      integration: 'clickup',
      last_webhook_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'integration' })

  return eventId
}

export async function markWebhookProcessed(eventId: string) {
  const supabase = createServiceClient()
  await supabase
    .from('clickup_webhook_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('id', eventId)
}

export async function getClickUpSyncOverview() {
  const supabase = createServiceClient()

  const [{ data: state }, { data: runs }, { data: counts }] = await Promise.all([
    supabase.from('clickup_sync_state').select('*').eq('integration', 'clickup').maybeSingle(),
    supabase.from('clickup_sync_runs').select('*').order('started_at', { ascending: false }).limit(10),
    supabase.from('clickup_crm_records').select('entity_type', { count: 'exact', head: false }),
  ])

  const grouped: Record<string, number> = {
    daley_list: 0,
    lead: 0,
    company: 0,
    contact: 0,
    assignment: 0,
    clickup_invoice: 0,
  }
  for (const row of counts || []) {
    const key = (row as any).entity_type
    if (key in grouped) grouped[key]++
  }

  return {
    state: state || null,
    recentRuns: runs || [],
    recordCounts: grouped,
  }
}

// ── Write-back: Dashboard → ClickUp ──────────────────────────────

interface PushRecordData {
  name: string
  status?: string
  description?: string
  due_date?: string | null // ISO string
  custom_fields?: Array<{ id: string; value: any }>
}

export async function createClickUpRecord(
  entityType: ClickUpCrmEntityType,
  data: PushRecordData
) {
  const config = getClickUpConfig()
  const listConfig = config.lists.find((l) => l.entityType === entityType)
  if (!listConfig) throw new Error(`No ClickUp list configured for entity type: ${entityType}`)

  const payload: CreateTaskPayload = {
    name: data.name,
    description: data.description,
    status: data.status,
    due_date: data.due_date ? new Date(data.due_date).getTime() : undefined,
    custom_fields: data.custom_fields,
  }

  const task = await createTask(listConfig.listId, payload)

  // Sync the new task back to Supabase
  const supabase = createServiceClient()
  const row = normalizeTask(task, entityType, listConfig.listId)
  const { data: record, error } = await supabase
    .from('clickup_crm_records')
    .upsert(row, { onConflict: 'clickup_task_id' })
    .select('*')
    .single()

  if (error) throw error
  return record
}

export async function updateClickUpRecord(
  recordId: string,
  data: PushRecordData
) {
  const supabase = createServiceClient()

  // Fetch current record to get ClickUp task ID
  const { data: existing, error: fetchError } = await supabase
    .from('clickup_crm_records')
    .select('clickup_task_id, entity_type, clickup_list_id')
    .eq('id', recordId)
    .single()

  if (fetchError || !existing) throw new Error('Record niet gevonden')

  const payload: UpdateTaskPayload = {
    name: data.name,
    status: data.status,
    due_date: data.due_date ? new Date(data.due_date).getTime() : undefined,
    custom_fields: data.custom_fields,
  }

  // Push update to ClickUp
  const task = await updateTask(existing.clickup_task_id, payload)

  // Sync updated task back to Supabase
  const row = normalizeTask(task, existing.entity_type as ClickUpCrmEntityType, existing.clickup_list_id)
  const { data: record, error } = await supabase
    .from('clickup_crm_records')
    .upsert(row, { onConflict: 'clickup_task_id' })
    .select('*')
    .single()

  if (error) throw error
  return record
}

export async function deleteClickUpRecord(recordId: string) {
  const supabase = createServiceClient()

  const { data: existing, error: fetchError } = await supabase
    .from('clickup_crm_records')
    .select('clickup_task_id')
    .eq('id', recordId)
    .single()

  if (fetchError || !existing) throw new Error('Record niet gevonden')

  // Delete from ClickUp
  await deleteTask(existing.clickup_task_id)

  // Remove from Supabase
  const { error } = await supabase
    .from('clickup_crm_records')
    .delete()
    .eq('id', recordId)

  if (error) throw error
  return { ok: true }
}

// ── Promote: Lead → Opdracht, Opdracht → Factuur ─────────────────

interface PromoteFieldMap {
  // Map by source field NAME to target field ID. Same option IDs across lists are assumed.
  byName: Record<string, string>
  // Field on the new task that should point back to the source task (list_relationship/tasks type)
  linkBackFieldId?: string
}

const PROMOTE_MAPS: Record<string, { target: ClickUpCrmEntityType; namePrefix?: string; map: PromoteFieldMap }> = {
  lead: {
    target: 'assignment',
    map: {
      byName: {
        'Bedrijf':           'fb3e499a-13b3-4b8c-bb57-a2e3320f2ac4', // tasks
        'Contactpersoon':    'b73a826d-65f1-4a9e-8704-30a72c895a22', // tasks (opdrachten variant)
        'Producten':         '1779bd17-3a93-4225-957a-4207ed3c7a0b', // labels (same IDs)
        'Prijs incl. BTW':   '8af0534c-7fe9-4b0f-9c30-5bcf6ccbdd62', // currency
        'Details opdracht':  '00506327-dc13-43a4-a1c2-09395c221824', // text
        'Type kans':         'b1f8c0ba-c1b5-4c9e-9da8-7e22c40ff6cf', // drop_down (same option IDs)
        'Bron':              '439f9f24-9a74-42f6-a7cb-70cecd224780', // drop_down (same option IDs)
        'Op initiatief van': '7d7b4687-56c7-4513-9fc4-b2ad1e9b10e6', // drop_down (same option IDs)
      },
      linkBackFieldId: '873d8435-aefd-49ab-b891-2a0b5ae35a80', // "Gekoppelde lead" on opdrachten
    },
  },
  assignment: {
    target: 'clickup_invoice',
    namePrefix: 'Factuur: ',
    map: {
      // Invoice list has different option IDs for dropdowns/labels, so skip those.
      // Only copy fields where the IDs and values are compatible.
      byName: {
        'Bedrijf':          'fb3e499a-13b3-4b8c-bb57-a2e3320f2ac4', // tasks
        'Contactpersoon':   'b73a826d-65f1-4a9e-8704-30a72c895a22', // tasks
        'Prijs incl. BTW':  '8af0534c-7fe9-4b0f-9c30-5bcf6ccbdd62', // currency
        'Details opdracht': '00506327-dc13-43a4-a1c2-09395c221824', // text
      },
    },
  },
}

function extractFieldValue(field: any): any {
  const v = field?.value
  if (v === null || v === undefined || v === '') return undefined

  const type = field?.type
  // For tasks / list_relationship, value comes back as array of task objects.
  // To SET these we need the task IDs in {add: [...]} format.
  if (type === 'tasks' || type === 'list_relationship') {
    if (!Array.isArray(v) || v.length === 0) return undefined
    const ids = v.map((t: any) => t?.id).filter(Boolean)
    if (!ids.length) return undefined
    return { add: ids }
  }
  // For drop_down, value is orderindex (number) but ClickUp wants the option ID (UUID) when writing.
  if (type === 'drop_down' && typeof v === 'number') {
    const opt = (field.type_config?.options || []).find((o: any) => o.orderindex === v)
    return opt?.id || undefined
  }
  // Labels: array of option IDs already
  // Currency / text / number: pass through
  return v
}

export async function promoteRecord(recordId: string) {
  const supabase = createServiceClient()

  const { data: source, error: fetchError } = await supabase
    .from('clickup_crm_records')
    .select('*')
    .eq('id', recordId)
    .single()

  if (fetchError || !source) throw new Error('Bron record niet gevonden')

  const promoteConfig = PROMOTE_MAPS[source.entity_type]
  if (!promoteConfig) {
    throw new Error(`Promote niet ondersteund voor ${source.entity_type}`)
  }

  const config = getClickUpConfig()
  const targetList = config.lists.find((l) => l.entityType === promoteConfig.target)
  if (!targetList) throw new Error(`Target lijst niet geconfigureerd: ${promoteConfig.target}`)

  // Build custom fields for the new task from the source's filled fields
  const sourceFields: any[] = source.custom_fields || []
  const customFieldsToSet: Array<{ id: string; value: any }> = []
  const seenTargets = new Set<string>()

  for (const sf of sourceFields) {
    const name = sf?.name
    if (!name) continue
    const targetFieldId = promoteConfig.map.byName[name]
    if (!targetFieldId) continue
    if (seenTargets.has(targetFieldId)) continue

    const value = extractFieldValue(sf)
    if (value === undefined) continue

    customFieldsToSet.push({ id: targetFieldId, value })
    seenTargets.add(targetFieldId)
  }

  // Link-back: point the new task at the source task
  if (promoteConfig.map.linkBackFieldId) {
    customFieldsToSet.push({
      id: promoteConfig.map.linkBackFieldId,
      value: { add: [source.clickup_task_id] },
    })
  }

  const newTaskName = `${promoteConfig.namePrefix || ''}${source.name}`

  // Create the bare task first, then set custom fields one by one
  // (ClickUp's update-field endpoint is required for relationships/tasks types)
  const newTask = await createTask(targetList.listId, { name: newTaskName })

  for (const field of customFieldsToSet) {
    try {
      await updateTask(newTask.id, { custom_fields: [field] })
    } catch (e: any) {
      // Don't abort the whole promote if one field fails — log and continue
      console.warn(`[promote] kon veld ${field.id} niet zetten:`, e?.message)
    }
  }

  // Re-fetch the freshly-created task so we get the populated custom fields
  // then mirror back to Supabase via the existing normalize flow
  const refreshed = await updateTask(newTask.id, {}) // no-op update returns the latest task
  const row = normalizeTask(refreshed, promoteConfig.target, targetList.listId)
  const { data: record, error: upsertError } = await supabase
    .from('clickup_crm_records')
    .upsert(row, { onConflict: 'clickup_task_id' })
    .select('*')
    .single()

  if (upsertError) throw upsertError
  return record
}

export function verifyClickUpWebhookSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.CLICKUP_WEBHOOK_SECRET
  if (!secret) return true

  const provided =
    headers.get('x-signature') ||
    headers.get('x-clickup-signature') ||
    headers.get('X-Signature') ||
    headers.get('X-ClickUp-Signature')

  if (!provided) return false

  const hmac = createHmac('sha256', secret).update(rawBody).digest('hex')
  const sha = createHash('sha256').update(rawBody + secret).digest('hex')
  const candidates = [hmac, sha]

  return candidates.some((candidate) => {
    try {
      return timingSafeEqual(Buffer.from(candidate), Buffer.from(provided))
    } catch {
      return false
    }
  })
}
