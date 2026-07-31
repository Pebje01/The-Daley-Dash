// Reggenereert de PDF van een bestaande factuur via DE GEDEELDE generator,
// zodat de "PDF opslaan" knop exact dezelfde stijl en map gebruikt als bij het
// aanmaken vanuit uren. Leest de opgeslagen regels uit factuur_line_items.
//
// Accepteert optioneel { layoutOverrides } in de request-body (vanuit de
// sleepbare editor, zie /api/facturen/[id]/editor): als dat meekomt, wordt de
// bewaarde indeling eerst in Supabase weggeschreven, en anders wordt de al
// opgeslagen indeling van de factuur zelf hergebruikt (nooit stilzwijgend
// resetten naar de standaard-layout).
import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { createClient } from '@/lib/supabase/server'
import { genereerFactuurPdf } from '@/lib/pdf/factuurGenerator'
import { laadFactuurBouwData } from '@/lib/pdf/factuurData'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const body = await req.json().catch(() => ({}))
    const nieuweOverrides = body?.layoutOverrides as Record<string, number> | undefined

    if (nieuweOverrides) {
      const { error: updateError } = await supabase
        .from('facturen')
        .update({ layout_overrides: nieuweOverrides })
        .eq('id', params.id)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { data: bouwData, error } = await laadFactuurBouwData(supabase, params.id)
    if (!bouwData) return NextResponse.json({ error }, { status: 404 })

    const layoutOverrides = nieuweOverrides ?? bouwData.layoutOverrides

    const { pdfPath } = await genereerFactuurPdf({ ...bouwData, layoutOverrides })
    exec(`open "${pdfPath}"`)

    return NextResponse.json({ ok: true, pdfPath })
  } catch (e: any) {
    console.error('regenerate-pdf fout:', e)
    return NextResponse.json({ error: e?.message ?? 'PDF genereren mislukt' }, { status: 500 })
  }
}
