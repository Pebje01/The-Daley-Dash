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

  // Retry bij transiente netwerkfouten en rate limiting (ClickUp: 100 req/min)
  const maxPogingen = 3
  let res: Response | undefined
  for (let poging = 1; poging <= maxPogingen; poging++) {
    try {
      res = await fetch(buildUrl(path, params), {
        ...init,
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
        cache: 'no-store',
      })
    } catch (e) {
      if (poging === maxPogingen) throw e
      await new Promise(r => setTimeout(r, poging * 2000))
      continue
    }
    if (res.status === 429 && poging < maxPogingen) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '0')
      await new Promise(r => setTimeout(r, (retryAfter || poging * 15) * 1000))
      continue
    }
    break
  }
  if (!res) throw new Error('ClickUp API onbereikbaar')

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`ClickUp API ${res.status}: ${body || res.statusText}`)
  }

  // ClickUp returns empty bodies for some endpoints (DELETE, custom field updates)
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
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

export async function getTask(taskId: string): Promise<ClickUpTask> {
  return clickUpFetch<ClickUpTask>(`/task/${taskId}`)
}

export interface CreateTaskPayload {
  name: string
  description?: string
  status?: string
  due_date?: number | null
  assignees?: number[]
  tags?: string[]
  custom_fields?: Array<{ id: string; value: any }>
}

export async function createTask(listId: string, payload: CreateTaskPayload): Promise<ClickUpTask> {
  return clickUpFetch<ClickUpTask>(`/list/${listId}/task`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface UpdateTaskPayload {
  name?: string
  description?: string
  status?: string
  due_date?: number | null
  assignees?: { add?: number[]; rem?: number[] }
  custom_fields?: Array<{ id: string; value: any }>
}

export async function updateTask(taskId: string, payload: UpdateTaskPayload): Promise<ClickUpTask> {
  const { custom_fields, ...rest } = payload

  // ClickUp requires custom_fields to be set via separate endpoint
  if (custom_fields?.length) {
    for (const field of custom_fields) {
      await clickUpFetch(`/task/${taskId}/field/${field.id}`, {
        method: 'POST',
        body: JSON.stringify({ value: field.value }),
      })
    }
  }

  return clickUpFetch<ClickUpTask>(`/task/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(rest),
  })
}

export async function deleteTask(taskId: string): Promise<void> {
  await clickUpFetch<any>(`/task/${taskId}`, { method: 'DELETE' })
}

export async function getTeams() {
  return clickUpFetch<any>('/team')
}

