/**
 * Dubbelcheck en blokkadecheck bij het toevoegen van een lead.
 *
 * Zonder deze controle vervuilt de lijst op twee manieren. Je voegt hetzelfde
 * bedrijf twee keer toe zonder het te merken, en een bedrijf dat je eerder
 * bewust hebt afgewezen komt bij de volgende ronde gewoon weer bovendrijven.
 * Dat laatste is het vervelendst: je hebt de beslissing al genomen en neemt
 * hem opnieuw.
 *
 * Vergelijken gebeurt op drie sleutels, in die volgorde van betrouwbaarheid:
 *  1. Domein, uit de website of anders uit het mailadres.
 *  2. Mailadres.
 *  3. Bedrijfsnaam, maar alleen als er verder niets bekend is. Twee bedrijven
 *     kunnen dezelfde naam dragen, twee domeinen nooit.
 *
 * De check kijkt door alle entity_types heen. Een prospect voor een bedrijf
 * dat al als klant in het CRM staat is net zo goed een dubbele.
 */
import { createServiceClient } from '@/lib/supabase/service'

export interface KandidaatLead {
  name: string
  website?: string | null
  email?: string | null
}

export interface Botsing {
  soort: 'dubbel' | 'blokkade'
  id: string
  naam: string
  entity_type: string
  /** Waarop het matchte: domein, mailadres of naam. */
  sleutel: 'domein' | 'mailadres' | 'naam'
  /** Alleen bij een blokkade: waarom het bedrijf destijds is afgewezen. */
  reden?: string | null
}

/** Kaal domein zonder protocol, www of pad. Leeg als er niets bruikbaars in zit. */
export function normaliseerDomein(waarde: string | null | undefined): string | null {
  const v = waarde?.trim().toLowerCase()
  if (!v) return null

  // Ook een mailadres levert een domein op, dat is vaak alles wat je hebt.
  if (v.includes('@') && !v.includes('/')) {
    const na = v.split('@')[1]
    return na && na.includes('.') ? na.replace(/^www\./, '') : null
  }

  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    const host = url.hostname.replace(/^www\./, '')
    return host.includes('.') ? host : null
  } catch {
    return null
  }
}

export function normaliseerEmail(waarde: string | null | undefined): string | null {
  const v = waarde?.trim().toLowerCase()
  if (!v || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(v)) return null
  return v
}

/**
 * Naam terugbrengen tot de kern, zodat "Van Dijk Hoveniers B.V." en
 * "van dijk hoveniers bv" als hetzelfde bedrijf tellen.
 */
export function normaliseerNaam(waarde: string | null | undefined): string | null {
  const v = waarde
    ?.trim()
    .toLowerCase()
    .replace(/\b(b\.?v\.?|v\.?o\.?f\.?|n\.?v\.?|eenmanszaak|holding)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return v && v.length >= 3 ? v : null
}

const CHECK_COLUMNS =
  'id, entity_type, name, contact_status, contact_status_reden, ruwe_website, ruwe_contact_email, ai_website, custom_fields'

/** Haalt de website en het mailadres uit de custom fields van bedrijven en contacten. */
function uitCustomFields(customFields: any): { website: string | null; email: string | null } {
  let website: string | null = null
  let email: string | null = null
  for (const veld of Array.isArray(customFields) ? customFields : []) {
    const naam = String(veld?.name || '').toLowerCase()
    const waarde = typeof veld?.value === 'string' ? veld.value : null
    if (!waarde) continue
    if (!website && (naam === 'website' || naam === 'site')) website = waarde
    if (!email && (naam === 'e-mail' || naam === 'email')) email = waarde
  }
  return { website, email }
}

/**
 * Kijkt of dit bedrijf al ergens in het CRM staat of eerder is geblokkeerd.
 *
 * Geeft de eerste botsing terug, of null als het bedrijf nieuw is. Een
 * blokkade weegt zwaarder dan een dubbele: die wil je als eerste zien.
 */
export async function zoekBotsing(kandidaat: KandidaatLead): Promise<Botsing | null> {
  const domein = normaliseerDomein(kandidaat.website) ?? normaliseerDomein(kandidaat.email)
  const email = normaliseerEmail(kandidaat.email)
  const naam = normaliseerNaam(kandidaat.name)

  if (!domein && !email && !naam) return null

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('clickup_crm_records').select(CHECK_COLUMNS)

  // De check mag het toevoegen nooit blokkeren als hij zelf omvalt: dan liever
  // een dubbele lead dan een lead die je niet kwijt kunt.
  if (error || !data) return null

  const dubbels: Botsing[] = []

  for (const rij of data as any[]) {
    const velden = uitCustomFields(rij.custom_fields)
    const rijDomein =
      normaliseerDomein(rij.ruwe_website) ??
      normaliseerDomein(rij.ai_website) ??
      normaliseerDomein(velden.website) ??
      normaliseerDomein(rij.ruwe_contact_email) ??
      normaliseerDomein(velden.email)
    const rijEmail = normaliseerEmail(rij.ruwe_contact_email) ?? normaliseerEmail(velden.email)
    const rijNaam = normaliseerNaam(rij.name)

    let sleutel: Botsing['sleutel'] | null = null
    if (domein && rijDomein && domein === rijDomein) sleutel = 'domein'
    else if (email && rijEmail && email === rijEmail) sleutel = 'mailadres'
    // Op naam alleen matchen als er van een van beide kanten geen hardere
    // sleutel is. Twee bedrijven mogen dezelfde naam dragen, twee domeinen niet.
    else if (naam && rijNaam && naam === rijNaam && !(domein && rijDomein)) sleutel = 'naam'

    if (!sleutel) continue

    const botsing: Botsing = {
      soort: rij.contact_status === 'blokkade' ? 'blokkade' : 'dubbel',
      id: rij.id,
      naam: rij.name,
      entity_type: rij.entity_type,
      sleutel,
      reden: rij.contact_status === 'blokkade' ? rij.contact_status_reden : null,
    }

    // Een blokkade is meteen raak, daar hoeven we niet verder voor te zoeken.
    if (botsing.soort === 'blokkade') return botsing
    dubbels.push(botsing)
  }

  // Een match op domein of mailadres zegt meer dan een match op naam.
  return (
    dubbels.find((b) => b.sleutel === 'domein') ??
    dubbels.find((b) => b.sleutel === 'mailadres') ??
    dubbels[0] ??
    null
  )
}

const ENTITEIT_LABEL: Record<string, string> = {
  ruwe_lead: 'prospect',
  lead: 'lead',
  company: 'bedrijf',
  contact: 'contact',
  deal: 'opdracht',
  invoice: 'factuur',
}

/** Nette zin voor in het scherm. */
export function botsingMelding(botsing: Botsing): string {
  const soort = ENTITEIT_LABEL[botsing.entity_type] || botsing.entity_type
  const via =
    botsing.sleutel === 'domein'
      // Bewust "domein" en niet "website": de sleutel komt ook uit een
      // mailadres, en dan klopt "zelfde website" niet met wat je hebt ingevuld.
      ? 'zelfde domein'
      : botsing.sleutel === 'mailadres'
        ? 'zelfde mailadres'
        : 'zelfde naam'

  if (botsing.soort === 'blokkade') {
    return `${botsing.naam} staat op de blocklist (${via})${
      botsing.reden ? `: ${botsing.reden}` : ''
    }. Haal hem eerst van de blocklist.`
  }
  return `Staat er al als ${soort} "${botsing.naam}" (${via}).`
}
