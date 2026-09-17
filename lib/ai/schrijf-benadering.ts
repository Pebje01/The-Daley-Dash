/**
 * Eerste mail aan een lead, geschreven door Claude in Daley's eigen toon.
 *
 * Dit is een concept, nooit een verzonden mail: Daley leest het in de Dash,
 * past het aan en verstuurt het zelf vanuit Spark. De toonregels hieronder
 * komen uit haar tone-of-voice-skill, ingekort tot wat voor een eerste
 * zakelijke mail telt.
 */
import { vraagClaude } from './claude-cli'
import { bouwContext } from './kwalificeer-lead'
import { KWALIFICATIE_PROFIEL } from './lead-criteria'

export interface Benaderingsmail {
  onderwerp: string
  tekst: string
}

const SCHEMA = {
  type: 'object',
  properties: {
    onderwerp: {
      type: 'string',
      maxLength: 90,
      description: 'Kort, persoonlijk onderwerp. Geen hoofdletters per woord, geen uitroeptekens, geen clickbait.',
    },
    tekst: {
      type: 'string',
      description: 'De mail zelf, platte tekst met witregels tussen alinea\'s. Zonder handtekening: die zet Spark eronder.',
    },
  },
  required: ['onderwerp', 'tekst'],
  additionalProperties: false,
} as const

const BEDRIJF_AFZENDER: Record<string, string> = {
  tde: 'The Daley Edit: content, social media en visuele branding voor premium merken.',
  wgb: 'We Grow Brands: websites, webshops, SEO, Google Ads, branding en logo\'s.',
  daleyphotography: 'Daley Photography: branding-, product- en contentfotografie.',
}

const TOON = `
Je schrijft als Daley Jansen zelf. De lezer mag nooit merken dat er een machine aan te pas kwam.

Hoe Daley klinkt in een eerste zakelijke mail:
- Warm, direct en menselijk. Korte zinnen, één gedachte per zin.
- Professioneel maar nooit stijf: "Hi [voornaam]," of "Hoi [voornaam]," als opening. Weet je geen naam, dan "Hi," of "Hallo,".
- Spreektaal mag, maar met mate in een eerste mail: een "gewoon", "echt" of "even" hier en daar. Geen afkortingen als mn, ff, miss in een koude mail.
- Ze laat merken dat ze echt gekeken heeft: noem één concreet ding van hun bedrijf of site dat je is opgevallen.
- Eén duidelijke, lichte vraag aan het eind. Geen harde verkoop, geen prijzen, geen opsomming van diensten.
- Afsluiten met "Groetjes," of "Met vriendelijke groet," en daaronder "Daley". Geen verdere handtekening, die zet Spark eronder.
- Hooguit 120 woorden. Liever korter.
- Geen emoji in een eerste mail aan een onbekende.

Nooit:
- "Ik hoop dat deze mail je goed bereikt", "Graag stel ik mij even voor", "Aarzel niet om contact op te nemen", "Ik zie een mooie kans".
- Complimenten die over elk bedrijf zouden kunnen gaan.
- Een verkooppraatje over jezelf als "Ik help [branche] met..." of een rijtje beloftes ("snel, overzichtelijk en gebouwd om..."). Eén zin over wat Daley doet is genoeg, en die mag ook weg.
- Aannames over problemen die je niet echt gezien hebt. Een vraag stellen is beter dan een probleem invullen.
- Lange streepjes. Gebruik een komma, punt of dubbele punt. Ook zo min mogelijk gewone koppelstreepjes.
- Beweringen over hun bedrijf die niet in de gegevens staan of die je niet zelf op hun site hebt gezien.

Taal: Nederlands. Alleen Engels als het een buitenlandse organisatie is zonder Nederlandstalige kant, dan in dezelfde toon: warm, kort, direct.
`

export async function schrijfBenaderingsmail(invoer: {
  leadId: string
  bedrijf: string | null
  ontvangerNaam: string | null
}): Promise<{ mail: Benaderingsmail; model: string }> {
  const model = process.env.CLAUDE_CLI_MODEL || 'claude-sonnet-5'
  const { tekst } = await bouwContext(invoer.leadId)

  const afzender = (invoer.bedrijf && BEDRIJF_AFZENDER[invoer.bedrijf]) || BEDRIJF_AFZENDER.tde

  const prompt = [
    'Schrijf de eerste mail van Daley aan deze lead.',
    '',
    `Daley mailt namens: ${afzender}`,
    invoer.ontvangerNaam
      ? `De mail gaat naar: ${invoer.ontvangerNaam}. Spreek diegene aan met de voornaam.`
      : 'Er is geen contactpersoon bekend, open dus zonder naam.',
    '',
    'Werkwijze:',
    '1. Lees de leadgegevens, vooral de AI-beoordeling en de voorgestelde eerste stap: die insteek neem je over.',
    '2. Staat er te weinig in om iets concreets over het bedrijf te zeggen en is er een website bekend, haal die dan op met WebFetch. Zoek niet verder dan die ene site.',
    '3. Schrijf een korte mail met een haakje dat echt over dit bedrijf gaat, en één vraag aan het eind.',
    '',
    '--- LEADGEGEVENS ---',
    tekst,
    '--- EINDE LEADGEGEVENS ---',
  ].join('\n')

  const mail = await vraagClaude<Benaderingsmail>({
    prompt,
    schema: SCHEMA as unknown as Record<string, unknown>,
    systemPrompt: `${TOON}\n\nAchtergrond over Daley en wat ze doet:\n${KWALIFICATIE_PROFIEL}`,
    tools: ['WebFetch'],
    model,
    timeoutMs: 4 * 60_000,
  })

  return {
    mail: {
      onderwerp: zonderLangeStreep(mail.onderwerp).trim(),
      tekst: zonderLangeStreep(mail.tekst).trim(),
    },
    model,
  }
}

// Lange en halflange streep, als tekencode zodat dit bestand ze zelf niet bevat
const LANGE_STREPEN = new RegExp(`\\s*[${String.fromCharCode(0x2014, 0x2013)}]\\s*`, 'g')

/** Vangnet voor Daley's vaste regel: nooit lange streepjes, wat het model ook doet. */
function zonderLangeStreep(s: string): string {
  return String(s || '').replace(LANGE_STREPEN, ', ')
}
