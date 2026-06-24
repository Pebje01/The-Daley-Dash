import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/crm/statuses
 * Haalt de echte statusconfiguratie (volgorde, kleur, type) per CRM-lijst op uit
 * ClickUp, zodat de boards exact het ClickUp-bord nabouwen, inclusief lege kolommen.
 * In-memory gecachet (ClickUp-config wijzigt zelden) om de lijst-calls te beperken.
 */

const ENTITY_LIST_ENV: Record<string, string> = {
  lead: 'CLICKUP_LEADS_LIST_ID',
  company: 'CLICKUP_COMPANIES_LIST_ID',
  contact: 'CLICKUP_CONTACTS_LIST_ID',
  assignment: 'CLICKUP_ASSIGNMENTS_LIST_ID',
  clickup_invoice: 'CLICKUP_INVOICES_LIST_ID',
  daley_list: 'CLICKUP_DALEY_LIST_ID',
}

interface StatusCfg { status: string; color: string; type: string; orderindex: number }

let cache: { ts: number; data: Record<string, StatusCfg[]> } | null = null
const TTL_MS = 10 * 60 * 1000

async function fetchListStatuses(listId: string, apiKey: string): Promise<StatusCfg[] | null> {
  try {
    const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
      headers: { Authorization: apiKey },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    const statuses = (json?.statuses || []) as any[]
    return statuses
      .map((s) => ({
        status: String(s.status),
        color: String(s.color || ''),
        type: String(s.type || ''),
        orderindex: Number(s.orderindex) || 0,
      }))
      .sort((a, b) => a.orderindex - b.orderindex)
  } catch {
    return null
  }
}

export async function GET() {
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return NextResponse.json({ byEntity: cache.data, cached: true })
  }

  const apiKey = process.env.CLICKUP_API_KEY
  if (!apiKey) {
    return NextResponse.json({ byEntity: {}, error: 'CLICKUP_API_KEY ontbreekt' })
  }

  const byEntity: Record<string, StatusCfg[]> = {}
  await Promise.all(
    Object.entries(ENTITY_LIST_ENV).map(async ([entity, envVar]) => {
      const listId = process.env[envVar]
      if (!listId) return
      const statuses = await fetchListStatuses(listId, apiKey)
      if (statuses && statuses.length) byEntity[entity] = statuses
    })
  )

  cache = { ts: Date.now(), data: byEntity }
  return NextResponse.json({ byEntity })
}
