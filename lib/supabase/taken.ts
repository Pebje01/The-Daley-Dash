import { createClient } from './server'
import { Taak } from '../types'

interface DbTaak {
  id: string
  title: string
  description: string | null
  done: boolean
  scheduled_date: string | null
  created_at: string
}

function mapDbToTaak(row: DbTaak): Taak {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    done: row.done,
    scheduledDate: row.scheduled_date ?? undefined,
    createdAt: row.created_at,
  }
}

export async function getTaken(): Promise<Taak[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('taken')
    .select('*')
    .order('done', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapDbToTaak)
}

export async function createTaak(data: { title: string; description?: string; scheduledDate?: string }): Promise<Taak> {
  const supabase = createClient()
  const { data: row, error } = await supabase
    .from('taken')
    .insert({ title: data.title, description: data.description ?? null, scheduled_date: data.scheduledDate ?? null })
    .select()
    .single()
  if (error) throw error
  return mapDbToTaak(row)
}

export async function updateTaak(id: string, data: Partial<{ title: string; description: string; done: boolean; scheduledDate: string | null }>): Promise<Taak> {
  const supabase = createClient()
  const update: Record<string, unknown> = {}
  if (data.title !== undefined) update.title = data.title
  if (data.description !== undefined) update.description = data.description
  if (data.done !== undefined) update.done = data.done
  if ('scheduledDate' in data) update.scheduled_date = data.scheduledDate ?? null
  const { data: row, error } = await supabase
    .from('taken')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return mapDbToTaak(row)
}

export async function deleteTaak(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('taken').delete().eq('id', id)
  if (error) throw error
}
