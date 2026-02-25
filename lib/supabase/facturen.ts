import { createClient } from './server'
import { Factuur, LineItem, CompanyId, FactuurStatus } from '../types'

// ── Types for DB rows ──────────────────────────────────────────────────────

interface DbFactuur {
  id: string
  number: string
  company_id: string
  offerte_id: string | null
  client_name: string
  client_contact_person: string | null
  client_email: string | null
  client_phone: string | null
  client_address: string | null
  client_kvk: string | null
  client_btw: string | null
  date: string
  due_date: string
  status: string
  subtotal: number
  btw_percentage: number
  btw_amount: number
  total: number
  paid_at: string | null
  mollie_payment_id: string | null
  mollie_payment_url: string | null
  notes: string | null
  slug: string | null
  created_at: string
  updated_at: string
}

interface DbFactuurLineItem {
  id: string
  factuur_id: string
  sort_order: number
  description: string
  details: string | null
  quantity: number
  unit_price: number
  section_title: string | null
}

// ── Mappers ────────────────────────────────────────────────────────────────

export function mapDbToFactuur(row: DbFactuur, items: DbFactuurLineItem[] = []): Factuur {
  return {
    id: row.id,
    number: row.number,
    companyId: row.company_id as CompanyId,
    offerteId: row.offerte_id ?? undefined,
    client: {
      name: row.client_name,
      contactPerson: row.client_contact_person ?? undefined,
      email: row.client_email ?? undefined,
      phone: row.client_phone ?? undefined,
      address: row.client_address ?? undefined,
      kvk: row.client_kvk ?? undefined,
      btw: row.client_btw ?? undefined,
    },
    date: row.date,
    dueDate: row.due_date,
    status: row.status as FactuurStatus,
    items: items
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(i => ({
        id: i.id,
        description: i.description,
        details: i.details ?? undefined,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        sectionTitle: i.section_title ?? undefined,
      })),
    subtotal: row.subtotal,
    btwPercentage: row.btw_percentage,
    btwAmount: row.btw_amount,
    total: row.total,
    paidAt: row.paid_at ?? undefined,
    molliePaymentId: row.mollie_payment_id ?? undefined,
    molliePaymentUrl: row.mollie_payment_url ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── Queries ────────────────────────────────────────────────────────────────

interface FactuurFilters {
  status?: FactuurStatus | 'alle'
  companyId?: CompanyId | 'alle'
  search?: string
}

export async function getFacturen(filters?: FactuurFilters): Promise<Factuur[]> {
  const supabase = createClient()

  let query = supabase
    .from('facturen')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.status && filters.status !== 'alle') {
    query = query.eq('status', filters.status)
  }
  if (filters?.companyId && filters.companyId !== 'alle') {
    query = query.eq('company_id', filters.companyId)
  }
  if (filters?.search) {
    query = query.or(`client_name.ilike.%${filters.search}%,number.ilike.%${filters.search}%`)
  }

  const { data, error } = await query
  if (error) throw error

  // Fetch line items for all facturen
  const ids = (data as DbFactuur[]).map(f => f.id)
  let items: DbFactuurLineItem[] = []
  if (ids.length > 0) {
    const { data: itemData, error: itemError } = await supabase
      .from('factuur_line_items')
      .select('*')
      .in('factuur_id', ids)
    if (itemError) throw itemError
    items = itemData as DbFactuurLineItem[]
  }

  return (data as DbFactuur[]).map(row =>
    mapDbToFactuur(row, items.filter(i => i.factuur_id === row.id))
  )
}

export async function getFactuur(id: string): Promise<Factuur | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('facturen')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null

  const { data: items } = await supabase
    .from('factuur_line_items')
    .select('*')
    .eq('factuur_id', id)

  return mapDbToFactuur(data as DbFactuur, (items ?? []) as DbFactuurLineItem[])
}

interface CreateFactuurData {
  number: string
  companyId: CompanyId
  offerteId?: string
  client: Factuur['client']
  date: string
  dueDate: string
  items: LineItem[]
  subtotal: number
  btwPercentage: number
  btwAmount: number
  total: number
  notes?: string
  slug?: string
}

export async function createFactuur(data: CreateFactuurData): Promise<Factuur> {
  const supabase = createClient()
  const now = new Date().toISOString()

  const { data: row, error } = await supabase
    .from('facturen')
    .insert({
      number: data.number,
      company_id: data.companyId,
      offerte_id: data.offerteId ?? null,
      client_name: data.client.name,
      client_contact_person: data.client.contactPerson ?? null,
      client_email: data.client.email ?? null,
      client_phone: data.client.phone ?? null,
      client_address: data.client.address ?? null,
      client_kvk: data.client.kvk ?? null,
      client_btw: data.client.btw ?? null,
      date: data.date,
      due_date: data.dueDate,
      status: 'concept',
      subtotal: data.subtotal,
      btw_percentage: data.btwPercentage,
      btw_amount: data.btwAmount,
      total: data.total,
      notes: data.notes ?? null,
      slug: data.slug ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) throw error

  // Insert line items
  if (data.items.length > 0) {
    const { error: itemError } = await supabase
      .from('factuur_line_items')
      .insert(
        data.items.map((item, idx) => ({
          factuur_id: (row as DbFactuur).id,
          sort_order: idx,
          description: item.description,
          details: item.details ?? null,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          section_title: item.sectionTitle ?? null,
        }))
      )
    if (itemError) throw itemError
  }

  return getFactuur((row as DbFactuur).id) as Promise<Factuur>
}

export async function updateFactuur(
  id: string,
  data: Partial<{
    number: string
    companyId: CompanyId
    offerteId: string
    client: Factuur['client']
    date: string
    dueDate: string
    status: FactuurStatus
    items: LineItem[]
    subtotal: number
    btwPercentage: number
    btwAmount: number
    total: number
    paidAt: string
    molliePaymentId: string
    molliePaymentUrl: string
    notes: string
  }>
): Promise<Factuur> {
  const supabase = createClient()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (data.number !== undefined) update.number = data.number
  if (data.companyId !== undefined) update.company_id = data.companyId
  if (data.offerteId !== undefined) update.offerte_id = data.offerteId
  if (data.date !== undefined) update.date = data.date
  if (data.dueDate !== undefined) update.due_date = data.dueDate
  if (data.status !== undefined) update.status = data.status
  if (data.subtotal !== undefined) update.subtotal = data.subtotal
  if (data.btwPercentage !== undefined) update.btw_percentage = data.btwPercentage
  if (data.btwAmount !== undefined) update.btw_amount = data.btwAmount
  if (data.total !== undefined) update.total = data.total
  if (data.paidAt !== undefined) update.paid_at = data.paidAt
  if (data.molliePaymentId !== undefined) update.mollie_payment_id = data.molliePaymentId
  if (data.molliePaymentUrl !== undefined) update.mollie_payment_url = data.molliePaymentUrl
  if (data.notes !== undefined) update.notes = data.notes

  if (data.client) {
    update.client_name = data.client.name
    update.client_contact_person = data.client.contactPerson ?? null
    update.client_email = data.client.email ?? null
    update.client_phone = data.client.phone ?? null
    update.client_address = data.client.address ?? null
    update.client_kvk = data.client.kvk ?? null
    update.client_btw = data.client.btw ?? null
  }

  const { error } = await supabase
    .from('facturen')
    .update(update)
    .eq('id', id)

  if (error) throw error

  // Replace line items if provided
  if (data.items) {
    await supabase.from('factuur_line_items').delete().eq('factuur_id', id)
    if (data.items.length > 0) {
      const { error: itemError } = await supabase
        .from('factuur_line_items')
        .insert(
          data.items.map((item, idx) => ({
            factuur_id: id,
            sort_order: idx,
            description: item.description,
            details: item.details ?? null,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            section_title: item.sectionTitle ?? null,
          }))
        )
      if (itemError) throw itemError
    }
  }

  return getFactuur(id) as Promise<Factuur>
}

export async function deleteFactuur(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('factuur_line_items').delete().eq('factuur_id', id)
  const { error } = await supabase.from('facturen').delete().eq('id', id)
  if (error) throw error
}

export async function getTodayFactuurCount(companyId?: CompanyId): Promise<number> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  let query = supabase
    .from('facturen')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${today}T00:00:00`)
    .lte('created_at', `${today}T23:59:59`)

  if (companyId) {
    query = query.eq('company_id', companyId)
  }

  const { count, error } = await query

  if (error) throw error
  return count ?? 0
}

export async function getFactuurStats() {
  const supabase = createClient()
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStr = now.toISOString().split('T')[0]

  const { data: all, error } = await supabase
    .from('facturen')
    .select('id, status, total, subtotal, date, due_date, paid_at, created_at')
  if (error) throw error

  const facturen = all ?? []

  // Openstaande facturen (verzonden)
  const openFacturen = facturen.filter((f: any) => f.status === 'verzonden').length
  const totalOpenAmount = facturen
    .filter((f: any) => f.status === 'verzonden')
    .reduce((sum: number, f: any) => sum + (f.total ?? 0), 0)

  // Te laat (verzonden + due_date verstreken)
  const overdueFacturen = facturen.filter(
    (f: any) => (f.status === 'verzonden' || f.status === 'te-laat') && f.due_date < todayStr
  ).length

  // Betaald deze maand
  const paidThisMonth = facturen
    .filter((f: any) => f.status === 'betaald' && f.paid_at && f.paid_at >= monthStart)
    .reduce((sum: number, f: any) => sum + (f.total ?? 0), 0)

  // Openstaande facturen deze maand (verzonden)
  const openMonthFacturen = facturen.filter(
    (f: any) => f.status === 'verzonden' && f.date >= monthStart.split('T')[0]
  )
  const openMonthCount = openMonthFacturen.length
  const openMonthAmount = openMonthFacturen.reduce((sum: number, f: any) => sum + (f.total ?? 0), 0)

  // Omzet berekeningen: alleen betaalde facturen
  const yearFacturen = facturen.filter(
    (f: any) => f.status === 'betaald' && f.date >= yearStart.split('T')[0]
  )
  const monthFacturen = facturen.filter(
    (f: any) => f.status === 'betaald' && f.date >= monthStart.split('T')[0]
  )

  const revenueYear = yearFacturen.reduce((sum: number, f: any) => sum + (f.subtotal ?? 0), 0)
  const revenueYearIncl = yearFacturen.reduce((sum: number, f: any) => sum + (f.total ?? 0), 0)
  const revenueMonth = monthFacturen.reduce((sum: number, f: any) => sum + (f.subtotal ?? 0), 0)
  const revenueMonthIncl = monthFacturen.reduce((sum: number, f: any) => sum + (f.total ?? 0), 0)

  // Recent facturen (full data for dashboard)
  const recent = await getFacturen()
  const recentFacturen = recent.slice(0, 5)

  return {
    openFacturen,
    totalFacturen: facturen.length,
    totalOpenAmount,
    overdueFacturen,
    paidThisMonth,
    openMonthCount,
    openMonthAmount,
    revenueYear,
    revenueYearIncl,
    revenueMonth,
    revenueMonthIncl,
    recentFacturen,
  }
}
