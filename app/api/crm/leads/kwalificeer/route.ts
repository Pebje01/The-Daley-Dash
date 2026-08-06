import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { planKwalificatie, wachtrijStand } from '@/lib/ai/kwalificatie-wachtrij'
import { LEAD_FASES } from '@/lib/crm/pipeline'

export const dynamic = 'force-dynamic'

/**
 * Alleen leads die nog ergens heen kunnen. Een gewonnen, verloren of
 * gearchiveerde lead beoordelen kost limiet en levert niets op: die beslissing
 * is al genomen. Handmatig beoordelen kan wel altijd, via { id }.
 */
const LEVENDE_FASES = [
  ...LEAD_FASES.filter((f) => f.groep === 'Not started' || f.groep === 'Active').map(
    (f) => f.status
  ),
  // createCrmRecord zet 'open' als er geen fase is meegegeven.
  'open',
]

/**
 * POST /api/crm/leads/kwalificeer
 *
 * Body: { id } voor een enkele lead, of { alleOnbeoordeelde: true } om alles
 * op te pakken wat nog nooit is beoordeeld of eerder is mislukt.
 *
 * Zet werk in de wachtrij en keert direct terug. De uitslag lees je van de
 * ai_-kolommen op het record zelf.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const supabase = createClient()

    if (body?.id) {
      const { data, error } = await supabase
        .from('clickup_crm_records')
        .select('id, entity_type')
        .eq('id', body.id)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Lead niet gevonden' }, { status: 404 })
      }
      if (!['lead', 'ruwe_lead'].includes(data.entity_type)) {
        return NextResponse.json({ error: 'Alleen leads kunnen gekwalificeerd worden' }, { status: 400 })
      }

      planKwalificatie(data.id)
      return NextResponse.json({ ingepland: 1, wachtrij: wachtrijStand() })
    }

    if (body?.alleOnbeoordeelde) {
      const limiet = Math.min(Math.max(Number(body.limiet) || 25, 1), 100)
      const { data, error } = await supabase
        .from('clickup_crm_records')
        .select('id')
        .eq('entity_type', 'lead')
        .in('status', LEVENDE_FASES)
        .or('ai_status.is.null,ai_status.eq.mislukt')
        // Let op: een kale .neq gooit ook de NULL-rijen eruit, en dat is het
        // gros. Vandaar expliciet "null of niet geblokkeerd".
        .or('contact_status.is.null,contact_status.neq.blokkade')
        .order('clickup_date_updated', { ascending: false, nullsFirst: false })
        .limit(limiet)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      for (const r of data || []) planKwalificatie(r.id)
      return NextResponse.json({ ingepland: data?.length || 0, wachtrij: wachtrijStand() })
    }

    return NextResponse.json({ error: 'Geef id of alleOnbeoordeelde mee' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Inplannen mislukt' }, { status: 500 })
  }
}

/** GET geeft de stand van de wachtrij, handig om op te pollen in de UI. */
export async function GET() {
  return NextResponse.json({ wachtrij: wachtrijStand() })
}
