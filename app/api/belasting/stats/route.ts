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

function berekenGroep(
  label: string,
  bedrijven: string[],
  alleOffertes: any[],
  yearStart: string,
  now: Date,
): GroepStats {
  const rows = alleOffertes
    .filter((o: any) =>
      o.status === 'akkoord'
      && o.date >= yearStart
      && bedrijven.includes(o.company_id)
    )
    .map((o: any) => ({
      subtotal: o.subtotal ?? 0,
      total: o.total ?? 0,
      date: o.date,
    }))

  const kwartalen = aggregeerPerKwartaal(rows)
  const maanden = aggregeerPerMaand(rows)

  const totaalOmzetExcl = rows.reduce((s: number, f: any) => s + (f.subtotal ?? 0), 0)
  const totaalBtw = rows.reduce((s: number, f: any) => s + ((f.total ?? 0) - (f.subtotal ?? 0)), 0)

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
  const yearStart = `${jaar}-01-01`

  // Haal alle offertes op (inclusief company_id)
  const { data: offertes, error } = await supabase
    .from('offertes')
    .select('id, subtotal, total, date, status, company_id, created_at')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const alleOffertes = offertes ?? []

  // Bereken per groep
  const eigen = berekenGroep('Mijn bedrijven', EIGEN_BEDRIJVEN, alleOffertes, yearStart, now)
  const bleijenberg = berekenGroep('Bleijenberg', ['bleijenberg'], alleOffertes, yearStart, now)
  const montung = berekenGroep('Montung', ['montung'], alleOffertes, yearStart, now)

  return NextResponse.json({
    jaar,
    huidigKwartaal: huidigKwartaal(),
    eigen,
    apart: [bleijenberg, montung],
  })
}
