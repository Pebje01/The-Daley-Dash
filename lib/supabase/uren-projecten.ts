import { createClient } from './server'
import { UurProject, CompanyId } from '../types'

// ── Types for DB rows ──────────────────────────────────────────────────────

interface DbUurProject {
  id: string
  company_id: string
  klant: string
  naam: string
  aantal: number | null
  prijs: number | null
  bedrag: number
  datum: string
  omschrijving: string | null
  status: string
  created_at: string
  updated_at: string
}

// ── Mappers ────────────────────────────────────────────────────────────────

function mapDbToUurProject(row: DbUurProject): UurProject {
  return {
    id: row.id,
    companyId: row.company_id as CompanyId,
    klant: row.klant,
    naam: row.naam,
    aantal: row.aantal != null ? Number(row.aantal) : undefined,
    prijs: row.prijs != null ? Number(row.prijs) : undefined,
    bedrag: Number(row.bedrag),
    datum: row.datum,
    omschrijving: row.omschrijving ?? undefined,
    status: row.status as UurProject['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── Queries ────────────────────────────────────────────────────────────────

interface UurProjectenFilters {
  companyId?: CompanyId | 'alle'
  klant?: string
  status?: UurProject['status'] | 'alle'
}

export async function getUurProjecten(filters?: UurProjectenFilters): Promise<UurProject[]> {
  const supabase = createClient()

  let query = supabase
    .from('uren_projecten')
    .select('*')
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters?.companyId && filters.companyId !== 'alle') {
    query = query.eq('company_id', filters.companyId)
  }
  if (filters?.klant) {
    query = query.eq('klant', filters.klant)
  }
  if (filters?.status && filters.status !== 'alle') {
    query = query.eq('status', filters.status)
  }

  const { data, error } = await query
  if (error) throw error

  return (data as DbUurProject[]).map(mapDbToUurProject)
}

export async function getUurProject(id: string): Promise<UurProject | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('uren_projecten')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null

  return mapDbToUurProject(data as DbUurProject)
}

interface CreateUurProjectData {
  companyId: CompanyId
  klant: string
  naam: string
  aantal?: number
  prijs?: number
  bedrag: number
  datum: string
  omschrijving?: string
  status?: UurProject['status']
}

export async function createUurProject(data: CreateUurProjectData): Promise<UurProject> {
  const supabase = createClient()
  const now = new Date().toISOString()

  const { data: row, error } = await supabase
    .from('uren_projecten')
    .insert({
      company_id: data.companyId,
      klant: data.klant,
      naam: data.naam,
      aantal: data.aantal ?? null,
      prijs: data.prijs ?? null,
      bedrag: data.bedrag,
      datum: data.datum,
      omschrijving: data.omschrijving ?? null,
      status: data.status ?? 'actief',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) throw error

  return mapDbToUurProject(row as DbUurProject)
}

export async function updateUurProject(
  id: string,
  data: Partial<{
    klant: string
    naam: string
    aantal: number
    prijs: number
    bedrag: number
    datum: string
    omschrijving: string
    status: UurProject['status']
  }>
): Promise<UurProject> {
  const supabase = createClient()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (data.klant !== undefined) update.klant = data.klant
  if (data.naam !== undefined) update.naam = data.naam
  if (data.aantal !== undefined) update.aantal = data.aantal
  if (data.prijs !== undefined) update.prijs = data.prijs
  if (data.bedrag !== undefined) update.bedrag = data.bedrag
  if (data.datum !== undefined) update.datum = data.datum
  if (data.omschrijving !== undefined) update.omschrijving = data.omschrijving
  if (data.status !== undefined) update.status = data.status

  const { error } = await supabase
    .from('uren_projecten')
    .update(update)
    .eq('id', id)

  if (error) throw error

  return getUurProject(id) as Promise<UurProject>
}

export async function deleteUurProject(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('uren_projecten').delete().eq('id', id)
  if (error) throw error
}
