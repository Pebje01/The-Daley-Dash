import { createClient } from './server'
import { Abonnement, AbonnementStatus, AbonnementInterval, CompanyId, Client } from '../types'

// ── Types for DB rows ──────────────────────────────────────────────────────

interface DbAbonnement {
  id: string
  company_id: string
  client_name: string
  client_contact_person: string | null
  client_email: string | null
  client_phone: string | null
  client_address: string | null
  description: string
  amount: number
  btw_percentage: number
  interval: string
  status: string
  start_date: string
  end_date: string | null
  next_invoice_date: string | null
  last_invoice_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Mappers ────────────────────────────────────────────────────────────────

export function mapDbToAbonnement(row: DbAbonnement): Abonnement {
  return {
    id: row.id,
    companyId: row.company_id as CompanyId,
    client: {
      name: row.client_name,
      contactPerson: row.client_contact_person ?? undefined,
      email: row.client_email ?? undefined,
      phone: row.client_phone ?? undefined,
      address: row.client_address ?? undefined,
    },
    description: row.description,
    amount: row.amount,
    btwPercentage: row.btw_percentage,
    interval: row.interval as AbonnementInterval,
    status: row.status as AbonnementStatus,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    nextInvoiceDate: row.next_invoice_date ?? undefined,
    lastInvoiceDate: row.last_invoice_date ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function calculateNextInvoiceDate(startDate: string, interval: AbonnementInterval): string {
  const date = new Date(startDate)
  switch (interval) {
    case 'maandelijks':
      date.setMonth(date.getMonth() + 1)
      break
    case 'kwartaal':
      date.setMonth(date.getMonth() + 3)
      break
    case 'jaarlijks':
      date.setFullYear(date.getFullYear() + 1)
      break
  }
  return date.toISOString().split('T')[0]
}

// ── Queries ────────────────────────────────────────────────────────────────

interface AbonnementFilters {
  status?: AbonnementStatus | 'alle'
  companyId?: CompanyId | 'alle'
  search?: string
}

export async function getAbonnementen(filters?: AbonnementFilters): Promise<Abonnement[]> {
  const supabase = createClient()

  let query = supabase
    .from('abonnementen')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.status && filters.status !== 'alle') {
    query = query.eq('status', filters.status)
  }
  if (filters?.companyId && filters.companyId !== 'alle') {
    query = query.eq('company_id', filters.companyId)
  }
  if (filters?.search) {
    query = query.or(`client_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
  }

  const { data, error } = await query
  if (error) throw error

  return (data as DbAbonnement[]).map(row => mapDbToAbonnement(row))
}

export async function getAbonnement(id: string): Promise<Abonnement | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('abonnementen')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null

  return mapDbToAbonnement(data as DbAbonnement)
}

interface CreateAbonnementData {
  companyId: CompanyId
  client: Client
  description: string
  amount: number
  btwPercentage: number
  interval: AbonnementInterval
  startDate: string
  notes?: string
}

export async function createAbonnement(data: CreateAbonnementData): Promise<Abonnement> {
  const supabase = createClient()
  const now = new Date().toISOString()
  const nextInvoiceDate = calculateNextInvoiceDate(data.startDate, data.interval)

  const { data: row, error } = await supabase
    .from('abonnementen')
    .insert({
      company_id: data.companyId,
      client_name: data.client.name,
      client_contact_person: data.client.contactPerson ?? null,
      client_email: data.client.email ?? null,
      client_phone: data.client.phone ?? null,
      client_address: data.client.address ?? null,
      description: data.description,
      amount: data.amount,
      btw_percentage: data.btwPercentage,
      interval: data.interval,
      status: 'actief',
      start_date: data.startDate,
      end_date: null,
      next_invoice_date: nextInvoiceDate,
      last_invoice_date: null,
      notes: data.notes ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) throw error

  return mapDbToAbonnement(row as DbAbonnement)
}

export async function updateAbonnement(
  id: string,
  data: Partial<{
    companyId: CompanyId
    client: Client
    description: string
    amount: number
    btwPercentage: number
    interval: AbonnementInterval
    status: AbonnementStatus
    startDate: string
    endDate: string
    nextInvoiceDate: string
    lastInvoiceDate: string
    notes: string
  }>
): Promise<Abonnement> {
  const supabase = createClient()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (data.companyId !== undefined) update.company_id = data.companyId
  if (data.description !== undefined) update.description = data.description
  if (data.amount !== undefined) update.amount = data.amount
  if (data.btwPercentage !== undefined) update.btw_percentage = data.btwPercentage
  if (data.interval !== undefined) update.interval = data.interval
  if (data.status !== undefined) update.status = data.status
  if (data.startDate !== undefined) update.start_date = data.startDate
  if (data.endDate !== undefined) update.end_date = data.endDate
  if (data.nextInvoiceDate !== undefined) update.next_invoice_date = data.nextInvoiceDate
  if (data.lastInvoiceDate !== undefined) update.last_invoice_date = data.lastInvoiceDate
  if (data.notes !== undefined) update.notes = data.notes

  if (data.client) {
    update.client_name = data.client.name
    update.client_contact_person = data.client.contactPerson ?? null
    update.client_email = data.client.email ?? null
    update.client_phone = data.client.phone ?? null
    update.client_address = data.client.address ?? null
  }

  const { error } = await supabase
    .from('abonnementen')
    .update(update)
    .eq('id', id)

  if (error) throw error

  return getAbonnement(id) as Promise<Abonnement>
}

export async function deleteAbonnement(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('abonnementen').delete().eq('id', id)
  if (error) throw error
}
