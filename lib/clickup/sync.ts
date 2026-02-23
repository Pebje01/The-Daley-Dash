import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { getClickUpConfig, type ClickUpCrmEntityType } from '@/lib/clickup/config'
import { getAllListTasks, type ClickUpTask } from '@/lib/clickup/client'
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
