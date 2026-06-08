/**
 * Eenmalige ClickUp → Supabase import
 * Gebruik: node scripts/import-clickup.mjs
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Parse .env.local
function loadEnv(path) {
  try {
    const content = readFileSync(path, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx)
      const val = trimmed.slice(idx + 1)
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* bestand bestaat niet */ }
}

loadEnv(new URL('../.env.local', import.meta.url).pathname)
loadEnv(new URL('../.env.vercel', import.meta.url).pathname)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY

const LISTS = [
  { listId: process.env.CLICKUP_LEADS_LIST_ID,      entityType: 'lead' },
  { listId: process.env.CLICKUP_COMPANIES_LIST_ID,  entityType: 'company' },
  { listId: process.env.CLICKUP_CONTACTS_LIST_ID,   entityType: 'contact' },
  { listId: process.env.CLICKUP_ASSIGNMENTS_LIST_ID, entityType: 'assignment' },
  { listId: process.env.CLICKUP_INVOICES_LIST_ID,   entityType: 'clickup_invoice' },
].filter(l => l.listId)

if (!SUPABASE_URL || !SUPABASE_KEY || !CLICKUP_API_KEY) {
  console.error('Ontbrekende env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY of CLICKUP_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function fetchAllTasks(listId) {
  const tasks = []
  let page = 0
  while (true) {
    const res = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?page=${page}&include_closed=true&subtasks=true`,
      { headers: { Authorization: CLICKUP_API_KEY } }
    )
    if (!res.ok) throw new Error(`ClickUp API error ${res.status} voor lijst ${listId}`)
    const body = await res.json()
    const batch = body.tasks || []
    tasks.push(...batch)
    if (!body.last_page && batch.length === 100) {
      page++
    } else {
      break
    }
  }
  return tasks
}

function toIso(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (Number.isFinite(n)) {
    const ms = n < 1_000_000_000_000 ? n * 1000 : n
    return new Date(ms).toISOString()
  }
  const d = new Date(String(value))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function normalize(task, entityType, listId) {
  const now = new Date().toISOString()
  const status = typeof task.status === 'string' ? task.status : (task.status?.status || null)
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
    clickup_date_created: toIso(task.date_created),
    clickup_date_updated: toIso(task.date_updated),
    due_date: toIso(task.due_date),
    synced_at: now,
    updated_at: now,
    active: true,
  }
}

async function run() {
  let total = 0

  for (const { listId, entityType } of LISTS) {
    console.log(`\nLijst: ${entityType} (${listId})`)
    const tasks = await fetchAllTasks(listId)
    console.log(`  ${tasks.length} taken opgehaald`)

    if (tasks.length === 0) continue

    const rows = tasks.map(t => normalize(t, entityType, listId))
    const { error } = await supabase
      .from('clickup_crm_records')
      .upsert(rows, { onConflict: 'clickup_task_id' })

    if (error) {
      console.error(`  FOUT bij upsert: ${error.message}`)
    } else {
      console.log(`  ${rows.length} records opgeslagen`)
      total += rows.length
    }
  }

  console.log(`\nKlaar: ${total} records totaal in Supabase`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
