import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(path) {
  try {
    const content = readFileSync(path, 'utf-8')
    for (const line of content.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const idx = t.indexOf('=')
      if (idx === -1) continue
      const key = t.slice(0, idx)
      const val = t.slice(idx + 1)
      if (!process.env[key]) process.env[key] = val
    }
  } catch {}
}

loadEnv(new URL('../.env.local', import.meta.url).pathname)

const LIST_ENTITY = {
  '901517514509': 'lead',
  '901517514537': 'assignment',
  '901517727843': 'clickup_invoice',
  '901517516955': 'company',
  '901517516200': 'contact',
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const tasks = JSON.parse(readFileSync(new URL('./clickup-data.json', import.meta.url).pathname, 'utf-8'))
const now = new Date().toISOString()

const rows = tasks.map(t => ({
  entity_type: LIST_ENTITY[t.list?.id] || 'lead',
  clickup_task_id: String(t.id),
  clickup_list_id: String(t.list?.id || ''),
  name: t.name || '(zonder naam)',
  status: typeof t.status === 'string' ? t.status : (t.status?.status || null),
  url: t.url || null,
  archived: false,
  active: true,
  assignees: t.assignees || [],
  tags: t.tags || [],
  custom_fields: [],
  raw: t,
  synced_at: now,
  updated_at: now,
}))

// Insert in batches of 50
for (let i = 0; i < rows.length; i += 50) {
  const batch = rows.slice(i, i + 50)
  const { error } = await supabase
    .from('clickup_crm_records')
    .upsert(batch, { onConflict: 'clickup_task_id' })
  if (error) { console.error(`Batch ${i}: ${error.message}`); process.exit(1) }
  console.log(`Batch ${i}-${i + batch.length}: OK`)
}
console.log(`\nKlaar: ${rows.length} records ingevoerd`)
