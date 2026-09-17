import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { haalToken, haalTransacties, naarBankRegel } from '@/lib/gocardless'
import { categoriseer, herkenFactuurNummer, matchFactuur, EIGEN_BEDRIJVEN, type FactuurLite } from '@/lib/btw'

export const dynamic = 'force-dynamic'

/**
 * Dagelijkse bank-sync: haalt nieuwe Knab-transacties op via GoCardless en zet
 * ze in btw_bank_transactie, met dezelfde categorisatie als de handmatige
 * CSV-import. Daarmee staat de btw-aangifte permanent bij.
 *
 * Draait via LaunchAgent com.daley.bank-sync, zie scripts/run-bank-sync.sh.
 *
 * Waarom het overlappend ophaalt in plaats van alleen sinds gisteren:
 * banken boeken transacties soms een paar dagen met terugwerkende kracht. Met
 * een venster van tien dagen mis je die niet. Dubbele regels zijn geen risico,
 * want er wordt op twee manieren ontdubbeld.
 */

const DAG = 24 * 60 * 60 * 1000
const OVERLAP_DAGEN = 10
const EERSTE_SYNC_DAGEN = 730 // Knab levert twee jaar historie

function isAuthorizedCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('CRON_SECRET ontbreekt, bank-sync geweigerd')
    return false
  }
  return request.headers.get('authorization') === `Bearer ${secret}`
}

/** '2026-09-09' -> '2026-Q3'. Bewust op de tekst, niet via Date, om tijdzonegedoe te vermijden. */
function kwartaalVanIso(iso: string): string {
  const jaar = iso.slice(0, 4)
  const maand = parseInt(iso.slice(5, 7), 10)
  return `${jaar}-Q${Math.ceil(maand / 3)}`
}

function isoDatum(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Stuurt een pushbericht. Faalt stil: een mislukte melding mag de sync niet stoppen. */
async function meld(titel: string, bericht: string, prioriteit: 'default' | 'high' = 'default') {
  const topic = process.env.NTFY_BANK_TOPIC
  if (!topic) return
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: { Title: titel, Priority: prioriteit, Tags: 'bank' },
      body: bericht,
    })
  } catch {
    // bewust genegeerd
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()

  const { data: koppeling } = await supabase
    .from('bank_koppeling')
    .select('*')
    .eq('status', 'actief')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!koppeling) {
    return NextResponse.json({ error: 'Geen actieve bankkoppeling. Koppel eerst via /api/belasting/btw/bank-koppeling.' }, { status: 409 })
  }

  // Verlopen of bijna verlopen toestemming: melden voordat de sync stilvalt.
  const dagenResterend = koppeling.geldig_tot
    ? Math.floor((new Date(koppeling.geldig_tot).getTime() - Date.now()) / DAG)
    : null

  if (dagenResterend !== null && dagenResterend < 0) {
    await supabase.from('bank_koppeling').update({ status: 'verlopen' }).eq('id', koppeling.id)
    await meld(
      'Bankkoppeling verlopen',
      'De PSD2-toestemming voor Knab is verlopen. Ga naar de Dash, belasting, btw en koppel opnieuw. Zonder dat komen er geen transacties meer binnen.',
      'high',
    )
    return NextResponse.json({ error: 'Toestemming verlopen, opnieuw koppelen nodig.' }, { status: 409 })
  }

  if (dagenResterend !== null && dagenResterend <= 14) {
    await meld(
      'Bankkoppeling verloopt bijna',
      `De toegang tot Knab verloopt over ${dagenResterend} dagen. Even opnieuw goedkeuren in de Dash, dan blijft de btw-administratie bijlopen.`,
      'high',
    )
  }

  // Vanaf welke datum ophalen
  const vanaf = koppeling.laatste_sync
    ? isoDatum(new Date(koppeling.laatste_sync).getTime() - OVERLAP_DAGEN * DAG)
    : isoDatum(Date.now() - EERSTE_SYNC_DAGEN * DAG)

  try {
    const token = await haalToken()

    // Facturen voor de omzet-match, net als bij de CSV-import.
    const { data: facturenRaw } = await supabase
      .from('facturen')
      .select('id, number, client_name, date, subtotal, total, company_id, status, paid_at')
      .in('company_id', EIGEN_BEDRIJVEN)
    const facturen = (facturenRaw ?? []) as FactuurLite[]

    // Wat staat er al, over de periode die we ophalen
    const { data: bestaand } = await supabase
      .from('btw_bank_transactie')
      .select('referentie, datum, bedrag, credit_debet')
      .gte('datum', vanaf)

    const bestaandeRefs = new Set((bestaand ?? []).map(b => b.referentie).filter(Boolean))
    // Tweede net: dezelfde betaling kan al via de CSV binnen zijn met een andere
    // referentie. Datum, bedrag en richting samen is in de praktijk uniek genoeg.
    const bestaandeVingerafdrukken = new Set(
      (bestaand ?? []).map(b => `${b.datum}|${Number(b.bedrag).toFixed(2)}|${b.credit_debet}`),
    )

    let opgehaald = 0
    let gematcht = 0
    let overgeslagen = 0
    const nieuweRows: Record<string, unknown>[] = []

    for (const accountId of koppeling.account_ids as string[]) {
      const { booked } = await haalTransacties(token, accountId, vanaf)
      opgehaald += booked.length

      const eigenIban = (koppeling.ibans as string[])?.[0] ?? ''

      for (const t of booked) {
        const regel = naarBankRegel(t, eigenIban)

        // Zonder referentie kunnen we niet betrouwbaar ontdubbelen, en een
        // dubbele boeking in de btw-aangifte is erger dan een ontbrekende.
        if (!regel.referentie || !regel.datum) { overgeslagen++; continue }
        if (bestaandeRefs.has(regel.referentie)) { overgeslagen++; continue }

        const vingerafdruk = `${regel.datum}|${regel.bedrag.toFixed(2)}|${regel.creditDebet}`
        if (bestaandeVingerafdrukken.has(vingerafdruk)) { overgeslagen++; continue }

        const categorie = categoriseer(regel)
        let factuurId: string | null = null
        if (categorie === 'omzet') {
          const m = matchFactuur(regel.omschrijving, facturen)
          if (m) { factuurId = m.id; gematcht++ }
        }

        nieuweRows.push({
          kwartaal: kwartaalVanIso(regel.datum),
          referentie: regel.referentie,
          datum: regel.datum,
          bedrag: regel.bedrag,
          credit_debet: regel.creditDebet,
          tegenrekening: regel.tegenrekening || null,
          tegenrekeninghouder: regel.tegenrekeninghouder || null,
          omschrijving: regel.omschrijving || null,
          betaalwijze: regel.betaalwijze || null,
          categorie,
          factuur_id: factuurId,
          factuur_nummer: herkenFactuurNummer(regel.omschrijving),
          bron: 'gocardless',
        })

        bestaandeRefs.add(regel.referentie)
        bestaandeVingerafdrukken.add(vingerafdruk)
      }
    }

    if (nieuweRows.length > 0) {
      const { error } = await supabase.from('btw_bank_transactie').insert(nieuweRows)
      if (error) throw new Error(`Opslaan mislukt: ${error.message}`)
    }

    await supabase
      .from('bank_koppeling')
      .update({ laatste_sync: new Date().toISOString(), laatste_fout: null, updated_at: new Date().toISOString() })
      .eq('id', koppeling.id)

    // Alleen melden als er iets te melden valt. Een stille sync is een goede sync.
    const onbekend = nieuweRows.filter(r => r.categorie === 'onbekend').length
    if (nieuweRows.length > 0 && onbekend > 0) {
      await meld(
        'Banktransacties bijgewerkt',
        `${nieuweRows.length} nieuwe transacties, waarvan ${onbekend} zonder categorie. Even nakijken in de Dash onder belasting, btw.`,
      )
    }

    return NextResponse.json({
      ok: true,
      vanaf,
      opgehaald,
      toegevoegd: nieuweRows.length,
      gematcht_op_factuur: gematcht,
      overgeslagen_dubbel: overgeslagen,
      zonder_categorie: onbekend,
      dagen_resterend: dagenResterend,
    })
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e)
    await supabase.from('bank_koppeling').update({ laatste_fout: melding }).eq('id', koppeling.id)
    await meld('Bank-sync mislukt', melding.slice(0, 400), 'high')
    return NextResponse.json({ error: melding }, { status: 500 })
  }
}
