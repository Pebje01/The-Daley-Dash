// Factuurarchief voor de urenpagina.
//
// De archieflijst las eerst alleen de `uren`-tabel. Regels die je tijdens het
// genereren aan de factuur toevoegt (een vast bedrag, een termijn, een los
// project) bestaan daar niet, dus die verdwenen uit beeld zodra de factuur weg
// was. Deze route leest de factuur zelf, zodat het archief precies laat zien wat
// er op de factuur heeft gestaan.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export interface ArchiefRegel {
  omschrijving: string
  detail: string | null
  datum: string | null
  aantal: number
  prijsPerStuk: number
  bedrag: number
  /** Waar als de regel uit een urenregistratie komt, anders een losse regel. */
  uitUren: boolean
}

export interface ArchiefFactuur {
  factuurnummer: string
  factuurId: string | null
  datum: string | null
  status: string | null
  /** Totaal van de hele factuur, inclusief losse regels. */
  subtotaal: number
  totaal: number
  /** Alleen het deel dat uit urenregistraties komt. */
  urenAantal: number
  urenBedrag: number
  /** Id's van de urenregels, nodig om de factuur terug te kunnen zetten. */
  urenIds: string[]
  regels: ArchiefRegel[]
}

export async function GET(request: NextRequest) {
  const klant = request.nextUrl.searchParams.get('klant')?.trim()
  if (!klant) return NextResponse.json({ error: 'Klant ontbreekt' }, { status: 400 })

  const supabase = createClient()

  const { data: urenRows, error: urenFout } = await supabase
    .from('uren')
    .select('id, datum, omschrijving, uren, uurtarief, factuurnummer')
    .eq('klant', klant)
    .eq('gefactureerd', true)

  if (urenFout) return NextResponse.json({ error: urenFout.message }, { status: 500 })

  // Facturen op naam van deze klant, plus alles waar zijn uren naar verwijzen.
  // Dat tweede vangt facturen op die onder een oudere klantnaam zijn gemaakt.
  const nummersUitUren = Array.from(
    new Set((urenRows ?? []).map(u => u.factuurnummer).filter((n): n is string => !!n))
  )

  const { data: facturen } = await supabase
    .from('facturen')
    .select('id, number, date, status, subtotal, total, client_name')
    .or([
      `client_name.eq.${klant}`,
      ...(nummersUitUren.length ? [`number.in.(${nummersUitUren.join(',')})`] : []),
    ].join(','))

  const factuurIds = (facturen ?? []).map(f => f.id)
  const { data: regels } = factuurIds.length
    ? await supabase
        .from('factuur_line_items')
        .select('factuur_id, sort_order, description, details, quantity, unit_price, datum, eenheid')
        .in('factuur_id', factuurIds)
        .order('sort_order', { ascending: true })
    : { data: [] as any[] }

  interface UurRij {
    id: string
    datum: string
    omschrijving: string | null
    uren: number
    uurtarief: number
    factuurnummer: string | null
  }

  const urenPerNummer: Record<string, UurRij[]> = {}
  for (const u of (urenRows ?? []) as UurRij[]) {
    const sleutel = u.factuurnummer ?? 'onbekend'
    if (!urenPerNummer[sleutel]) urenPerNummer[sleutel] = []
    urenPerNummer[sleutel].push(u)
  }

  const resultaat: ArchiefFactuur[] = (facturen ?? []).map(f => {
    const eigenUren = urenPerNummer[f.number] ?? []
    delete urenPerNummer[f.number]

    const factuurRegels = (regels ?? [])
      .filter(r => r.factuur_id === f.id)
      .map(r => ({
        omschrijving: r.description,
        detail: r.details ?? null,
        datum: r.datum ?? null,
        aantal: Number(r.quantity),
        prijsPerStuk: Number(r.unit_price),
        bedrag: Number(r.quantity) * Number(r.unit_price),
        uitUren: r.eenheid === 'uur',
      }))

    return {
      factuurnummer: f.number,
      factuurId: f.id,
      datum: f.date,
      status: f.status,
      subtotaal: Number(f.subtotal ?? 0),
      totaal: Number(f.total ?? 0),
      urenAantal: eigenUren.reduce((s, u) => s + Number(u.uren), 0),
      urenBedrag: eigenUren.reduce((s, u) => s + Number(u.uren) * Number(u.uurtarief), 0),
      urenIds: eigenUren.map(u => u.id),
      regels: factuurRegels,
    }
  })

  // Uren waarvan de factuur niet (meer) in de Dash staat: toon dan de urenregels
  // zelf, zodat je ze nog steeds ziet en kunt terugzetten.
  for (const [nummer, groep] of Object.entries(urenPerNummer)) {
    resultaat.push({
      factuurnummer: nummer,
      factuurId: null,
      datum: groep.map(u => u.datum).sort()[0] ?? null,
      status: null,
      subtotaal: groep.reduce((s, u) => s + Number(u.uren) * Number(u.uurtarief), 0),
      totaal: 0,
      urenAantal: groep.reduce((s, u) => s + Number(u.uren), 0),
      urenBedrag: groep.reduce((s, u) => s + Number(u.uren) * Number(u.uurtarief), 0),
      urenIds: groep.map(u => u.id),
      regels: groep
        .sort((a, b) => a.datum.localeCompare(b.datum))
        .map(u => ({
          omschrijving: u.omschrijving ?? '',
          detail: null,
          datum: u.datum,
          aantal: Number(u.uren),
          prijsPerStuk: Number(u.uurtarief),
          bedrag: Number(u.uren) * Number(u.uurtarief),
          uitUren: true,
        })),
    })
  }

  resultaat.sort((a, b) => b.factuurnummer.localeCompare(a.factuurnummer))
  return NextResponse.json(resultaat)
}
