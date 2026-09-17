// Slaat de PDF van een bestaande factuur opnieuw op via de gedeelde helper
// (lib/pdf/factuurPdfOpslaan.ts), zodat de editor exact dezelfde stijl en map
// gebruikt als "Wijzigingen opslaan" en het aanmaken vanuit uren.
//
// Accepteert optioneel { layoutOverrides } in de request-body (vanuit de
// sleepbare editor, zie /api/facturen/[id]/editor): als dat meekomt, wordt de
// bewaarde indeling eerst in Supabase weggeschreven, en anders wordt de al
// opgeslagen indeling van de factuur zelf hergebruikt (nooit stilzwijgend
// resetten naar de standaard-layout).
//
// Met { geladenOp } stuurt de editor mee welke versie hij toonde. Is de factuur
// sindsdien via Bewerken aangepast, dan weigeren we: de blokposities zijn dan
// gemeten op een verouderde factuur en zouden over de nieuwe inhoud vallen.
import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { createClient } from '@/lib/supabase/server'
import { slaFactuurPdfOp } from '@/lib/pdf/factuurPdfOpslaan'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const body = await req.json().catch(() => ({}))
    const nieuweOverrides = body?.layoutOverrides as Record<string, number> | undefined
    const geladenOp = body?.geladenOp as string | undefined

    if (geladenOp) {
      const { data: f } = await supabase.from('facturen').select('updated_at').eq('id', params.id).single()
      if (f?.updated_at && new Date(f.updated_at).getTime() !== new Date(geladenOp).getTime()) {
        return NextResponse.json({
          error: 'Deze factuur is intussen aangepast in de Dash. Herlaad de editor, dan zie je de nieuwe versie en kun je de indeling opnieuw opslaan.',
          verouderd: true,
        }, { status: 409 })
      }
    }

    if (nieuweOverrides) {
      const { error: updateError } = await supabase
        .from('facturen')
        .update({ layout_overrides: nieuweOverrides })
        .eq('id', params.id)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { pdfPath } = await slaFactuurPdfOp(supabase, params.id, { layoutOverrides: nieuweOverrides })
    exec(`open "${pdfPath}"`)

    // Nieuwe versie teruggeven, zodat de editor daarna nog een keer kan opslaan
    // zonder zichzelf als verouderd te zien.
    const { data: na } = await supabase.from('facturen').select('updated_at').eq('id', params.id).single()
    return NextResponse.json({ ok: true, pdfPath, bijgewerktOp: na?.updated_at ?? null })
  } catch (e: any) {
    console.error('regenerate-pdf fout:', e)
    return NextResponse.json({ error: e?.message ?? 'PDF genereren mislukt' }, { status: 500 })
  }
}
