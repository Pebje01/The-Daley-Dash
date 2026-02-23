import { getClickUpConfig } from '@/lib/clickup/config'

export interface ClickUpTask {
  id: string
  name: string
  archived?: boolean
  url?: string
  status?: { status?: string; color?: string } | string
  tags?: Array<{ name?: string; tag_fg?: string; tag_bg?: string }>
  assignees?: Array<{ id?: number | string; username?: string; email?: string }>
  custom_fields?: any[]
  date_created?: string
  date_updated?: string
  due_date?: string | null
  list?: { id?: string; name?: string }
  folder?: { id?: string; name?: string }
  space?: { id?: string; name?: string }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
  const { apiBaseUrl } = getClickUpConfig()
  const url = new URL(path.replace(/^\//, ''), apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value))
    })
  }
  return url.toString()
}

export async function clickUpFetch<T>(path: string, init?: RequestInit, params?: Record<string, any>): Promise<T> {
  const { apiKey } = getClickUpConfig()

  const res = await fetch(buildUrl(path, params), {
    ...init,
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ClickUp API ${res.status}: ${body || res.statusText}`)
  }

  return res.json() as Promise<T>
}

export async function getListTasks(listId: string, page = 0): Promise<{ tasks: ClickUpTask[]; lastPage?: boolean }> {
  const data = await clickUpFetch<any>(`/list/${listId}/task`, undefined, {
    archived: false,
    include_closed: true,
    subtasks: true,
    page,
  })

  return {
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
    lastPage: typeof data?.last_page === 'boolean' ? data.last_page : undefined,
  }
}

export async function getAllListTasks(listId: string): Promise<ClickUpTask[]> {
  const all: ClickUpTask[] = []

  for (let page = 0; page < 100; page++) {
    const { tasks, lastPage } = await getListTasks(listId, page)
    all.push(...tasks)
    if (tasks.length === 0) break
    if (lastPage === true) break
    if (tasks.length < 100) break
  }

  return all
}

export async function getTeams() {
  return clickUpFetch<any>('/team')
}

