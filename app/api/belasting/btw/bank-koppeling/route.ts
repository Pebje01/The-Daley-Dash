import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { haalToken, zoekInstelling, startKoppeling, haalKoppeling, haalRekening } from '@/lib/gocardless'

export const dynamic = 'force-dynamic'

/**
 * Beheer van de PSD2-bankkoppeling.
 *
 *   GET    status van de huidige koppeling
 *   POST   nieuwe koppeling starten, geeft een link terug om goed te keuren
 *   PUT    koppeling afronden nadat de link is goedgekeurd
 *
 * De volgorde is altijd POST, dan de link openen en bij Knab inloggen, dan PUT.
 */

const DAGEN = 24 * 60 * 60 * 1000

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bank_koppeling')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ koppeling: null, melding: 'Nog geen bankkoppeling ingesteld.' })

  const dagenResterend = data.geldig_tot
    ? Math.floor((new Date(data.geldig_tot).getTime() - Date.now()) / DAGEN)
    : null

  return NextResponse.json({
    koppeling: {
      bank: data.bank,
      status: data.status,
      ibans: data.ibans,
      geldig_tot: data.geldig_tot,
      dagen_resterend: dagenResterend,
      laatste_sync: data.laatste_sync,
      laatste_fout: data.laatste_fout,
    },
    // Onder de 14 dagen is het tijd om te vernieuwen. Wacht je tot het verlopen
    // is, dan staat de sync stil zonder dat er iets misgaat wat je opvalt.
    vernieuwen_nodig: dagenResterend !== null && dagenResterend <= 14,
  })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const bankNaam = typeof body.bank === 'string' ? body.bank : 'knab'
  const basisUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'

  try {
    const token = await haalToken()
    const instelling = await zoekInstelling(token, bankNaam)
    if (!instelling) {
      return NextResponse.json(
        { error: `Bank "${bankNaam}" niet gevonden bij GoCardless voor Nederland.` },
        { status: 404 },
      )
    }

    // Knab levert 730 dagen historie. Vraag nooit meer dan de bank aangeeft,
    // want dan weigert GoCardless de hele overeenkomst.
    const maxDagen = Math.min(parseInt(instelling.transaction_total_days || '730', 10) || 730, 730)

    const { requisition, agreementId, geldigDagen } = await startKoppeling(
      token,
      instelling.id,
      `${basisUrl}/belasting/btw`,
      maxDagen,
    )

    const supabase = createClient()
    const { error } = await supabase.from('bank_koppeling').insert({
      bank: instelling.name,
      institution_id: instelling.id,
      requisition_id: requisition.id,
      agreement_id: agreementId,
      status: 'wacht_op_goedkeuring',
      geldig_tot: new Date(Date.now() + geldigDagen * DAGEN).toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      bank: instelling.name,
      requisition_id: requisition.id,
      link: requisition.link,
      historie_dagen: maxDagen,
      geldig_dagen: geldigDagen,
      volgende_stap: 'Open de link, log in bij de bank en keur de toegang goed. Roep daarna PUT aan om af te ronden.',
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PUT() {
  const supabase = createClient()
  const { data: koppeling, error: leesFout } = await supabase
    .from('bank_koppeling')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (leesFout) return NextResponse.json({ error: leesFout.message }, { status: 500 })
  if (!koppeling) return NextResponse.json({ error: 'Geen koppeling om af te ronden.' }, { status: 404 })

  try {
    const token = await haalToken()
    const status = await haalKoppeling(token, koppeling.requisition_id)

    if (!status.accounts || status.accounts.length === 0) {
      return NextResponse.json(
        {
          error: 'De koppeling is nog niet goedgekeurd bij de bank.',
          status: status.status,
          hint: 'Open de link uit de vorige stap opnieuw en rond het inloggen af.',
        },
        { status: 409 },
      )
    }

    // IBAN's erbij halen zodat de transacties straks een herkenbaar rekeningnummer krijgen.
    const ibans: string[] = []
    for (const accountId of status.accounts) {
      const rekening = await haalRekening(token, accountId).catch(() => null)
      if (rekening?.iban) ibans.push(rekening.iban)
    }

    const { error } = await supabase
      .from('bank_koppeling')
      .update({
        account_ids: status.accounts,
        ibans,
        status: 'actief',
        laatste_fout: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', koppeling.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      bank: koppeling.bank,
      rekeningen: status.accounts.length,
      ibans,
      geldig_tot: koppeling.geldig_tot,
      volgende_stap: 'De dagelijkse sync haalt vanaf nu automatisch nieuwe transacties op.',
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
