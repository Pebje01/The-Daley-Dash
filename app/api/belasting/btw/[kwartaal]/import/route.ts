import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  parseKwartaal, parseKnabCsv, categoriseer,
  herkenFactuurNummer, matchFactuur, EIGEN_BEDRIJVEN,
  type FactuurLite,
} from '@/lib/btw'

export const dynamic = 'force-dynamic'

/**
 * Importeer een Knab-transactieoverzicht (CSV) voor dit kwartaal.
 * Bestaande transacties (op referentie) blijven behouden, zodat handmatige
 * categorie-aanpassingen niet verloren gaan bij een her-import.
 */
export async function POST(
  req: Request,
  { params }: { params: { kwartaal: string } },
) {
  const info = parseKwartaal(params.kwartaal)
  if (!info) return NextResponse.json({ error: 'Ongeldig kwartaal' }, { status: 400 })

  const supabase = createClient()

  // CSV uit body halen (JSON { csv } of platte tekst)
  let csvText = ''
  const ct = req.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => ({}))
    csvText = body.csv || ''
  } else {
    csvText = await req.text()
  }
  if (!csvText.trim()) {
    return NextResponse.json({ error: 'Geen CSV-inhoud ontvangen' }, { status: 400 })
  }

  const regels = parseKnabCsv(csvText)
  if (regels.length === 0) {
    return NextResponse.json({ error: 'Geen transacties gevonden. Is dit een Knab-export?' }, { status: 400 })
  }

  // Alleen transacties binnen dit kwartaal
  const inKwartaal = regels.filter(r => r.datum >= info.start && r.datum <= info.eind)
  const buitenKwartaal = regels.length - inKwartaal.length

  // Alle eigen facturen ophalen voor de omzet-match (ook buiten dit kwartaal:
  // een betaling in Q2 kan bij een oudere factuur horen).
  const { data: facturenRaw } = await supabase
    .from('facturen')
    .select('id, number, client_name, date, subtotal, total, company_id, status, paid_at')
    .in('company_id', EIGEN_BEDRIJVEN)
  const facturen = (facturenRaw ?? []) as FactuurLite[]

  // Bestaande referenties voor dit kwartaal (dedup + edits behouden)
  const { data: bestaand } = await supabase
    .from('btw_bank_transactie')
    .select('referentie')
    .eq('kwartaal', info.kwartaal)
  const bestaandeRefs = new Set((bestaand ?? []).map(b => b.referentie).filter(Boolean))

  let gematcht = 0
  const nieuweRows = inKwartaal
    .filter(r => !r.referentie || !bestaandeRefs.has(r.referentie))
    .map(r => {
      const categorie = categoriseer(r)
      const factuurNummer = herkenFactuurNummer(r.omschrijving)
      let factuurId: string | null = null
      if (categorie === 'omzet') {
        const m = matchFactuur(r.omschrijving, facturen)
        if (m) { factuurId = m.id; gematcht++ }
      }
      return {
        kwartaal: info.kwartaal,
        referentie: r.referentie || null,
        datum: r.datum,
        bedrag: r.bedrag,
        credit_debet: r.creditDebet,
        tegenrekening: r.tegenrekening || null,
        tegenrekeninghouder: r.tegenrekeninghouder || null,
        omschrijving: r.omschrijving || null,
        betaalwijze: r.betaalwijze || null,
        categorie,
        factuur_id: factuurId,
        factuur_nummer: factuurNummer,
      }
    })

  const overgeslagen = inKwartaal.length - nieuweRows.length

  if (nieuweRows.length > 0) {
    const { error } = await supabase.from('btw_bank_transactie').insert(nieuweRows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    geimporteerd: nieuweRows.length,
    gematcht,
    overgeslagen_reeds_aanwezig: overgeslagen,
    buiten_kwartaal_genegeerd: buitenKwartaal,
    totaal_in_csv: regels.length,
  })
}

/** Verwijder alle banktransacties van dit kwartaal (opnieuw beginnen). */
export async function DELETE(
  _req: Request,
  { params }: { params: { kwartaal: string } },
) {
  const info = parseKwartaal(params.kwartaal)
  if (!info) return NextResponse.json({ error: 'Ongeldig kwartaal' }, { status: 400 })

  const supabase = createClient()
  const { error } = await supabase
    .from('btw_bank_transactie')
    .delete()
    .eq('kwartaal', info.kwartaal)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
