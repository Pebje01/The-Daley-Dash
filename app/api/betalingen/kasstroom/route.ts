// Kasstroom: wat er echt is binnengekomen, op betaaldatum.
//
// De betalingen-pagina las de tabel `betalingen`, maar die wordt nergens gevuld.
// De echte betaalinformatie staat op de facturen zelf: `paid_at` plus het bedrag.
// Deze route leidt daar het kasoverzicht uit af, zodat naast je omzet (wat je
// verdiend hebt) ook zichtbaar is wat er daadwerkelijk is ontvangen.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EIGEN_BEDRIJVEN } from '@/lib/btw'

export const dynamic = 'force-dynamic'

interface FactuurRij {
  id: string
  number: string
  client_name: string
  company_id: string
  date: string
  due_date: string | null
  paid_at: string | null
  total: number
  subtotal: number
  status: string
  exclude_from_revenue: boolean | null
}

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('facturen')
    .select('id, number, client_name, company_id, date, due_date, paid_at, total, subtotal, status, exclude_from_revenue')
    .in('company_id', EIGEN_BEDRIJVEN)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const facturen = (data as FactuurRij[]).filter(f => !f.exclude_from_revenue)
  const nu = new Date()
  const jaar = nu.getFullYear()
  const vandaag = nu.toISOString().split('T')[0]
  const dag = (d?: string | null) => String(d ?? '').split('T')[0]

  const betaald = facturen.filter(f => f.status === 'betaald' && f.paid_at)
  const openStatussen = ['verzonden', 'herinnering-verzonden', 'te-laat']
  const openstaand = facturen.filter(f => openStatussen.includes(f.status))
  const omzetStatussen = [...openStatussen, 'betaald']

  // Per maand: wat je factureerde tegenover wat er binnenkwam. Die twee lopen
  // bewust niet gelijk, want een factuur van juli kan in augustus betaald worden.
  const maanden = Array.from({ length: nu.getMonth() + 1 }, (_, i) => {
    const maand = `${jaar}-${String(i + 1).padStart(2, '0')}`
    const gefactureerd = facturen.filter(f => omzetStatussen.includes(f.status) && dag(f.date).startsWith(maand))
    const ontvangen = betaald.filter(f => dag(f.paid_at).startsWith(maand))
    return {
      maand,
      label: new Date(`${maand}-01T12:00:00`).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }),
      gefactureerdExcl: gefactureerd.reduce((s, f) => s + Number(f.subtotal ?? 0), 0),
      gefactureerdIncl: gefactureerd.reduce((s, f) => s + Number(f.total ?? 0), 0),
      ontvangen: ontvangen.reduce((s, f) => s + Number(f.total ?? 0), 0),
      aantalOntvangen: ontvangen.length,
    }
  }).reverse()

  // Hoe snel je klanten betalen: dagen tussen factuurdatum en betaaldatum.
  //
  // Stond de betaling al binnen voordat de factuur de deur uit ging, dan komt daar
  // een negatief getal uit. Dat zegt niets over de klant, die heeft juist niet
  // hoeven wachten, dus dat telt als 0 dagen.
  const looptijd = (f: FactuurRij): number =>
    Math.max(0, Math.round((new Date(dag(f.paid_at)).getTime() - new Date(dag(f.date)).getTime()) / 86400000))

  const looptijden = betaald.filter(f => f.date && f.paid_at).map(looptijd)
  const gemiddeldeBetaaltermijn = looptijden.length
    ? Math.round(looptijden.reduce((s, d) => s + d, 0) / looptijden.length)
    : null

  const dezeMaand = `${jaar}-${String(nu.getMonth() + 1).padStart(2, '0')}`

  return NextResponse.json({
    ontvangenDezeMaand: betaald.filter(f => dag(f.paid_at).startsWith(dezeMaand)).reduce((s, f) => s + Number(f.total ?? 0), 0),
    ontvangenDitJaar: betaald.filter(f => dag(f.paid_at).startsWith(String(jaar))).reduce((s, f) => s + Number(f.total ?? 0), 0),
    openstaandBedrag: openstaand.reduce((s, f) => s + Number(f.total ?? 0), 0),
    openstaandAantal: openstaand.length,
    gemiddeldeBetaaltermijn,
    maanden,
    laatsteBetalingen: betaald
      .sort((a, b) => dag(b.paid_at).localeCompare(dag(a.paid_at)))
      .slice(0, 12)
      .map(f => ({
        id: f.id,
        nummer: f.number,
        klant: f.client_name,
        bedrijf: f.company_id,
        betaaldOp: dag(f.paid_at),
        factuurdatum: dag(f.date),
        bedrag: Number(f.total ?? 0),
        dagen: looptijd(f),
        // Betaald voordat de factuur verstuurd was. Dan is er niet gewacht, maar
        // liep de factuur achter op de betaling.
        vooraf: new Date(dag(f.paid_at)).getTime() < new Date(dag(f.date)).getTime(),
      })),
    openstaandeFacturen: openstaand
      .sort((a, b) => dag(a.due_date).localeCompare(dag(b.due_date)))
      .map(f => ({
        id: f.id,
        nummer: f.number,
        klant: f.client_name,
        bedrijf: f.company_id,
        vervaldatum: dag(f.due_date),
        bedrag: Number(f.total ?? 0),
        dagenOpen: Math.round((new Date(vandaag).getTime() - new Date(dag(f.date)).getTime()) / 86400000),
        teLaat: !!f.due_date && dag(f.due_date) < vandaag,
      })),
  })
}
