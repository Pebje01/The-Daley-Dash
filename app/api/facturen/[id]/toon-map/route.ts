// Opent in Finder de map waar de PDF van deze factuur staat, met de PDF
// geselecteerd. Staat de PDF er (nog) niet, dan gaat de kwartaalmap open, en
// bestaat die ook niet dan de map Verkoopfacturen. Werkt op de Mac waar de Dash
// draait, dus niet op de telefoon zelf.
import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { access } from 'fs/promises'
import { dirname } from 'path'
import { createClient } from '@/lib/supabase/server'
import { huidigPdfPad } from '@/lib/pdf/factuurPdfOpslaan'

export const dynamic = 'force-dynamic'

const bestaat = (pad: string) => access(pad).then(() => true).catch(() => false)

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const pdfPad = await huidigPdfPad(createClient(), params.id)
  if (!pdfPad) return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 })

  // execFile in plaats van exec: klantnamen in het pad gaan zo nooit door een shell.
  const kwartaalMap = dirname(pdfPad)
  const args = await bestaat(pdfPad)
    ? ['-R', pdfPad]
    : [await bestaat(kwartaalMap) ? kwartaalMap : dirname(kwartaalMap)]

  execFile('open', args)
  return NextResponse.json({ ok: true, pdfGevonden: args[0] === '-R' })
}
