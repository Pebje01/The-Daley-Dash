import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { volgendNummer } from '@/lib/supabase/factuurNummer'
import { COMPANY_CONFIG, type CompanyKey, type FactuurRegel } from '@/lib/pdf/factuurGenerator'
import { maakFactuur } from '@/lib/facturen/maakFactuur'

export const dynamic = 'force-dynamic'

interface UurItem {
  id: string
  datum: string
  omschrijving?: string
  uren: number
  uurtarief: number
}

interface HandmatigeRegel {
  /** Hoofdtitel (vet, bovenste regel) */
  werkzaamheden: string
  /** Sub-beschrijving (klein, grijs, optioneel) */
  omschrijving?: string
  /** Aantal (standaard 1) */
  aantal?: number
  /** Prijs per stuk (valt terug op bedrag als niet gezet) */
  prijs?: number
  /** Totaalbedrag (aantal x prijs) */
  bedrag: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { uren, klantId, vastTarief, companyId, factuurdatum: factuurdatumInput, betaallink, btwPercentage, handmatigeRegels, concept, inEditor }: {
      uren: UurItem[]
      klantId: string
      vastTarief: number | null
      companyId?: string
      factuurdatum?: string
      betaallink?: string | null
      btwPercentage?: number
      handmatigeRegels?: HandmatigeRegel[]
      /** Concept: status 'concept', uren blijven openstaan tot de factuur verzonden wordt. */
      concept?: boolean
      /**
       * Open in editor: de factuur wordt wel volledig vastgelegd (nummer, regels,
       * uren), maar de PDF wordt nog NIET gemaakt. De gebruiker schuift eerst in
       * de sleepbare editor en slaat daar pas de PDF op.
       */
      inEditor?: boolean
    } = body

    const isConcept = concept === true
    const openInEditor = inEditor === true

    // Alleen geldige Nederlandse btw-tarieven toestaan; val terug op 21%
    const btwTarief = typeof btwPercentage === 'number' && [21, 9, 0].includes(btwPercentage) ? btwPercentage : 21

    const company: CompanyKey = (companyId && companyId in COMPANY_CONFIG)
      ? companyId as CompanyKey
      : 'daleyphotography'

    if ((!uren?.length && !handmatigeRegels?.length) || !klantId) {
      return NextResponse.json({ error: 'Minimaal één regel of uur is verplicht' }, { status: 400 })
    }

    // Haal klantgegevens op uit uren_klanten
    const supabase = createClient()
    const { data: klantRow, error: klantError } = await supabase
      .from('uren_klanten')
      .select('*')
      .eq('id', klantId)
      .single()

    if (klantError || !klantRow) {
      return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })
    }

    // Als adresgegevens ontbreken: terugmelden aan UI
    if (!klantRow.adres || !klantRow.postcode || !klantRow.stad) {
      return NextResponse.json({
        needsKlantDetails: true,
        klant: {
          naam: klantRow.naam,
          contactpersoon: klantRow.contactpersoon ?? '',
          adres: klantRow.adres ?? '',
          postcode: klantRow.postcode ?? '',
          stad: klantRow.stad ?? '',
          klantnummer: klantRow.klantnummer ?? '',
          email: klantRow.email ?? '',
        },
      })
    }

    // Factuurdatum: lokale datum als er niets is meegegeven (toISOString is UTC)
    const nu = new Date()
    const vandaag = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`
    const factuurdatum = (factuurdatumInput && /^\d{4}-\d{2}-\d{2}$/.test(factuurdatumInput))
      ? factuurdatumInput
      : vandaag

    // Eén gezamenlijke regellijst: uren eerst, daarna vaste regels.
    const tariefVan = (u: UurItem) => vastTarief ?? u.uurtarief
    const regels: FactuurRegel[] = [
      ...(uren ?? []).map(u => ({
        omschrijving: u.omschrijving?.trim() || COMPANY_CONFIG[company].defaultOmschrijving,
        datum: u.datum, aantal: u.uren, prijsPerStuk: tariefVan(u), perUur: true,
      })),
      ...(handmatigeRegels ?? []).map(r => ({
        omschrijving: r.werkzaamheden || 'Vast bedrag', detail: r.omschrijving,
        aantal: r.aantal ?? 1, prijsPerStuk: r.prijs ?? r.bedrag, perUur: false,
      })),
    ]

    // Nummer, regels, PDF en uren gaan via de gedeelde helper, zodat de
    // assistent precies dezelfde factuur maakt als deze knop.
    // Bij "Open in editor" komt de PDF er pas als de editor opslaat.
    const { factuurId, factuurnummer } = await maakFactuur({
      company,
      klant: {
        naam: klantRow.naam,
        contactpersoon: klantRow.contactpersoon,
        adres: klantRow.adres,
        postcode: klantRow.postcode,
        stad: klantRow.stad,
        email: klantRow.email,
        klantnummer: klantRow.klantnummer,
      },
      regels,
      factuurdatum,
      betaaltermijnDagen: 14,
      btwPercentage: btwTarief,
      status: isConcept ? 'concept' : 'verzonden',
      betaallink,
      urenIds: (uren ?? []).map(u => u.id),
      zonderPdf: openInEditor,
      openPdf: true,
    })

    return NextResponse.json({
      ok: true,
      factuurnummer,
      factuurId,
      concept: isConcept,
      editorUrl: openInEditor ? `/api/facturen/${factuurId}/editor?nieuw=1` : null,
    })
  } catch (err: any) {
    console.error('factuur-van-uren error:', err)
    return NextResponse.json({ error: err.message ?? 'Onbekende fout' }, { status: 500 })
  }
}

// Voorspelt het factuurnummer voor een datum, zodat de popup het alvast kan tonen
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Ongeldige datum' }, { status: 400 })
  }
  const companyParam = request.nextUrl.searchParams.get('company') ?? ''
  const bedrijfsPrefix = (companyParam in COMPANY_CONFIG)
    ? COMPANY_CONFIG[companyParam as CompanyKey].factuurPrefix
    : 'F'

  // Concept en direct-verzonden krijgen hetzelfde nummer, alleen de status verschilt.
  const factuurnummer = await volgendNummer(bedrijfsPrefix, date)
  return NextResponse.json({ factuurnummer })
}
