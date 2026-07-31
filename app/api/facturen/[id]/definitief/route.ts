// Maakt een concept-factuur definitief.
//
// Een concept draagt een nummer uit de losse C-reeks en staat in de map
// _Concepten, buiten de sync. Pas hier krijgt hij een echt factuurnummer uit de
// bedrijfsreeks, verhuist de PDF naar de kwartaalmap en worden de uren afgeboekt.
// Zo claimt een concept nooit een factuurnummer dat je later niet verstuurt.
import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { rm } from 'fs/promises'
import { createClient } from '@/lib/supabase/server'
import { CONCEPT_PREFIX } from '@/lib/factuur-utils'
import { volgendNummer } from '@/lib/supabase/factuurNummer'
import { COMPANY_CONFIG, type CompanyKey, genereerFactuurPdf } from '@/lib/pdf/factuurGenerator'
import { laadFactuurBouwData } from '@/lib/pdf/factuurData'
import { CONCEPTEN_MAP } from '@/lib/admin/documentPaths'
import { homedir } from 'os'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()

    const { data: factuur, error: leesFout } = await supabase
      .from('facturen')
      .select('id, number, company_id, client_name, date, status')
      .eq('id', params.id)
      .single()

    if (leesFout || !factuur) {
      return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 })
    }

    const conceptnummer: string = factuur.number
    if (!conceptnummer.toUpperCase().startsWith(`${CONCEPT_PREFIX}-`)) {
      return NextResponse.json(
        { error: `${conceptnummer} is al een echte factuur, die kun je niet nog eens definitief maken.` },
        { status: 409 }
      )
    }

    const company = ((factuur.company_id in COMPANY_CONFIG) ? factuur.company_id : 'daleyphotography') as CompanyKey
    const factuurdatum: string = factuur.date
    const nieuwNummer = await volgendNummer(COMPANY_CONFIG[company].factuurPrefix, factuurdatum)

    const { error: updateFout } = await supabase
      .from('facturen')
      .update({
        number: nieuwNummer,
        slug: nieuwNummer.toLowerCase(),
        status: 'verzonden',
      })
      .eq('id', params.id)

    if (updateFout) {
      return NextResponse.json(
        { error: `Nummer toekennen mislukt: ${updateFout.message}` },
        { status: 500 }
      )
    }

    // Uren die aan het concept hingen nu echt afboeken en omhangen naar het
    // definitieve nummer.
    await supabase
      .from('uren')
      .update({ gefactureerd: true, factuurnummer: nieuwNummer })
      .eq('factuurnummer', conceptnummer)

    // PDF opnieuw bouwen, nu met het echte nummer en in de kwartaalmap.
    const { data: bouwData, error: bouwFout } = await laadFactuurBouwData(supabase, params.id)
    if (!bouwData) {
      return NextResponse.json(
        { error: `Nummer is toegekend (${nieuwNummer}), maar de PDF kon niet opnieuw gemaakt worden: ${bouwFout}` },
        { status: 500 }
      )
    }

    const { pdfPath } = await genereerFactuurPdf({ ...bouwData, layoutOverrides: bouwData.layoutOverrides })

    // Oude concept-PDF opruimen, anders blijft er een dubbele versie rondslingeren.
    const daleyWerkRoot = process.env.DALEY_WERK_ROOT ?? `${homedir()}/Documents/DALEY WERK`
    const conceptPad = `${daleyWerkRoot}/Bedrijf Administratie/Verkoopfacturen/${CONCEPTEN_MAP}/${conceptnummer} ${factuur.client_name}.pdf`
    await rm(conceptPad, { force: true }).catch(() => {})

    exec(`open "${pdfPath}"`)

    return NextResponse.json({ ok: true, nummer: nieuwNummer, vorigNummer: conceptnummer, pdfPath })
  } catch (e: any) {
    console.error('definitief maken mislukt:', e)
    return NextResponse.json({ error: e?.message ?? 'Definitief maken mislukt' }, { status: 500 })
  }
}
