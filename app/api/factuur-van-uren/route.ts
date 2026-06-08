import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { createClient } from '@/lib/supabase/server'
import { updateUur } from '@/lib/supabase/uren'
import { generateFactuurNumber } from '@/lib/factuur-utils'
import { COMPANY_CONFIG, type CompanyKey, type FactuurRegel, genereerFactuurPdf } from '@/lib/pdf/factuurGenerator'

export const dynamic = 'force-dynamic'

interface UurItem {
  id: string
  datum: string
  omschrijving?: string
  uren: number
  uurtarief: number
}

async function getFactuurCountForDate(date: string): Promise<number> {
  const supabase = createClient()
  const { count } = await supabase
    .from('facturen')
    .select('*', { count: 'exact', head: true })
    .eq('date', date)
  return count ?? 0
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
    const { uren, klantId, vastTarief, companyId, factuurdatum: factuurdatumInput, betaallink, btwPercentage, handmatigeRegels }: {
      uren: UurItem[]
      klantId: string
      vastTarief: number | null
      companyId?: string
      factuurdatum?: string
      betaallink?: string | null
      btwPercentage?: number
      handmatigeRegels?: HandmatigeRegel[]
    } = body

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
    const factuurdatumDate = new Date(`${factuurdatum}T12:00:00`)
    const vervaldatumDate = new Date(`${factuurdatum}T12:00:00`)
    vervaldatumDate.setDate(vervaldatumDate.getDate() + 14)
    const vervaldatum = vervaldatumDate.toISOString().split('T')[0]
    const dateCount = await getFactuurCountForDate(factuurdatum)
    const factuurnummer = generateFactuurNumber(COMPANY_CONFIG[company].factuurPrefix, dateCount, factuurdatumDate)

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

    // PDF genereren via de GEDEELDE generator (zelfde route als opnieuw-opslaan)
    const pdfPath = await genereerFactuurPdf({
      company, factuurnummer, klant: klantData, klantNaamVoorBestand: klantRow.naam,
      regels, factuurdatum, vervaldatum,
      betaallink: veiligeBetaallink ?? undefined, btwPercentage: btwTarief,
    })
    exec(`open "${pdfPath}"`)

    // Markeer uren als gefactureerd
    await Promise.all(uren.map(u => updateUur(u.id, { gefactureerd: true, factuurnummer })))

    // Registreer in Supabase: factuurkop + losse regels (single source of truth)
    const subtotaal = regels.reduce((s, r) => s + r.aantal * r.prijsPerStuk, 0)
    const btwAmount = subtotaal * (btwTarief / 100)
    const { data: nieuweFactuur } = await supabase.from('facturen').insert({
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
      status: 'verzonden',
      mollie_payment_url: veiligeBetaallink,
      offerte_id: null,
      notes: null,
    }).select('id').single()

    if (nieuweFactuur?.id) {
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
    }

    return NextResponse.json({ ok: true, factuurnummer })
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
  const prefix = (companyParam in COMPANY_CONFIG)
    ? COMPANY_CONFIG[companyParam as CompanyKey].factuurPrefix
    : 'F'
  const count = await getFactuurCountForDate(date)
  const factuurnummer = generateFactuurNumber(prefix, count, new Date(`${date}T12:00:00`))
  return NextResponse.json({ factuurnummer })
}
