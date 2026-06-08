// Reggenereert de PDF van een bestaande factuur via DE GEDEELDE generator,
// zodat de "PDF opslaan" knop exact dezelfde stijl en map gebruikt als bij het
// aanmaken vanuit uren. Leest de opgeslagen regels uit factuur_line_items.
import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { createClient } from '@/lib/supabase/server'
import { COMPANY_CONFIG, type CompanyKey, type FactuurRegel, genereerFactuurPdf } from '@/lib/pdf/factuurGenerator'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()

    const { data: f, error } = await supabase.from('facturen').select('*').eq('id', params.id).single()
    if (error || !f) return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 })

    const company = ((f.company_id in COMPANY_CONFIG) ? f.company_id : 'daleyphotography') as CompanyKey

    const { data: items } = await supabase
      .from('factuur_line_items')
      .select('*')
      .eq('factuur_id', params.id)
      .order('sort_order', { ascending: true })

    if (!items || items.length === 0) {
      return NextResponse.json({
        error: 'Deze factuur heeft geen opgeslagen regels in de database en kan daarom niet opnieuw gegenereerd worden.',
      }, { status: 400 })
    }

    const regels: FactuurRegel[] = items.map(i => ({
      omschrijving: i.description,
      detail: i.details ?? undefined,
      datum: i.datum ?? undefined,
      aantal: i.quantity,
      prijsPerStuk: i.unit_price,
      perUur: i.eenheid === 'uur',
    }))

    // client_address is opgeslagen als "adres, postcode stad" -> weer uit elkaar halen
    const adresVol: string = f.client_address ?? ''
    const m = adresVol.match(/^(.*),\s*(\d{4}\s?[A-Za-z]{2})\s+(.*)$/)
    const klant = {
      bedrijfsnaam: f.client_name,
      contactpersoon: f.client_contact_person ?? undefined,
      adres: m ? m[1].trim() : adresVol,
      postcode: m ? m[2].trim() : '',
      stad: m ? m[3].trim() : '',
    }

    const pdfPath = await genereerFactuurPdf({
      company,
      factuurnummer: f.number,
      klant,
      klantNaamVoorBestand: f.client_name,
      regels,
      factuurdatum: f.date,
      vervaldatum: f.due_date ?? f.date,
      betaallink: f.mollie_payment_url ?? undefined,
      btwPercentage: f.btw_percentage ?? 21,
    })
    exec(`open "${pdfPath}"`)

    return NextResponse.json({ ok: true, pdfPath })
  } catch (e: any) {
    console.error('regenerate-pdf fout:', e)
    return NextResponse.json({ error: e?.message ?? 'PDF genereren mislukt' }, { status: 500 })
  }
}
