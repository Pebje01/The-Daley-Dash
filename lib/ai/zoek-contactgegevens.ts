/**
 * Contactgegevens bij een prospect of lead opzoeken: website, de persoon die erbij
 * hoort, het mailadres en het telefoonnummer.
 *
 * Zonder die gegevens is een prospect niet te beoordelen en al helemaal niet
 * te benaderen. Dit vult dat gat met wat er publiek op de site van het bedrijf
 * staat, zodat je in de lijst meteen kunt klikken: bellen, mailen, site open.
 *
 * Drie regels die de hele opzet bepalen:
 *  - Alleen lege velden worden gevuld. Wat jij zelf hebt ingevuld wint altijd.
 *  - Liever niets dan gegokt. Een verzonnen mailadres kost je een bounce en
 *    beschadigt je afzenderreputatie, een leeg veld kost je niets.
 *  - Elk mailadres wordt daarna nog eens hard nagerekend tegen de site zelf.
 *
 * Die laatste regel is niet voor de sier. Een taalmodel stelt met het grootste
 * gemak een plausibel adres samen uit naam plus domein. De instructie "nooit
 * afleiden of raden" helpt daar onvoldoende tegen, een deterministische
 * controle wel.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { vraagClaude, ClaudeCliError } from './claude-cli'

export interface Contactgegevens {
  website: string | null
  contactpersoon: string | null
  email: string | null
  telefoon: string | null
  /** Waar het vandaan komt, zodat je het kunt narekenen. */
  toelichting: string | null
}

const ANTWOORD_SCHEMA = {
  type: 'object',
  properties: {
    website: {
      type: ['string', 'null'],
      description:
        'De website van dit bedrijf, als volledige URL. Null als je die niet met zekerheid kunt vinden.',
    },
    contactpersoon: {
      type: ['string', 'null'],
      description:
        'Naam van de eigenaar of vaste contactpersoon, zoals die op de site staat. Null als er geen naam te vinden is.',
    },
    email: {
      type: ['string', 'null'],
      description:
        'Publiek mailadres van het bedrijf. Letterlijk overnemen zoals het er staat, nooit afleiden of samenstellen. Null als je er geen ziet.',
    },
    telefoon: {
      type: ['string', 'null'],
      description: 'Telefoonnummer van het bedrijf, zoals het er staat. Null als je er geen ziet.',
    },
    toelichting: {
      type: ['string', 'null'],
      description:
        'Een korte zin waar je het vond, bijvoorbeeld contactpagina of footer. Null als je niets vond.',
    },
  },
  required: ['website', 'contactpersoon', 'email', 'telefoon', 'toelichting'],
  additionalProperties: false,
} as const

const INSTRUCTIE = [
  'Je zoekt publieke contactgegevens van een bedrijf op, voor Daley Jansen: een zelfstandig brand designer en fotograaf die dit bedrijf zakelijk wil benaderen.',
  '',
  'Neem alles letterlijk over zoals het op de website staat. Je mag een mailadres nooit afleiden, samenstellen of raden.',
  'Dus geen info@ verzinnen omdat dat gebruikelijk is, en geen naam plus domein aan elkaar plakken.',
  'Zie je het adres niet echt staan, geef dan null. Een leeg veld is prima, een verkeerd adres niet.',
  '',
  'Voor de naam: zoek de eigenaar of de vaste contactpersoon, meestal te vinden op een over-ons- of teampagina.',
  'Is het een groter bedrijf zonder duidelijke eigenaar, geef dan null in plaats van een willekeurige medewerker.',
  '',
  'Kies bij meerdere mailadressen het adres dat het meest geschikt is voor een zakelijk voorstel: een algemeen info- of contactadres, of dat van de eigenaar.',
  'Niet het adres van sollicitaties, facturen of de klantenservice van een webshop.',
].join('\n')

interface RuweLeadRij {
  id: string
  name: string
  entity_type: string
  custom_fields: any[] | null
  ruwe_website: string | null
  ruwe_contact_email: string | null
  ruwe_contactpersoon: string | null
  ruwe_telefoon: string | null
  ruwe_fit_reden: string | null
  ai_website: string | null
  ai_branche: string | null
}

/** Website uit het veld Website op het record zelf of op een gekoppeld bedrijf. */
async function siteUitVelden(lead: RuweLeadRij): Promise<string | null> {
  const uitVelden = (velden: any): string | null => {
    for (const f of Array.isArray(velden) ? velden : []) {
      const naam = String(f?.name || '').toLowerCase()
      if ((naam === 'website' || naam === 'site') && typeof f?.value === 'string' && f.value.trim()) {
        return f.value.trim()
      }
    }
    return null
  }

  const eigen = uitVelden(lead.custom_fields)
  if (eigen) return eigen

  const taskIds: string[] = []
  for (const f of Array.isArray(lead.custom_fields) ? lead.custom_fields : []) {
    if (f?.type !== 'tasks' && f?.type !== 'list_relationship') continue
    for (const v of Array.isArray(f.value) ? f.value : []) if (v?.id) taskIds.push(String(v.id))
  }
  if (!taskIds.length) return null

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('clickup_crm_records')
    .select('entity_type, custom_fields')
    .in('clickup_task_id', taskIds)
  for (const r of data || []) {
    if (r.entity_type !== 'company') continue
    const site = uitVelden(r.custom_fields)
    if (site) return site
  }
  return null
}

/**
 * Zoekt de ontbrekende contactgegevens van één ruwe lead op en schrijft ze weg.
 *
 * Alleen de velden die nog leeg waren worden gevuld. Levert het niets op, dan
 * blijft de lead gewoon staan zoals hij stond; dit is een vangnet, geen
 * voorwaarde.
 */
export async function zoekContactgegevens(recordId: string): Promise<Contactgegevens | null> {
  const supabase = createServiceClient()

  const { data: lead, error } = await supabase
    .from('clickup_crm_records')
    .select(
      'id, name, entity_type, custom_fields, ruwe_website, ruwe_contact_email, ruwe_contactpersoon, ruwe_telefoon, ruwe_fit_reden, ai_website, ai_branche'
    )
    .eq('id', recordId)
    .single<RuweLeadRij>()

  if (error || !lead) throw new Error('Record niet gevonden')

  // De kwalificatie heeft de site vaak al gevonden. Die hoeven we niet opnieuw
  // te zoeken, en hij is meteen het startpunt voor de contactpagina. Bij leads
  // die niet uit de prospectlijst komen staat hij vaak in een veld, of bij het
  // bedrijf dat eraan gekoppeld is.
  const website = lead.ruwe_website || lead.ai_website || (await siteUitVelden(lead)) || null

  const ontbreekt = [
    !website ? 'de website' : null,
    !lead.ruwe_contactpersoon ? 'de naam van de eigenaar of contactpersoon' : null,
    !lead.ruwe_contact_email ? 'het mailadres' : null,
    !lead.ruwe_telefoon ? 'het telefoonnummer' : null,
  ].filter(Boolean) as string[]

  if (ontbreekt.length === 0) {
    await supabase
      .from('clickup_crm_records')
      .update({
        ruwe_contact_status: 'klaar',
        ruwe_contact_gezocht_op: new Date().toISOString(),
        ruwe_contact_fout: null,
      })
      .eq('id', recordId)
    return null
  }

  await supabase
    .from('clickup_crm_records')
    .update({ ruwe_contact_status: 'bezig', ruwe_contact_fout: null })
    .eq('id', recordId)

  const feiten = [
    `Bedrijfsnaam: ${lead.name}`,
    website ? `Website: ${website}` : null,
    lead.ai_branche ? `Branche: ${lead.ai_branche}` : null,
    lead.ruwe_fit_reden ? `Context: ${lead.ruwe_fit_reden}` : null,
    lead.ruwe_contactpersoon ? `Contactpersoon (al bekend): ${lead.ruwe_contactpersoon}` : null,
    lead.ruwe_contact_email ? `Mailadres (al bekend): ${lead.ruwe_contact_email}` : null,
    lead.ruwe_telefoon ? `Telefoon (al bekend): ${lead.ruwe_telefoon}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const prompt = [
    `Zoek van dit bedrijf ${ontbreekt.join(', ')} op.`,
    '',
    website
      ? 'Begin bij de website hieronder. Haal de homepage op en daarna de contact- of over-ons-pagina, want daar staat het meestal.'
      : 'Er is geen website bekend. Zoek die eerst met WebSearch, en haal daarna de contactpagina op.',
    'Kom je er via de site niet uit, probeer dan nog een gerichte zoekopdracht. Levert dat ook niets op, geef dan null terug.',
    '',
    '--- BEDRIJF ---',
    feiten,
    '--- EINDE ---',
  ].join('\n')

  try {
    const uitslag = await vraagClaude<Contactgegevens>({
      prompt,
      schema: ANTWOORD_SCHEMA as unknown as Record<string, unknown>,
      systemPrompt: INSTRUCTIE,
      tools: ['WebSearch', 'WebFetch'],
      timeoutMs: 4 * 60_000,
    })

    // Nooit iets teruggeven voor een veld dat al gevuld was.
    const gevondenSite = website ? null : schoonWebsite(uitslag.website)
    const kandidaat = lead.ruwe_contact_email ? null : schoonEmail(uitslag.email)
    const telefoon = lead.ruwe_telefoon ? null : schoonTelefoon(uitslag.telefoon)
    const contactpersoon = lead.ruwe_contactpersoon ? null : schoonNaam(uitslag.contactpersoon)

    // Het mailadres moet letterlijk op de site staan. Vindt de controle een
    // ander adres op datzelfde domein, dan nemen we dat: beter een kloppend
    // info@ dan een verzonnen adres dat er specifieker uitziet.
    const email = kandidaat ? await verifieerEmail(kandidaat, website || gevondenSite) : null

    const update: Record<string, unknown> = {
      ruwe_contact_status: 'klaar',
      ruwe_contact_gezocht_op: new Date().toISOString(),
      ruwe_contact_fout: null,
      ruwe_contact_toelichting: uitslag.toelichting?.trim()?.slice(0, 300) || null,
    }
    if (gevondenSite) update.ruwe_website = gevondenSite
    if (contactpersoon) update.ruwe_contactpersoon = contactpersoon
    if (email) update.ruwe_contact_email = email
    if (telefoon) update.ruwe_telefoon = telefoon

    const { error: schrijfFout } = await supabase
      .from('clickup_crm_records')
      .update(update)
      .eq('id', recordId)
    if (schrijfFout) throw schrijfFout

    const gevonden = [
      gevondenSite ? 'website' : null,
      contactpersoon ? 'contactpersoon' : null,
      email ? 'mailadres' : null,
      telefoon ? 'telefoon' : null,
    ].filter(Boolean)

    if (gevonden.length) {
      // Zichtbaar in de activiteitenfeed, zodat je later ziet waar het vandaan kwam.
      await supabase
        .from('crm_activiteiten')
        .insert({
          record_id: recordId,
          soort: 'veld',
          omschrijving: 'Contactgegevens opgezocht',
          nieuwe_waarde: `${gevonden.join(', ')}${
            uitslag.toelichting ? ` (${uitslag.toelichting.trim().slice(0, 120)})` : ''
          }`,
        })
        .then(
          () => undefined,
          () => undefined // logging mag het zoeken nooit laten falen
        )
    }

    console.log(
      `[lead-contact] ${lead.name}: ${gevonden.length ? gevonden.join(', ') : 'niets gevonden'}`
    )

    return { website: gevondenSite, contactpersoon, email, telefoon, toelichting: uitslag.toelichting }
  } catch (e: any) {
    const melding = e instanceof ClaudeCliError ? e.message : e?.message || 'Onbekende fout'
    await supabase
      .from('clickup_crm_records')
      .update({
        ruwe_contact_status: 'mislukt',
        ruwe_contact_gezocht_op: new Date().toISOString(),
        ruwe_contact_fout: melding.slice(0, 500),
      })
      .eq('id', recordId)
    console.error(`[lead-contact] mislukt voor ${recordId}: ${melding}`)
    throw e
  }
}

// ── Narekenen tegen de echte site ─────────────────────────────────────

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

/** Zet &#64; en consorten terug om, want veel sites verstoppen hun adres zo. */
function decodeEntiteiten(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x40;|&commat;|&#64;/gi, '@')
}

const MAIL_PATROON = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

/**
 * Rekent een gevonden mailadres na tegen de echte website.
 *
 * Loopt de homepage af en daarna de contact- en over-ons-pagina's. Staat het
 * adres daar letterlijk, dan is het goed. Staat het er niet maar vinden we wel
 * een ander adres op hetzelfde domein, dan geven we dat terug. Vinden we
 * helemaal niets, dan liever leeg dan fout.
 *
 * Bewust deterministisch en niet nog een AI-ronde: dit is precies het soort
 * controle waar code beter in is dan een taalmodel.
 */
async function verifieerEmail(
  kandidaat: string,
  website: string | null | undefined
): Promise<string | null> {
  if (!website) return null

  let basis: string
  try {
    basis = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).href
  } catch {
    return null
  }

  const domein = new URL(basis).hostname.replace(/^www\./, '')
  const bezocht = new Set<string>()
  const queue: string[] = [basis]
  const gevondenOpSite = new Set<string>()

  while (queue.length && bezocht.size < 6) {
    const url = queue.shift()!
    if (bezocht.has(url)) continue
    bezocht.add(url)

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) continue
      if (!(res.headers.get('content-type') ?? '').includes('text/html')) continue

      const html = decodeEntiteiten(await res.text())

      if (html.toLowerCase().includes(kandidaat)) return kandidaat

      const adressen = html.match(MAIL_PATROON) || []
      for (const adres of adressen) gevondenOpSite.add(adres.toLowerCase())

      const linkPatroon = /href="([^"]*(?:contact|over|about)[^"]*)"/gi
      let link: RegExpExecArray | null
      while ((link = linkPatroon.exec(html)) !== null) {
        try {
          const volgend = new URL(link[1], url)
          if (volgend.hostname.replace(/^www\./, '') === domein) {
            queue.push(volgend.href)
          }
        } catch {
          // Onbruikbare href, overslaan.
        }
      }
    } catch {
      // Site plat, traag of blokkeert ons: dan valt er niets na te rekenen.
    }
  }

  // Het voorgestelde adres stond er niet. Wel een ander adres op hetzelfde
  // domein? Dan is dat vrijwel zeker het juiste.
  const opDomein = Array.from(gevondenOpSite)
    .map((e) => schoonEmail(e))
    .filter((e): e is string => Boolean(e) && e!.endsWith(`@${domein}`))

  if (opDomein.length === 0) return null

  // Een algemeen adres is voor een eerste zakelijke mail het veiligst.
  const algemeen = opDomein.find((e) => /^(info|contact|hallo|hello|mail)@/.test(e))
  return algemeen ?? opDomein[0]
}

// ── Opschonen ─────────────────────────────────────────────────────────

/** Alleen een adres dat er echt als een mailadres uitziet. */
function schoonEmail(waarde: string | null): string | null {
  const v = waarde?.trim().toLowerCase()
  if (!v) return null
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(v)) return null
  // Adressen die nergens heen leiden of die je niet wilt benaderen.
  if (/^(noreply|no-reply|donotreply|postmaster|abuse)@/.test(v)) return null
  if (/example\.(com|org|net)$/.test(v)) return null
  return v
}

function schoonTelefoon(waarde: string | null): string | null {
  const v = waarde?.trim()
  if (!v) return null
  // Minstens acht cijfers, anders is het geen bruikbaar nummer.
  const cijfers = v.replace(/\D/g, '')
  if (cijfers.length < 8 || cijfers.length > 15) return null
  return v.slice(0, 40)
}

function schoonNaam(waarde: string | null): string | null {
  const v = waarde?.trim()
  if (!v || v.length < 3 || v.length > 80) return null
  // Een functietitel is geen naam.
  if (/^(info|contact|team|klantenservice|receptie|sales)$/i.test(v)) return null
  return v
}

function schoonWebsite(waarde: string | null): string | null {
  const v = waarde?.trim()
  if (!v) return null
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    if (!url.hostname.includes('.')) return null
    return url.href.replace(/\/$/, '')
  } catch {
    return null
  }
}
