import { NextRequest, NextResponse } from 'next/server'
import { readdir, mkdir, rename } from 'fs/promises'
import { homedir } from 'os'
import path from 'path'
import { createClient } from '@/lib/supabase/server'
import { verwijderFactuurVeilig } from '@/lib/supabase/facturen'
import { VERWIJDERD_MAP } from '@/lib/admin/documentPaths'

export const dynamic = 'force-dynamic'

/**
 * Haalt de PDF's van een teruggezette factuur uit het archief.
 *
 * Zonder dit bleef de PDF staan terwijl de factuur uit de Dash verdween: de sync
 * bood hem daarna aan als nieuwe factuur, en het nummer kon intussen opnieuw zijn
 * uitgegeven. Verwijderen doen we niet, ze verhuizen naar een map die de scan
 * overslaat.
 */
async function parkeerFactuurPdfs(factuurnummer: string): Promise<string[]> {
  const daleyWerkRoot = process.env.DALEY_WERK_ROOT ?? `${homedir()}/Documents/DALEY WERK`
  const basis = `${daleyWerkRoot}/Bedrijf Administratie/Verkoopfacturen`
  const doelMap = `${basis}/${VERWIJDERD_MAP}`
  const verplaatst: string[] = []

  async function loop(map: string) {
    let entries
    try {
      entries = await readdir(map, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const vol = path.join(map, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('_')) continue
        await loop(vol)
      } else if (entry.name.startsWith(factuurnummer) && entry.name.toLowerCase().endsWith('.pdf')) {
        await mkdir(doelMap, { recursive: true })
        await rename(vol, path.join(doelMap, entry.name)).catch(() => {})
        verplaatst.push(entry.name)
      }
    }
  }

  await loop(basis)
  // Concepten staan buiten de scan, maar horen na terugzetten ook weg te zijn.
  await loop(`${basis}/_Concepten`).catch(() => {})
  return verplaatst
}

// Zet gefactureerde uren terug naar actief en (indien factuurnummer bekend) verwijder de factuur
export async function POST(request: NextRequest) {
  try {
    const { factuurnummer, urenIds, losseRegels, klant } = await request.json() as {
      factuurnummer?: string | null
      urenIds?: string[]
      /** Regels die op de factuur stonden maar geen urenregistratie zijn. */
      losseRegels?: {
        omschrijving: string
        detail?: string | null
        bedrag: number
        datum?: string | null
        aantal?: number
        prijsPerStuk?: number
      }[]
      /** Nodig als de factuur helemaal geen uren had, dan valt er niets uit af te leiden. */
      klant?: string | null
    }
    if (!factuurnummer && (!Array.isArray(urenIds) || urenIds.length === 0)) {
      return NextResponse.json({ error: 'factuurnummer of urenIds verplicht' }, { status: 400 })
    }

    const supabase = createClient()
    const updatePayload = { gefactureerd: false, factuurnummer: null, updated_at: new Date().toISOString() }

    // Bepaal welke uren we resetten: of via factuurnummer-match, of via IDs (voor legacy zonder factuurnummer)
    const urenQuery = supabase.from('uren').update(updatePayload)
    const finalQuery = Array.isArray(urenIds) && urenIds.length > 0
      ? urenQuery.in('id', urenIds)
      : urenQuery.eq('factuurnummer', factuurnummer)

    const { data: restoredUren, error: urenError } = await finalQuery.select('id, klant')

    if (urenError) throw urenError

    // Herstel gefactureerde projecten voor de betrokken klanten
    const klantNamen = Array.from(new Set(
      [...(restoredUren ?? []).map((u: { klant: string }) => u.klant), klant].filter(Boolean) as string[]
    ))
    // Alleen de projecten die op DEZE factuur stonden weer openzetten. Eerst ging
    // dat op klantnaam, waardoor het terugzetten van één factuur ook de projecten
    // van een andere factuur van dezelfde klant weer openzette.
    const losseNamen = (losseRegels ?? []).map(r => r.omschrijving).filter(Boolean)
    let herstelde: { naam: string }[] = []
    if (klantNamen.length > 0 && losseNamen.length > 0) {
      const { data } = await supabase
        .from('uren_projecten')
        .update({ status: 'actief', updated_at: new Date().toISOString() })
        .in('klant', klantNamen)
        .eq('status', 'gefactureerd')
        .in('naam', losseNamen)
        .select('naam')
      herstelde = data ?? []
    }

    // Regels die je tijdens het genereren aan de factuur hebt toegevoegd bestonden
    // nergens anders en waren na terugzetten dus weg. Die zetten we terug als los
    // project, want daar hoort een vast bedrag thuis: bij opnieuw factureren komt
    // dezelfde regel er weer op, zonder dat er "per uur" van gemaakt wordt.
    const klantVoorRegels = klantNamen[0]
    let herstuurdeRegels = 0
    if (klantVoorRegels && Array.isArray(losseRegels) && losseRegels.length > 0) {
      // company_id is verplicht op uren_projecten, dus die halen we van de klantkaart.
      const { data: klantRow } = await supabase
        .from('uren_klanten')
        .select('company_id')
        .eq('naam', klantVoorRegels)
        .maybeSingle()

      const bestaandeNamen = new Set(herstelde.map(p => p.naam))
      const nieuw = losseRegels
        .filter(r => r.omschrijving && !bestaandeNamen.has(r.omschrijving))
        .map(r => ({
          company_id: (klantRow as { company_id?: string } | null)?.company_id ?? 'tde',
          klant: klantVoorRegels,
          naam: r.omschrijving,
          omschrijving: r.detail ?? null,
          aantal: r.aantal ?? null,
          prijs: r.prijsPerStuk ?? null,
          bedrag: r.bedrag,
          datum: r.datum ?? new Date().toISOString().split('T')[0],
          status: 'actief',
        }))
      if (nieuw.length > 0) {
        const { error: regelFout } = await supabase.from('uren_projecten').insert(nieuw)
        if (regelFout) throw regelFout
        herstuurdeRegels = nieuw.length
      }
    }

    // Alleen factuur verwijderen als we een echt factuurnummer hebben
    let geparkeerdePdfs: string[] = []
    if (factuurnummer && factuurnummer !== 'onbekend') {
      const { data: factuurRij } = await supabase
        .from('facturen')
        .select('id')
        .eq('number', factuurnummer)
        .maybeSingle()

      if (factuurRij?.id) {
        // Via de gedeelde helper, zodat er ook hier eerst een kopie in de
        // prullenbak belandt. Terugzetten is een bewuste actie met een
        // bevestiging in de interface, dus een verstuurde factuur mag hier weg.
        await verwijderFactuurVeilig(factuurRij.id, {
          bron: 'uren-restore',
          reden: 'Factuur teruggezet vanaf de urenpagina',
          bevestigdVerstuurd: true,
        })
      }

      geparkeerdePdfs = await parkeerFactuurPdfs(factuurnummer)
    }

    return NextResponse.json({
      ok: true,
      restoredCount: restoredUren?.length ?? 0,
      herstuurdeRegels,
      geparkeerdePdfs,
      factuurnummer: factuurnummer ?? null,
    })
  } catch (err: any) {
    console.error('uren-restore error:', err)
    return NextResponse.json({ error: err.message ?? 'Onbekende fout' }, { status: 500 })
  }
}
