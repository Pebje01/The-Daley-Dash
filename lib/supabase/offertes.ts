import { createClient } from './server'
import { Offerte, LineItem, CompanyId, OfferteStatus } from '../types'

// ── Types for DB rows ──────────────────────────────────────────────────────

interface DbOfferte {
  id: string
  number: string
  company_id: string
  client_name: string
  client_contact_person: string | null
  client_email: string | null
  client_phone: string | null
  client_address: string | null
  client_kvk: string | null
  client_btw: string | null
  date: string
  valid_until: string
  status: string
  subtotal: number
  btw_percentage: number
  btw_amount: number
  total: number
  notes: string | null
  intro_text: string | null
  terms_text: string | null
  payment_url: string | null
  slug: string | null
  password_hash: string | null
  is_public: boolean
  approved_at: string | null
  approved_by_name: string | null
  approved_by_email: string | null
  created_at: string
  updated_at: string
}

interface DbLineItem {
  id: string
  offerte_id: string
  sort_order: number
  description: string
  details: string | null
  quantity: number
  unit_price: number
  section_title: string | null
}

// ── Mappers ────────────────────────────────────────────────────────────────

export function mapDbToOfferte(row: DbOfferte, items: DbLineItem[] = []): Offerte {
  return {
    id: row.id,
    number: row.number,
    companyId: row.company_id as CompanyId,
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
    validUntil: row.valid_until,
    status: row.status as OfferteStatus,
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
    notes: row.notes ?? undefined,
    introText: row.intro_text ?? undefined,
    termsText: row.terms_text ?? undefined,
    paymentUrl: row.payment_url ?? undefined,
    slug: row.slug ?? undefined,
    passwordHash: row.password_hash ?? undefined,
    isPublic: row.is_public,
    approvedAt: row.approved_at ?? undefined,
    approvedByName: row.approved_by_name ?? undefined,
    approvedByEmail: row.approved_by_email ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── Queries ────────────────────────────────────────────────────────────────

interface OfferteFilters {
  status?: OfferteStatus | 'alle'
  companyId?: CompanyId | 'alle'
  search?: string
}

export async function getOffertes(filters?: OfferteFilters): Promise<Offerte[]> {
  const supabase = createClient()

  let query = supabase
    .from('offertes')
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

  // Fetch line items for all offertes
  const ids = (data as DbOfferte[]).map(o => o.id)
  let items: DbLineItem[] = []
  if (ids.length > 0) {
    const { data: itemData, error: itemError } = await supabase
      .from('line_items')
      .select('*')
      .in('offerte_id', ids)
    if (itemError) throw itemError
    items = itemData as DbLineItem[]
  }

  return (data as DbOfferte[]).map(row =>
    mapDbToOfferte(row, items.filter(i => i.offerte_id === row.id))
  )
}

export async function getOfferte(id: string): Promise<Offerte | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('offertes')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null

  const { data: items } = await supabase
    .from('line_items')
    .select('*')
    .eq('offerte_id', id)

  return mapDbToOfferte(data as DbOfferte, (items ?? []) as DbLineItem[])
}

export async function getOfferteBySlug(slug: string): Promise<Offerte | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('offertes')
    .select('*')
    .eq('slug', slug)
    .single()
  if (error) return null

  const { data: items } = await supabase
    .from('line_items')
    .select('*')
    .eq('offerte_id', (data as DbOfferte).id)

  return mapDbToOfferte(data as DbOfferte, (items ?? []) as DbLineItem[])
}

interface CreateOfferteData {
  number: string
  companyId: CompanyId
  client: Offerte['client']
  date: string
  validUntil: string
  items: LineItem[]
  subtotal: number
  btwPercentage: number
  btwAmount: number
  total: number
  notes?: string
  introText?: string
  termsText?: string
  paymentUrl?: string
  slug?: string
  passwordHash?: string
  isPublic?: boolean
}

export async function createOfferte(data: CreateOfferteData): Promise<Offerte> {
  const supabase = createClient()
  const now = new Date().toISOString()

  const { data: row, error } = await supabase
    .from('offertes')
    .insert({
      number: data.number,
      company_id: data.companyId,
      client_name: data.client.name,
      client_contact_person: data.client.contactPerson ?? null,
      client_email: data.client.email ?? null,
      client_phone: data.client.phone ?? null,
      client_address: data.client.address ?? null,
      client_kvk: data.client.kvk ?? null,
      client_btw: data.client.btw ?? null,
      date: data.date,
      valid_until: data.validUntil,
      status: 'concept',
      subtotal: data.subtotal,
      btw_percentage: data.btwPercentage,
      btw_amount: data.btwAmount,
      total: data.total,
      notes: data.notes ?? null,
      intro_text: data.introText ?? null,
      terms_text: data.termsText ?? null,
      payment_url: data.paymentUrl ?? null,
      slug: data.slug ?? null,
      password_hash: data.passwordHash ?? null,
      is_public: data.isPublic ?? false,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) throw error

  // Insert line items
  if (data.items.length > 0) {
    const { error: itemError } = await supabase
      .from('line_items')
      .insert(
        data.items.map((item, idx) => ({
          offerte_id: (row as DbOfferte).id,
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

  return getOfferte((row as DbOfferte).id) as Promise<Offerte>
}

export async function updateOfferte(
  id: string,
  data: Partial<{
    number: string
    companyId: CompanyId
    client: Offerte['client']
    date: string
    validUntil: string
    status: OfferteStatus
    items: LineItem[]
    subtotal: number
    btwPercentage: number
    btwAmount: number
    total: number
    notes: string
    introText: string
    termsText: string
    paymentUrl: string
    slug: string
    passwordHash: string
    isPublic: boolean
    approvedAt: string
    approvedByName: string
    approvedByEmail: string
  }>
): Promise<Offerte> {
  const supabase = createClient()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (data.number !== undefined) update.number = data.number
  if (data.companyId !== undefined) update.company_id = data.companyId
  if (data.date !== undefined) update.date = data.date
  if (data.validUntil !== undefined) update.valid_until = data.validUntil
  if (data.status !== undefined) update.status = data.status
  if (data.subtotal !== undefined) update.subtotal = data.subtotal
  if (data.btwPercentage !== undefined) update.btw_percentage = data.btwPercentage
  if (data.btwAmount !== undefined) update.btw_amount = data.btwAmount
  if (data.total !== undefined) update.total = data.total
  if (data.notes !== undefined) update.notes = data.notes
  if (data.introText !== undefined) update.intro_text = data.introText
  if (data.termsText !== undefined) update.terms_text = data.termsText
  if (data.paymentUrl !== undefined) update.payment_url = data.paymentUrl
  if (data.slug !== undefined) update.slug = data.slug
  if (data.passwordHash !== undefined) update.password_hash = data.passwordHash
  if (data.isPublic !== undefined) update.is_public = data.isPublic
  if (data.approvedAt !== undefined) update.approved_at = data.approvedAt
  if (data.approvedByName !== undefined) update.approved_by_name = data.approvedByName
  if (data.approvedByEmail !== undefined) update.approved_by_email = data.approvedByEmail

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
    .from('offertes')
    .update(update)
    .eq('id', id)

  if (error) throw error

  // Replace line items if provided
  if (data.items) {
    await supabase.from('line_items').delete().eq('offerte_id', id)
    if (data.items.length > 0) {
      const { error: itemError } = await supabase
        .from('line_items')
        .insert(
          data.items.map((item, idx) => ({
            offerte_id: id,
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

  return getOfferte(id) as Promise<Offerte>
}

export async function deleteOfferte(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('line_items').delete().eq('offerte_id', id)
  const { error } = await supabase.from('offertes').delete().eq('id', id)
  if (error) throw error
}

export async function getTodayOfferteCount(companyId?: CompanyId): Promise<number> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  let query = supabase
    .from('offertes')
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

export async function getOfferteStats() {
  const supabase = createClient()
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data: all, error } = await supabase
    .from('offertes')
    .select('id, status, total, subtotal, date, created_at')
  if (error) throw error

  const offertes = all ?? []
  const conceptOffertes = offertes.filter((o: any) => o.status === 'concept').length
  const openOffertes = offertes.filter((o: any) => o.status === 'verstuurd').length
  const totalOpenAmount = offertes
    .filter((o: any) => o.status === 'verstuurd')
    .reduce((sum: number, o: any) => sum + (o.total ?? 0), 0)
  const akkoordOffertes = offertes.filter((o: any) => o.status === 'akkoord').length
  const akkoordAmount = offertes
    .filter((o: any) => o.status === 'akkoord')
    .reduce((sum: number, o: any) => sum + (o.total ?? 0), 0)
  const acceptedThisMonth = offertes
    .filter((o: any) => o.status === 'akkoord' && o.created_at >= monthStart)
    .reduce((sum: number, o: any) => sum + (o.total ?? 0), 0)

  // Openstaande offertes deze maand (verstuurd)
  const openMonthOffertes = offertes.filter((o: any) => o.status === 'verstuurd' && o.date >= monthStart.split('T')[0])
  const openMonthCount = openMonthOffertes.length
  const openMonthAmount = openMonthOffertes.reduce((sum: number, o: any) => sum + (o.total ?? 0), 0)

  // Omzet berekeningen: alleen goedgekeurde offertes
  const yearOffertes = offertes.filter((o: any) => o.status === 'akkoord' && o.date >= yearStart.split('T')[0])
  const monthOffertes = offertes.filter((o: any) => o.status === 'akkoord' && o.date >= monthStart.split('T')[0])

  const revenueYear = yearOffertes.reduce((sum: number, o: any) => sum + (o.subtotal ?? 0), 0)
  const revenueYearIncl = yearOffertes.reduce((sum: number, o: any) => sum + (o.total ?? 0), 0)
  const revenueMonth = monthOffertes.reduce((sum: number, o: any) => sum + (o.subtotal ?? 0), 0)
  const revenueMonthIncl = monthOffertes.reduce((sum: number, o: any) => sum + (o.total ?? 0), 0)

  // Recent offertes (full data for dashboard)
  const recent = await getOffertes()
  const recentOffertes = recent.slice(0, 5)

  return {
    conceptOffertes,
    openOffertes,
    totalOffertes: offertes.length,
    totalOpenAmount,
    akkoordOffertes,
    akkoordAmount,
    acceptedThisMonth,
    openMonthCount,
    openMonthAmount,
    revenueYear,
    revenueYearIncl,
    revenueMonth,
    revenueMonthIncl,
    recentOffertes,
  }
}
