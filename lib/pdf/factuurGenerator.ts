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
import { readFile, writeFile, mkdir } from 'fs/promises'
import { homedir } from 'os'
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
}): Promise<string> {
  const { company, factuurnummer, klant, klantNaamVoorBestand, regels, factuurdatum, vervaldatum, betaallink, btwPercentage } = params

  const daleyWerkRoot = process.env.DALEY_WERK_ROOT ?? `${homedir()}/Documents/DALEY WERK`
  const defaultFacturenBase = process.env.ADMIN_FACTUREN_PATH ?? `${daleyWerkRoot}/Bedrijf Administratie/Facturen`
  const wgbFacturenBase = `${daleyWerkRoot}/We Grow Brands/Bedrijf Administratie/Facturen`
  const facturenBase = company === 'wgb' ? wgbFacturenBase : defaultFacturenBase
  const cfg = COMPANY_CONFIG[company]
  const previewPath = `${facturenBase}/${cfg.previewFile ?? cfg.templateFile}`

  let html: string
  if (company === 'wgb') {
    html = buildWgbFactuurHtml({
      factuurnummer,
      klant,
      regels,
      factuurdatum,
      vervaldatum,
      betaallink,
      btwPercentage,
    })
  } else {
    // Fonts zitten ingebed in de gedeelde module. Het logo komt uit cfg.logoOverride
    // (TDE); bedrijven zonder override (Daley Photography) lezen hun eigen logo uit
    // hun template-bestand.
    let logoSrc = cfg.logoOverride
    if (!logoSrc) {
      const templateHtml = await readFile(`${facturenBase}/${cfg.templateFile}`, 'utf-8')
      logoSrc = templateHtml.match(/class="logo"[^>]*src="([^"]+)"/)?.[1]
    }
    html = buildFactuurHtml({
      cfg, factuurnummer, klant, regels, factuurdatum, vervaldatum, betaallink, btwPercentage, logoSrc,
    })
  }

  await writeFile(previewPath, html, 'utf-8')

  const datumDate = new Date(`${factuurdatum}T12:00:00`)
  const year = datumDate.getFullYear()
  const quarter = Math.ceil((datumDate.getMonth() + 1) / 3)
  const verkoopfacturenBase = `${daleyWerkRoot}/Bedrijf Administratie/Verkoopfacturen`
  const pdfDir = `${verkoopfacturenBase}/${year}-Q${quarter}`
  const pdfPath = `${pdfDir}/${factuurnummer} ${klantNaamVoorBestand}.pdf`
  await mkdir(pdfDir, { recursive: true })

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  await new Promise<void>((resolve) => {
    exec(`"${chromePath}" --headless=new --disable-gpu --no-margins --virtual-time-budget=10000 --run-all-compositor-stages-before-draw --print-to-pdf="${pdfPath}" --no-pdf-header-footer "file://${previewPath}"`, () => resolve())
  })

  return pdfPath
}
