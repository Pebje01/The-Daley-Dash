/**
 * WGB factuur-HTML voor de uren-flow.
 *
 * Layout is gelijkgetrokken met de reguliere PGS-stijl factuur:
 *  - Afzendergegevens rechtsboven onder het logo
 *  - Klantlabel "Klant"
 *  - Tabel met aparte Datum-kolom: Omschrijving | Datum | Aantal | Prijs excl. | Totaal excl.
 *  - Numerieke datums (DD-MM-JJJJ)
 */

import { wgbLogoHorizontalBase64 } from './wgbLogoHorizontal'

export interface WgbRegel {
  omschrijving: string
  detail?: string
  datum?: string
  aantal: number
  prijsPerStuk: number
  perUur?: boolean
}

function euro(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

/** Numerieke datum DD-MM-JJJJ, zoals op de reguliere facturen. */
function datumKort(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`
}

export function buildWgbFactuurHtml(opts: {
  logoSrc?: string
  factuurnummer: string
  klant: {
    bedrijfsnaam: string
    contactpersoon?: string
    adres: string
    postcode: string
    stad: string
    klantnummer?: string
  }
  regels: WgbRegel[]
  factuurdatum: string
  vervaldatum: string
  betaallink?: string
  btwPercentage: number
}): string {
  const { factuurnummer, klant, regels, factuurdatum, vervaldatum, betaallink, btwPercentage } = opts
  const logoSrc = `data:image/png;base64,${wgbLogoHorizontalBase64}`

  const subtotaal = regels.reduce((s, r) => s + r.aantal * r.prijsPerStuk, 0)
  const btw = subtotaal * (btwPercentage / 100)
  const totaal = subtotaal + btw
  const vervaldatumTekst = datumKort(vervaldatum)

  // Eén weergave voor alle regels: altijd het werkelijke aantal x prijs.
  // perUur voegt "/uur" toe en toont het aantal met 2 decimalen.
  const itemRijen = regels.map(r => {
    const sub = r.aantal * r.prijsPerStuk
    const aantalTekst = r.perUur ? r.aantal.toFixed(2) : (Number.isInteger(r.aantal) ? String(r.aantal) : r.aantal.toFixed(2))
    const prijsTekst = euro(r.prijsPerStuk) + (r.perUur ? '/uur' : '')
    return `
      <tr>
        <td class="item-name">${r.omschrijving || 'Werkzaamheden'}${r.detail ? `<span class="item-sub">${r.detail}</span>` : ''}</td>
        <td class="col-datum">${r.datum ? datumKort(r.datum) : '—'}</td>
        <td>${aantalTekst}</td>
        <td>${prijsTekst}</td>
        <td>${euro(sub)}</td>
      </tr>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>${factuurnummer} ${klant.bedrijfsnaam}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:0}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:9pt;color:#222;line-height:1.45;background:#f0f0f0}
.save-bar{position:fixed;top:0;left:0;right:0;background:#03483A;padding:10px 20px;display:flex;align-items:center;gap:16px;z-index:1000}
.save-bar button{background:#F7F3ED;color:#03483A;border:none;padding:7px 18px;font-weight:700;font-size:9pt;border-radius:5px;cursor:pointer}
.save-bar span{color:#fff;font-size:9pt;opacity:.8}
@media print{.save-bar{display:none!important}body{background:white}.page{margin-top:0!important;box-shadow:none!important}}
.page{width:210mm;min-height:297mm;background:#fff;margin:60px auto 20px;box-shadow:0 4px 24px rgba(0,0,0,.12);display:flex;flex-direction:column}
.hero{background:#03483A;height:65mm;flex-shrink:0;display:flex;align-items:flex-start;justify-content:space-between;padding:14mm 13mm 0 13mm}
.hero-left{display:flex;flex-direction:column}
.hero-title{font-family:'Instrument Serif',Georgia,serif;font-size:28pt;color:#fff;letter-spacing:.5px;line-height:1}
.hero-number{font-size:10pt;color:rgba(255,255,255,.65);letter-spacing:.3px;margin-top:3mm}
.hero-right{display:flex;flex-direction:column;align-items:flex-end}
.hero-logo{width:52mm;height:auto;object-fit:contain;flex-shrink:0}
.hero-sender{font-size:7pt;color:rgba(255,255,255,.8);line-height:1.6;margin-top:7mm;text-align:right}
.hero-sender strong{color:#fff;font-size:8.5pt;font-weight:600;display:block;margin-bottom:1mm}
.content{padding:0 13mm 12mm;display:flex;flex-direction:column;flex:1}
.row2{display:grid;grid-template-columns:1fr 112mm;gap:6mm;margin:8mm 0 0;align-items:flex-start}
.client{font-size:9pt;color:#2a2a2a;line-height:1.7}
.client-lbl{font-size:7pt;color:#0A5C4A;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2mm}
.client-name{font-weight:700;font-size:10.5pt;color:#03483A;margin-bottom:1mm}
.details{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}
.d-lbl{font-size:7pt;color:#0A5C4A;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1.5mm}
.d-val{font-size:9pt;color:#2a2a2a;font-weight:500;line-height:1.3}
hr.sep{border:none;border-top:1px solid #d8d0c0;margin:6mm 0 4mm}
.tw{flex:1;margin-bottom:3mm}
table{width:100%;border-collapse:collapse;font-size:9pt}
thead tr{background:#EAD7FF}
thead th{padding:3mm;text-align:left;font-size:7.5pt;font-weight:700;color:#03483A;text-transform:uppercase;letter-spacing:.4px}
thead th:nth-child(3),thead th:nth-child(4),thead th:last-child{text-align:right}
tbody tr{border-bottom:.5px solid #ede8e0}
tbody td{padding:3mm;vertical-align:top}
.item-name{color:#03483A;font-weight:600;font-size:9.5pt;line-height:1.35}
.item-sub{display:block;font-size:7.5pt;color:#888;font-weight:400;font-style:italic;margin-top:.8mm;line-height:1.5}
.col-datum{color:#555;white-space:nowrap}
tbody td:nth-child(3),tbody td:nth-child(4),tbody td:last-child{text-align:right;white-space:nowrap;font-weight:500;color:#333}
.totals{margin-left:auto;width:78mm;margin-bottom:6mm;font-size:9pt}
.t-row{display:flex;justify-content:space-between;gap:20px;padding:2.5mm 0;border-bottom:1px solid #e3dfd2}
.t-lbl{color:#555}
.t-val{font-weight:600;color:#222}
.t-total{border-bottom:none;border-top:1.5px solid #03483A;padding-top:3mm;margin-top:1mm}
.t-total .t-lbl,.t-total .t-val{font-size:11pt;font-weight:800;color:#03483A}
.banner{display:inline-block;background:#F7F3ED;border-left:3px solid #03483A;padding:7px 12px;font-size:9.5pt;color:#03483A;margin-bottom:5mm}
.betaalinfo{font-size:8.5pt;color:#555;font-style:italic;line-height:1.6;margin-bottom:2mm}
.betaalinfo strong{color:#03483A;font-style:normal}
.ideal-btn{display:inline-flex;align-items:center;gap:8px;margin-top:3mm;padding:7px 16px;background:#03483A;color:white;font-weight:700;font-size:9pt;font-style:normal;border-radius:6px;text-decoration:none}
.ideal-btn svg{width:16px;height:16px}
.footer{margin-top:auto;padding-top:3mm;border-top:1px solid #d8d0c0;display:flex;justify-content:space-between;font-size:7pt;color:#bbb}
</style>
</head>
<body>

<div class="save-bar">
  <button onclick="window.print()">Opslaan als PDF</button>
  <span>${factuurnummer} | ${klant.bedrijfsnaam}</span>
</div>

<div class="page">
  <div class="hero">
    <div class="hero-left">
      <div class="hero-title">FACTUUR</div>
      <div class="hero-number">${factuurnummer}</div>
    </div>
    <div class="hero-right">
      <img class="hero-logo" src="${logoSrc}" alt="We Grow Brands logo">
      <div class="hero-sender">
        <strong>We Grow Brands</strong>
        Daley Jansen<br>
        Noorderpad 47, 1461 CD Zuidoostbeemster<br>
        hello@wegrowbrands.online<br>
        06 36 16 26 39
      </div>
    </div>
  </div>

  <div class="content">
    <div class="row2">
      <div class="client">
        <div class="client-lbl">Klant</div>
        <div class="client-name">${klant.bedrijfsnaam}</div>
        ${klant.contactpersoon ? `t.a.v. ${klant.contactpersoon}<br>` : ''}
        ${klant.adres}<br>
        ${klant.postcode} ${klant.stad}
      </div>
      <div class="details">
        <div>
          <div class="d-lbl">Datum</div>
          <div class="d-val">${datumKort(factuurdatum)}</div>
        </div>
        <div>
          <div class="d-lbl">Vervaldatum</div>
          <div class="d-val">${vervaldatumTekst}</div>
        </div>
        <div>
          <div class="d-lbl">Factuurnummer</div>
          <div class="d-val">${factuurnummer}</div>
        </div>
        ${klant.klantnummer ? `<div><div class="d-lbl">Klantnummer</div><div class="d-val">${klant.klantnummer}</div></div>` : ''}
      </div>
    </div>

    <hr class="sep">

    <div class="tw">
      <table>
        <thead>
          <tr>
            <th style="width:42%">Omschrijving</th>
            <th>Datum</th>
            <th>Aantal</th>
            <th>Prijs excl.</th>
            <th>Totaal excl.</th>
          </tr>
        </thead>
        <tbody>${itemRijen}</tbody>
      </table>
    </div>

    <div class="totals">
      <div class="t-row"><span class="t-lbl">Subtotaal excl. BTW</span><span class="t-val">${euro(subtotaal)}</span></div>
      <div class="t-row"><span class="t-lbl">BTW ${btwPercentage}%</span><span class="t-val">${euro(btw)}</span></div>
      <div class="t-row t-total"><span class="t-lbl">Totaal incl. BTW</span><span class="t-val">${euro(totaal)}</span></div>
    </div>

    <div class="banner">Bedankt voor deze opdracht!</div>

    <div class="betaalinfo">
      Gelieve het bedrag van <strong>${euro(totaal)}</strong> te voldoen voor <strong>${vervaldatumTekst}</strong> via IBAN <strong>NL78 KNAB 0414 3949 17</strong><br>
      t.n.v. Daley Jansen, onder vermelding van factuurnummer <strong>${factuurnummer}</strong>.${betaallink ? `
      <br><a class="ideal-btn" href="${betaallink}" target="_blank">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" stroke="white" stroke-width="1.5"/><path d="M8 12.5l3 3 5-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Betaal direct via iDEAL
      </a>` : ''}
    </div>

    <div class="footer">
      <span>We Grow Brands is onderdeel van The Daley Edit | KVK 84818883 | BTW NL004023224B90 | IBAN NL78 KNAB 0414 3949 17</span>
      <span>${factuurnummer}</span>
    </div>
  </div>
</div>
<script>
(function(){
  function fit(){
    var page=document.querySelector('.page'); if(!page) return;
    var target=parseFloat(getComputedStyle(page).minHeight); // 297mm in px
    var PX=3.7795; // px per mm @96dpi
    function over(){ return page.offsetHeight > target + 2; }
    if(!over()) return; // past al op 1 A4: niets aanpassen
    // Stap 1: rij-padding inknijpen (3mm -> 0.8mm)
    var tds=[].slice.call(document.querySelectorAll('tbody td'));
    var pad=3*PX;
    while(over() && pad>0.8*PX){ pad-=0.4*PX; tds.forEach(function(t){ t.style.paddingTop=pad+'px'; t.style.paddingBottom=pad+'px'; }); }
    // Stap 2: regel-lettergrootte iets verkleinen indien nog nodig
    var names=[].slice.call(document.querySelectorAll('.item-name'));
    var subs=[].slice.call(document.querySelectorAll('.item-sub'));
    var nf=9.5, sf=7.5;
    while(over() && nf>8){ nf-=0.3; sf=Math.max(6.4,sf-0.25);
      names.forEach(function(n){ n.style.fontSize=nf+'pt'; n.style.lineHeight='1.2'; });
      subs.forEach(function(s){ s.style.fontSize=sf+'pt'; s.style.lineHeight='1.3'; }); }
  }
  if(document.fonts&&document.fonts.ready){ document.fonts.ready.then(fit); } else { fit(); }
})();
</script>
</body>
</html>`
}
