import { createClient } from './server'
import { Factuur, LineItem, CompanyId, FactuurStatus } from '../types'
import { EIGEN_BEDRIJVEN } from '../btw'

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
  exclude_from_revenue: boolean
  revenue_date: string | null
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
    excludeFromRevenue: row.exclude_from_revenue ?? false,
    revenueDate: row.revenue_date ?? undefined,
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

  // Alleen de eigen bedrijven. Montung is een aparte VOF met een eigen
  // administratie; oude montung-rijen mogen niet meetellen in deze lijst.
  let query = supabase
    .from('facturen')
    .select('*')
    .in('company_id', EIGEN_BEDRIJVEN)
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
    excludeFromRevenue: boolean
    revenueDate: string | null
    paidAt: string | null
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
  if (data.status !== undefined) {
    update.status = data.status
    // Houd paid_at consistent met de status: betaald krijgt altijd een
    // betaaldatum, elke andere status wist hem (tenzij expliciet meegegeven)
    if (data.status === 'betaald' && data.paidAt === undefined) {
      update.paid_at = new Date().toISOString()
    } else if (data.status !== 'betaald' && data.paidAt === undefined) {
      update.paid_at = null
    }
  }
  if (data.subtotal !== undefined) update.subtotal = data.subtotal
  if (data.btwPercentage !== undefined) update.btw_percentage = data.btwPercentage
  if (data.btwAmount !== undefined) update.btw_amount = data.btwAmount
  if (data.total !== undefined) update.total = data.total
  if (data.excludeFromRevenue !== undefined) update.exclude_from_revenue = data.excludeFromRevenue
  if (data.revenueDate !== undefined) update.revenue_date = data.revenueDate ?? null
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

/**
 * Statussen die betekenen: deze factuur is de deur uit. Dat is een wettelijk
 * document, dus die verdwijnt nooit zomaar. Alleen met een expliciete
 * bevestiging vanuit de interface, nooit door een automatisch proces.
 */
export const VERSTUURDE_STATUSSEN: FactuurStatus[] = [
  'verzonden', 'herinnering-verzonden', 'betaald', 'te-laat',
]

export interface VerwijderOpties {
  /** Waar de verwijdering vandaan komt, voor de prullenbak: 'dashboard', 'uren-restore', 'sync' */
  bron: string
  reden?: string
  /**
   * Nodig zodra de factuur al verstuurd is. Zonder deze vlag weigert de helper,
   * zodat een achtergrondproces er nooit per ongeluk een weg kan gooien.
   */
  bevestigdVerstuurd?: boolean
}

export class FactuurVerstuurdError extends Error {
  constructor(public factuurnummer: string, public status: string) {
    super(`Factuur ${factuurnummer} heeft status "${status}" en is dus verstuurd. Verwijderen kan alleen met een expliciete bevestiging.`)
    this.name = 'FactuurVerstuurdError'
  }
}

/**
 * De enige plek waar een factuur uit Supabase verdwijnt.
 *
 * Achtergrond: de bestandssync verwijderde op 1 augustus 2026 een verstuurde
 * factuur omdat de PDF verplaatst was. Er was geen prullenbak, geen bevestiging
 * en geen bruikbare back-up. Sindsdien geldt: elke verwijdering gaat hier
 * doorheen, legt eerst een volledige kopie in `facturen_prullenbak` en geeft de
 * gekoppelde uren weer vrij.
 *
 * Uren vrijgeven hoorde hier thuis en niet alleen in de uren-restore route:
 * anders blijven ze op `gefactureerd` staan met een nummer dat niet meer
 * bestaat, en verdwijnen ze stil uit je nog te factureren werk.
 */
export async function verwijderFactuurVeilig(
  id: string,
  opties: VerwijderOpties,
): Promise<{ number: string; urenVrijgegeven: number }> {
  const supabase = createClient()

  const { data: rij, error: leesFout } = await supabase
    .from('facturen')
    .select('*')
    .eq('id', id)
    .single()
  if (leesFout || !rij) throw leesFout ?? new Error('Factuur niet gevonden')

  const factuur = rij as DbFactuur
  if (
    VERSTUURDE_STATUSSEN.includes(factuur.status as FactuurStatus) &&
    !opties.bevestigdVerstuurd
  ) {
    throw new FactuurVerstuurdError(factuur.number, factuur.status)
  }

  const { data: regels } = await supabase
    .from('factuur_line_items')
    .select('*')
    .eq('factuur_id', id)
    .order('sort_order')

  // Eerst de kopie, dan pas verwijderen. Loopt de kopie stuk, dan blijft de
  // factuur gewoon staan.
  const { error: kopieFout } = await supabase.from('facturen_prullenbak').insert({
    factuur_id: factuur.id,
    number: factuur.number,
    company_id: factuur.company_id,
    client_name: factuur.client_name,
    status: factuur.status,
    date: factuur.date,
    total: factuur.total,
    bron: opties.bron,
    reden: opties.reden ?? null,
    factuur: rij,
    regels: regels ?? [],
  })
  if (kopieFout) throw kopieFout

  const { data: vrijgegeven } = await supabase
    .from('uren')
    .update({ gefactureerd: false, factuurnummer: null, updated_at: new Date().toISOString() })
    .eq('factuurnummer', factuur.number)
    .select('id')

  await supabase.from('factuur_line_items').delete().eq('factuur_id', id)
  const { error } = await supabase.from('facturen').delete().eq('id', id)
  if (error) throw error

  return { number: factuur.number, urenVrijgegeven: vrijgegeven?.length ?? 0 }
}

/** Zet een factuur uit de prullenbak terug, inclusief regels. */
export async function herstelFactuurUitPrullenbak(prullenbakId: string): Promise<string> {
  const supabase = createClient()

  const { data: bak, error: leesFout } = await supabase
    .from('facturen_prullenbak')
    .select('*')
    .eq('id', prullenbakId)
    .single()
  if (leesFout || !bak) throw leesFout ?? new Error('Niet gevonden in de prullenbak')

  const rij = (bak as { factuur: Record<string, unknown> }).factuur
  const regels = ((bak as { regels: Record<string, unknown>[] }).regels ?? [])

  const { error: insertFout } = await supabase.from('facturen').insert(rij)
  if (insertFout) throw insertFout

  if (regels.length > 0) {
    const { error: regelFout } = await supabase.from('factuur_line_items').insert(regels)
    if (regelFout) throw regelFout
  }

  await supabase.from('facturen_prullenbak').delete().eq('id', prullenbakId)
  return String((rij as { number?: string }).number ?? '')
}

/**
 * @deprecated Gebruik `verwijderFactuurVeilig`. Deze wrapper blijft bestaan voor
 * bestaande aanroepen en verwijdert nooit een verstuurde factuur zonder bevestiging.
 */
export async function deleteFactuur(id: string, opties?: Partial<VerwijderOpties>): Promise<void> {
  await verwijderFactuurVeilig(id, { bron: 'dashboard', ...opties })
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

export interface MaandRegel {
  maand: string
  openstaand: number
  offertes: number
  uren: number
  totaal: number
}

export async function getFactuurStats() {
  const supabase = createClient()
  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const todayStr = now.toISOString().split('T')[0]

  const [
    { data: all, error },
    { data: urenRows },
    { data: pipelineOffertes },
    recent,
  ] = await Promise.all([
    supabase.from('facturen')
      .select('id, number, client_name, status, total, subtotal, date, due_date, paid_at, created_at, offerte_id, exclude_from_revenue, revenue_date')
      .in('company_id', EIGEN_BEDRIJVEN),
    supabase.from('uren').select('datum, uren, uurtarief, gefactureerd'),
    supabase.from('offertes').select('id, subtotal, total, status, date').in('status', ['akkoord', 'verstuurd']),
    getFacturen(),
  ])
  if (error) throw error

  const facturen = (all ?? []).filter((f: any) => !f.exclude_from_revenue)

  // Zelfde semantiek als de facturenpagina: omzet telt op revenue_date als die gezet is
  const effectiveDate = (f: any): string => ((f.revenue_date || f.date || '') as string).split('T')[0]

  // Actieve facturen: verzonden + herinnering + betaald + te-laat (niet concept/geannuleerd), dit jaar
  const activeStatuses = ['verzonden', 'herinnering-verzonden', 'betaald', 'te-laat']
  const activeFacturen = facturen.filter(
    (f: any) => activeStatuses.includes(f.status) && effectiveDate(f) >= yearStart
  )

  // Openstaande facturen (verzonden of herinnering verzonden)
  const openStatuses = ['verzonden', 'herinnering-verzonden']
  const openFacturen = facturen.filter((f: any) => openStatuses.includes(f.status)).length
  const totalOpenAmount = facturen
    .filter((f: any) => openStatuses.includes(f.status))
    .reduce((sum: number, f: any) => sum + (f.total ?? 0), 0)

  // Te laat (openstaand + due_date verstreken)
  const overdueFacturen = facturen.filter(
    (f: any) => (openStatuses.includes(f.status) || f.status === 'te-laat') && f.due_date < todayStr
  ).length

  // Betaald deze maand: echte cashflow, op betaaldatum (paid_at), niet op factuurdatum
  const paidDate = (f: any): string => ((f.paid_at || '') as string).split('T')[0]
  const paidThisMonth = facturen
    .filter((f: any) => f.status === 'betaald' && paidDate(f) >= monthStart)
    .reduce((sum: number, f: any) => sum + (f.total ?? 0), 0)

  // Omzet (factuurstelsel): elke verstuurde/betaalde factuur telt in zijn factuurjaar,
  // ongeacht of hij al betaald is. Zo sluit het dashboard aan op de IB-aangifte.
  const yearFacturen = facturen.filter((f: any) => activeStatuses.includes(f.status) && effectiveDate(f) >= yearStart)
  const monthFacturen = facturen.filter((f: any) => activeStatuses.includes(f.status) && effectiveDate(f) >= monthStart)

  const revenueYear = yearFacturen.reduce((sum: number, f: any) => sum + (f.subtotal ?? 0), 0)
  const revenueYearIncl = yearFacturen.reduce((sum: number, f: any) => sum + (f.total ?? 0), 0)
  const revenueMonth = monthFacturen.reduce((sum: number, f: any) => sum + (f.subtotal ?? 0), 0)
  const revenueMonthIncl = monthFacturen.reduce((sum: number, f: any) => sum + (f.total ?? 0), 0)

  // Omzet per maand voor het hele jaar, zodat je op het dashboard door de maanden
  // kunt bladeren. Op de eerste van de maand staat "deze maand" namelijk op nul en
  // lijkt het alsof er niets gebeurt, terwijl de maand ervoor juist goed was.
  const omzetPerMaand = Array.from({ length: now.getMonth() + 1 }, (_, i) => {
    const maand = `${now.getFullYear()}-${String(i + 1).padStart(2, '0')}`
    const regels = yearFacturen.filter((f: any) => effectiveDate(f).startsWith(maand))

    // Wat er in die maand echt binnenkwam, op betaaldatum. Dat kan een factuur uit
    // een eerdere maand of zelfs een eerder jaar zijn, dus hier kijken we naar alle
    // facturen en niet alleen naar die van dit jaar.
    const ontvangen = facturen
      .filter((f: any) => f.status === 'betaald' && String(f.paid_at ?? '').startsWith(maand))
      .reduce((sum: number, f: any) => sum + (f.total ?? 0), 0)

    return {
      maand,
      label: new Date(`${maand}-01T12:00:00`).toLocaleDateString('nl-NL', { month: 'long' }),
      excl: regels.reduce((sum: number, f: any) => sum + (f.subtotal ?? 0), 0),
      incl: regels.reduce((sum: number, f: any) => sum + (f.total ?? 0), 0),
      aantal: regels.length,
      ontvangen,
      // De facturen zelf, zodat je vanaf het dashboard direct kunt doorklikken
      // naar wat die maand precies opbouwt.
      facturen: regels
        .slice()
        .sort((a: any, b: any) => effectiveDate(b).localeCompare(effectiveDate(a)))
        .map((f: any) => ({
          id: f.id,
          nummer: f.number,
          klant: f.client_name,
          bedrag: f.total ?? 0,
          status: f.status,
        })),
    }
  })

  // Verwachte omzet: actieve facturen + akkoord/verstuurd offertes ZONDER bijbehorende factuur + open uren
  const invoicedOfferteIds = new Set(
    facturen
      .filter((f: any) => f.offerte_id && f.status !== 'geannuleerd')
      .map((f: any) => f.offerte_id)
  )

  const uninvoicedOffertes = (pipelineOffertes ?? []).filter(
    (o: any) => !invoicedOfferteIds.has(o.id)
  )

  // Alleen niet-gefactureerde uren; gefactureerde uren zitten al in de facturen
  const openUren = (urenRows ?? []).filter((u: any) => !u.gefactureerd)
  const urenSubtotal = openUren.reduce(
    (sum: number, u: any) => sum + (u.uren ?? 0) * (u.uurtarief ?? 0),
    0
  )

  // Verwacht is wat er nog MOET komen. Een betaalde factuur is geen verwachting
  // meer maar gerealiseerde omzet, die telde hier eerst ten onrechte in mee.
  const nogTeOntvangen = facturen.filter(
    (f: any) => openStatuses.includes(f.status) || f.status === 'te-laat'
  )

  const verwachteOmzet =
    nogTeOntvangen.reduce((sum: number, f: any) => sum + (f.subtotal ?? 0), 0) +
    uninvoicedOffertes.reduce((sum: number, o: any) => sum + (o.subtotal ?? 0), 0) +
    urenSubtotal
  const verwachteOmzetIncl =
    nogTeOntvangen.reduce((sum: number, f: any) => sum + (f.total ?? 0), 0) +
    uninvoicedOffertes.reduce((sum: number, o: any) => sum + (o.total ?? 0), 0) +
    urenSubtotal * 1.21

  // Verwachte omzet per maand: alleen openstaande facturen (verzonden/te-laat) + uren
  const maandMap = new Map<string, { openstaand: number; uren: number }>()
  const addToMaand = (maand: string, type: 'openstaand' | 'uren', amount: number) => {
    if (!maandMap.has(maand)) maandMap.set(maand, { openstaand: 0, uren: 0 })
    maandMap.get(maand)![type] += amount
  }

  facturen
    .filter((f: any) => openStatuses.includes(f.status) || f.status === 'te-laat')
    .forEach((f: any) => {
      if (f.due_date) addToMaand(f.due_date.substring(0, 7), 'openstaand', f.subtotal ?? 0)
    })
  openUren.forEach((u: any) => {
    if (u.datum) addToMaand(u.datum.substring(0, 7), 'uren', (u.uren ?? 0) * (u.uurtarief ?? 0))
  })

  const perMaand: MaandRegel[] = Array.from(maandMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([maand, { openstaand, uren: u }]) => ({
      maand,
      openstaand,
      offertes: 0,
      uren: u,
      totaal: openstaand + u,
    }))

  const recentFacturen = recent.slice(0, 5)

  return {
    openFacturen,
    totalFacturen: facturen.length,
    totalOpenAmount,
    overdueFacturen,
    paidThisMonth,
    revenueYear,
    revenueYearIncl,
    revenueMonth,
    revenueMonthIncl,
    omzetPerMaand,
    verwachteOmzet,
    verwachteOmzetIncl,
    recentFacturen,
    perMaand,
  }
}
