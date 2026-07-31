/**
 * Gedeelde databewerking: een factuur-rij + zijn regels uit Supabase omzetten
 * naar de input die de PDF/HTML-builders (lib/pdf/factuurGenerator.ts) nodig
 * hebben. Gebruikt door zowel de regenerate-pdf route als de editor-route,
 * zodat beide gegarandeerd dezelfde factuur op dezelfde manier opbouwen.
 */
import { COMPANY_CONFIG, type CompanyKey, type FactuurRegel, type KlantData } from '@/lib/pdf/factuurGenerator'

export interface FactuurBouwData {
  company: CompanyKey
  factuurnummer: string
  klant: KlantData
  klantNaamVoorBestand: string
  regels: FactuurRegel[]
  factuurdatum: string
  vervaldatum: string
  betaallink?: string
  btwPercentage: number
  layoutOverrides: Record<string, number> | null
  /** Concept (C-reeks): PDF hoort in _Concepten, buiten de sync. */
  concept: boolean
}

/**
 * Leest de factuur + regels op uit Supabase en zet ze om naar builder-input.
 * Geeft `null` terug als de factuur niet bestaat of geen opgeslagen regels heeft.
 */
export async function laadFactuurBouwData(
  supabase: ReturnType<typeof import('@/lib/supabase/server').createClient>,
  factuurId: string,
): Promise<{ data: FactuurBouwData | null; error?: string }> {
  const { data: f, error } = await supabase.from('facturen').select('*').eq('id', factuurId).single()
  if (error || !f) return { data: null, error: 'Factuur niet gevonden' }

  const company = ((f.company_id in COMPANY_CONFIG) ? f.company_id : 'daleyphotography') as CompanyKey

  const { data: items } = await supabase
    .from('factuur_line_items')
    .select('*')
    .eq('factuur_id', factuurId)
    .order('sort_order', { ascending: true })

  if (!items || items.length === 0) {
    return { data: null, error: 'Deze factuur heeft geen opgeslagen regels in de database.' }
  }

  const regels: FactuurRegel[] = items.map(i => ({
    omschrijving: i.description,
    detail: i.details ?? undefined,
    datum: i.datum ?? undefined,
    aantal: i.quantity,
    prijsPerStuk: i.unit_price,
    perUur: i.eenheid === 'uur',
  }))

  // client_address is opgeslagen als "adres, postcode stad" -> weer uit elkaar halen
  const adresVol: string = f.client_address ?? ''
  const m = adresVol.match(/^(.*),\s*(\d{4}\s?[A-Za-z]{2})\s+(.*)$/)

  // Het klantnummer staat niet op de factuur zelf maar op de klantkaart. Zonder
  // deze opzoeking verdween het uit de PDF zodra je hem opnieuw opsloeg, terwijl
  // hij er bij het aanmaken vanuit uren wel op stond.
  const { data: klantRow } = await supabase
    .from('uren_klanten')
    .select('klantnummer')
    .eq('naam', f.client_name)
    .maybeSingle()

  const klant: KlantData = {
    bedrijfsnaam: f.client_name,
    contactpersoon: f.client_contact_person ?? undefined,
    adres: m ? m[1].trim() : adresVol,
    postcode: m ? m[2].trim() : '',
    stad: m ? m[3].trim() : '',
    klantnummer: (klantRow as { klantnummer?: string } | null)?.klantnummer ?? undefined,
  }

  return {
    data: {
      company,
      factuurnummer: f.number,
      klant,
      klantNaamVoorBestand: f.client_name_bestand || f.client_name,
      regels,
      factuurdatum: f.date,
      vervaldatum: f.due_date ?? f.date,
      betaallink: f.mollie_payment_url ?? undefined,
      btwPercentage: f.btw_percentage ?? 21,
      layoutOverrides: f.layout_overrides ?? null,
      concept: String(f.number ?? '').toUpperCase().startsWith('C-'),
    },
  }
}
