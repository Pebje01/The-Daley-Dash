/**
 * Gedeelde server-side factuur-PDF generator.
 *
 * Dit is de ENIGE plek waar een factuur-PDF wordt opgebouwd en weggeschreven,
 * zodat zowel het aanmaken vanuit uren als het opnieuw opslaan vanuit de
 * factuurdetail exact dezelfde stijl en opslaglocatie gebruiken (single source
 * of truth). WGB gebruikt het PGS-stijl sjabloon (wgbFactuurHtml), de overige
 * bedrijven het generieke sjabloon hieronder.
 */
import { exec } from 'child_process'
import { IS_TEST } from '@/lib/dashModus'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { dirname } from 'path'
import { wgbLogoBase64 } from '@/lib/pdf/wgbLogo'
import { GENERIC_COMPANY_CONFIG, buildFactuurHtml } from '@/lib/pdf/factuurTemplate.mjs'
import { buildWgbFactuurHtml } from '@/lib/pdf/wgbFactuurHtml'

export type CompanyKey = 'tde' | 'daleyphotography' | 'wgb'

/** Eén factuurregel, los van of het uur- of vast werk is. */
export interface FactuurRegel {
  omschrijving: string
  detail?: string
  datum?: string        // ISO datum (YYYY-MM-DD), optioneel
  aantal: number
  prijsPerStuk: number
  perUur?: boolean      // true = toon "€x/uur" en aantal als uren
}

export interface KlantData {
  bedrijfsnaam: string
  contactpersoon?: string
  adres: string
  postcode: string
  stad: string
  klantnummer?: string
}

interface CompanyCfg {
  naam: string
  email: string
  website: string
  footer: string
  iban: string
  tenNaamVan: string
  factuurPrefix: string
  primaryColor: string
  accentBg: string
  templateFile: string
  previewFile?: string
  logoOverride?: string
  /** Maximale logohoogte in px, standaard 56. Per bedrijf, want de logo's hebben een andere verhouding. */
  logoMaxHeight?: number
  /** Maximale logobreedte in px, standaard 215. Moet meegroeien met logoMaxHeight. */
  logoMaxWidth?: number
  defaultOmschrijving: string
}

export const COMPANY_CONFIG: Record<CompanyKey, CompanyCfg> = {
  ...(GENERIC_COMPANY_CONFIG as Record<'tde' | 'daleyphotography', CompanyCfg>),
  wgb: {
    naam: 'We Grow Brands',
    email: 'hello@wegrowbrands.online',
    website: 'www.wegrowbrands.online',
    footer: 'We Grow Brands | KVK 84818883 | BTW NL004023224B90 | IBAN NL78 KNAB 0414 3949 17',
    iban: 'NL78 KNAB 0414 3949 17',
    tenNaamVan: 'Daley Jansen',
    factuurPrefix: 'F',
    primaryColor: '#03483A',
    accentBg: '#EAD7FF',
    templateFile: 'Factuur_preview.html',
    previewFile: 'WGB_Factuur_preview.html',
    logoOverride: `data:image/png;base64,${wgbLogoBase64}`,
    defaultOmschrijving: 'Werkzaamheden',
  },
}

function facturenBaseVoor(company: CompanyKey): string {
  const daleyWerkRoot = process.env.DALEY_WERK_ROOT ?? `${homedir()}/Documents/DALEY WERK`
  // In de testversie nooit ADMIN_FACTUREN_PATH: die komt uit .env.local en wijst naar de echte map
  const defaultFacturenBase = (IS_TEST ? undefined : process.env.ADMIN_FACTUREN_PATH) ?? `${daleyWerkRoot}/Bedrijf Administratie/Facturen`
  const wgbFacturenBase = `${daleyWerkRoot}/We Grow Brands/Bedrijf Administratie/Facturen`
  return company === 'wgb' ? wgbFacturenBase : defaultFacturenBase
}

/**
 * Bouwt de factuur-HTML voor een bedrijf (zonder iets weg te schrijven). Wordt
 * gebruikt door zowel `genereerFactuurPdf` (editMode uit, voor de PDF) als de
 * editor-route `/api/facturen/[id]/editor` (editMode aan, voor de sleepbare
 * weergave in de browser) zodat editor-scherm en PDF gegarandeerd dezelfde HTML
 * delen.
 */
export async function bouwFactuurHtml(params: {
  company: CompanyKey
  factuurnummer: string
  klant: KlantData
  regels: FactuurRegel[]
  factuurdatum: string
  vervaldatum: string
  betaallink?: string
  btwPercentage: number
  layoutOverrides?: Record<string, number> | null
  editMode?: boolean
  factuurId?: string
  /** Editor-stand: er is nog geen PDF, de opslaanknop maakt hem voor het eerst. */
  pdfNogNietGemaakt?: boolean
  /** Editor-stand: updated_at van de factuur, gaat mee bij opslaan tegen overschrijven van een nieuwere versie. */
  bijgewerktOp?: string | null
}): Promise<string> {
  const { company, factuurnummer, klant, regels, factuurdatum, vervaldatum, betaallink, btwPercentage, layoutOverrides, editMode = false, factuurId, pdfNogNietGemaakt = false, bijgewerktOp = null } = params
  const facturenBase = facturenBaseVoor(company)
  const cfg = COMPANY_CONFIG[company]

  if (company === 'wgb') {
    return buildWgbFactuurHtml({
      factuurnummer, klant, regels, factuurdatum, vervaldatum, betaallink, btwPercentage,
      layoutOverrides, editMode, factuurId, pdfNogNietGemaakt, bijgewerktOp,
    })
  }

  // Fonts en logo's zitten ingebed in de gedeelde module (cfg.logoOverride).
  // Als terugval lezen we het logo uit het template-bestand, maar dat is alleen
  // een vangnet: dat bestand wordt bij elke generatie overschreven, dus een logo
  // dat daar één keer niet uit te lezen valt, is daarna definitief weg.
  let logoSrc = cfg.logoOverride
  if (!logoSrc) {
    const templateHtml = await readFile(`${facturenBase}/${cfg.templateFile}`, 'utf-8')
    logoSrc = templateHtml.match(/class="logo"[^>]*src="([^"]+)"/)?.[1]
    if (!logoSrc || logoSrc === 'undefined') {
      throw new Error(`Geen logo gevonden voor ${cfg.naam}. Zet het logo vast in lib/pdf als data-URI in plaats van het uit ${cfg.templateFile} te lezen.`)
    }
  }
  return buildFactuurHtml({
    cfg, factuurnummer, klant, regels, factuurdatum, vervaldatum, betaallink, btwPercentage, logoSrc,
    layoutOverrides, editMode, factuurId, pdfNogNietGemaakt, bijgewerktOp,
  })
}

/**
 * Waar de PDF van een factuur in het archief staat: kwartaalmap op basis van de
 * factuurdatum, bestandsnaam uit nummer plus korte klantnaam. Los uitgeschreven
 * zodat je ook kunt uitrekenen waar de PDF stond vóór een wijziging.
 */
export function pdfPadVoorFactuur(p: { factuurnummer: string; klantNaamVoorBestand: string; factuurdatum: string }): string {
  const daleyWerkRoot = process.env.DALEY_WERK_ROOT ?? `${homedir()}/Documents/DALEY WERK`
  const datumDate = new Date(`${p.factuurdatum}T12:00:00`)
  const year = datumDate.getFullYear()
  const quarter = Math.ceil((datumDate.getMonth() + 1) / 3)
  return `${daleyWerkRoot}/Bedrijf Administratie/Verkoopfacturen/${year}-Q${quarter}/${p.factuurnummer} ${p.klantNaamVoorBestand}.pdf`
}

/**
 * Bouwt de factuur-HTML, rendert die met Chrome headless naar een PDF en slaat
 * die op in het verkoopfacturen-archief. Geeft het pad terug.
 * Dit is de gedeelde route voor zowel aanmaken-vanuit-uren als opnieuw-opslaan.
 */
export async function genereerFactuurPdf(params: {
  company: CompanyKey
  factuurnummer: string
  klant: KlantData
  klantNaamVoorBestand: string
  regels: FactuurRegel[]
  factuurdatum: string
  vervaldatum: string
  betaallink?: string
  btwPercentage: number
  /** Bewaarde blok-posities (mm) uit de sleepbare editor, of null/undefined voor standaard-layout. */
  layoutOverrides?: Record<string, number> | null
}): Promise<{ pdfPath: string }> {
  const { company, factuurnummer, klant, klantNaamVoorBestand, regels, factuurdatum, vervaldatum, betaallink, btwPercentage, layoutOverrides } = params

  const cfg = COMPANY_CONFIG[company]

  // Chrome print vanaf een bestand, dus we moeten de HTML ergens neerzetten. Dat
  // gebeurt in een cachemap en niet meer in het factuurarchief: daar horen alleen
  // PDF's te staan, geen werkbestanden.
  const werkMap = `${homedir()}/Library/Caches/daley-dash`
  await mkdir(werkMap, { recursive: true })
  const previewPath = `${werkMap}/${cfg.previewFile ?? cfg.templateFile}`

  const html = await bouwFactuurHtml({
    company, factuurnummer, klant, regels, factuurdatum, vervaldatum, betaallink, btwPercentage, layoutOverrides,
  })

  await writeFile(previewPath, html, 'utf-8')

  const pdfPath = pdfPadVoorFactuur({ factuurnummer, klantNaamVoorBestand, factuurdatum })
  await mkdir(dirname(pdfPath), { recursive: true })

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  await new Promise<void>((resolve) => {
    exec(`"${chromePath}" --headless=new --disable-gpu --no-margins --virtual-time-budget=10000 --run-all-compositor-stages-before-draw --print-to-pdf="${pdfPath}" --no-pdf-header-footer "file://${previewPath}"`, () => resolve())
  })

  return { pdfPath }
}
