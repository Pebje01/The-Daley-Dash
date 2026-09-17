/**
 * Een lead benaderen: concept in de Dash, versturen in Spark, registreren in de Dash.
 *
 *   concept    AI schrijft, Daley past aan in de detailkaart
 *   in_spark   geopend als nieuw bericht in Spark, Daley verstuurt het daar zelf
 *   verstuurd  teruggevonden in de verzonden mail, contactmoment is gelogd
 *
 * Daarnaast legt `registreerVerzondenMails` elke mail vast die Daley zelf aan een
 * lead stuurt, ook zonder concept uit de Dash. Zo'n mail krijgt een rij met status
 * verstuurd en een lege tekst; het Spark-bericht-id voorkomt dat hij twee keer telt.
 *
 * En `registreerReacties` ziet wanneer een lead terugmailt: die reactie komt erin
 * met richting 'in', en de lead staat meteen in Vandaag oppakken. De fase blijft
 * van Daley.
 *
 * De Dash verstuurt nooit zelf iets en leest Spark alleen.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { COMPANIES } from '@/lib/companies'
import { IS_TEST } from '@/lib/dashModus'
import { normaliseerEmail } from '@/lib/crm/dubbelcheck'
import { datumPlusDagen, faseNaContact, standaardOpvolgdatum } from '@/lib/crm/pipeline'
import { logContactMoment } from '@/lib/crm/store'
import { schrijfBenaderingsmail } from '@/lib/ai/schrijf-benadering'
import {
  afzenderSleutel, isAutomatischeAfzender, kiesAccount, leesThread, mailTijd, mailtoLink, sparkAccounts,
  zoekOntvangenMails, zoekVerzondenMail, zoekVerzondenMails,
} from '@/lib/mail/spark'

export type ConceptStatus = 'concept' | 'in_spark' | 'verstuurd' | 'geannuleerd'

export interface MailConcept {
  id: string
  record_id: string
  account: string | null
  aan: string | null
  onderwerp: string
  tekst: string
  status: ConceptStatus
  in_spark_op: string | null
  verstuurd_op: string | null
  laatst_gecontroleerd_op: string | null
  aangemaakt_op: string
}

const KOLOMMEN =
  'id, record_id, account, aan, onderwerp, tekst, status, in_spark_op, verstuurd_op, laatst_gecontroleerd_op, aangemaakt_op'

/** Zonder migratie een melding waar Daley iets mee kan, geen kale databasefout. */
function tabelFout(error: any): never {
  if (error?.code === '42P01' || /crm_mail_concepten/.test(error?.message || '')) {
    throw new Error('Benaderen kan nog niet: draai eerst de migratie 20260918_crm_mail_concepten.sql in Supabase.')
  }
  throw error
}

// ── Ontvanger ─────────────────────────────────────────────────────────

function veld(customFields: any, namen: string[]): string | null {
  for (const v of Array.isArray(customFields) ? customFields : []) {
    if (namen.includes(String(v?.name || '').toLowerCase()) && typeof v?.value === 'string' && v.value.trim()) {
      return v.value.trim()
    }
  }
  return null
}

function gekoppeldeTaskIds(customFields: any): string[] {
  const ids: string[] = []
  for (const f of Array.isArray(customFields) ? customFields : []) {
    if (f?.type !== 'tasks' && f?.type !== 'list_relationship') continue
    for (const v of Array.isArray(f.value) ? f.value : []) if (v?.id) ids.push(String(v.id))
  }
  return ids
}

/**
 * Het mailadres van een lead is een keuze van Daley, geen gok van de Dash.
 *
 * Alleen `ruwe_contact_email` telt: dat veld vult zij zelf (of de enrichment bij
 * prospects). Adressen van gekoppelde records worden bewust NIET automatisch
 * gebruikt. Aanleiding: aan de lead "Diego website + video + foto" hing een
 * contact Diego Desmidt dat bij Montung hoort. Zonder deze regel zou een mail
 * aan die Diego als contact met deze lead tellen, en zou Benaderen zijn adres
 * voorstellen. De Dash stelt gekoppelde adressen wel voor in het scherm.
 */
function gekozenAdres(lead: any): string | null {
  return normaliseerEmail(lead.ruwe_contact_email)
}

export interface AdresSuggestie {
  email: string
  /** Waar het adres vandaan komt, bijvoorbeeld "Contact: Ellen Jonkhoff" */
  bron: string
}

/** Adressen van gekoppelde contacten en bedrijven, als suggestie voor de kiezer. */
export async function adresSuggesties(recordId: string): Promise<AdresSuggestie[]> {
  const supabase = createServiceClient()
  const { data: lead } = await supabase
    .from('clickup_crm_records')
    .select('custom_fields')
    .eq('id', recordId)
    .single()

  const ids = gekoppeldeTaskIds(lead?.custom_fields)
  if (!ids.length) return []

  const { data } = await supabase
    .from('clickup_crm_records')
    .select('entity_type, name, custom_fields, contact_status')
    .in('clickup_task_id', ids)

  const uit: AdresSuggestie[] = []
  const gezien = new Set<string>()
  for (const r of data || []) {
    if (r.contact_status === 'blokkade') continue
    const email = normaliseerEmail(veld(r.custom_fields, ['e-mail', 'email']))
    if (!email || gezien.has(email)) continue
    gezien.add(email)
    uit.push({ email, bron: `${r.entity_type === 'company' ? 'Bedrijf' : 'Contact'}: ${r.name}` })
  }
  return uit
}

/** De naam waarmee de AI de lead aanspreekt. */
function ontvangerNaam(lead: any): string | null {
  return lead.ruwe_contactpersoon || null
}

// ── Lezen ─────────────────────────────────────────────────────────────

/** Het lopende of laatst verstuurde concept van een record, of null. */
export async function huidigConcept(recordId: string): Promise<MailConcept | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_mail_concepten')
    .select(KOLOMMEN)
    .eq('record_id', recordId)
    .eq('richting', 'uit')
    .neq('status', 'geannuleerd')
    .order('aangemaakt_op', { ascending: false })
    .limit(1)
  if (error) tabelFout(error)
  return (data?.[0] as MailConcept) ?? null
}

async function haalConcept(id: string): Promise<MailConcept> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('crm_mail_concepten').select(KOLOMMEN).eq('id', id).single()
  if (error) tabelFout(error)
  if (!data) throw new Error('Concept niet gevonden')
  return data as MailConcept
}

async function werkBij(id: string, velden: Record<string, unknown>): Promise<MailConcept> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_mail_concepten')
    .update({ ...velden, bijgewerkt_op: new Date().toISOString() })
    .eq('id', id)
    .select(KOLOMMEN)
    .single()
  if (error) tabelFout(error)
  return data as MailConcept
}

// ── Schrijven ─────────────────────────────────────────────────────────

/**
 * Laat de AI een eerste mail schrijven. Bestaat er al een concept dat nog in de
 * Dash staat, dan wordt dat overschreven; een concept dat al in Spark staat niet.
 */
export async function schrijfConcept(recordId: string): Promise<MailConcept> {
  const supabase = createServiceClient()
  const { data: lead, error } = await supabase
    .from('clickup_crm_records')
    .select('id, entity_type, name, status, company_id, contact_status, custom_fields, ruwe_contact_email, ruwe_contactpersoon')
    .eq('id', recordId)
    .single()

  if (error || !lead) throw new Error('Lead niet gevonden')
  if (lead.entity_type !== 'lead') throw new Error('Benaderen kan alleen vanuit een lead')
  if (lead.contact_status === 'blokkade') throw new Error('Deze lead staat op de blocklist')

  const bestaand = await huidigConcept(recordId)
  if (bestaand?.status === 'in_spark') {
    throw new Error('Deze mail staat al open in Spark. Verstuur hem daar, of haal hem hier weg.')
  }

  const bedrijf = COMPANIES.find((c) => c.id === lead.company_id) ?? COMPANIES[0]

  // Spark hoeft niet open te staan om te schrijven; het account kun je later nog kiezen
  let account: string | null = bedrijf.email
  try {
    account = kiesAccount(await sparkAccounts(), bedrijf.email)?.email ?? bedrijf.email
  } catch {
    // Spark dicht: het bedrijfsadres uit de Dash is een prima eerste gok
  }

  const { mail, model } = await schrijfBenaderingsmail({
    leadId: recordId,
    bedrijf: bedrijf.id,
    ontvangerNaam: ontvangerNaam(lead),
  })

  const velden = {
    record_id: recordId,
    account,
    aan: gekozenAdres(lead),
    onderwerp: mail.onderwerp,
    tekst: mail.tekst,
    status: 'concept',
    ai_model: model,
  }

  if (bestaand?.status === 'concept') return werkBij(bestaand.id, velden)

  const { data, error: schrijfFout } = await supabase
    .from('crm_mail_concepten')
    .insert(velden)
    .select(KOLOMMEN)
    .single()
  if (schrijfFout) tabelFout(schrijfFout)
  return data as MailConcept
}

export async function wijzigConcept(
  id: string,
  invoer: { aan?: string | null; account?: string | null; onderwerp?: string; tekst?: string }
): Promise<MailConcept> {
  const concept = await haalConcept(id)
  if (concept.status !== 'concept') {
    throw new Error('Dit concept staat al in Spark. Pas het daar aan.')
  }
  const velden: Record<string, unknown> = {}
  if (invoer.aan !== undefined) velden.aan = invoer.aan?.trim() || null
  if (invoer.account !== undefined) velden.account = invoer.account?.trim() || null
  if (invoer.onderwerp !== undefined) velden.onderwerp = invoer.onderwerp
  if (invoer.tekst !== undefined) velden.tekst = invoer.tekst
  return werkBij(id, velden)
}

export async function annuleerConcept(id: string): Promise<MailConcept> {
  const concept = await haalConcept(id)
  if (concept.status === 'verstuurd') throw new Error('Deze mail is al verstuurd')
  return werkBij(id, { status: 'geannuleerd' })
}

// ── Naar Spark ────────────────────────────────────────────────────────

/**
 * Markeert het concept als geopend in Spark en geeft de maillink terug. Openen
 * zelf doet de route (op de Mac) of de browser (op de telefoon).
 */
export async function openInSpark(id: string): Promise<{ concept: MailConcept; mailto: string }> {
  const concept = await haalConcept(id)
  if (concept.status !== 'concept' && concept.status !== 'in_spark') {
    throw new Error('Dit concept is al verstuurd of weggegooid')
  }

  // De testversie mag nooit iets in het echte mailprogramma zetten
  if (IS_TEST) throw new Error('In de testversie gaat er niets naar Spark.')

  const aan = normaliseerEmail(concept.aan)
  if (!aan) throw new Error('Vul eerst een geldig mailadres in bij Aan.')
  if (!concept.onderwerp.trim() || !concept.tekst.trim()) throw new Error('Onderwerp en tekst mogen niet leeg zijn.')

  const mailto = mailtoLink({ aan, onderwerp: concept.onderwerp.trim(), tekst: concept.tekst.trim() })
  // Nog een keer openen verschuift het startmoment niet: de eerste keer telt
  const bijgewerkt = concept.status === 'in_spark'
    ? concept
    : await werkBij(id, { aan, status: 'in_spark', in_spark_op: new Date().toISOString() })
  return { concept: bijgewerkt, mailto }
}

// ── Verzonden? ────────────────────────────────────────────────────────

/**
 * Kijkt in de verzonden mail van Spark of dit concept de deur uit is. Zo ja,
 * dan wordt het contactmoment gelogd en schuift een nieuwe lead naar Benaderd.
 */
export async function controleerVerstuurd(id: string): Promise<MailConcept> {
  const concept = await haalConcept(id)
  if (concept.status !== 'in_spark' || !concept.aan) return concept

  const gevonden = await zoekVerzondenMail({
    aan: concept.aan,
    onderwerp: concept.onderwerp,
    vanaf: new Date(concept.in_spark_op || concept.aangemaakt_op),
  })

  const nu = new Date().toISOString()
  if (!gevonden) return werkBij(id, { laatst_gecontroleerd_op: nu })

  const verstuurdOp = mailTijd(gevonden)
  const bijgewerkt = await werkBij(id, {
    status: 'verstuurd',
    verstuurd_op: Number.isFinite(verstuurdOp.getTime()) ? verstuurdOp.toISOString() : nu,
    spark_bericht_id: gevonden.id,
    // Het account waar hij echt vandaan ging, ook als Daley in Spark een ander koos
    account: gevonden.account,
    laatst_gecontroleerd_op: nu,
  })

  await logVerzondenMail(concept.record_id, concept.onderwerp)
  await reactiesAfgehandeld(concept.record_id, verstuurdOp)
  return bijgewerkt
}

/** Contactmoment voor een verzonden mail; een nieuwe lead schuift door naar Benaderd. */
async function logVerzondenMail(recordId: string, onderwerp: string) {
  const supabase = createServiceClient()
  const { data: lead } = await supabase
    .from('clickup_crm_records')
    .select('status, entity_type')
    .eq('id', recordId)
    .single()

  const nieuweFase = lead?.entity_type === 'lead' ? faseNaContact(lead.status) : null
  try {
    await logContactMoment(recordId, {
      soort: 'mail',
      notitie: `Verstuurd via Spark: ${onderwerp}`,
      status: nieuweFase,
      volgende_actie: standaardOpvolgdatum(nieuweFase || lead?.status),
    })
  } catch (e) {
    // Op de blocklist gezet terwijl de mail onderweg was: de mail is wel weg, dat blijft staan
    console.warn('Contactmoment na verzonden mail niet gelogd:', e)
  }
}

/** Fases waarin een lead nog loopt. Afgesloten leads laten we met rust. */
const LOPENDE_FASES = ['nieuwe kans', 'benaderd', 'in gesprek', 'offerte uit', 'later opvolgen', 'on hold']

/**
 * Hoe ver terug we kijken. Kort, zodat het aanzetten van deze functie geen
 * stapel oude mails als nieuw contact logt en leads massaal doorschuift.
 */
const TERUGKIJK_DAGEN = 3

/**
 * Legt mails vast die Daley zelf aan een lead heeft gestuurd, buiten een concept
 * uit de Dash om. Alleen mails na het laatst gelogde contact tellen: wie het
 * contact al met de hand logde, krijgt het niet dubbel.
 */
export async function registreerVerzondenMails(): Promise<{ leads: number; vastgelegd: number }> {
  const supabase = createServiceClient()
  const { data: leads, error } = await supabase
    .from('clickup_crm_records')
    .select('id, name, status, laatste_contact, contact_status, custom_fields, ruwe_contact_email, ruwe_contactpersoon')
    .eq('entity_type', 'lead')
    .in('status', LOPENDE_FASES)
    .or('contact_status.is.null,contact_status.neq.blokkade')
  if (error) throw error

  let bekeken = 0
  let vastgelegd = 0

  for (const lead of leads || []) {
    const email = gekozenAdres(lead)
    if (!email) continue
    bekeken++

    const vanaf = Math.max(
      Date.now() - TERUGKIJK_DAGEN * 86_400_000,
      lead.laatste_contact ? new Date(lead.laatste_contact).getTime() : 0
    )
    const mails = (await zoekVerzondenMails(email, TERUGKIJK_DAGEN + 1))
      .filter((m) => mailTijd(m).getTime() > vanaf)
    if (!mails.length) continue

    const { data: bekend, error: leesFout } = await supabase
      .from('crm_mail_concepten')
      .select('spark_bericht_id')
      .in('spark_bericht_id', mails.map((m) => m.id))
    if (leesFout) tabelFout(leesFout)
    const alGeteld = new Set((bekend || []).map((r: any) => r.spark_bericht_id))

    for (const mail of mails) {
      if (alGeteld.has(mail.id)) continue
      const { error: schrijfFout } = await supabase.from('crm_mail_concepten').insert({
        record_id: lead.id,
        account: mail.account,
        aan: email,
        onderwerp: mail.onderwerp,
        tekst: '',
        status: 'verstuurd',
        verstuurd_op: mailTijd(mail).toISOString(),
        spark_bericht_id: mail.id,
      })
      if (schrijfFout) tabelFout(schrijfFout)
      await logVerzondenMail(lead.id, mail.onderwerp)
      await reactiesAfgehandeld(lead.id, mailTijd(mail))
      vastgelegd++
    }
  }

  return { leads: bekeken, vastgelegd }
}

/**
 * Het vangnet op de achtergrond: eerst de concepten die in Spark openstaan, dan
 * alle andere mails aan leads, en als laatste de reacties. In die volgorde, zodat
 * een mail uit een concept aan zijn concept gekoppeld wordt en niet als losse mail,
 * en een reactie waarop je al antwoordde niet meer als open reactie blijft staan.
 */
export async function controleerMail(): Promise<{
  concepten: number; verstuurd: number; losseMails: number; reacties: number; fouten: string[]
}> {
  const open = await controleerAlleOpen()
  let losseMails = 0
  let reacties = 0
  const fouten = [...open.fouten]
  const sparkDicht = () => fouten.some((f) => /niet open|geen antwoord|niet gevonden/i.test(f))

  if (!sparkDicht()) {
    try {
      losseMails = (await registreerVerzondenMails()).vastgelegd
    } catch (e: any) {
      fouten.push(e?.message || String(e))
    }
  }
  if (!sparkDicht()) {
    try {
      reacties = (await registreerReacties()).nieuw
    } catch (e: any) {
      fouten.push(e?.message || String(e))
    }
  }
  return { concepten: open.gecontroleerd, verstuurd: open.verstuurd, losseMails, reacties, fouten }
}

/** Alle concepten die in Spark klaarstaan nalopen. Voor het vangnet op de achtergrond. */
export async function controleerAlleOpen(): Promise<{ gecontroleerd: number; verstuurd: number; fouten: string[] }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_mail_concepten')
    .select('id')
    .eq('status', 'in_spark')
    .order('in_spark_op', { ascending: true })
    .limit(50)
  if (error) tabelFout(error)

  let verstuurd = 0
  const fouten: string[] = []
  // Eén voor één: de Spark CLI praat met één app, parallel levert niets op
  for (const { id } of data || []) {
    try {
      const uit = await controleerVerstuurd(id)
      if (uit.status === 'verstuurd') verstuurd++
    } catch (e: any) {
      fouten.push(e?.message || String(e))
      // Spark dicht geldt voor alle concepten tegelijk, dan heeft doorgaan geen zin
      if (/niet open|geen antwoord/i.test(e?.message || '')) break
    }
  }
  return { gecontroleerd: (data || []).length, verstuurd, fouten }
}

// ── Reacties ──────────────────────────────────────────────────────────

export interface Reactie {
  id: string
  record_id: string
  van: string | null
  account: string | null
  onderwerp: string
  verstuurd_op: string | null
  gezien_op: string | null
}

const REACTIE_KOLOMMEN = 'id, record_id, van, account, onderwerp, verstuurd_op, gezien_op'

/**
 * Kijkt of lopende leads hebben teruggemaild. Alleen leads die Daley al eens
 * benaderde: anders telt elke nieuwsbrief van een bedrijf op de lijst als reactie.
 *
 * Een reactie zet de lead op vandaag in Vandaag oppakken, met het onderwerp als
 * notitie. De fase blijft staan: of het een gesprek wordt, beslist Daley.
 */
export async function registreerReacties(): Promise<{ leads: number; nieuw: number }> {
  const supabase = createServiceClient()
  const { data: leads, error } = await supabase
    .from('clickup_crm_records')
    .select('id, name, status, laatste_contact, contact_pogingen, contact_status, custom_fields, ruwe_contact_email, ruwe_contactpersoon')
    .eq('entity_type', 'lead')
    .in('status', LOPENDE_FASES)
    .or('contact_status.is.null,contact_status.neq.blokkade')
  if (error) throw error

  let bekeken = 0
  let nieuw = 0

  for (const lead of leads || []) {
    if (!lead.laatste_contact && !(Number(lead.contact_pogingen) > 0)) continue
    const email = gekozenAdres(lead)
    if (!email) continue
    bekeken++

    // Een reactie waarop Daley daarna al antwoordde, is geen open reactie meer
    const { data: laatsteUit } = await supabase
      .from('crm_mail_concepten')
      .select('verstuurd_op')
      .eq('record_id', lead.id)
      .eq('richting', 'uit')
      .eq('status', 'verstuurd')
      .order('verstuurd_op', { ascending: false })
      .limit(1)
    const vanaf = Math.max(
      Date.now() - TERUGKIJK_DAGEN * 86_400_000,
      laatsteUit?.[0]?.verstuurd_op ? new Date(laatsteUit[0].verstuurd_op).getTime() : 0
    )

    const kandidaten = (await zoekOntvangenMails(afzenderSleutel(email), TERUGKIJK_DAGEN + 1))
      .filter((m) => mailTijd(m).getTime() > vanaf)
    if (!kandidaten.length) continue

    const { data: bekend, error: leesFout } = await supabase
      .from('crm_mail_concepten')
      .select('spark_bericht_id')
      .in('spark_bericht_id', kandidaten.map((m) => m.id))
    if (leesFout) tabelFout(leesFout)
    const alGeteld = new Set((bekend || []).map((r: any) => r.spark_bericht_id))

    for (const mail of kandidaten) {
      if (alGeteld.has(mail.id)) continue

      // De zoektabel kapt het adres af; het gesprek zelf heeft het volledige adres
      const van = (await leesThread(mail.id)).find((b) => b.id === mail.id)?.van || null
      if (van && isAutomatischeAfzender(van)) continue

      const { error: schrijfFout } = await supabase.from('crm_mail_concepten').insert({
        record_id: lead.id,
        richting: 'in',
        status: 'ontvangen',
        account: mail.account,
        van,
        onderwerp: mail.onderwerp,
        tekst: '',
        verstuurd_op: mailTijd(mail).toISOString(),
        spark_bericht_id: mail.id,
      })
      if (schrijfFout) tabelFout(schrijfFout)

      await zetReactieOpVandaag(lead, mail.onderwerp, mailTijd(mail))
      nieuw++
    }
  }

  return { leads: bekeken, nieuw }
}

async function zetReactieOpVandaag(lead: any, onderwerp: string, binnen: Date) {
  const supabase = createServiceClient()
  const nu = new Date().toISOString()
  const laatste = lead.laatste_contact ? new Date(lead.laatste_contact).getTime() : 0

  await supabase
    .from('clickup_crm_records')
    .update({
      volgende_actie: datumPlusDagen(0),
      volgende_actie_notitie: `Heeft gereageerd: ${onderwerp}`.slice(0, 200),
      // Laatste contact is contact in beide richtingen; de teller pogingen is alleen van Daley
      ...(binnen.getTime() > laatste ? { laatste_contact: binnen.toISOString() } : {}),
      updated_at: nu,
    })
    .eq('id', lead.id)

  await supabase.from('crm_activiteiten').insert({
    record_id: lead.id,
    soort: 'contact',
    omschrijving: 'Reactie ontvangen',
    nieuwe_waarde: onderwerp,
  })
}

/** Heeft Daley na een reactie zelf gemaild, dan is die reactie afgehandeld. */
async function reactiesAfgehandeld(recordId: string, na: Date) {
  if (!Number.isFinite(na.getTime())) return
  const supabase = createServiceClient()
  await supabase
    .from('crm_mail_concepten')
    .update({ gezien_op: new Date().toISOString() })
    .eq('record_id', recordId)
    .eq('richting', 'in')
    .is('gezien_op', null)
    .lt('verstuurd_op', na.toISOString())
}

/** Reacties op een lead die nog niet afgehandeld zijn, nieuwste eerst. */
export async function openReacties(recordId: string): Promise<Reactie[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_mail_concepten')
    .select(REACTIE_KOLOMMEN)
    .eq('record_id', recordId)
    .eq('richting', 'in')
    .is('gezien_op', null)
    .order('verstuurd_op', { ascending: false })
  if (error) tabelFout(error)
  return (data || []) as Reactie[]
}

export async function markeerReactieGezien(id: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('crm_mail_concepten')
    .update({ gezien_op: new Date().toISOString(), bijgewerkt_op: new Date().toISOString() })
    .eq('id', id)
    .eq('richting', 'in')
  if (error) tabelFout(error)
}

/** De tekst van een reactie, gelezen uit Spark. */
export async function leesReactie(id: string): Promise<{ van: string; datum: string; tekst: string }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('crm_mail_concepten')
    .select('spark_bericht_id')
    .eq('id', id)
    .single()
  if (error) tabelFout(error)
  if (!data?.spark_bericht_id) throw new Error('Deze reactie heeft geen Spark-bericht')
  const bericht = (await leesThread(data.spark_bericht_id)).find((b) => b.id === data.spark_bericht_id)
  if (!bericht) throw new Error('Spark vond dit bericht niet meer')
  return { van: bericht.van, datum: bericht.datum, tekst: bericht.tekst }
}

// ── Mailadres kiezen ──────────────────────────────────────────────────

/** Het gekozen adres plus wat er aan gekoppelde records te kiezen valt. */
export async function mailAdresKeuze(recordId: string): Promise<{ gekozen: string | null; suggesties: AdresSuggestie[] }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('clickup_crm_records')
    .select('ruwe_contact_email')
    .eq('id', recordId)
    .single()
  if (error) throw error
  return { gekozen: data?.ruwe_contact_email || null, suggesties: await adresSuggesties(recordId) }
}

export async function zetMailAdres(recordId: string, email: string | null): Promise<string | null> {
  const schoon = email?.trim() ? normaliseerEmail(email) : null
  if (email?.trim() && !schoon) throw new Error('Dat is geen geldig mailadres')

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('clickup_crm_records')
    .update({ ruwe_contact_email: schoon, updated_at: new Date().toISOString() })
    .eq('id', recordId)
  if (error) throw error

  await supabase.from('crm_activiteiten').insert({
    record_id: recordId,
    soort: 'veld',
    omschrijving: schoon ? 'Mailadres gezet' : 'Mailadres gewist',
    nieuwe_waarde: schoon,
  })
  return schoon
}
