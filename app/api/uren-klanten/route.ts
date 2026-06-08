import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUurKlanten, createUurKlant } from '@/lib/supabase/uren-klanten'
import { deriveKlantnummerLetters } from '@/lib/klantnummer'

export const dynamic = 'force-dynamic'

export async function GET() {
  const klanten = await getUurKlanten()
  return NextResponse.json(klanten)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { naam, standaardUurtarief, companyId, crmBedrijfId, contactpersoon, email, adres, postcode, stad } = body
  let klantnummer: string = (body.klantnummer ?? '').trim()

  if (!naam?.trim()) {
    return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })
  }

  try {
    // Auto-genereer klantnummer als niet of slechts als prefix aangeleverd
    if (!klantnummer || klantnummer.length <= 3) {
      const letters = klantnummer.length === 3 && /^[A-Za-z]{3}$/.test(klantnummer)
        ? klantnummer.toUpperCase()
        : deriveKlantnummerLetters(naam.trim())

      const supabase = createClient()
      const { data: existing } = await supabase
        .from('uren_klanten')
        .select('klantnummer')
        .like('klantnummer', `${letters}%`)

      // Tel alleen nummers die exact overeenkomen met het patroon XXX000
      const count = (existing ?? []).filter(r =>
        r.klantnummer?.match(new RegExp(`^${letters}\\d{3}$`))
      ).length

      klantnummer = `${letters}${String(count + 1).padStart(3, '0')}`
    }

    const klant = await createUurKlant({
      naam: naam.trim(),
      standaardUurtarief: standaardUurtarief !== undefined ? Number(standaardUurtarief) : undefined,
      companyId,
      klantnummer,
      crmBedrijfId: crmBedrijfId ?? undefined,
    })

    // Update direct met de overige velden indien meegegeven
    const extra: Record<string, string> = {}
    if (contactpersoon) extra.contactpersoon = contactpersoon
    if (email) extra.email = email
    if (adres) extra.adres = adres
    if (postcode) extra.postcode = postcode
    if (stad) extra.stad = stad

    if (Object.keys(extra).length > 0) {
      const { updateUurKlant } = await import('@/lib/supabase/uren-klanten')
      const updated = await updateUurKlant(klant.id, extra)
      return NextResponse.json(updated, { status: 201 })
    }

    return NextResponse.json(klant, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Fout bij aanmaken' }, { status: 500 })
  }
}
