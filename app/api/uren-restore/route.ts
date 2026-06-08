import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Zet gefactureerde uren terug naar actief en (indien factuurnummer bekend) verwijder de factuur
export async function POST(request: NextRequest) {
  try {
    const { factuurnummer, urenIds } = await request.json()
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
    const klantNamen = Array.from(new Set((restoredUren ?? []).map((u: { klant: string }) => u.klant).filter(Boolean)))
    if (klantNamen.length > 0) {
      await supabase
        .from('uren_projecten')
        .update({ status: 'actief', updated_at: new Date().toISOString() })
        .in('klant', klantNamen)
        .eq('status', 'gefactureerd')
    }

    // Alleen factuur verwijderen als we een echt factuurnummer hebben
    if (factuurnummer && factuurnummer !== 'onbekend') {
      const { error: factuurError } = await supabase
        .from('facturen')
        .delete()
        .eq('number', factuurnummer)

      if (factuurError) throw factuurError
    }

    return NextResponse.json({
      ok: true,
      restoredCount: restoredUren?.length ?? 0,
      factuurnummer: factuurnummer ?? null,
    })
  } catch (err: any) {
    console.error('uren-restore error:', err)
    return NextResponse.json({ error: err.message ?? 'Onbekende fout' }, { status: 500 })
  }
}
