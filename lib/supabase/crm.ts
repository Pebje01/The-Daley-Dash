import { createClient } from '@/lib/supabase/server'

export interface CrmBedrijf {
  id: string
  clickup_id: string | null
  naam: string
  status: string | null
  website: string | null
  klantnummer: string | null
  notities: string | null
  created_at: string
  updated_at: string
  // joined
  contacten?: CrmContact[]
  opdrachten?: CrmOpdracht[]
}

export interface CrmContact {
  id: string
  clickup_id: string | null
  naam: string
  email: string | null
  telefoon: string | null
  beroep: string | null
  website: string | null
  bedrijf_id: string | null
  notities: string | null
  created_at: string
  updated_at: string
  // joined
  bedrijf?: Pick<CrmBedrijf, 'id' | 'naam' | 'status'> | null
}

export interface CrmOpdracht {
  id: string
  clickup_id: string | null
  naam: string
  status: string | null
  bedrijf_id: string | null
  contactpersoon_id: string | null
  details: string | null
  prijs_incl_btw: number | null
  datum_afgerond: string | null
  created_at: string
  updated_at: string
  // joined
  bedrijf?: Pick<CrmBedrijf, 'id' | 'naam'> | null
  contactpersoon?: Pick<CrmContact, 'id' | 'naam' | 'email'> | null
}

export async function getCrmBedrijven(): Promise<CrmBedrijf[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_bedrijven')
    .select('*')
    .order('naam')
  if (error) throw error
  return data ?? []
}

export async function getCrmContacten(): Promise<CrmContact[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_contacten')
    .select('*, bedrijf:crm_bedrijven(id, naam, status)')
    .order('naam')
  if (error) throw error
  return (data ?? []) as CrmContact[]
}

export async function getCrmOpdrachten(): Promise<CrmOpdracht[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_opdrachten')
    .select('*, bedrijf:crm_bedrijven(id, naam), contactpersoon:crm_contacten(id, naam, email)')
    .order('naam')
  if (error) throw error
  return (data ?? []) as CrmOpdracht[]
}

export async function updateCrmBedrijf(id: string, data: Partial<Pick<CrmBedrijf, 'naam' | 'status' | 'website' | 'klantnummer' | 'notities'>>) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('crm_bedrijven')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function updateCrmContact(id: string, data: Partial<Pick<CrmContact, 'naam' | 'email' | 'telefoon' | 'beroep' | 'website' | 'notities' | 'bedrijf_id'>>) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('crm_contacten')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
