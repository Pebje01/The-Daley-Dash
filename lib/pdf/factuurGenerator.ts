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
  tde: {
    naam: 'The Daley Edit',
    email: 'hello@thedaleyedit.nl',
    website: 'www.thedaleyedit.nl',
    footer: 'The Daley Edit | KVK 84818883 | BTW NL004023224B90 | IBAN NL78 KNAB 0414 3949 17',
    iban: 'NL78 KNAB 0414 3949 17',
    tenNaamVan: 'Daley Jansen',
    factuurPrefix: 'F',
    primaryColor: '#4400aa',
    accentBg: '#ede8f8',
    templateFile: 'TDE_Factuur_preview.html',
    defaultOmschrijving: 'Werkzaamheden',
  },
  daleyphotography: {
    naam: 'Daley Photography',
    email: 'hello@daleyphotography.nl',
    website: 'www.daleyphotography.nl',
    footer: 'Daley Photography is onderdeel van The Daley Edit &amp; We Grow Brands | KVK 84818883 | BTW NL004023224B90 | IBAN NL78 KNAB 0414 3949 17',
    iban: 'NL78 KNAB 0414 3949 17',
    tenNaamVan: 'Daley Jansen',
    factuurPrefix: 'F',
    primaryColor: '#4400aa',
    accentBg: '#ede8f8',
    templateFile: 'Factuur_preview.html',
    defaultOmschrijving: 'Fotografie werkzaamheden',
  },
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

function euroFormat(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function formatDate(isoDate: string): string {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Generiek (niet-WGB) sjabloon ─────────────────────────────────────────────
function buildFactuurHtml(opts: {
  fontFaceBlock: string
  logoSrc: string
  factuurnummer: string
  company: CompanyKey
  klant: KlantData
  regels: FactuurRegel[]
  factuurdatum: string
  vervaldatum: string
  betaallink?: string
  btwPercentage: number
}): string {
  const { fontFaceBlock, logoSrc, factuurnummer, company, klant, regels, factuurdatum, vervaldatum, betaallink, btwPercentage } = opts
  const cfg = COMPANY_CONFIG[company]
  const pc = cfg.primaryColor
  const ab = cfg.accentBg

  const subtotaal = regels.reduce((s, r) => s + r.aantal * r.prijsPerStuk, 0)
  const btw = subtotaal * (btwPercentage / 100)
  const totaal = subtotaal + btw
  const vervaldatumTekst = formatDate(vervaldatum)

  const itemRijen = regels.map(r => {
    const sub = r.aantal * r.prijsPerStuk
    const aantalTekst = r.perUur ? r.aantal.toFixed(2) : (Number.isInteger(r.aantal) ? String(r.aantal) : r.aantal.toFixed(2))
    const prijsTekst = euroFormat(r.prijsPerStuk) + (r.perUur ? '/uur' : '')
    const subRegel = r.datum ? formatDate(r.datum) : (r.detail ?? '')
    return `
      <tr>
        <td class="item-name">${r.omschrijving || cfg.defaultOmschrijving}${subRegel ? `<span class="item-sub-desc" style="color:${pc}99">${subRegel}</span>` : ''}</td>
        <td class="item-price">${prijsTekst}</td>
        <td class="item-qty">${aantalTekst}</td>
        <td class="item-subtotal">${euroFormat(sub)}</td>
      </tr>`
  }).join('\n')

  const css = `
${fontFaceBlock}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Arial,sans-serif;font-size:9pt;color:#1a1a2e;line-height:1.45}
.action-bar{position:fixed;top:0;left:0;right:0;height:44px;background:#1a0044;display:flex;align-items:center;gap:14px;padding:0 20px;z-index:999}
.action-bar button{background:white;color:#1a0044;border:none;border-radius:4px;padding:5px 14px;font-weight:700;font-size:9pt;cursor:pointer}
.action-bar span{color:rgba(255,255,255,.75);font-size:8.5pt}
@media print{.action-bar{display:none!important}}
.page{width:210mm;min-height:297mm;padding:14mm 14mm 12mm;margin:44px auto 0;display:flex;flex-direction:column}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4mm}
.header-left h1{font-size:21pt;font-weight:900;letter-spacing:.06em;color:${pc};line-height:1}
.factuurnr-sub{font-size:8pt;color:#aaa;margin-top:3px}
.logo{max-height:38px;max-width:130px;object-fit:contain;display:block}
.sep1{border:none;border-top:2px solid ${pc}33;margin:3mm 0}
.sep2{border:none;border-top:1px solid #e4e0f0;margin:2.5mm 0}
.addresses{display:grid;grid-template-columns:1fr 1fr;gap:6mm;font-size:8.5pt;line-height:1.6;margin-bottom:3mm}
.company,.title{font-weight:700;font-size:9pt;color:${pc};margin-bottom:1px}
.label{color:${pc};font-weight:600}
.details{display:flex;gap:8mm;flex-wrap:wrap;margin-bottom:3mm}
.detail-label{font-size:7pt;text-transform:uppercase;letter-spacing:.07em;color:#bbb}
.detail-value{font-weight:700;font-size:8.5pt;color:${pc};margin-top:1px}
.table-wrap{flex:1;margin-bottom:3mm}
table{width:100%;border-collapse:collapse;font-size:8.5pt}
thead th{background:${ab};color:${pc};font-weight:700;font-size:7.5pt;text-transform:uppercase;letter-spacing:.05em;padding:5px 8px;text-align:left}
tbody td{border-bottom:1px solid #f0eef8;padding:5px 8px;vertical-align:top}
.item-name{width:50%}
.item-price,.item-qty{text-align:right;white-space:nowrap;color:#666}
.item-subtotal{text-align:right;white-space:nowrap;font-weight:700}
.item-sub-desc{display:block;font-size:7.5pt;color:#999;font-weight:400;margin-top:2px;line-height:1.4}
.totals{display:flex;flex-direction:column;align-items:flex-end;gap:3px;margin-bottom:3mm;font-size:8.5pt}
.totals .row{display:flex;justify-content:space-between;min-width:190px;gap:20px}
.totals .label{color:#666}
.totals .value{font-weight:600}
.totals .line{width:190px;border-top:1px solid #ccc;margin:2px 0}
.totals .total-row .label,.totals .total-row .value{font-size:10.5pt;font-weight:900;color:${pc}}
.banner{background:${ab};border-left:3px solid ${pc};padding:7px 12px;font-size:8.5pt;color:${pc};margin-bottom:3mm}
.betaalinfo{font-size:8pt;color:#555;font-style:italic;line-height:1.6;margin-bottom:2mm}
.ideal-btn{display:inline-flex;align-items:center;gap:7px;margin-top:5px;padding:7px 16px;background:${pc};color:white;font-weight:700;font-size:9pt;font-style:normal;border-radius:6px;text-decoration:none}
.ideal-btn svg{width:16px;height:16px}
.footer{margin-top:auto;padding-top:3mm;border-top:1px solid #e4e0f0;display:flex;justify-content:space-between;font-size:7pt;color:#bbb}`

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>${factuurnummer} | ${klant.bedrijfsnaam}</title>
<style>${css}</style>
</head>
<body>

<div class="action-bar">
  <button onclick="window.print()">Opslaan als PDF</button>
  <span>${factuurnummer} | ${klant.bedrijfsnaam}</span>
</div>

<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>FACTUUR</h1>
      <div class="factuurnr-sub">${factuurnummer}</div>
    </div>
    <img class="logo" src="${logoSrc}" alt="${cfg.naam} logo">
  </div>

  <hr class="sep1">

  <div class="addresses">
    <div class="client-address">
      <div class="company">${klant.bedrijfsnaam}</div>
      ${klant.contactpersoon ? `t.a.v. ${klant.contactpersoon}<br>` : ''}
      ${klant.adres}<br>
      ${klant.postcode} ${klant.stad}
    </div>
    <div class="my-address">
      <div class="title">${cfg.naam} | Daley Jansen</div>
      Noorderpad 47<br>
      1461 CD Zuidoostbeemster<br>
      <span class="label">E</span> ${cfg.email}<br>
      <span class="label">Web</span> ${cfg.website}
    </div>
  </div>

  <hr class="sep2">

  <div class="details">
    <div class="detail"><div class="detail-label">Datum</div><div class="detail-value">${formatDate(factuurdatum)}</div></div>
    <div class="detail"><div class="detail-label">Vervaldatum</div><div class="detail-value">${vervaldatumTekst}</div></div>
    <div class="detail"><div class="detail-label">Factuurnummer</div><div class="detail-value">${factuurnummer}</div></div>
    ${klant.klantnummer ? `<div class="detail"><div class="detail-label">Klantnummer</div><div class="detail-value">${klant.klantnummer}</div></div>` : ''}
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr><th style="width:50%">Product / Dienst</th><th>Prijs</th><th>Aantal</th><th>Subtotaal</th></tr>
      </thead>
      <tbody>${itemRijen}</tbody>
    </table>
  </div>

  <div class="totals">
    <div class="row"><span class="label">Totaal excl. BTW</span><span class="value">${euroFormat(subtotaal)}</span></div>
    <div class="row"><span class="label">${btwPercentage}% BTW</span><span class="value">${euroFormat(btw)}</span></div>
    <div class="line"></div>
    <div class="row total-row"><span class="label">Totaal incl. BTW</span><span class="value">${euroFormat(totaal)}</span></div>
  </div>

  <div class="banner">Bedankt voor je vertrouwen in ${cfg.naam}. Vragen over deze factuur? Neem gerust contact op.</div>

  <div class="betaalinfo">
    Gelieve het bedrag te voldoen voor ${vervaldatumTekst} via IBAN ${cfg.iban} t.n.v. ${cfg.tenNaamVan}, onder vermelding van factuurnummer ${factuurnummer}.${betaallink ? `
    <br><a class="ideal-btn" href="${betaallink}" target="_blank">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" stroke="white" stroke-width="1.5"/><path d="M8 12.5l3 3 5-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Betaal direct via iDEAL
    </a>` : ''}
  </div>

  <div class="footer"><span>${cfg.footer}</span><span>${factuurnummer}</span></div>
</div>
</body>
</html>`
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
    const templatePath = `${facturenBase}/${cfg.templateFile}`
    const templateHtml = await readFile(templatePath, 'utf-8')
    const styleContent = (templateHtml.match(/<style>([\s\S]*?)<\/style>/) ?? [])[1] ?? ''
    const fontFaceBlock = (styleContent.match(/@font-face\s*\{[^}]+\}/g) ?? []).join('\n')
    const logoMatch = templateHtml.match(/class="logo"[^>]*src="([^"]+)"/)
    const logoSrc = cfg.logoOverride ?? logoMatch?.[1]
    if (!logoSrc) throw new Error('Kan logo niet vinden in template')
    html = buildFactuurHtml({
      fontFaceBlock, logoSrc, factuurnummer, company, klant, regels, factuurdatum, vervaldatum, betaallink, btwPercentage,
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
