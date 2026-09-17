/**
 * Eén plek die de PDF van een bestaande factuur opnieuw opslaat vanuit
 * Supabase. Gebruikt door "Wijzigingen opslaan" (PATCH /api/facturen/[id]) én
 * door de editor (regenerate-pdf), zodat de gegevens in de Dash en de PDF in de
 * map nooit meer uit elkaar lopen, welke knop je ook gebruikt.
 */
import { access, mkdir, rename, stat } from 'fs/promises'
import { homedir } from 'os'
import { basename } from 'path'
import { genereerFactuurPdf, pdfPadVoorFactuur } from '@/lib/pdf/factuurGenerator'
import { laadFactuurBouwData } from '@/lib/pdf/factuurData'
import { IS_TEST } from '@/lib/dashModus'

type SupabaseClient = ReturnType<typeof import('@/lib/supabase/server').createClient>

export interface PdfOpslagResultaat {
  pdfPath: string
  /** Oude PDF die naar de prullenbak is verplaatst, omdat hij na de wijziging op een andere plek hoort. */
  oudePdfNaarPrullenbak: string | null
}

export async function slaFactuurPdfOp(
  supabase: SupabaseClient,
  factuurId: string,
  opties: {
    /** Nieuwe blokposities uit de editor. Zonder deze wordt de opgeslagen indeling gebruikt. */
    layoutOverrides?: Record<string, number>
    /** Waar de PDF stond vóór de wijziging. Wijkt die af van het nieuwe pad, dan ruimen we hem op. */
    vorigPdfPad?: string | null
  } = {},
): Promise<PdfOpslagResultaat> {
  const { data: bouwData, error } = await laadFactuurBouwData(supabase, factuurId)
  if (!bouwData) throw new Error(error ?? 'Factuur niet gevonden')

  const { concept: _concept, bijgewerktOp: _bijgewerktOp, ...pdfData } = bouwData
  const layoutOverrides = opties.layoutOverrides ?? bouwData.layoutOverrides

  const start = Date.now()
  const { pdfPath } = await genereerFactuurPdf({ ...pdfData, layoutOverrides })

  // Chrome geeft bij een mislukte print geen foutcode terug die we zien. Kijk
  // dus zelf of er echt een verse PDF staat, anders meldt de Dash "opgeslagen"
  // terwijl de oude PDF gewoon is blijven staan.
  const info = await stat(pdfPath).catch(() => null)
  if (!info || info.mtimeMs < start - 2000) {
    throw new Error(`De PDF is niet bijgewerkt (${basename(pdfPath)}). Controleer of Google Chrome geïnstalleerd is.`)
  }

  let oudePdfNaarPrullenbak: string | null = null
  if (opties.vorigPdfPad && opties.vorigPdfPad !== pdfPath) {
    oudePdfNaarPrullenbak = await naarPrullenbak(opties.vorigPdfPad)
  }

  return { pdfPath, oudePdfNaarPrullenbak }
}

/** Het pad van de PDF zoals hij er nu voor staat, uit te rekenen vóór een wijziging. */
export async function huidigPdfPad(supabase: SupabaseClient, factuurId: string): Promise<string | null> {
  const { data: f } = await supabase
    .from('facturen')
    .select('number, client_name, client_name_bestand, date')
    .eq('id', factuurId)
    .single()
  if (!f?.number || !f.date) return null
  return pdfPadVoorFactuur({
    factuurnummer: f.number,
    klantNaamVoorBestand: f.client_name_bestand || f.client_name,
    factuurdatum: f.date,
  })
}

/**
 * Verplaatst een verouderde PDF naar de macOS-prullenbak in plaats van hem te
 * verwijderen: hij is terug te halen, maar staat niet meer als tweede versie
 * van dezelfde factuur in het archief.
 */
async function naarPrullenbak(pad: string): Promise<string | null> {
  const bestaat = await access(pad).then(() => true).catch(() => false)
  if (!bestaat) return null
  const naam = basename(pad)
  // De testversie gooit nepfacturen niet in je echte prullenbak, maar in een map in de zandbak
  const prullenbak = IS_TEST && process.env.DALEY_WERK_ROOT
    ? `${process.env.DALEY_WERK_ROOT}/../Prullenbak`
    : `${homedir()}/.Trash`
  if (IS_TEST) await mkdir(prullenbak, { recursive: true })
  let doel = `${prullenbak}/${naam}`
  if (await access(doel).then(() => true).catch(() => false)) {
    doel = `${prullenbak}/${naam.replace(/\.pdf$/i, '')} ${Date.now()}.pdf`
  }
  try {
    await rename(pad, doel)
    return pad
  } catch (e) {
    console.error('Oude factuur-PDF niet naar de prullenbak verplaatst:', pad, e)
    return null
  }
}
