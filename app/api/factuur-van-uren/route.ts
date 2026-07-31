import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { createClient } from '@/lib/supabase/server'
import { updateUur } from '@/lib/supabase/uren'
import { CONCEPT_PREFIX } from '@/lib/factuur-utils'
import { volgendNummer } from '@/lib/supabase/factuurNummer'
import { COMPANY_CONFIG, type CompanyKey, type FactuurRegel, genereerFactuurPdf } from '@/lib/pdf/factuurGenerator'

export const dynamic = 'force-dynamic'

interface UurItem {
  id: string
  datum: string
  omschrijving?: string
  uren: number
  uurtarief: number
}

// Knab betaalverzoek-links zijn gewone https-urls; weiger al het andere zodat
// er nooit iets onveiligs in een href of in de database belandt.
function isSafeUrl(url?: string | null): url is string {
  return !!url && /^https?:\/\/[^\s"'<>]+$/.test(url.trim())
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
    const { uren, klantId, vastTarief, companyId, factuurdatum: factuurdatumInput, betaallink, btwPercentage, handmatigeRegels, concept }: {
      uren: UurItem[]
      klantId: string
      vastTarief: number | null
      companyId?: string
      factuurdatum?: string
      betaallink?: string | null
      btwPercentage?: number
      handmatigeRegels?: HandmatigeRegel[]
      /** Concept: eigen C-reeks, PDF in _Concepten, uren blijven openstaan. */
      concept?: boolean
    } = body

    const isConcept = concept === true

    const veiligeBetaallink = isSafeUrl(betaallink) ? betaallink.trim() : null
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

    // Factuurdatum, vervaldatum en volgnummer
    const factuurdatum = (factuurdatumInput && /^\d{4}-\d{2}-\d{2}$/.test(factuurdatumInput))
      ? factuurdatumInput
      : new Date().toISOString().split('T')[0]
    const vervaldatumDate = new Date(`${factuurdatum}T12:00:00`)
    vervaldatumDate.setDate(vervaldatumDate.getDate() + 14)
    const vervaldatum = vervaldatumDate.toISOString().split('T')[0]
    const prefix = isConcept ? CONCEPT_PREFIX : COMPANY_CONFIG[company].factuurPrefix
    const factuurnummer = await volgendNummer(prefix, factuurdatum)

    const klantData = {
      bedrijfsnaam: klantRow.naam,
      contactpersoon: klantRow.contactpersoon ?? undefined,
      adres: klantRow.adres,
      postcode: klantRow.postcode,
      stad: klantRow.stad,
      klantnummer: klantRow.klantnummer ?? undefined,
    }

    // Bouw één gezamenlijke regellijst: uren eerst, daarna vaste regels.
    const tariefVan = (u: UurItem) => vastTarief ?? u.uurtarief
    const regels: FactuurRegel[] = [
      ...uren.map(u => ({
        omschrijving: u.omschrijving?.trim() || COMPANY_CONFIG[company].defaultOmschrijving,
        datum: u.datum, aantal: u.uren, prijsPerStuk: tariefVan(u), perUur: true,
      })),
      ...(handmatigeRegels ?? []).map(r => ({
        omschrijving: r.werkzaamheden || 'Vast bedrag', detail: r.omschrijving,
        aantal: r.aantal ?? 1, prijsPerStuk: r.prijs ?? r.bedrag, perUur: false,
      })),
    ]

    // Eerst vastleggen in Supabase, dan pas de PDF en de uren. Andersom liep het
    // mis: als de insert stukliep, lag er wel een PDF in de map en stonden de uren
    // op gefactureerd, terwijl de factuur nergens in de Dash te vinden was.
    const subtotaal = regels.reduce((s, r) => s + r.aantal * r.prijsPerStuk, 0)
    const btwAmount = subtotaal * (btwTarief / 100)
    const { data: nieuweFactuur, error: insertFout } = await supabase.from('facturen').insert({
      company_id: company,
      number: factuurnummer,
      slug: factuurnummer.toLowerCase(),
      client_name: klantRow.naam,
      client_contact_person: klantRow.contactpersoon ?? null,
      client_address: `${klantRow.adres}, ${klantRow.postcode} ${klantRow.stad}`,
      client_email: klantRow.email ?? null,
      client_phone: null,
      date: factuurdatum,
      due_date: vervaldatum,
      subtotal: subtotaal,
      btw_percentage: btwTarief,
      btw_amount: btwAmount,
      total: subtotaal + btwAmount,
      status: isConcept ? 'concept' : 'verzonden',
      mollie_payment_url: veiligeBetaallink,
      offerte_id: null,
      notes: null,
    }).select('id').single()

    if (insertFout || !nieuweFactuur?.id) {
      console.error('factuur-van-uren: opslaan in Supabase mislukt', insertFout)
      return NextResponse.json(
        { error: `Opslaan in de Dash mislukt, er is niets aangemaakt: ${insertFout?.message ?? 'onbekende fout'}` },
        { status: 500 }
      )
    }

    await supabase.from('factuur_line_items').insert(
      regels.map((r, idx) => ({
        factuur_id: nieuweFactuur.id,
        sort_order: idx,
        description: r.omschrijving,
        details: r.detail ?? null,
        quantity: r.aantal,
        unit_price: r.prijsPerStuk,
        section_title: null,
        datum: r.datum ?? null,
        eenheid: r.perUur ? 'uur' : null,
      }))
    )

    // PDF genereren via de GEDEELDE generator (zelfde route als opnieuw-opslaan)
    const { pdfPath } = await genereerFactuurPdf({
      company, factuurnummer, klant: klantData, klantNaamVoorBestand: klantRow.naam,
      regels, factuurdatum, vervaldatum,
      betaallink: veiligeBetaallink ?? undefined, btwPercentage: btwTarief,
      concept: isConcept,
    })
    exec(`open "${pdfPath}"`)

    // Uren pas afboeken bij een echte factuur. Bij een concept leggen we alleen
    // de koppeling vast: ze blijven openstaan in de urenlijst, maar bij
    // "Definitief maken" weten we nog precies welke uren erop stonden.
    await Promise.all(uren.map(u => updateUur(u.id, {
      gefactureerd: !isConcept,
      factuurnummer,
    })))

    return NextResponse.json({ ok: true, factuurnummer, concept: isConcept })
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

  // De popup toont beide nummers, zodat je vooraf ziet wat je krijgt bij
  // "Genereer factuur" en wat bij "Concept".
  const [factuurnummer, conceptnummer] = await Promise.all([
    volgendNummer(bedrijfsPrefix, date),
    volgendNummer(CONCEPT_PREFIX, date),
  ])
  return NextResponse.json({ factuurnummer, conceptnummer })
}
