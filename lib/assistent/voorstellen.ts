/**
 * Voorstellen van de assistent: nakijken en, na een klik van Daley, uitvoeren.
 *
 * De assistent voert zelf nooit iets uit. Hij levert een voorstel aan, de Dash
 * rekent het na (bedragen, nummer, klantgegevens, uren) en bewaart het. In de
 * chat verschijnt het als kaart met een knop. Pas die knop roept
 * `voerVoorstelUit` aan, en die weigert alles wat niet meer open staat.
 */
import { createClient } from '@/lib/supabase/server'
import { getFactuur } from '@/lib/supabase/facturen'
import { volgendNummer } from '@/lib/supabase/factuurNummer'
import { factuurNummerStam } from '@/lib/factuur-utils'
import { COMPANY_CONFIG, type CompanyKey, type FactuurRegel } from '@/lib/pdf/factuurGenerator'
import { slaFactuurPdfOp } from '@/lib/pdf/factuurPdfOpslaan'
import { maakFactuur, isVeiligeLink, vervaldatumVan, type FactuurKlant } from '@/lib/facturen/maakFactuur'
import { wijzigFactuurMetPdf, type FactuurWijziging } from '@/lib/facturen/wijzigFactuur'
import type { FactuurStatus, LineItem } from '@/lib/types'

export type VoorstelType = 'factuur_nieuw' | 'factuur_wijzigen' | 'factuur_pdf' | 'factuur_koppelen'
export type VoorstelStatus = 'open' | 'bezig' | 'uitgevoerd' | 'geannuleerd' | 'mislukt'

export interface VoorstelRegel {
  omschrijving: string
  detail?: string
  /** YYYY-MM-DD, voor uren: de dag van het werk */
  datum?: string
  aantal: number
  prijs: number
  perUur?: boolean
}

export interface KlantInvoer {
  naam: string
  contactpersoon?: string
  adres?: string
  postcode?: string
  stad?: string
  email?: string
  telefoon?: string
  kvk?: string
  btw?: string
  klantnummer?: string
}

export interface FactuurNieuwPayload {
  bedrijf: CompanyKey
  klant: KlantInvoer
  factuurdatum: string
  betaaltermijnDagen?: number
  btwPercentage?: number
  status?: 'concept' | 'verzonden'
  betaallink?: string
  offerteId?: string
  notities?: string
  regels: VoorstelRegel[]
  urenIds?: string[]
  projectIds?: string[]
}

export interface FactuurWijzigenPayload {
  factuurId: string
  factuurdatum?: string
  betaaltermijnDagen?: number
  klant?: Partial<KlantInvoer>
  regels?: VoorstelRegel[]
  btwPercentage?: number
  status?: FactuurStatus
  betaallink?: string | null
  notities?: string | null
}

export interface FactuurPdfPayload {
  factuurId: string
}

export interface FactuurKoppelenPayload {
  factuurId: string
  urenIds?: string[]
  offerteId?: string
}

export type VoorstelPayload = FactuurNieuwPayload | FactuurWijzigenPayload | FactuurPdfPayload | FactuurKoppelenPayload

/** Wat de Dash van een voorstel vindt. Staat in de kaart en gaat terug naar de assistent. */
export interface Controle {
  /** Blokkeert uitvoeren: zonder dit kan de factuur niet gemaakt worden. */
  fouten: string[]
  /** Mag wel, maar kijk even. */
  waarschuwingen: string[]
  bedragen?: { subtotaal: number; btwPercentage: number; btw: number; totaal: number }
  /** Nummer dat de factuur naar verwachting krijgt. Kan bij uitvoeren nog één opschuiven. */
  verwachtNummer?: string
  vervaldatum?: string
  /** De klant zoals hij op de factuur komt, aangevuld uit eerdere gegevens. */
  klant?: FactuurKlant
  /** Bij wijzigen, koppelen en PDF: de factuur zoals hij nu is. */
  factuur?: { id: string; nummer: string; klant: string; datum: string; status: string; totaal: number }
  /** Bij wijzigen: wat er verandert. */
  wijzigingen?: { veld: string; oud: string; nieuw: string }[]
  /** Bij koppelen: welke uren erbij komen. */
  uren?: { id: string; datum: string; uren: number; omschrijving?: string }[]
}

export interface VoorstelRij {
  id: string
  gesprek_id: string | null
  type: VoorstelType
  payload: VoorstelPayload
  controle: Controle | null
  status: VoorstelStatus
  resultaat: Record<string, unknown> | null
  created_at: string
  uitgevoerd_op: string | null
}

const euro = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
const rond = (n: number) => Math.round(n * 100) / 100
const isDatum = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)

function naarFactuurRegels(regels: VoorstelRegel[]): FactuurRegel[] {
  return regels.map(r => ({
    omschrijving: r.omschrijving,
    detail: r.detail || undefined,
    datum: r.datum || undefined,
    aantal: Number(r.aantal),
    prijsPerStuk: Number(r.prijs),
    perUur: !!r.perUur,
  }))
}

function bedragen(regels: VoorstelRegel[], btwPercentage: number) {
  const subtotaal = rond(regels.reduce((s, r) => s + Number(r.aantal) * Number(r.prijs), 0))
  const btw = rond(subtotaal * btwPercentage / 100)
  return { subtotaal, btwPercentage, btw, totaal: rond(subtotaal + btw) }
}

function regelFouten(regels: VoorstelRegel[] | undefined, fouten: string[], waarschuwingen: string[]) {
  if (!regels?.length) {
    fouten.push('Er staan geen regels op de factuur')
    return
  }
  regels.forEach((r, i) => {
    const nr = `Regel ${i + 1}`
    if (!r.omschrijving?.trim()) fouten.push(`${nr} heeft geen omschrijving`)
    if (!Number.isFinite(Number(r.aantal)) || Number(r.aantal) <= 0) fouten.push(`${nr} heeft geen geldig aantal`)
    if (!Number.isFinite(Number(r.prijs))) fouten.push(`${nr} heeft geen geldige prijs`)
    else if (Number(r.prijs) === 0) waarschuwingen.push(`${nr} (${r.omschrijving}) staat op € 0`)
    if (r.datum && !isDatum(r.datum)) fouten.push(`${nr} heeft een ongeldige datum`)
  })
}

/** Vult ontbrekende klantgegevens aan uit de urenregistratie en de laatste factuur of offerte. */
async function vulKlantAan(invoer: KlantInvoer): Promise<{ klant: FactuurKlant; bronnen: string[] }> {
  const supabase = createClient()
  const naam = invoer.naam.trim()
  const [{ data: urenKlant }, { data: factuur }, { data: offerte }] = await Promise.all([
    supabase.from('uren_klanten').select('*').ilike('naam', naam).limit(1).maybeSingle(),
    supabase.from('facturen').select('client_contact_person, client_address, client_email, client_phone, client_kvk, client_btw')
      .ilike('client_name', naam).order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('offertes').select('client_contact_person, client_address, client_email, client_phone, client_kvk, client_btw')
      .ilike('client_name', naam).order('date', { ascending: false }).limit(1).maybeSingle(),
  ])

  const bronnen: string[] = []
  const eerder = factuur ?? offerte
  const adresMatch = (eerder?.client_address ?? '').match(/^(.*),\s*(\d{4}\s?[A-Za-z]{2})\s+(.*)$/)

  const kies = (...waarden: (string | null | undefined)[]) => waarden.find(w => w && String(w).trim())?.trim() || undefined

  const klant: FactuurKlant = {
    naam,
    contactpersoon: kies(invoer.contactpersoon, urenKlant?.contactpersoon, eerder?.client_contact_person),
    adres: kies(invoer.adres, urenKlant?.adres, adresMatch?.[1]) ?? '',
    postcode: kies(invoer.postcode, urenKlant?.postcode, adresMatch?.[2]) ?? '',
    stad: kies(invoer.stad, urenKlant?.stad, adresMatch?.[3]) ?? '',
    email: kies(invoer.email, urenKlant?.email, eerder?.client_email),
    telefoon: kies(invoer.telefoon, eerder?.client_phone),
    kvk: kies(invoer.kvk, eerder?.client_kvk),
    btw: kies(invoer.btw, eerder?.client_btw),
    klantnummer: kies(invoer.klantnummer, urenKlant?.klantnummer),
  }
  if (urenKlant) bronnen.push('urenregistratie')
  if (factuur) bronnen.push('vorige factuur')
  else if (offerte) bronnen.push('offerte')
  return { klant, bronnen }
}

async function controleerUren(urenIds: string[], klantnaam: string, bedrijf: CompanyKey, fouten: string[], waarschuwingen: string[]) {
  if (!urenIds.length) return []
  const supabase = createClient()
  const { data } = await supabase.from('uren').select('id, datum, uren, omschrijving, klant, company_id, gefactureerd, factuurnummer').in('id', urenIds)
  const gevonden = data ?? []
  if (gevonden.length !== urenIds.length) fouten.push(`${urenIds.length - gevonden.length} van de gekoppelde uren bestaan niet (meer)`)
  for (const u of gevonden) {
    if (u.gefactureerd) fouten.push(`De uren van ${u.datum} zijn al gefactureerd op ${u.factuurnummer}`)
    else if (u.factuurnummer) waarschuwingen.push(`De uren van ${u.datum} staan al op concept ${u.factuurnummer}`)
    if (u.klant.toLowerCase() !== klantnaam.toLowerCase()) waarschuwingen.push(`De uren van ${u.datum} horen bij ${u.klant}, niet bij ${klantnaam}`)
    if (u.company_id !== bedrijf) waarschuwingen.push(`De uren van ${u.datum} zijn geschreven op ${u.company_id}, de factuur gaat via ${bedrijf}`)
  }
  return gevonden.map(u => ({ id: u.id, datum: u.datum, uren: Number(u.uren), omschrijving: u.omschrijving ?? undefined }))
}

function datumWaarschuwing(datum: string, waarschuwingen: string[]) {
  const dagen = Math.round((new Date(`${datum}T12:00:00`).getTime() - Date.now()) / 86_400_000)
  if (dagen > 7) waarschuwingen.push(`De factuurdatum ligt ${dagen} dagen in de toekomst`)
  if (dagen < -45) waarschuwingen.push(`De factuurdatum ligt ${-dagen} dagen in het verleden`)
}

// ---------------------------------------------------------------------------
// Nakijken
// ---------------------------------------------------------------------------

export async function controleerVoorstel(type: VoorstelType, payload: VoorstelPayload): Promise<Controle> {
  switch (type) {
    case 'factuur_nieuw': return controleerNieuw(payload as FactuurNieuwPayload)
    case 'factuur_wijzigen': return controleerWijzigen(payload as FactuurWijzigenPayload)
    case 'factuur_pdf': return controleerBestaand((payload as FactuurPdfPayload).factuurId)
    case 'factuur_koppelen': return controleerKoppelen(payload as FactuurKoppelenPayload)
  }
}

async function controleerNieuw(p: FactuurNieuwPayload): Promise<Controle> {
  const fouten: string[] = []
  const waarschuwingen: string[] = []

  if (!(p.bedrijf in COMPANY_CONFIG)) fouten.push(`Onbekend bedrijf: ${p.bedrijf}`)
  if (!p.klant?.naam?.trim()) fouten.push('Er is geen klant opgegeven')
  if (!isDatum(p.factuurdatum)) fouten.push('Er is geen geldige factuurdatum')
  else datumWaarschuwing(p.factuurdatum, waarschuwingen)
  const btwPercentage = p.btwPercentage ?? 21
  if (![21, 9, 0].includes(btwPercentage)) fouten.push(`Btw van ${btwPercentage}% bestaat niet, kies 21, 9 of 0`)
  if (p.betaallink && !isVeiligeLink(p.betaallink)) fouten.push('De betaallink is geen geldige https-link')
  regelFouten(p.regels, fouten, waarschuwingen)

  let klant: FactuurKlant | undefined
  if (p.klant?.naam?.trim()) {
    const aangevuld = await vulKlantAan(p.klant)
    klant = aangevuld.klant
    if (!klant.adres || !klant.postcode || !klant.stad) {
      fouten.push(`Het adres van ${klant.naam} is niet compleet (adres, postcode en plaats zijn verplicht)`)
    }
    if (!aangevuld.bronnen.length) waarschuwingen.push(`${klant.naam} staat nog nergens in de Dash, controleer de gegevens`)
  }

  if (p.offerteId) {
    const { data } = await createClient().from('offertes').select('id, status, client_name').eq('id', p.offerteId).maybeSingle()
    if (!data) fouten.push('De gekoppelde offerte bestaat niet')
    else if (data.status !== 'akkoord') waarschuwingen.push(`De gekoppelde offerte heeft status ${data.status}, niet akkoord`)
  }

  const uren = klant && p.urenIds?.length && p.bedrijf in COMPANY_CONFIG
    ? await controleerUren(p.urenIds, klant.naam, p.bedrijf, fouten, waarschuwingen)
    : undefined

  // Gekoppelde uren en uurregels op de factuur moeten over hetzelfde gaan
  if (uren?.length && p.regels?.length) {
    const gekoppeld = rond(uren.reduce((s, u) => s + u.uren, 0))
    const opFactuur = rond(p.regels.filter(r => r.perUur).reduce((s, r) => s + Number(r.aantal), 0))
    if (gekoppeld !== opFactuur) {
      waarschuwingen.push(`Er zijn ${gekoppeld} uur gekoppeld, maar er staan ${opFactuur} uur op de factuur`)
    }
  }

  const verwachtNummer = isDatum(p.factuurdatum) && p.bedrijf in COMPANY_CONFIG
    ? await volgendNummer(COMPANY_CONFIG[p.bedrijf].factuurPrefix, p.factuurdatum)
    : undefined

  return {
    fouten,
    waarschuwingen,
    bedragen: p.regels?.length ? bedragen(p.regels, btwPercentage) : undefined,
    verwachtNummer,
    vervaldatum: isDatum(p.factuurdatum) ? vervaldatumVan(p.factuurdatum, p.betaaltermijnDagen ?? 14) : undefined,
    klant,
    uren,
  }
}

async function laadFactuurKort(factuurId: string) {
  const f = await getFactuur(factuurId)
  if (!f) return null
  return { volledig: f, kort: { id: f.id, nummer: f.number, klant: f.client.name, datum: f.date, status: f.status, totaal: f.total } }
}

async function controleerBestaand(factuurId: string): Promise<Controle> {
  const f = await laadFactuurKort(factuurId)
  if (!f) return { fouten: ['Deze factuur bestaat niet'], waarschuwingen: [] }
  return { fouten: [], waarschuwingen: [], factuur: f.kort }
}

const VERSTUURD: FactuurStatus[] = ['verzonden', 'herinnering-verzonden', 'betaald', 'te-laat']

async function controleerWijzigen(p: FactuurWijzigenPayload): Promise<Controle> {
  const fouten: string[] = []
  const waarschuwingen: string[] = []
  const gevonden = await laadFactuurKort(p.factuurId)
  if (!gevonden) return { fouten: ['Deze factuur bestaat niet'], waarschuwingen }
  const f = gevonden.volledig
  const wijzigingen: NonNullable<Controle['wijzigingen']> = []

  const pdfVerandert = p.factuurdatum || p.betaaltermijnDagen || p.klant || p.regels || p.btwPercentage !== undefined || p.betaallink !== undefined
  if (pdfVerandert && VERSTUURD.includes(f.status)) {
    waarschuwingen.push(`Factuur ${f.number} is al verstuurd (${f.status}). De klant heeft de oude versie.`)
  }

  let verwachtNummer: string | undefined
  if (p.factuurdatum !== undefined && p.factuurdatum !== f.date) {
    if (!isDatum(p.factuurdatum)) fouten.push('De nieuwe factuurdatum is ongeldig')
    else {
      datumWaarschuwing(p.factuurdatum, waarschuwingen)
      wijzigingen.push({ veld: 'Factuurdatum', oud: f.date, nieuw: p.factuurdatum })
      // Het datumdeel van het nummer volgt de factuurdatum
      const prefix = COMPANY_CONFIG[(f.companyId in COMPANY_CONFIG ? f.companyId : 'tde') as CompanyKey].factuurPrefix
      const nieuweStam = factuurNummerStam(prefix, new Date(`${p.factuurdatum}T12:00:00`))
      if (!f.number.startsWith(`${nieuweStam}-`)) {
        verwachtNummer = await volgendNummer(prefix, p.factuurdatum)
        wijzigingen.push({ veld: 'Factuurnummer', oud: f.number, nieuw: verwachtNummer })
      }
    }
  }
  const datum = p.factuurdatum && isDatum(p.factuurdatum) ? p.factuurdatum : f.date
  if (p.factuurdatum || p.betaaltermijnDagen) {
    const termijn = p.betaaltermijnDagen ?? Math.round((new Date(f.dueDate).getTime() - new Date(f.date).getTime()) / 86_400_000)
    const nieuweVervaldatum = vervaldatumVan(datum, termijn)
    if (nieuweVervaldatum !== f.dueDate) wijzigingen.push({ veld: 'Vervaldatum', oud: f.dueDate, nieuw: nieuweVervaldatum })
  }

  if (p.klant) {
    const velden: [keyof KlantInvoer, string, string | undefined][] = [
      ['naam', 'Klantnaam', f.client.name],
      ['contactpersoon', 'Contactpersoon', f.client.contactPerson],
      ['email', 'E-mail', f.client.email],
      ['telefoon', 'Telefoon', f.client.phone],
      ['kvk', 'KVK', f.client.kvk],
      ['btw', 'Btw-nummer', f.client.btw],
    ]
    for (const [sleutel, label, oud] of velden) {
      const nieuw = p.klant[sleutel]
      if (nieuw !== undefined && nieuw !== (oud ?? '')) wijzigingen.push({ veld: label, oud: oud ?? '', nieuw })
    }
    if (p.klant.adres !== undefined || p.klant.postcode !== undefined || p.klant.stad !== undefined) {
      const m = (f.client.address ?? '').match(/^(.*),\s*(\d{4}\s?[A-Za-z]{2})\s+(.*)$/)
      const nieuwAdres = `${p.klant.adres ?? m?.[1] ?? ''}, ${p.klant.postcode ?? m?.[2] ?? ''} ${p.klant.stad ?? m?.[3] ?? ''}`
      if (nieuwAdres !== f.client.address) wijzigingen.push({ veld: 'Adres', oud: f.client.address ?? '', nieuw: nieuwAdres })
    }
  }

  const btwPercentage = p.btwPercentage ?? f.btwPercentage
  if (![21, 9, 0].includes(btwPercentage)) fouten.push(`Btw van ${btwPercentage}% bestaat niet`)
  if (p.btwPercentage !== undefined && p.btwPercentage !== f.btwPercentage) {
    wijzigingen.push({ veld: 'Btw', oud: `${f.btwPercentage}%`, nieuw: `${p.btwPercentage}%` })
  }

  let nieuweBedragen: Controle['bedragen']
  if (p.regels) {
    regelFouten(p.regels, fouten, waarschuwingen)
    const oud = f.items.map(i => `${i.description} (${i.quantity} x ${euro(i.unitPrice)})`).join('; ')
    const nieuw = p.regels.map(r => `${r.omschrijving} (${r.aantal} x ${euro(Number(r.prijs))})`).join('; ')
    if (oud !== nieuw) wijzigingen.push({ veld: 'Regels', oud, nieuw })
    nieuweBedragen = bedragen(p.regels, btwPercentage)
  } else if (p.btwPercentage !== undefined) {
    const btw = rond(f.subtotal * btwPercentage / 100)
    nieuweBedragen = { subtotaal: f.subtotal, btwPercentage, btw, totaal: rond(f.subtotal + btw) }
  }
  if (nieuweBedragen && nieuweBedragen.totaal !== f.total) {
    wijzigingen.push({ veld: 'Totaal', oud: euro(f.total), nieuw: euro(nieuweBedragen.totaal) })
  }

  if (p.status !== undefined && p.status !== f.status) wijzigingen.push({ veld: 'Status', oud: f.status, nieuw: p.status })
  if (p.betaallink !== undefined && (p.betaallink ?? '') !== (f.molliePaymentUrl ?? '')) {
    if (p.betaallink && !isVeiligeLink(p.betaallink)) fouten.push('De betaallink is geen geldige https-link')
    wijzigingen.push({ veld: 'Betaallink', oud: f.molliePaymentUrl ?? '', nieuw: p.betaallink ?? '' })
  }
  if (p.notities !== undefined && (p.notities ?? '') !== (f.notes ?? '')) {
    wijzigingen.push({ veld: 'Notities', oud: f.notes ?? '', nieuw: p.notities ?? '' })
  }

  if (!wijzigingen.length && !fouten.length) fouten.push('Dit voorstel verandert niets aan de factuur')

  return { fouten, waarschuwingen, factuur: gevonden.kort, wijzigingen, bedragen: nieuweBedragen, verwachtNummer }
}

async function controleerKoppelen(p: FactuurKoppelenPayload): Promise<Controle> {
  const fouten: string[] = []
  const waarschuwingen: string[] = []
  const gevonden = await laadFactuurKort(p.factuurId)
  if (!gevonden) return { fouten: ['Deze factuur bestaat niet'], waarschuwingen }
  const f = gevonden.volledig
  if (!p.urenIds?.length && !p.offerteId) fouten.push('Er is niets om te koppelen')

  const uren = p.urenIds?.length
    ? await controleerUren(p.urenIds, f.client.name, (f.companyId in COMPANY_CONFIG ? f.companyId : 'tde') as CompanyKey, fouten, waarschuwingen)
    : undefined
  if (uren?.length) {
    waarschuwingen.push('Koppelen verandert de regels en bedragen van de factuur niet, alleen welke uren erop staan')
  }

  const wijzigingen: NonNullable<Controle['wijzigingen']> = []
  if (p.offerteId) {
    const { data } = await createClient().from('offertes').select('number, client_name').eq('id', p.offerteId).maybeSingle()
    if (!data) fouten.push('De offerte bestaat niet')
    else wijzigingen.push({ veld: 'Offerte', oud: f.offerteId ? 'andere offerte' : '', nieuw: `${data.number} (${data.client_name})` })
  }
  return { fouten, waarschuwingen, factuur: gevonden.kort, uren, wijzigingen }
}

// ---------------------------------------------------------------------------
// Uitvoeren
// ---------------------------------------------------------------------------

export async function voerVoorstelUit(voorstel: VoorstelRij): Promise<Record<string, unknown>> {
  switch (voorstel.type) {
    case 'factuur_nieuw': return voerNieuwUit(voorstel.payload as FactuurNieuwPayload)
    case 'factuur_wijzigen': return voerWijzigenUit(voorstel.payload as FactuurWijzigenPayload)
    case 'factuur_pdf': {
      const { factuurId } = voorstel.payload as FactuurPdfPayload
      const { pdfPath } = await slaFactuurPdfOp(createClient(), factuurId)
      const f = await getFactuur(factuurId)
      return { factuurId, factuurnummer: f?.number, pdfPath }
    }
    case 'factuur_koppelen': return voerKoppelenUit(voorstel.payload as FactuurKoppelenPayload)
  }
}

async function voerNieuwUit(p: FactuurNieuwPayload) {
  // Opnieuw nakijken: tussen voorstel en klik kan er van alles veranderd zijn
  // (uren elders gefactureerd, klant aangepast).
  const controle = await controleerNieuw(p)
  if (controle.fouten.length) throw new Error(controle.fouten.join('. '))

  const resultaat = await maakFactuur({
    company: p.bedrijf,
    klant: controle.klant!,
    regels: naarFactuurRegels(p.regels),
    factuurdatum: p.factuurdatum,
    betaaltermijnDagen: p.betaaltermijnDagen ?? 14,
    btwPercentage: p.btwPercentage ?? 21,
    status: p.status ?? 'concept',
    betaallink: p.betaallink,
    offerteId: p.offerteId,
    notities: p.notities,
    urenIds: p.urenIds,
    projectIds: p.projectIds,
  })
  return { ...resultaat }
}

async function voerWijzigenUit(p: FactuurWijzigenPayload) {
  const controle = await controleerWijzigen(p)
  if (controle.fouten.length) throw new Error(controle.fouten.join('. '))
  const f = (await getFactuur(p.factuurId))!

  const body: FactuurWijziging = {}
  if (p.factuurdatum && p.factuurdatum !== f.date) {
    body.date = p.factuurdatum
    // Opnieuw tellen op het moment van uitvoeren, niet het nummer uit de controle
    if (controle.verwachtNummer) {
      const prefix = COMPANY_CONFIG[(f.companyId in COMPANY_CONFIG ? f.companyId : 'tde') as CompanyKey].factuurPrefix
      body.number = await volgendNummer(prefix, p.factuurdatum)
    }
  }
  if (p.factuurdatum || p.betaaltermijnDagen) {
    const vervaldatumWijziging = controle.wijzigingen?.find(w => w.veld === 'Vervaldatum')
    if (vervaldatumWijziging) body.dueDate = vervaldatumWijziging.nieuw
  }
  if (p.klant) {
    const m = (f.client.address ?? '').match(/^(.*),\s*(\d{4}\s?[A-Za-z]{2})\s+(.*)$/)
    const adresVeranderd = p.klant.adres !== undefined || p.klant.postcode !== undefined || p.klant.stad !== undefined
    body.client = {
      name: p.klant.naam ?? f.client.name,
      contactPerson: p.klant.contactpersoon ?? f.client.contactPerson,
      email: p.klant.email ?? f.client.email,
      phone: p.klant.telefoon ?? f.client.phone,
      kvk: p.klant.kvk ?? f.client.kvk,
      btw: p.klant.btw ?? f.client.btw,
      address: adresVeranderd
        ? `${p.klant.adres ?? m?.[1] ?? ''}, ${p.klant.postcode ?? m?.[2] ?? ''} ${p.klant.stad ?? m?.[3] ?? ''}`
        : f.client.address,
    }
  }
  if (p.btwPercentage !== undefined) body.btwPercentage = p.btwPercentage
  if (p.regels) {
    body.items = p.regels.map((r, i): LineItem => ({
      id: `nieuw-${i}`,
      description: r.omschrijving,
      details: r.detail || undefined,
      quantity: Number(r.aantal),
      unitPrice: Number(r.prijs),
      datum: r.datum || undefined,
      eenheid: r.perUur ? 'uur' : undefined,
    }))
  }
  if (controle.bedragen) {
    body.subtotal = controle.bedragen.subtotaal
    body.btwAmount = controle.bedragen.btw
    body.total = controle.bedragen.totaal
  }
  if (p.status !== undefined && p.status !== f.status) body.status = p.status
  if (p.betaallink !== undefined) body.molliePaymentUrl = p.betaallink ?? ''
  if (p.notities !== undefined) body.notes = p.notities ?? ''

  const { factuur, pdf } = await wijzigFactuurMetPdf(p.factuurId, body)
  return { factuurId: factuur.id, factuurnummer: factuur.number, pdfPath: pdf?.pdfPath ?? null, pdfFout: pdf && !pdf.ok ? pdf.fout : null }
}

async function voerKoppelenUit(p: FactuurKoppelenPayload) {
  const controle = await controleerKoppelen(p)
  if (controle.fouten.length) throw new Error(controle.fouten.join('. '))
  const f = (await getFactuur(p.factuurId))!
  const supabase = createClient()

  if (p.urenIds?.length) {
    const { error } = await supabase
      .from('uren')
      .update({ factuurnummer: f.number, gefactureerd: f.status !== 'concept', updated_at: new Date().toISOString() })
      .in('id', p.urenIds)
    if (error) throw new Error(`Uren koppelen mislukt: ${error.message}`)
  }
  if (p.offerteId) {
    await wijzigFactuurMetPdf(p.factuurId, { offerteId: p.offerteId })
  }
  return { factuurId: f.id, factuurnummer: f.number, urenGekoppeld: p.urenIds?.length ?? 0, offerteGekoppeld: !!p.offerteId }
}
