/**
 * Een factuur wijzigen en de PDF meteen bijwerken als er iets verandert dat op
 * de PDF staat. Gebruikt door PATCH /api/facturen/[id] (de factuurkaart) en door
 * de assistent, zodat een wijziging via de chat precies hetzelfde afloopt.
 */
import { updateFactuur } from '@/lib/supabase/facturen'
import { createClient } from '@/lib/supabase/server'
import { huidigPdfPad, slaFactuurPdfOp } from '@/lib/pdf/factuurPdfOpslaan'
import type { Factuur } from '@/lib/types'

/**
 * Velden die op de PDF staan. Verandert er één, dan wordt de PDF meteen opnieuw
 * opgeslagen, zodat de Dash en de map nooit uit elkaar lopen. Status, omzetdatum
 * en betaaldatum staan niet op de PDF, die wijzigen zonder nieuwe PDF.
 */
const PDF_VELDEN = ['items', 'client', 'date', 'dueDate', 'number', 'companyId', 'btwPercentage', 'molliePaymentUrl', 'layoutOverrides'] as const

export type FactuurWijziging = Parameters<typeof updateFactuur>[1]

export interface WijzigResultaat {
  factuur: Factuur
  pdf?: { ok: boolean; pdfPath?: string; oudePdfNaarPrullenbak?: string | null; indelingTeruggezet: boolean; fout?: string }
}

export async function wijzigFactuurMetPdf(id: string, body: FactuurWijziging): Promise<WijzigResultaat> {
  const raaktPdf = PDF_VELDEN.some(veld => (body as Record<string, unknown>)[veld] !== undefined)
  if (!raaktPdf) {
    return { factuur: await updateFactuur(id, body) }
  }

  const supabase = createClient()
  const vorigPdfPad = await huidigPdfPad(supabase, id)

  // De editor bewaart blokposities in millimeters vanaf de bovenkant. Komen er
  // regels bij of gaan er af, dan schuift de tabel en valt hij over het
  // betaalblok. Dan terug naar de standaardindeling, die loopt vanzelf mee.
  let indelingTeruggezet = false
  if (Array.isArray(body.items) && body.layoutOverrides === undefined) {
    const [{ data: f }, { count }] = await Promise.all([
      supabase.from('facturen').select('layout_overrides').eq('id', id).single(),
      supabase.from('factuur_line_items').select('id', { count: 'exact', head: true }).eq('factuur_id', id),
    ])
    if (f?.layout_overrides && count !== body.items.length) {
      body = { ...body, layoutOverrides: null }
      indelingTeruggezet = true
    }
  }

  const factuur = await updateFactuur(id, body)

  // De gegevens staan in Supabase, nu de PDF erachteraan. Mislukt dat, dan
  // blijft de wijziging staan maar hoort het scherm dat de PDF achterloopt.
  try {
    const { pdfPath, oudePdfNaarPrullenbak } = await slaFactuurPdfOp(supabase, id, { vorigPdfPad })
    return { factuur, pdf: { ok: true, pdfPath, oudePdfNaarPrullenbak, indelingTeruggezet } }
  } catch (e) {
    console.error(`PDF bijwerken na wijziging van factuur ${id} mislukt:`, e)
    return { factuur, pdf: { ok: false, fout: e instanceof Error ? e.message : String(e), indelingTeruggezet } }
  }
}
