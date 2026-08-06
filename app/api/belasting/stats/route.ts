import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  berekenInkomstenbelasting,
  aggregeerPerKwartaal,
  aggregeerPerMaand,
  huidigKwartaal,
  type IBBreakdown,
  type KwartaalData,
  type MaandData,
} from '@/lib/belasting'

// Bedrijfsgroepen: eigen ZZP-bedrijven vs externe bedrijven
export const dynamic = 'force-dynamic'

const EIGEN_BEDRIJVEN = ['tde', 'wgb', 'daleyphotography']

interface GroepStats {
  label: string
  bedrijven: string[]
  totaalOmzetExcl: number
  totaalBtw: number
  btwDitKwartaal: number
  geprojecteerdeJaaromzet: number
  kwartalen: KwartaalData[]
  maanden: MaandData[]
  ibWerkelijk: IBBreakdown
  ibProjectie: IBBreakdown
  maandelijkseIBReservering: number
}

// Factuurstatussen die meetellen (niet concept of geannuleerd)
const ACTIEVE_STATUSSEN = ['verzonden', 'herinnering-verzonden', 'betaald', 'te-laat']

function berekenGroep(
  label: string,
  bedrijven: string[],
  alleFacturen: any[],
  jaar: number,
  now: Date,
): GroepStats {
  const yearStart = `${jaar}-01-01`
  const yearEnd = `${jaar}-12-31`
  const inGroep = (f: any) =>
    ACTIEVE_STATUSSEN.includes(f.status)
    && bedrijven.includes(f.company_id)
    && !f.exclude_from_revenue

  // OMZET / IB / BTW: allemaal factuurstelsel, op factuurdatum (`date`). Daley
  // staat op het factuurstelsel (nooit kasstelsel aangevraagd), dus BTW hoort
  // net als omzet/IB bij het kwartaal van de factuurdatum, niet de betaaldatum.
  // Zelfde grondslag als de kwartaal-aangifte (nieuwe kwartalen), zodat dit
  // overzicht en de aangifte altijd gelijklopen.
  const omzetRows = alleFacturen
    .filter((f: any) => inGroep(f) && f.date >= yearStart && f.date <= yearEnd)
    .map((f: any) => ({ subtotal: f.subtotal ?? 0, total: f.total ?? 0, date: f.date }))

  const kwartalen = aggregeerPerKwartaal(omzetRows)
  const maanden = aggregeerPerMaand(omzetRows)

  const totaalOmzetExcl = omzetRows.reduce((s: number, f: any) => s + (f.subtotal ?? 0), 0)
  const totaalBtw = omzetRows.reduce((s: number, f: any) => s + ((f.total ?? 0) - (f.subtotal ?? 0)), 0)

  const huidigKw = huidigKwartaal()
  const btwDitKwartaal = kwartalen[huidigKw - 1]?.btwBedrag ?? 0

  const verlopenMaanden = now.getMonth() + (now.getDate() > 15 ? 1 : 0.5)
  const geprojecteerdeJaaromzet = verlopenMaanden > 0
    ? (totaalOmzetExcl / verlopenMaanden) * 12
    : 0

  const ibWerkelijk = berekenInkomstenbelasting(totaalOmzetExcl)
  const ibProjectie = berekenInkomstenbelasting(geprojecteerdeJaaromzet)
  const maandelijkseIBReservering = ibProjectie.geschatteIB / 12

  return {
    label,
    bedrijven,
    totaalOmzetExcl,
    totaalBtw,
    btwDitKwartaal,
    geprojecteerdeJaaromzet,
    kwartalen,
    maanden,
    ibWerkelijk,
    ibProjectie,
    maandelijkseIBReservering,
  }
}

export async function GET() {
  const supabase = createClient()
  const now = new Date()
  const jaar = now.getFullYear()

  // Facturen als bron: omzet op factuurdatum (IB), BTW op betaaldatum (paid_at).
  const { data: facturen, error } = await supabase
    .from('facturen')
    .select('id, subtotal, total, date, paid_at, status, company_id, exclude_from_revenue, created_at')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const alleFacturen = facturen ?? []

  // Bereken per groep
  const eigen = berekenGroep('Mijn bedrijven', EIGEN_BEDRIJVEN, alleFacturen, jaar, now)

  return NextResponse.json({
    jaar,
    huidigKwartaal: huidigKwartaal(),
    eigen,
  })
}
