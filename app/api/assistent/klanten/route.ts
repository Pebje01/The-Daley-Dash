import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface KlantTreffer {
  naam: string
  bedrijf?: string
  bronnen: string[]
  urenKlantId?: string
  klantnummer?: string
  contactpersoon?: string
  adres?: string
  postcode?: string
  stad?: string
  email?: string
  telefoon?: string
  kvk?: string
  btw?: string
  uurtarief?: number
  gearchiveerd?: boolean
  laatsteFactuur?: { nummer: string; datum: string; status: string }
}

/**
 * Klant opzoeken voor de assistent. Er is geen klantentabel die alles heeft:
 * de urenregistratie kent adres en klantnummer, eerdere facturen en offertes
 * kennen KVK, btw-nummer en telefoon. Hier komt het per naam bij elkaar.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ error: 'Zoek op minimaal 2 tekens' }, { status: 400 })

  const supabase = createClient()
  const patroon = `%${q.replace(/[%_]/g, '')}%`
  const [{ data: urenKlanten }, { data: facturen }, { data: offertes }] = await Promise.all([
    supabase.from('uren_klanten').select('*').ilike('naam', patroon).limit(10),
    supabase.from('facturen')
      .select('number, date, status, company_id, client_name, client_contact_person, client_address, client_email, client_phone, client_kvk, client_btw')
      .ilike('client_name', patroon).order('date', { ascending: false }).limit(30),
    supabase.from('offertes')
      .select('company_id, client_name, client_contact_person, client_address, client_email, client_phone, client_kvk, client_btw, date')
      .ilike('client_name', patroon).order('date', { ascending: false }).limit(20),
  ])

  const perNaam = new Map<string, KlantTreffer>()
  const treffer = (naam: string) => {
    const sleutel = naam.trim().toLowerCase()
    if (!perNaam.has(sleutel)) perNaam.set(sleutel, { naam: naam.trim(), bronnen: [] })
    return perNaam.get(sleutel)!
  }
  const vul = <K extends keyof KlantTreffer>(t: KlantTreffer, veld: K, waarde: KlantTreffer[K] | null | undefined) => {
    if (t[veld] === undefined && waarde !== null && waarde !== undefined && waarde !== '') t[veld] = waarde
  }
  const splitsAdres = (t: KlantTreffer, adres?: string | null) => {
    const m = (adres ?? '').match(/^(.*),\s*(\d{4}\s?[A-Za-z]{2})\s+(.*)$/)
    if (m) { vul(t, 'adres', m[1].trim()); vul(t, 'postcode', m[2].trim()); vul(t, 'stad', m[3].trim()) }
  }

  for (const k of urenKlanten ?? []) {
    const t = treffer(k.naam)
    t.bronnen.push('urenregistratie')
    t.urenKlantId = k.id
    vul(t, 'bedrijf', k.company_id)
    vul(t, 'klantnummer', k.klantnummer)
    vul(t, 'contactpersoon', k.contactpersoon)
    vul(t, 'adres', k.adres)
    vul(t, 'postcode', k.postcode)
    vul(t, 'stad', k.stad)
    vul(t, 'email', k.email)
    vul(t, 'uurtarief', k.standaard_uurtarief != null ? Number(k.standaard_uurtarief) : undefined)
    t.gearchiveerd = !!k.gearchiveerd_op
  }
  for (const f of facturen ?? []) {
    const t = treffer(f.client_name)
    if (!t.bronnen.includes('facturen')) t.bronnen.push('facturen')
    vul(t, 'laatsteFactuur', { nummer: f.number, datum: f.date, status: f.status })
    vul(t, 'bedrijf', f.company_id)
    vul(t, 'contactpersoon', f.client_contact_person)
    vul(t, 'email', f.client_email)
    vul(t, 'telefoon', f.client_phone)
    vul(t, 'kvk', f.client_kvk)
    vul(t, 'btw', f.client_btw)
    splitsAdres(t, f.client_address)
  }
  for (const o of offertes ?? []) {
    const t = treffer(o.client_name)
    if (!t.bronnen.includes('offertes')) t.bronnen.push('offertes')
    vul(t, 'bedrijf', o.company_id)
    vul(t, 'contactpersoon', o.client_contact_person)
    vul(t, 'email', o.client_email)
    vul(t, 'telefoon', o.client_phone)
    vul(t, 'kvk', o.client_kvk)
    vul(t, 'btw', o.client_btw)
    splitsAdres(t, o.client_address)
  }

  return NextResponse.json(Array.from(perNaam.values()).slice(0, 10))
}
