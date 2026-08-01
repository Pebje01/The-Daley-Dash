/**
 * Periodegrenzen voor omzetberekeningen.
 *
 * Aanleiding: zowel `getFactuurStats` als `getOfferteStats` filterden met
 * alleen een ondergrens (`datum >= begin van de maand`). Een factuur met een
 * datum in december telde daardoor al mee in "deze maand", en een factuur van
 * volgend jaar in de omzet van dit jaar. Factuurdata in de toekomst komen hier
 * echt voor, de factuurnummering is er expliciet op aangepast.
 *
 * Datums zijn overal `YYYY-MM-DD`, dus tekstvergelijking is genoeg en klopt ook
 * rond middernacht en zomertijd. Daarom hier geen Date-rekenwerk op waardes uit
 * de database.
 */

function tweeCijfers(n) {
  return String(n).padStart(2, '0')
}

/** Losse datum uit een database-veld, ook als er een tijd achter plakt. */
export function alleenDatum(waarde) {
  return String(waarde ?? '').split('T')[0]
}

export function jaarPeriode(peil) {
  const jaar = peil.getFullYear()
  return { begin: `${jaar}-01-01`, eind: `${jaar}-12-31` }
}

export function maandPeriode(peil) {
  const jaar = peil.getFullYear()
  const maand = peil.getMonth()
  const laatsteDag = new Date(jaar, maand + 1, 0).getDate()
  return {
    begin: `${jaar}-${tweeCijfers(maand + 1)}-01`,
    eind: `${jaar}-${tweeCijfers(maand + 1)}-${tweeCijfers(laatsteDag)}`,
  }
}

/** Valt de datum binnen de periode? Lege of ontbrekende datums tellen niet mee. */
export function valtBinnen(datum, periode) {
  if (!datum) return false
  return datum >= periode.begin && datum <= periode.eind
}
