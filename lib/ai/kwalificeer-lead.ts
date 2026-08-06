/**
 * Kwalificatie van een lead door Claude, via de lokale CLI.
 *
 * De AI plakt een branchelabel, zoekt de website op, leest die, en geeft een
 * score met de argumenten erachter plus een voorgestelde eerste stap.
 *
 * Wat de AI NIET doet: de fase van de lead veranderen, een volgende actie
 * zetten of de contactstatus aanraken. Dat blijft handwerk. Het bord is van
 * Daley, de AI schrijft alleen in zijn eigen ai_-kolommen.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { vraagClaude, ClaudeCliError } from './claude-cli'
import { BRANCHE_LABELS, KWALIFICATIE_PROFIEL, prioriteitVanScore } from './lead-criteria'

export interface Kwalificatie {
  branche: string
  website: string | null
  score: number
  samenvatting: string
  plus: string[]
  min: string[]
  volgende_stap: string
}

const ANTWOORD_SCHEMA = {
  type: 'object',
  properties: {
    branche: {
      type: 'string',
      maxLength: 32,
      description:
        'Kort branchelabel van hooguit een paar woorden, bij voorkeur letterlijk uit de aangeboden lijst. Geen toelichting tussen haakjes.',
    },
    website: {
      type: ['string', 'null'],
      description: 'De website die je hebt bekeken, of null als je er geen kon vinden.',
    },
    score: {
      type: 'integer',
      minimum: 0,
      maximum: 100,
      description: 'Hoe kansrijk deze lead is voor Daley.',
    },
    samenvatting: {
      type: 'string',
      description: 'Twee tot vier zinnen: wat het bedrijf doet en wat je van de site vond.',
    },
    plus: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete pluspunten, elk maximaal een korte zin.',
    },
    min: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete minpunten of twijfels, elk maximaal een korte zin.',
    },
    volgende_stap: {
      type: 'string',
      description: 'Een concrete eerste stap, inclusief de hoek waarop je binnenkomt.',
    },
  },
  required: ['branche', 'website', 'score', 'samenvatting', 'plus', 'min', 'volgende_stap'],
  additionalProperties: false,
} as const

// ── Leesbaar maken van de opgeslagen ClickUp-veldwaarden ──────────────

function veldWaarde(field: any): string | null {
  const value = field?.value
  if (value === null || value === undefined || value === '') return null
  const options: any[] = field?.type_config?.options || []
  if (field.type === 'drop_down' && typeof value === 'number') {
    return options.find((o) => o.orderindex === value)?.name ?? null
  }
  if (field.type === 'labels' && Array.isArray(value)) {
    const namen = value.map((id: string) => options.find((o) => o.id === id)?.label).filter(Boolean)
    return namen.length ? namen.join(', ') : null
  }
  if (field.type === 'tasks' || field.type === 'list_relationship') {
    return null // relaties halen we los op, met hun eigen velden erbij
  }
  if (typeof value === 'object') return null
  return String(value)
}

/** Gekoppelde task-id's per relatieveld, bijvoorbeeld het bedrijf achter de lead. */
function gekoppeldeTaskIds(customFields: any[], veldnamen: string[]): string[] {
  const gezocht = new Set(veldnamen.map((n) => n.toLowerCase()))
  const ids: string[] = []
  for (const f of customFields || []) {
    if (f?.type !== 'tasks' && f?.type !== 'list_relationship') continue
    if (!gezocht.has((f.name || '').toLowerCase())) continue
    for (const v of Array.isArray(f.value) ? f.value : []) {
      if (v?.id) ids.push(String(v.id))
    }
  }
  return ids
}

function veldenAlsRegels(customFields: any[], overslaan: string[] = []): string[] {
  const skip = new Set(overslaan.map((n) => n.toLowerCase()))
  const regels: string[] = []
  for (const f of customFields || []) {
    if (skip.has((f.name || '').toLowerCase())) continue
    const waarde = veldWaarde(f)
    if (waarde) regels.push(`  - ${f.name}: ${waarde}`)
  }
  return regels
}

// ── Context opbouwen ──────────────────────────────────────────────────

async function bouwContext(leadId: string): Promise<{ naam: string; tekst: string }> {
  const supabase = createServiceClient()

  const { data: lead, error } = await supabase
    .from('clickup_crm_records')
    .select('id, name, status, custom_fields, raw, due_date')
    .eq('id', leadId)
    .single()

  if (error || !lead) throw new Error('Lead niet gevonden')

  const regels: string[] = [
    `Leadnaam: ${lead.name}`,
    `Huidige fase: ${lead.status || 'onbekend'}`,
  ]

  const beschrijving = (lead.raw as any)?.description
  const notities = (lead.raw as any)?.notes
  if (beschrijving) regels.push(`Omschrijving: ${String(beschrijving).slice(0, 1500)}`)
  if (notities) regels.push(`Notities: ${String(notities).slice(0, 1500)}`)

  const leadVelden = veldenAlsRegels(lead.custom_fields as any[])
  if (leadVelden.length) regels.push('Velden op de lead:', ...leadVelden)

  // Gekoppeld bedrijf en contactpersoon: daar staat de website en het beroep.
  const taskIds = gekoppeldeTaskIds(lead.custom_fields as any[], [
    'bedrijf',
    'bedrijven',
    'contactpersoon',
    'contacten',
  ])

  if (taskIds.length) {
    const { data: gekoppeld } = await supabase
      .from('clickup_crm_records')
      .select('entity_type, name, custom_fields')
      .in('clickup_task_id', taskIds)

    for (const r of gekoppeld || []) {
      const soort = r.entity_type === 'company' ? 'Gekoppeld bedrijf' : 'Gekoppeld contact'
      regels.push(`${soort}: ${r.name}`)
      regels.push(...veldenAlsRegels(r.custom_fields as any[]))
    }
  }

  // Wat er al gebeurd is. Vooral relevant bij een herbeoordeling.
  const { data: activiteiten } = await supabase
    .from('crm_activiteiten')
    .select('soort, omschrijving, nieuwe_waarde, created_at')
    .eq('record_id', leadId)
    .in('soort', ['contact', 'notitie', 'status'])
    .order('created_at', { ascending: false })
    .limit(8)

  if (activiteiten?.length) {
    regels.push('Recente geschiedenis (nieuwste eerst):')
    for (const a of activiteiten) {
      const datum = String(a.created_at).slice(0, 10)
      regels.push(`  - ${datum} ${a.omschrijving}${a.nieuwe_waarde ? `: ${a.nieuwe_waarde}` : ''}`)
    }
  }

  return { naam: lead.name, tekst: regels.join('\n') }
}

// ── De kwalificatie zelf ──────────────────────────────────────────────

export async function kwalificeerLead(leadId: string): Promise<Kwalificatie> {
  const supabase = createServiceClient()
  const model = process.env.CLAUDE_CLI_MODEL || 'claude-sonnet-5'

  await supabase
    .from('clickup_crm_records')
    .update({ ai_status: 'bezig', ai_fout: null })
    .eq('id', leadId)

  try {
    const { naam, tekst } = await bouwContext(leadId)

    const prompt = [
      'Beoordeel de onderstaande lead.',
      '',
      'Werkwijze:',
      `1. Zoek de website van dit bedrijf op met WebSearch als je die nog niet hebt. Zoek gericht op de bedrijfsnaam plus de plaats of branche. Weet je na twee pogingen niet zeker welke site het is, geef dan null terug in plaats van te gokken.`,
      '2. Haal de site op met WebFetch en kijk echt wat er staat: wat doet dit bedrijf, hoe oud oogt de site, staat er een contactmogelijkheid op, is er sprake van webshop of online boekingen.',
      '3. Plak een branchelabel. Gebruik bij voorkeur een label uit deze lijst: ' +
        BRANCHE_LABELS.join(', ') +
        '. Past er niets, verzin dan zelf een kort label.',
      '4. Geef een score van 0 tot 100, met de argumenten eronder gesplitst in plus- en minpunten.',
      '5. Stel een concrete eerste stap voor: wat zou Daley als eerste doen, en met welke insteek.',
      '',
      'Belangrijk: baseer je oordeel op wat je daadwerkelijk hebt gezien. Lukte het niet om de site te vinden of te lezen, zeg dat dan in de samenvatting en verlaag je zekerheid, in plaats van iets aannemelijks te verzinnen.',
      '',
      '--- LEADGEGEVENS ---',
      tekst,
      '--- EINDE LEADGEGEVENS ---',
    ].join('\n')

    const uitslag = await vraagClaude<Kwalificatie>({
      prompt,
      schema: ANTWOORD_SCHEMA as unknown as Record<string, unknown>,
      systemPrompt: KWALIFICATIE_PROFIEL,
      tools: ['WebSearch', 'WebFetch'],
      model,
      timeoutMs: 6 * 60_000,
    })

    const score = Math.max(0, Math.min(100, Math.round(Number(uitslag.score) || 0)))

    const { error: schrijfFout } = await supabase
      .from('clickup_crm_records')
      .update({
        ai_status: 'klaar',
        ai_score: score,
        ai_prioriteit: prioriteitVanScore(score),
        ai_branche: uitslag.branche?.slice(0, 80) || null,
        ai_website: uitslag.website || null,
        ai_samenvatting: uitslag.samenvatting || null,
        ai_signalen: {
          plus: Array.isArray(uitslag.plus) ? uitslag.plus.slice(0, 8) : [],
          min: Array.isArray(uitslag.min) ? uitslag.min.slice(0, 8) : [],
        },
        ai_volgende_stap: uitslag.volgende_stap || null,
        ai_beoordeeld_op: new Date().toISOString(),
        ai_model: model,
        ai_fout: null,
      })
      .eq('id', leadId)

    if (schrijfFout) throw schrijfFout

    // Zichtbaar in de activiteitenfeed, zodat je later ziet wanneer de AI keek.
    await supabase.from('crm_activiteiten').insert({
      record_id: leadId,
      soort: 'veld',
      omschrijving: 'AI-kwalificatie',
      nieuwe_waarde: `${score}/100 (${prioriteitVanScore(score)}), ${uitslag.branche}`,
    }).then(
      () => undefined,
      () => undefined // logging mag de kwalificatie nooit laten falen
    )

    console.log(`[lead-ai] ${naam}: ${score}/100 (${uitslag.branche})`)
    return { ...uitslag, score }
  } catch (e: any) {
    const melding =
      e instanceof ClaudeCliError ? e.message : e?.message || 'Onbekende fout'
    await supabase
      .from('clickup_crm_records')
      .update({ ai_status: 'mislukt', ai_fout: melding.slice(0, 500) })
      .eq('id', leadId)
    console.error(`[lead-ai] mislukt voor ${leadId}: ${melding}`)
    throw e
  }
}
