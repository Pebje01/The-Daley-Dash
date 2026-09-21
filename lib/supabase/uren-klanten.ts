import { createClient } from './server'
import { UurKlant, CompanyId } from '../types'

interface DbUurKlant {
  id: string
  naam: string
  standaard_uurtarief: number
  company_id: string | null
  crm_bedrijf_id: string | null
  crm_record_id?: string | null
  contactpersoon: string | null
  adres: string | null
  postcode: string | null
  stad: string | null
  klantnummer: string | null
  email: string | null
  gearchiveerd_op?: string | null
  created_at: string
  updated_at: string
}

/** True als de fout komt doordat gearchiveerd_op nog niet in de tabel staat. */
function ontbrekendeArchiefKolom(error: any) {
  // Op de kolomnaam, niet op code 42703: die geldt voor elke ontbrekende kolom
  return /gearchiveerd_op/.test(error?.message || '')
}

/** True als de fout komt doordat crm_record_id nog niet in de tabel staat. */
function ontbrekendeCrmKolom(error: any) {
  return /crm_record_id/.test(error?.message || '')
}

function crmKolomFout() {
  return new Error(
    'Koppelen aan een CRM-bedrijf kan nog niet: draai eerst de migratie 20260918_uren_klanten_crm_record.sql in Supabase.'
  )
}

function archiefKolomFout() {
  return new Error(
    'Archiveren kan nog niet: draai eerst de migratie 20260911_uren_klanten_archief.sql in Supabase.'
  )
}

function mapDbToUurKlant(row: DbUurKlant): UurKlant {
  return {
    id: row.id,
    naam: row.naam,
    standaardUurtarief: Number(row.standaard_uurtarief),
    companyId: (row.company_id ?? undefined) as CompanyId | undefined,
    crmBedrijfId: row.crm_bedrijf_id ?? undefined,
    crmRecordId: row.crm_record_id ?? undefined,
    contactpersoon: row.contactpersoon ?? undefined,
    adres: row.adres ?? undefined,
    postcode: row.postcode ?? undefined,
    stad: row.stad ?? undefined,
    klantnummer: row.klantnummer ?? undefined,
    email: row.email ?? undefined,
    gearchiveerdOp: row.gearchiveerd_op ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Standaard alleen de actieve klanten: gearchiveerde horen niet meer tussen de
 * tabs van de urenregistratie te staan. Met metGearchiveerd krijg je ze er weer
 * bij, voor het archiefoverzicht en de klantenpagina.
 *
 * Zolang de migratie 20260911_uren_klanten_archief.sql niet gedraaid is, valt
 * dit terug op het gedrag zonder kolom. Lezen mag nooit stuk op een kolom die
 * er nog niet is; schrijven geeft wel een duidelijke fout.
 */
export async function getUurKlanten(
  companyId?: CompanyId | 'alle',
  opties?: { metGearchiveerd?: boolean }
): Promise<UurKlant[]> {
  const supabase = createClient()

  const haalOp = async (metArchiefKolom: boolean) => {
    let query = supabase
      .from('uren_klanten')
      .select('*')
      .order('naam', { ascending: true })

    if (companyId && companyId !== 'alle') {
      query = query.eq('company_id', companyId)
    }
    if (metArchiefKolom && !opties?.metGearchiveerd) {
      query = query.is('gearchiveerd_op', null)
    }
    return query
  }

  let { data, error } = await haalOp(true)
  if (error && ontbrekendeArchiefKolom(error)) {
    ;({ data, error } = await haalOp(false))
  }

  if (error) throw error
  return (data as DbUurKlant[]).map(mapDbToUurKlant)
}

interface CreateUurKlantData {
  naam: string
  standaardUurtarief?: number
  companyId?: CompanyId
  klantnummer?: string
  crmBedrijfId?: string
  crmRecordId?: string
}

export async function createUurKlant(data: CreateUurKlantData): Promise<UurKlant> {
  const supabase = createClient()
  const now = new Date().toISOString()

  const rij: Record<string, unknown> = {
    naam: data.naam,
    standaard_uurtarief: data.standaardUurtarief ?? 0,
    company_id: data.companyId ?? null,
    klantnummer: data.klantnummer ?? null,
    crm_bedrijf_id: data.crmBedrijfId ?? null,
    created_at: now,
    updated_at: now,
  }
  if (data.crmRecordId) rij.crm_record_id = data.crmRecordId

  const { data: row, error } = await supabase
    .from('uren_klanten')
    .insert(rij)
    .select()
    .single()

  // Liever een duidelijke fout dan een klant die stilletjes los van zijn bedrijf staat
  if (error && ontbrekendeCrmKolom(error)) throw crmKolomFout()
  if (error?.code === '23505' && /crm_record_id/.test(error.message)) {
    throw new Error('Dit bedrijf staat al in de urenregistratie')
  }
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
    /** Het CRM-bedrijf; null maakt de koppeling los. */
    crmRecordId: string | null
    /** true archiveert, false haalt hem terug. */
    gearchiveerd: boolean
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
  if (data.crmRecordId !== undefined) update.crm_record_id = data.crmRecordId
  if (data.gearchiveerd !== undefined) {
    update.gearchiveerd_op = data.gearchiveerd ? new Date().toISOString() : null
  }

  const { data: row, error } = await supabase
    .from('uren_klanten')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  // Archiveren zonder kolom stilletjes laten lopen zou betekenen dat je denkt
  // dat het gelukt is terwijl de klant gewoon blijft staan.
  if (error && ontbrekendeArchiefKolom(error) && data.gearchiveerd !== undefined) {
    throw archiefKolomFout()
  }
  if (error && ontbrekendeCrmKolom(error)) throw crmKolomFout()
  if (error?.code === '23505' && /klantnummer/.test(error.message)) {
    throw new Error(`Klantnummer ${data.klantnummer} hoort al bij een ander bedrijf`)
  }
  if (error) throw error
  return mapDbToUurKlant(row as DbUurKlant)
}

export async function deleteUurKlant(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('uren_klanten').delete().eq('id', id)
  if (error) throw error
}
