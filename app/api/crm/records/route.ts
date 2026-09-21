import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCrmRecord } from '@/lib/crm/store'
import { CRM_ENTITY_TYPES, type CrmEntityType } from '@/lib/crm/types'
import { planKwalificatie } from '@/lib/ai/kwalificatie-wachtrij'
import { planContactZoektocht } from '@/lib/ai/contact-wachtrij'
import { zoekBotsing, botsingMelding } from '@/lib/crm/dubbelcheck'

const ALLOWED_ENTITY_TYPES = new Set<string>(CRM_ENTITY_TYPES)

const RECORD_COLUMNS =
  'id, entity_type, clickup_task_id, clickup_list_id, name, status, url, archived, active, assignees, tags, custom_fields, dash_tags, due_date, clickup_date_updated, synced_at, volgende_actie, volgende_actie_notitie, laatste_contact, contact_pogingen, contact_status, contact_status_tot, contact_status_reden, ai_status, ai_score, ai_prioriteit, ai_branche, ai_website, ai_samenvatting, ai_signalen, ai_volgende_stap, ai_beoordeeld_op, ai_model, ai_fout, afsluit_reden, ruwe_contact_email, ruwe_website, ruwe_bron, ruwe_fit_reden, ruwe_prioriteit, ruwe_contactpersoon, ruwe_telefoon, ruwe_contact_status, ruwe_contact_gezocht_op, ruwe_contact_toelichting, ruwe_contact_fout, beschrijving:raw->>description, company_id'

/** True als de fout komt doordat company_id nog niet in de tabel staat. */
function ontbrekendeBedrijfsKolom(error: any) {
  return error?.code === '42703' || /company_id|afsluit_reden/.test(error?.message || '')
}

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = createClient()

  const { searchParams } = new URL(request.url)
  const entity = (searchParams.get('entity') || '').toLowerCase()
  const search = (searchParams.get('search') || '').trim()
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 100), 1), 500)
  // Alleen prospects en leads zijn bedrijfsgericht. Bedrijven, contacten en
  // opdrachten blijven gedeeld: dezelfde klant kan werk voor meerdere van je
  // bedrijven zijn, en dat wil je niet in drieën knippen.
  const bedrijfsgericht = entity === 'lead' || entity === 'ruwe_lead'
  const companyParam = (searchParams.get('company') || '').trim()
  const company = bedrijfsgericht && companyParam && companyParam !== 'alle' ? companyParam : null

  if (!ALLOWED_ENTITY_TYPES.has(entity)) {
    return NextResponse.json({ error: 'Invalid entity.' }, { status: 400 })
  }

  // metBedrijf=false is de terugval voor het geval de kolom company_id nog niet
  // bestaat: migraties draaien handmatig, en de CRM-pagina's mogen daar niet op
  // stukgaan. Zodra 20260909_crm_bedrijf.sql is uitgevoerd valt dit vanzelf weg.
  const haalOp = async (metBedrijf: boolean) => {
    let query = supabase
      .from('clickup_crm_records')
      // De terugval haalt beide jonge kolommen weg, zodat de lijst blijft werken
      // zolang een migratie nog niet gedraaid is.
      .select(metBedrijf ? RECORD_COLUMNS : RECORD_COLUMNS.replace(', company_id', '').replace(', afsluit_reden', ''))
      .eq('entity_type', entity)
      .order('clickup_date_updated', { ascending: false, nullsFirst: false })
      .order('synced_at', { ascending: false })
      .limit(limit)

    if (search) {
      query = query.or(`name.ilike.%${search}%,status.ilike.%${search}%`)
    }
    if (metBedrijf && company) {
      query = query.eq('company_id', company)
    }
    return query
  }

  let { data, error } = await haalOp(true)
  if (error && ontbrekendeBedrijfsKolom(error)) {
    ;({ data, error } = await haalOp(false))
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data || [] })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      entity_type, name, status, description, due_date, custom_fields,
      ruwe_contact_email, ruwe_website, ruwe_bron, ruwe_fit_reden, ruwe_prioriteit,
      ruwe_contactpersoon, ruwe_telefoon, company_id,
    } = body

    if (!entity_type || !ALLOWED_ENTITY_TYPES.has(entity_type)) {
      return NextResponse.json({ error: 'Invalid entity_type' }, { status: 400 })
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Dubbelcheck alleen op leads: die komen uit onderzoek en imports, en dat
    // is precies waar dezelfde bedrijven telkens opnieuw binnendruppelen.
    // Bedrijven, contacten en opdrachten voeg je bewust toe, daar hoort geen
    // drempel voor te staan.
    if (entity_type === 'ruwe_lead' || entity_type === 'lead') {
      const botsing = await zoekBotsing({
        name: name.trim(),
        website: ruwe_website,
        email: ruwe_contact_email,
      })
      // Een dubbele mag je bewust overrulen met negeerDubbel, een blokkade
      // nooit. Die controle staat hier en niet alleen in het scherm: anders
      // wandelt een geblokkeerd bedrijf via een directe API-call of een
      // import alsnog binnen, en dat is precies wat de blocklist moet stoppen.
      const tegenhouden = botsing && (botsing.soort === 'blokkade' || body?.negeerDubbel !== true)
      if (botsing && tegenhouden) {
        return NextResponse.json(
          { error: botsingMelding(botsing), botsing },
          { status: 409 } // een conflict, geen serverfout
        )
      }
    }

    const record = await createCrmRecord(entity_type as CrmEntityType, {
      name: name.trim(),
      status,
      description,
      due_date,
      custom_fields,
      ruwe_contact_email,
      ruwe_website,
      ruwe_bron,
      ruwe_fit_reden,
      ruwe_prioriteit,
      ruwe_contactpersoon,
      ruwe_telefoon,
      // Alleen prospects en leads horen bij één bedrijf; de rest blijft gedeeld.
      company_id: entity_type === 'lead' || entity_type === 'ruwe_lead' ? company_id : null,
    })

    // Nieuwe leads (en ruwe leads, de triagelaag ervoor) gaan meteen de
    // AI-wachtrij in. Bewust niet awaiten: de kwalificatie duurt een minuut,
    // de gebruiker krijgt zijn record nu terug en de score druppelt er zo
    // achteraan in.
    if (entity_type === 'lead' || entity_type === 'ruwe_lead') {
      planKwalificatie(record.id)
    }

    // Een ruwe lead komt vaak binnen als niet meer dan een bedrijfsnaam. Zonder
    // nummer, mailadres of site valt er niets te beoordelen, dus die gaan er
    // meteen achteraan. Eigen wachtrij, zodat het de kwalificatie niet ophoudt.
    if (entity_type === 'ruwe_lead') {
      planContactZoektocht(record.id)
    }

    return NextResponse.json({ item: record }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Aanmaken mislukt' }, { status: 500 })
  }
}
