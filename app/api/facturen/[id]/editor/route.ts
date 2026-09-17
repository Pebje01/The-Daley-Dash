// Serveert de sleepbare editor-versie van een factuur als kaal HTML-document
// (geen React/dashboard-chrome), zodat wat je hier versleept letterlijk
// dezelfde HTML is als wat er straks in de PDF komt. Opent via een nieuw
// tabblad vanuit de "Editor openen"-knop op de factuurdetailpagina.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { bouwFactuurHtml } from '@/lib/pdf/factuurGenerator'
import { laadFactuurBouwData } from '@/lib/pdf/factuurData'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // ?nieuw=1 komt van "Open in editor" op de urenpagina: de factuur staat al in
  // Supabase maar er is nog geen PDF. De opslaanknop heet dan "Sla op als PDF"
  // zodat duidelijk is dat de PDF daar pas ontstaat.
  const pdfNogNietGemaakt = req.nextUrl.searchParams.get('nieuw') === '1'
  const supabase = createClient()
  const { data: bouwData, error } = await laadFactuurBouwData(supabase, params.id)
  if (!bouwData) {
    return NextResponse.json({ error: error ?? 'Factuur niet gevonden' }, { status: 404 })
  }

  const html = await bouwFactuurHtml({
    ...bouwData,
    editMode: true,
    factuurId: params.id,
    pdfNogNietGemaakt,
  })

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
