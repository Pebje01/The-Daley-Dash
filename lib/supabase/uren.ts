import { createClient } from './server'
import { Uur, CompanyId } from '../types'

// ── Types for DB rows ──────────────────────────────────────────────────────

interface DbUur {
  id: string
  company_id: string
  datum: string
  klant: string
  project: string | null
  uren: number
  omschrijving: string | null
  uurtarief: number
  gefactureerd: boolean
  factuurnummer: string | null
  created_at: string
  updated_at: string
}

// ── Mappers ────────────────────────────────────────────────────────────────

function mapDbToUur(row: DbUur): Uur {
  return {
    id: row.id,
    companyId: row.company_id as CompanyId,
    datum: row.datum,
    klant: row.klant,
    project: row.project ?? undefined,
    uren: Number(row.uren),
    omschrijving: row.omschrijving ?? undefined,
    uurtarief: Number(row.uurtarief),
    gefactureerd: row.gefactureerd ?? false,
    factuurnummer: row.factuurnummer ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── Queries ────────────────────────────────────────────────────────────────

interface UrenFilters {
  companyId?: CompanyId | 'alle'
  datumVan?: string
  datumTot?: string
  klant?: string
  inclGefactureerd?: boolean
  alleenGefactureerd?: boolean
}

export async function getUren(filters?: UrenFilters): Promise<Uur[]> {
  const supabase = createClient()

  let query = supabase
    .from('uren')
    .select('*')
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters?.alleenGefactureerd) {
    query = query.eq('gefactureerd', true)
  } else if (!filters?.inclGefactureerd) {
    query = query.eq('gefactureerd', false)
  }
  if (filters?.companyId && filters.companyId !== 'alle') {
    query = query.eq('company_id', filters.companyId)
  }
  if (filters?.datumVan) {
    query = query.gte('datum', filters.datumVan)
  }
  if (filters?.datumTot) {
    query = query.lte('datum', filters.datumTot)
  }
  if (filters?.klant) {
    query = query.ilike('klant', `%${filters.klant}%`)
  }

  const { data, error } = await query
  if (error) throw error

  return (data as DbUur[]).map(row => mapDbToUur(row))
}

export async function getUur(id: string): Promise<Uur | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('uren')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null

  return mapDbToUur(data as DbUur)
}

interface CreateUurData {
  companyId: CompanyId
  datum: string
  klant: string
  project?: string
  uren: number
  omschrijving?: string
  uurtarief: number
}

export async function createUur(data: CreateUurData): Promise<Uur> {
  const supabase = createClient()
  const now = new Date().toISOString()

  const { data: row, error } = await supabase
    .from('uren')
    .insert({
      company_id: data.companyId,
      datum: data.datum,
      klant: data.klant,
      project: data.project ?? null,
      uren: data.uren,
      omschrijving: data.omschrijving ?? null,
      uurtarief: data.uurtarief,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) throw error

  return mapDbToUur(row as DbUur)
}

export async function updateUur(
  id: string,
  data: Partial<{
    companyId: CompanyId
    datum: string
    klant: string
    project: string
    uren: number
    omschrijving: string
    uurtarief: number
    gefactureerd: boolean
    factuurnummer: string | null
  }>
): Promise<Uur> {
  const supabase = createClient()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (data.companyId !== undefined) update.company_id = data.companyId
  if (data.datum !== undefined) update.datum = data.datum
  if (data.klant !== undefined) update.klant = data.klant
  if (data.project !== undefined) update.project = data.project
  if (data.uren !== undefined) update.uren = data.uren
  if (data.omschrijving !== undefined) update.omschrijving = data.omschrijving
  if (data.uurtarief !== undefined) update.uurtarief = data.uurtarief
  if (data.gefactureerd !== undefined) update.gefactureerd = data.gefactureerd
  if (data.factuurnummer !== undefined) update.factuurnummer = data.factuurnummer

  const { error } = await supabase
    .from('uren')
    .update(update)
    .eq('id', id)

  if (error) throw error

  return getUur(id) as Promise<Uur>
}

export async function deleteUur(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('uren').delete().eq('id', id)
  if (error) throw error
}
