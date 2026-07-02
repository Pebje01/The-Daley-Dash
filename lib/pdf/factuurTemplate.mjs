/**
 * ENIGE bron van het generieke factuur-ontwerp (The Daley Edit / Daley Photography).
 *
 * Zowel The Daley Dash (lib/pdf/factuurGenerator.ts) als het losse skill-CLI
 * (scripts/genereer-factuur.mjs) gebruiken deze module, zodat er letterlijk
 * één opmaak bestaat en die niet uit elkaar kan lopen. WGB heeft een eigen
 * sjabloon (wgbFactuurHtml).
 *
 * Plain ESM (geen TypeScript) zodat ook `node` het rechtstreeks kan draaien.
 */
import { factuurFontFace } from './factuurFonts.mjs'
import { tdeLogoBase64 } from './tdeLogo.mjs'

export function euroFormat(n) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

export function formatDate(isoDate) {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

/** Config voor de bedrijven die het generieke sjabloon delen. */
export const GENERIC_COMPANY_CONFIG = {
  tde: {
    naam: 'The Daley Edit',
    email: 'hello@thedaleyedit.nl',
    website: 'www.thedaleyedit.nl',
    footer: 'The Daley Edit | Daley Photography | We Grow Brands | KVK 84818883 | BTW NL004023224B90 | IBAN NL78 KNAB 0414 3949 17',
    iban: 'NL78 KNAB 0414 3949 17',
    tenNaamVan: 'Daley Jansen',
    factuurPrefix: 'F',
    primaryColor: '#4400aa',
    accentBg: '#ede8f8',
    templateFile: 'TDE_Factuur_preview.html',
    logoOverride: `data:image/png;base64,${tdeLogoBase64}`,
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
    // Geen logoOverride: Daley Photography houdt z'n eigen logo uit Factuur_preview.html.
    defaultOmschrijving: 'Fotografie werkzaamheden',
  },
}

/**
 * Bouwt de factuur-HTML in de huisstijl-opmaak.
 * @param {object} opts
 * @param {object} opts.cfg              bedrijfsconfig (uit GENERIC_COMPANY_CONFIG)
 * @param {string} opts.factuurnummer
 * @param {object} opts.klant            { bedrijfsnaam, contactpersoon?, adres, postcode, stad, klantnummer? }
 * @param {Array}  opts.regels           [{ omschrijving, detail?, datum?, aantal, prijsPerStuk, perUur? }]
 * @param {string} opts.factuurdatum     ISO (YYYY-MM-DD)
 * @param {string} opts.vervaldatum      ISO (YYYY-MM-DD)
 * @param {string} [opts.betaallink]     Knab betaalverzoek URL (optioneel)
 * @param {number} opts.btwPercentage
 * @param {string} [opts.fontFaceBlock]  standaard de ingebedde huisstijl-fonts
 * @param {string} [opts.logoSrc]        standaard cfg.logoOverride
 */
export function buildFactuurHtml(opts) {
  const {
    cfg, factuurnummer, klant, regels, factuurdatum, vervaldatum, betaallink, btwPercentage,
    fontFaceBlock = factuurFontFace,
    logoSrc = cfg.logoOverride,
  } = opts
  const pc = cfg.primaryColor

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
        <td class="item-name">${r.omschrijving || cfg.defaultOmschrijving}${subRegel ? `<span class="item-sub-desc">${subRegel}</span>` : ''}</td>
        <td class="item-price">${prijsTekst}</td>
        <td class="item-qty">${aantalTekst}</td>
        <td class="item-subtotal">${euroFormat(sub)}</td>
      </tr>`
  }).join('\n')

  // Huisstijl-tokens (mooie template): hoofdpaars = pc (#4400aa), donker navy, en
  // lichtpaarse accenten voor tabelkop, lijnen en banner.
  const navy = '#1a0044'
  const tableHead = '#c5b0e8'
  const lineSoft = '#c0a8e8'
  const bannerBg = '#f3edfb'
  const labelPurple = '#8855cc'
  const linkPurple = '#9955dd'

  const css = `
${fontFaceBlock}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
body{font-family:'Athletics',-apple-system,Arial,sans-serif;font-size:9.5pt;color:#333;line-height:1.45}
.action-bar{position:fixed;top:0;left:0;right:0;height:44px;background:${navy};display:flex;align-items:center;gap:14px;padding:0 20px;z-index:999}
.action-bar button{background:white;color:${navy};border:none;border-radius:4px;padding:5px 14px;font-weight:700;font-size:9pt;cursor:pointer;font-family:'Athletics',sans-serif}
.action-bar span{color:rgba(255,255,255,.75);font-size:8.5pt}
@media print{.action-bar{display:none!important}.page{margin-top:0!important}}
.page{width:210mm;min-height:297mm;padding:13mm 13mm 11mm;margin:44px auto 0;display:flex;flex-direction:column}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3.5mm}
.header-left h1{font-family:'PolysansWide','Athletics',sans-serif;font-weight:500;font-size:26pt;letter-spacing:1px;color:${pc};line-height:1}
.factuurnr-sub{font-family:'Athletics',sans-serif;font-size:10.5pt;color:#999;margin-top:2px}
.logo{max-height:56px;max-width:215px;object-fit:contain;display:block;margin-top:1mm}
.sep1{border:none;border-top:1px solid ${lineSoft};margin:3mm 0}
.sep2{border:none;border-top:1px solid ${lineSoft};margin:2.5mm 0}
.addresses{display:grid;grid-template-columns:1fr 1fr;gap:8mm;line-height:1.5;margin-bottom:3mm}
.client-address{font-size:9.5pt}
.client-address .company{font-weight:700;font-size:10pt;color:${navy};margin-bottom:1px}
.my-address{font-size:8.5pt;line-height:1.55}
.my-address .title{font-weight:700;font-size:10pt;color:${navy};margin-bottom:2px}
.my-address .label{color:${labelPurple};font-weight:500;display:inline-block;width:34px}
.my-address a{color:${linkPurple};text-decoration:none}
.details{display:flex;gap:0;margin-bottom:3mm}
.details .detail{flex:1}
.detail-label{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${labelPurple};margin-bottom:2px}
.detail-value{font-size:9.5pt;color:#333}
.table-wrap{margin-bottom:3.5mm}
table{width:100%;border-collapse:collapse}
thead th{background:${tableHead};color:${navy};font-weight:700;font-size:7.5pt;text-transform:uppercase;letter-spacing:.8px;padding:6px 8px;text-align:left}
thead th:nth-child(n+2){text-align:right}
tbody td{border-bottom:1px solid #efe9f8;padding:4.5px 8px;vertical-align:top}
.item-name{width:50%;font-weight:700;color:${navy};font-size:10pt}
.item-price,.item-qty{text-align:right;white-space:nowrap;font-size:9.5pt;color:#555}
.item-subtotal{text-align:right;white-space:nowrap;font-size:9.5pt;font-weight:700;color:${navy}}
.item-sub-desc{display:block;font-size:7.5pt;color:#888;font-weight:400;font-style:italic;margin-top:1px;line-height:1.4}
.totals{margin-left:auto;width:78mm;margin-bottom:3.5mm;font-size:9.5pt}
.totals .row{display:flex;justify-content:space-between;gap:20px;margin-bottom:3px}
.totals .label{color:#666}
.totals .value{font-weight:600;text-align:right}
.totals .line{border-top:1px solid ${pc};margin:3px 0}
.totals .total-row .label,.totals .total-row .value{font-size:11.5pt;font-weight:700;color:${navy}}
.banner{background:${bannerBg};border-left:3px solid ${pc};padding:8px 12px;font-size:8.5pt;color:${pc};margin-bottom:2.5mm}
.betaalinfo{font-size:8pt;color:#555;font-style:italic;line-height:1.55;margin-bottom:2.5mm}
.ideal-btn{display:inline-flex;align-items:center;gap:8px;margin-top:7px;padding:7px 16px;background:${pc};color:white;font-family:'Athletics',sans-serif;font-weight:700;font-size:9pt;font-style:normal;letter-spacing:.3px;border-radius:6px;text-decoration:none}
.ideal-btn svg{width:16px;height:16px}
.footer{margin-top:auto;padding-top:3mm;border-top:1px solid ${lineSoft};display:flex;justify-content:space-between;font-size:7pt;color:#aaa}`

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
