/**
 * Eén plek waar een factuur met regels, uren en PDF wordt aangemaakt.
 *
 * Gebruikt door "Factuur van uren" (POST /api/factuur-van-uren) en door de
 * assistent (voorstel uitvoeren). Zo krijgen beide exact dezelfde nummering,
 * dezelfde regels in Supabase en dezelfde PDF in dezelfde kwartaalmap.
 */
import { exec } from 'child_process'
import { createClient } from '@/lib/supabase/server'
import { volgendNummer } from '@/lib/supabase/factuurNummer'
import { COMPANY_CONFIG, type CompanyKey, type FactuurRegel, genereerFactuurPdf } from '@/lib/pdf/factuurGenerator'

export interface FactuurKlant {
  naam: string
  contactpersoon?: string | null
  adres: string
  postcode: string
  stad: string
  email?: string | null
  telefoon?: string | null
  kvk?: string | null
  btw?: string | null
  klantnummer?: string | null
}

export interface MaakFactuurInvoer {
  company: CompanyKey
  klant: FactuurKlant
  regels: FactuurRegel[]
  /** YYYY-MM-DD. Het datumdeel van het nummer volgt deze datum. */
  factuurdatum: string
  betaaltermijnDagen?: number
  btwPercentage?: number
  /** Concept: uren blijven openstaan tot de factuur een andere status krijgt. */
  status?: 'concept' | 'verzonden'
  betaallink?: string | null
  offerteId?: string | null
  notities?: string | null
  /** Uren die op deze factuur staan. Worden gekoppeld via het factuurnummer. */
  urenIds?: string[]
  /** Projecten (uren_projecten) die op deze factuur staan. */
  projectIds?: string[]
  /** Geen PDF maken, bijvoorbeeld omdat de editor dat straks doet. */
  zonderPdf?: boolean
  /** PDF na het maken openen op de Mac. */
  openPdf?: boolean
}

export interface MaakFactuurResultaat {
  factuurId: string
  factuurnummer: string
  pdfPath: string | null
  concept: boolean
}

/** Knab-betaalverzoeken zijn gewone https-links; al het andere weigeren. */
export function isVeiligeLink(url?: string | null): url is string {
  return !!url && /^https?:\/\/[^\s"'<>]+$/.test(url.trim())
}

export function vervaldatumVan(factuurdatum: string, dagen = 14): string {
  const d = new Date(`${factuurdatum}T12:00:00`)
  d.setDate(d.getDate() + dagen)
  return d.toISOString().split('T')[0]
}

export async function maakFactuur(invoer: MaakFactuurInvoer): Promise<MaakFactuurResultaat> {
  const supabase = createClient()
  const { company, klant, regels } = invoer

  if (!regels.length) throw new Error('Een factuur heeft minimaal één regel nodig')
  if (!klant.naam || !klant.adres || !klant.postcode || !klant.stad) {
    throw new Error('Klantnaam, adres, postcode en plaats zijn verplicht op een factuur')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoer.factuurdatum)) {
    throw new Error(`Ongeldige factuurdatum: ${invoer.factuurdatum}`)
  }

  const isConcept = (invoer.status ?? 'concept') === 'concept'
  const btwTarief = [21, 9, 0].includes(invoer.btwPercentage ?? 21) ? (invoer.btwPercentage ?? 21) : 21
  const betaallink = isVeiligeLink(invoer.betaallink) ? invoer.betaallink.trim() : null
  const factuurdatum = invoer.factuurdatum
  const vervaldatum = vervaldatumVan(factuurdatum, invoer.betaaltermijnDagen ?? 14)

  const subtotaal = +regels.reduce((s, r) => s + r.aantal * r.prijsPerStuk, 0).toFixed(2)
  const btwBedrag = +(subtotaal * (btwTarief / 100)).toFixed(2)

  // Eerst vastleggen in Supabase, dan pas de PDF en de uren. Andersom lag er bij
  // een mislukte insert wel een PDF in de map en stonden uren op gefactureerd,
  // terwijl de factuur nergens in de Dash te vinden was.
  // Het nummer is uniek in de database; valt er tussen tellen en opslaan een
  // ander nummer op dezelfde dag, dan tellen we opnieuw.
  let factuurId: string | null = null
  let factuurnummer = ''
  for (let poging = 0; poging < 3 && !factuurId; poging++) {
    factuurnummer = await volgendNummer(COMPANY_CONFIG[company].factuurPrefix, factuurdatum)
    const { data, error } = await supabase.from('facturen').insert({
      company_id: company,
      number: factuurnummer,
      slug: factuurnummer.toLowerCase(),
      client_name: klant.naam,
      // Zelfde naam als in de bestandsnaam, anders maakt opnieuw opslaan een tweede PDF
      client_name_bestand: klant.naam,
      client_contact_person: klant.contactpersoon || null,
      client_address: `${klant.adres}, ${klant.postcode} ${klant.stad}`,
      client_email: klant.email || null,
      client_phone: klant.telefoon || null,
      client_kvk: klant.kvk || null,
      client_btw: klant.btw || null,
      date: factuurdatum,
      due_date: vervaldatum,
      subtotal: subtotaal,
      btw_percentage: btwTarief,
      btw_amount: btwBedrag,
      total: +(subtotaal + btwBedrag).toFixed(2),
      status: isConcept ? 'concept' : 'verzonden',
      mollie_payment_url: betaallink,
      offerte_id: invoer.offerteId || null,
      notes: invoer.notities || null,
    }).select('id').single()

    if (data?.id) {
      factuurId = data.id
    } else if (!error || !/duplicate|unique/i.test(error.message)) {
      throw new Error(`Opslaan in de Dash mislukt, er is niets aangemaakt: ${error?.message ?? 'onbekende fout'}`)
    }
  }
  if (!factuurId) throw new Error('Kon geen uniek factuurnummer maken, probeer het opnieuw')

  const { error: regelFout } = await supabase.from('factuur_line_items').insert(
    regels.map((r, idx) => ({
      factuur_id: factuurId,
      sort_order: idx,
      description: r.omschrijving,
      details: r.detail ?? null,
      quantity: r.aantal,
      unit_price: r.prijsPerStuk,
      section_title: null,
      datum: r.datum ?? null,
      eenheid: r.perUur ? 'uur' : null,
    }))
  )
  if (regelFout) {
    throw new Error(`Factuur ${factuurnummer} is aangemaakt, maar de regels niet: ${regelFout.message}`)
  }

  let pdfPath: string | null = null
  if (!invoer.zonderPdf) {
    ;({ pdfPath } = await genereerFactuurPdf({
      company,
      factuurnummer,
      klant: {
        bedrijfsnaam: klant.naam,
        contactpersoon: klant.contactpersoon ?? undefined,
        adres: klant.adres,
        postcode: klant.postcode,
        stad: klant.stad,
        klantnummer: klant.klantnummer ?? undefined,
      },
      klantNaamVoorBestand: klant.naam,
      regels,
      factuurdatum,
      vervaldatum,
      betaallink: betaallink ?? undefined,
      btwPercentage: btwTarief,
    }))
    if (invoer.openPdf) exec(`open "${pdfPath}"`)
  }

  // Uren altijd koppelen, maar pas afboeken bij een echte factuur. Een concept
  // houdt ze open; updateFactuur boekt ze af zodra de status verandert.
  if (invoer.urenIds?.length) {
    const { error } = await supabase
      .from('uren')
      .update({ gefactureerd: !isConcept, factuurnummer, updated_at: new Date().toISOString() })
      .in('id', invoer.urenIds)
    if (error) throw new Error(`Factuur ${factuurnummer} staat er, maar de uren zijn niet gekoppeld: ${error.message}`)
  }
  if (invoer.projectIds?.length && !isConcept) {
    await supabase.from('uren_projecten').update({ status: 'gefactureerd' }).in('id', invoer.projectIds)
  }

  return { factuurId, factuurnummer, pdfPath, concept: isConcept }
}
