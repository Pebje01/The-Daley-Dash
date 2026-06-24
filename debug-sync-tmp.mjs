import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const lists = [
  ['daley_list', env.CLICKUP_DALEY_LIST_ID],
  ['lead', env.CLICKUP_LEADS_LIST_ID],
  ['company', env.CLICKUP_COMPANIES_LIST_ID],
  ['contact', env.CLICKUP_CONTACTS_LIST_ID],
  ['assignment', env.CLICKUP_ASSIGNMENTS_LIST_ID],
  ['clickup_invoice', env.CLICKUP_INVOICES_LIST_ID],
]

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

for (const [type, listId] of lists) {
  if (!listId) { console.log(type, '— GEEN LIST ID'); continue }
  try {
    let all = []
    for (let page = 0; page < 100; page++) {
      const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task?archived=false&include_closed=true&subtasks=true&page=${page}`, {
        headers: { Authorization: env.CLICKUP_API_KEY },
      })
      if (!res.ok) throw new Error(`ClickUp ${res.status}`)
      const data = await res.json()
      all.push(...(data.tasks || []))
      if (data.last_page !== false || (data.tasks || []).length === 0) break
    }
    console.log(`${type}: ${all.length} taken opgehaald — OK`)
  } catch (e) {
    console.log(`${type}: FOUT bij ophalen — ${e.message} (cause: ${e.cause?.message || e.cause?.code || 'geen'})`)
  }
}
