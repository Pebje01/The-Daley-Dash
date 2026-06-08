import { createClient } from './server'
import { UurKlant, CompanyId } from '../types'

interface DbUurKlant {
  id: string
  naam: string
  standaard_uurtarief: number
  company_id: string | null
  crm_bedrijf_id: string | null
  contactpersoon: string | null
  adres: string | null
  postcode: string | null
  stad: string | null
  klantnummer: string | null
  email: string | null
  created_at: string
  updated_at: string
}

function mapDbToUurKlant(row: DbUurKlant): UurKlant {
  return {
    id: row.id,
    naam: row.naam,
    standaardUurtarief: Number(row.standaard_uurtarief),
    companyId: (row.company_id ?? undefined) as CompanyId | undefined,
    crmBedrijfId: row.crm_bedrijf_id ?? undefined,
    contactpersoon: row.contactpersoon ?? undefined,
    adres: row.adres ?? undefined,
    postcode: row.postcode ?? undefined,
    stad: row.stad ?? undefined,
    klantnummer: row.klantnummer ?? undefined,
    email: row.email ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getUurKlanten(): Promise<UurKlant[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('uren_klanten')
    .select('*')
    .order('naam', { ascending: true })

  if (error) throw error
  return (data as DbUurKlant[]).map(mapDbToUurKlant)
}

interface CreateUurKlantData {
  naam: string
  standaardUurtarief?: number
  companyId?: CompanyId
  klantnummer?: string
  crmBedrijfId?: string
}

export async function createUurKlant(data: CreateUurKlantData): Promise<UurKlant> {
  const supabase = createClient()
  const now = new Date().toISOString()

  const { data: row, error } = await supabase
    .from('uren_klanten')
    .insert({
      naam: data.naam,
      standaard_uurtarief: data.standaardUurtarief ?? 0,
      company_id: data.companyId ?? null,
      klantnummer: data.klantnummer ?? null,
      crm_bedrijf_id: data.crmBedrijfId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) throw error
  return mapDbToUurKlant(row as DbUurKlant)
}

export async function updateUurKlant(
  id: string,
  data: Partial<{
    naam: string
    standaardUurtarief: number
    companyId: CompanyId
    contactpersoon: string
    adres: string
    postcode: string
    stad: string
    klantnummer: string
    email: string
  }>
): Promise<UurKlant> {
  const supabase = createClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (data.naam !== undefined) update.naam = data.naam
  if (data.standaardUurtarief !== undefined) update.standaard_uurtarief = data.standaardUurtarief
  if (data.companyId !== undefined) update.company_id = data.companyId
  if (data.contactpersoon !== undefined) update.contactpersoon = data.contactpersoon
  if (data.adres !== undefined) update.adres = data.adres
  if (data.postcode !== undefined) update.postcode = data.postcode
  if (data.stad !== undefined) update.stad = data.stad
  if (data.klantnummer !== undefined) update.klantnummer = data.klantnummer
  if (data.email !== undefined) update.email = data.email

  const { data: row, error } = await supabase
    .from('uren_klanten')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return mapDbToUurKlant(row as DbUurKlant)
}

export async function deleteUurKlant(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('uren_klanten').delete().eq('id', id)
  if (error) throw error
}
