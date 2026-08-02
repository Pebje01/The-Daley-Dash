import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseKwartaal, berekenBtwAangifte, EIGEN_BEDRIJVEN } from '@/lib/btw'

export const dynamic = 'force-dynamic'

const UITGESLOTEN_STATUS = ['concept', 'geannuleerd']

export async function GET(
  _req: Request,
  { params }: { params: { kwartaal: string } },
) {
  const info = parseKwartaal(params.kwartaal)
  if (!info) return NextResponse.json({ error: 'Ongeldig kwartaal (verwacht bijv. 2026-Q2)' }, { status: 400 })

  const supabase = createClient()

  // 1) Aangifte-record ophalen of aanmaken
  let { data: aangifte, error: aanErr } = await supabase
    .from('btw_aangifte')
    .select('*')
    .eq('kwartaal', info.kwartaal)
    .maybeSingle()
  if (aanErr) return NextResponse.json({ error: aanErr.message }, { status: 500 })
  if (!aangifte) {
    const { data: nieuw, error } = await supabase
      .from('btw_aangifte')
      .insert({ kwartaal: info.kwartaal, jaar: info.jaar, kwartaalnummer: info.nummer })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    aangifte = nieuw
  }

  const kolommen = 'id, number, company_id, client_name, date, due_date, status, subtotal, btw_amount, total, paid_at, exclude_from_revenue'

  // 2a) Facturen met factuurdatum in het kwartaal (grondslag factuurstelsel + controle)
  const { data: facturenRaw, error: facErr } = await supabase
    .from('facturen')
    .select(kolommen)
    .gte('date', info.start)
    .lte('date', info.eind)
    .in('company_id', EIGEN_BEDRIJVEN)
    .order('date', { ascending: true })
  if (facErr) return NextResponse.json({ error: facErr.message }, { status: 500 })
  const facturenPeriode = (facturenRaw ?? []).filter(
    f => !UITGESLOTEN_STATUS.includes(f.status) && !f.exclude_from_revenue,
  )

  // 2b) Facturen die IN dit kwartaal betaald zijn (grondslag kasstelsel). De BTW
  //     valt dan in het kwartaal van de betaaldatum (paid_at), niet de factuurdatum.
  //     Dit werkt zonder bankimport: zodra een factuur op 'betaald' staat met een
  //     betaaldatum, telt hij mee in het juiste kwartaal.
  const { data: betaaldRaw, error: betErr } = await supabase
    .from('facturen')
    .select(kolommen)
    .gte('paid_at', info.start)
    .lte('paid_at', `${info.eind}T23:59:59.999+00`)
    .in('company_id', EIGEN_BEDRIJVEN)
    .order('paid_at', { ascending: true })
  if (betErr) return NextResponse.json({ error: betErr.message }, { status: 500 })
  const facturenBetaald = (betaaldRaw ?? []).filter(
    f => !UITGESLOTEN_STATUS.includes(f.status) && !f.exclude_from_revenue,
  )

  // 3) Banktransacties en kostenposten voor dit kwartaal
  const { data: transacties } = await supabase
    .from('btw_bank_transactie')
    .select('*')
    .eq('kwartaal', info.kwartaal)
    .order('datum', { ascending: true })

  const { data: kosten } = await supabase
    .from('btw_kostenpost')
    .select('*')
    .eq('kwartaal', info.kwartaal)
    .order('datum', { ascending: true })

  const alleTx = transacties ?? []
  const alleKosten = kosten ?? []

  // 4) Grondslag bepaalt welke facturen de omzet vormen:
  //    - kasstelsel: facturen die in dit kwartaal betaald zijn (op betaaldatum)
  //    - factuurstelsel: facturen met factuurdatum in dit kwartaal
  // Daley staat op het factuurstelsel: ze heeft nooit kasstelsel aangevraagd en
  // factureert zakelijk. Nieuwe kwartalen krijgen daarom die grondslag. Kwartalen
  // met een eigen waarde houden die, ook als daar nog kasstelsel staat: wat je
  // hebt ingediend moet je in de app kunnen terugzien zoals je het indiende.
  const grondslag = aangifte.grondslag || 'factuurstelsel'
  const omzetFacturen = grondslag === 'kasstelsel' ? facturenBetaald : facturenPeriode

  // 5) Reconciliatie factuur <-> bank (controle, alleen zinvol als er bank-import is)
  const txByFactuur = new Map<string, any>()
  for (const t of alleTx) if (t.factuur_id) txByFactuur.set(t.factuur_id, t)

  const facturenMet = omzetFacturen.map(f => ({
    ...f,
    bank_tx: txByFactuur.get(f.id) ?? null,
    // In kasstelsel is de factuur per definitie betaald in dit kwartaal.
    betaald_in_kwartaal: grondslag === 'kasstelsel' ? true : Boolean(txByFactuur.get(f.id)),
  }))

  const omzetTx = alleTx.filter(t => t.categorie === 'omzet')
  const ontvangstenZonderFactuur = omzetTx.filter(t => !t.factuur_id)
  // Alleen tonen als er echt bankdata is; anders is "niet ontvangen" ruis.
  const facturenZonderOntvangst = alleTx.length ? facturenMet.filter(f => !f.bank_tx) : []

  const omzetOntvangenBank = omzetTx.reduce((s, t) => s + Number(t.bedrag || 0), 0)

  // 6) Berekening op basis van de gekozen omzetfacturen (echte btw_amount per factuur).
  const berekening = berekenBtwAangifte(
    omzetFacturen,
    alleKosten,
    Number(aangifte.correctie_omzet_excl || 0),
    Number(aangifte.correctie_btw || 0),
  )

  return NextResponse.json({
    kwartaal: info,
    aangifte,
    facturen: facturenMet,
    transacties: alleTx,
    kosten: alleKosten,
    reconciliatie: {
      omzetOntvangsten: omzetTx,
      ontvangstenZonderFactuur,
      facturenZonderOntvangst,
      omzetOntvangenBank,
    },
    berekening,
    meta: {
      bankImportAanwezig: alleTx.length > 0,
      aantalTransacties: alleTx.length,
    },
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: { kwartaal: string } },
) {
  const info = parseKwartaal(params.kwartaal)
  if (!info) return NextResponse.json({ error: 'Ongeldig kwartaal' }, { status: 400 })

  const supabase = createClient()
  const body = await req.json()

  // Alleen toegestane velden bijwerken
  const toegestaan = [
    'status', 'notities', 'ingediend_op', 'grondslag',
    'correctie_omzet_excl', 'correctie_btw', 'correctie_toelichting',
  ]
  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const k of toegestaan) if (k in body) update[k] = body[k]

  const { data, error } = await supabase
    .from('btw_aangifte')
    .update(update)
    .eq('kwartaal', info.kwartaal)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
