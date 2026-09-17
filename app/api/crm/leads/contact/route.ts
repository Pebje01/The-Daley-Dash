import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { planContactZoektocht, contactWachtrijStand } from '@/lib/ai/contact-wachtrij'

export const dynamic = 'force-dynamic'

/**
 * POST /api/crm/leads/contact
 *
 * Zoekt ontbrekende contactgegevens op bij prospects en leads: website, de
 * persoon die erbij hoort, mailadres en telefoonnummer. Vult uitsluitend lege
 * velden, dus wat je zelf hebt ingevuld blijft altijd staan.
 *
 * Body:
 *   { id }                  een bepaald record, ook als het al gegevens heeft
 *   { ids: [...] }          een selectie
 *   { alleOnvolledige: true, limiet, entity } alles zonder mailadres of nummer
 *
 * `entity` is 'ruwe_lead' (standaard) of 'lead'. Leads hebben hetzelfde nodig
 * zodra je ze wil benaderen of hun mail wil herkennen, en de kolommen zijn
 * dezelfde: die staan op de hele tabel.
 *
 * Zet werk in de wachtrij en keert direct terug. De uitslag lees je van de
 * ruwe_-kolommen op het record zelf.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const supabase = createClient()

    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((v: unknown): v is string => typeof v === 'string')
      : body?.id
        ? [String(body.id)]
        : []

    if (ids.length) {
      const { data, error } = await supabase
        .from('clickup_crm_records')
        .select('id, entity_type')
        .in('id', ids)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const ruwe = (data || []).filter((r) => r.entity_type === 'ruwe_lead' || r.entity_type === 'lead')
      if (!ruwe.length) {
        return NextResponse.json(
          { error: 'Alleen prospects en leads kunnen worden opgezocht' },
          { status: 400 }
        )
      }

      for (const r of ruwe) planContactZoektocht(r.id)
      return NextResponse.json({ ingepland: ruwe.length, wachtrij: contactWachtrijStand() })
    }

    if (body?.alleOnvolledige) {
      const limiet = Math.min(Math.max(Number(body.limiet) || 10, 1), 50)
      const entity = body?.entity === 'lead' ? 'lead' : 'ruwe_lead'

      let vraag = supabase
        .from('clickup_crm_records')
        .select('id')
        .eq('entity_type', entity)
      // Een afgesloten lead hoeft geen mailadres meer: dat kost limiet en levert niets op
      if (entity === 'lead') {
        vraag = vraag.in('status', ['nieuwe kans', 'benaderd', 'in gesprek', 'offerte uit', 'later opvolgen', 'on hold'])
      }

      const { data, error } = await vraag
        // Zonder mailadres of zonder nummer valt er nog wat te halen. Alles
        // wat compleet is slaan we over, dat kost limiet en levert niets op.
        .or('ruwe_contact_email.is.null,ruwe_telefoon.is.null')
        // Al eens langs geweest en niets gevonden? Dan niet elke ronde opnieuw.
        .or('ruwe_contact_status.is.null,ruwe_contact_status.eq.mislukt')
        // Let op: een kale .neq gooit ook alle NULL-rijen eruit, en dat is het
        // gros. Vandaar expliciet "null of niet geblokkeerd".
        .or('contact_status.is.null,contact_status.neq.blokkade')
        .order('clickup_date_updated', { ascending: false, nullsFirst: false })
        .limit(limiet)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      for (const r of data || []) planContactZoektocht(r.id)
      return NextResponse.json({
        ingepland: data?.length || 0,
        wachtrij: contactWachtrijStand(),
      })
    }

    return NextResponse.json(
      { error: 'Geef id, ids of alleOnvolledige mee' },
      { status: 400 }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Inplannen mislukt' }, { status: 500 })
  }
}

/** GET geeft de stand van de wachtrij, handig om op te pollen in de UI. */
export async function GET() {
  return NextResponse.json({ wachtrij: contactWachtrijStand() })
}
