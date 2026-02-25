import { createClient } from './server'
import { Betaling, BetalingStatus, CompanyId, Client } from '../types'

// ── Types for DB rows ──────────────────────────────────────────────────────

interface DbBetaling {
  id: string
  factuur_id: string | null
  company_id: string
  client_name: string
  client_email: string | null
  amount: number
  status: string
  method: string | null
  mollie_payment_id: string | null
  reference: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Mappers ────────────────────────────────────────────────────────────────

export function mapDbToBetaling(row: DbBetaling): Betaling {
  return {
    id: row.id,
    factuurId: row.factuur_id ?? undefined,
    companyId: row.company_id as CompanyId,
    client: {
      name: row.client_name,
      email: row.client_email ?? undefined,
    },
    amount: row.amount,
    status: row.status as BetalingStatus,
    method: row.method ?? undefined,
    molliePaymentId: row.mollie_payment_id ?? undefined,
    reference: row.reference ?? undefined,
    paidAt: row.paid_at ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── Queries ────────────────────────────────────────────────────────────────

interface BetalingFilters {
  status?: BetalingStatus | 'alle'
  companyId?: CompanyId | 'alle'
  search?: string
}

export async function getBetalingen(filters?: BetalingFilters): Promise<Betaling[]> {
  const supabase = createClient()

  let query = supabase
    .from('betalingen')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.status && filters.status !== 'alle') {
    query = query.eq('status', filters.status)
  }
  if (filters?.companyId && filters.companyId !== 'alle') {
    query = query.eq('company_id', filters.companyId)
  }
  if (filters?.search) {
    query = query.or(`client_name.ilike.%${filters.search}%,reference.ilike.%${filters.search}%`)
  }

  const { data, error } = await query
  if (error) throw error

  return (data as DbBetaling[]).map(row => mapDbToBetaling(row))
}

export async function getBetaling(id: string): Promise<Betaling | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('betalingen')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null

  return mapDbToBetaling(data as DbBetaling)
}

interface CreateBetalingData {
  companyId: CompanyId
  client: Client
  amount: number
  method?: string
  reference?: string
  factuurId?: string
  notes?: string
}

export async function createBetaling(data: CreateBetalingData): Promise<Betaling> {
  const supabase = createClient()
  const now = new Date().toISOString()

  const { data: row, error } = await supabase
    .from('betalingen')
    .insert({
      factuur_id: data.factuurId ?? null,
      company_id: data.companyId,
      client_name: data.client.name,
      client_email: data.client.email ?? null,
      amount: data.amount,
      status: 'openstaand',
      method: data.method ?? null,
      mollie_payment_id: null,
      reference: data.reference ?? null,
      paid_at: null,
      notes: data.notes ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) throw error

  return mapDbToBetaling(row as DbBetaling)
}

export async function updateBetaling(
  id: string,
  data: Partial<{
    companyId: CompanyId
    client: Client
    amount: number
    status: BetalingStatus
    method: string
    molliePaymentId: string
    reference: string
    factuurId: string
    paidAt: string
    notes: string
  }>
): Promise<Betaling> {
  const supabase = createClient()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (data.companyId !== undefined) update.company_id = data.companyId
  if (data.amount !== undefined) update.amount = data.amount
  if (data.status !== undefined) update.status = data.status
  if (data.method !== undefined) update.method = data.method
  if (data.molliePaymentId !== undefined) update.mollie_payment_id = data.molliePaymentId
  if (data.reference !== undefined) update.reference = data.reference
  if (data.factuurId !== undefined) update.factuur_id = data.factuurId
  if (data.paidAt !== undefined) update.paid_at = data.paidAt
  if (data.notes !== undefined) update.notes = data.notes

  if (data.client) {
    update.client_name = data.client.name
    update.client_email = data.client.email ?? null
  }

  const { error } = await supabase
    .from('betalingen')
    .update(update)
    .eq('id', id)

  if (error) throw error

  return getBetaling(id) as Promise<Betaling>
}

export async function deleteBetaling(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('betalingen').delete().eq('id', id)
  if (error) throw error
}

export async function getBetalingStats() {
  const supabase = createClient()

  const { data: all, error } = await supabase
    .from('betalingen')
    .select('id, status, amount, paid_at')
  if (error) throw error

  const betalingen = all ?? []

  const totalPaid = betalingen
    .filter((b: any) => b.status === 'betaald')
    .reduce((sum: number, b: any) => sum + (b.amount ?? 0), 0)

  const totalOpen = betalingen
    .filter((b: any) => b.status === 'openstaand')
    .reduce((sum: number, b: any) => sum + (b.amount ?? 0), 0)

  const countPerStatus: Record<string, number> = {}
  for (const b of betalingen) {
    const s = (b as any).status as string
    countPerStatus[s] = (countPerStatus[s] ?? 0) + 1
  }

  return {
    totalPaid,
    totalOpen,
    countPerStatus,
    totalBetalingen: betalingen.length,
  }
}
