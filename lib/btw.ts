/**
 * BTW-aangifte per kwartaal (zakelijk).
 *
 * Bevat: kwartaal-helpers, de Knab-CSV parser, automatische categorisatie van
 * banktransacties (omzet / kosten / prive / intern), en het koppelen van
 * omzet-ontvangsten aan facturen op factuurnummer.
 *
 * De grondslag voor de aangifte zijn de FACTUREN. Bij factuurstelsel op
 * factuurdatum, bij kasstelsel op betaaldatum (paid_at): de BTW valt dan in het
 * kwartaal waarin de factuur betaald is. De bankimport is een optionele
 * controle: is het echt ontvangen, mist er iets, staat er een ontvangst zonder
 * factuur tussen.
 */

// Eigen eenmanszaak-bedrijven. Montung (VOF) heeft een eigen BTW-aangifte en
// telt hier NIET mee.
export const EIGEN_BEDRIJVEN = ['tde', 'wgb', 'daleyphotography']

// Factuurstatussen die als omzet meetellen (niet concept/geannuleerd).
export const OMZET_STATUSSEN = [
  'verzonden', 'betaald', 'te-laat', 'herinnering-verzonden', 'herinnering',
]

export type BankCategorie =
  | 'omzet'
  | 'zakelijke_kost'
  | 'kosten_retour'
  | 'btw_afdracht'
  | 'intern_spaarpot'
  | 'prive_overboeking'
  | 'prive_lening'
  | 'prive_overig'
  | 'onbekend'

export const CATEGORIE_LABELS: Record<BankCategorie, string> = {
  omzet: 'Omzet',
  zakelijke_kost: 'Zakelijke kost',
  kosten_retour: 'Kosten retour',
  btw_afdracht: 'BTW-afdracht',
  intern_spaarpot: 'Intern (spaarpot)',
  prive_overboeking: 'Prive overboeking',
  prive_lening: 'Prive lening',
  prive_overig: 'Prive',
  onbekend: 'Onbekend',
}

export interface KwartaalInfo {
  kwartaal: string   // '2026-Q2'
  jaar: number
  nummer: number     // 1-4
  start: string      // '2026-04-01'
  eind: string       // '2026-06-30'
  label: string      // 'Q2 2026'
  maanden: string    // 'apr - jun'
}

const KW_MAANDEN = ['jan - mrt', 'apr - jun', 'jul - sep', 'okt - dec']

/** Parse '2026-Q2' naar kwartaalinfo. */
export function parseKwartaal(kwartaal: string): KwartaalInfo | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(kwartaal)
  if (!m) return null
  const jaar = parseInt(m[1], 10)
  const nummer = parseInt(m[2], 10)
  const startMaand = (nummer - 1) * 3 // 0-indexed
  const start = `${jaar}-${String(startMaand + 1).padStart(2, '0')}-01`
  const eindMaand = startMaand + 3 // exclusief; dag 0 = laatste dag vorige maand
  const eindDate = new Date(Date.UTC(jaar, eindMaand, 0))
  const eind = eindDate.toISOString().slice(0, 10)
  return {
    kwartaal, jaar, nummer, start, eind,
    label: `Q${nummer} ${jaar}`,
    maanden: KW_MAANDEN[nummer - 1],
  }
}

/** Het kwartaal waarin een datum valt, als '2026-Q2'. */
export function kwartaalVanDatum(d: Date): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

// ─────────────────────────────────────────────────────────────────────────
// Knab CSV parser
// ─────────────────────────────────────────────────────────────────────────

export interface RuweBankRegel {
  rekeningnummer: string
  datum: string            // ISO 'YYYY-MM-DD'
  bedrag: number           // altijd positief
  creditDebet: 'C' | 'D'
  tegenrekening: string
  tegenrekeninghouder: string
  omschrijving: string
  betaalwijze: string
  referentie: string
}

/** '30-06-2026' -> '2026-06-30'. Leeg/ongeldig -> ''. */
function knabDatumNaarIso(s: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim())
  if (!m) return ''
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** '1.633,98' of '7,95' -> number. */
function knabBedrag(s: string): number {
  const clean = s.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(clean)
  return isNaN(n) ? 0 : n
}

/** Splits 1 CSV-regel op ';', respecteert dubbele quotes. */
function splitCsvRegel(regel: string): string[] {
  const velden: string[] = []
  let huidig = ''
  let inQuotes = false
  for (let i = 0; i < regel.length; i++) {
    const c = regel[i]
    if (c === '"') {
      if (inQuotes && regel[i + 1] === '"') { huidig += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === ';' && !inQuotes) {
      velden.push(huidig); huidig = ''
    } else {
      huidig += c
    }
  }
  velden.push(huidig)
  return velden
}

/**
 * Parse een Knab-transactieoverzicht (CSV). Regel 1 is "KNAB EXPORT;...",
 * regel 2 de kolomkoppen, daarna de transacties.
 */
export function parseKnabCsv(text: string): RuweBankRegel[] {
  const regels = text.split(/\r?\n/)
  const out: RuweBankRegel[] = []
  // Zoek de headerregel (begint met 'Rekeningnummer')
  let startIdx = 0
  for (let i = 0; i < Math.min(regels.length, 5); i++) {
    if (/^"?Rekeningnummer"?;/.test(regels[i])) { startIdx = i + 1; break }
  }
  for (let i = startIdx; i < regels.length; i++) {
    const regel = regels[i]
    if (!regel.trim()) continue
    const v = splitCsvRegel(regel).map(x => x.trim())
    if (v.length < 15 || !v[0]) continue
    const cd = v[3] === 'C' ? 'C' : 'D'
    out.push({
      rekeningnummer: v[0],
      datum: knabDatumNaarIso(v[1]),
      creditDebet: cd,
      bedrag: knabBedrag(v[4]),
      tegenrekening: v[5],
      tegenrekeninghouder: v[6],
      betaalwijze: v[8],
      omschrijving: v[9],
      referentie: v[14] || '',
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────
// Categorisatie
// ─────────────────────────────────────────────────────────────────────────

// Eigen spaar-/BTW-potjes (Knab "Daley Content"): interne overboekingen.
const INTERNE_REKENINGEN = new Set(['33036299', '36080630'])
// Eigen prive-rekening (ING).
const EIGEN_PRIVE_REKENINGEN = new Set(['NL81INGB0008876875'])
// Partner / prive.
const VAN_NAARDEN = ['van naarden', 'fgd', 'f.g.d', 'f g d']
// Hints dat een bijschrijving een klant is (voor omzet zonder duidelijk nummer).
const KLANT_HINTS = ['bonvue', 'kloek', 'samen effectief', 'hoofs', 'shriemissier', 'pgs', 'pg s']
// Bekende zakelijke leveranciers -> zakelijke kost.
const LEVERANCIERS = [
  'figma', 'google', 'openai', 'anthropic', 'claude', 'hetzner', 'adobe',
  'business open', 'vodafone', 'kvk', 'clickup', 'apple', 'spark', 'leeflang',
]

const FACTUUR_RE = /[FGfg]-?\d{6}-\d{2}/
/** Kern van een factuurnummer, bijv. '260603-01' uit 'G-260603-01'. */
const FACTUUR_KERN_RE = /\d{6}-\d{2}/

export function normaliseer(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Automatische categorie op basis van de ruwe bankregel. */
export function categoriseer(r: RuweBankRegel): BankCategorie {
  const houder = normaliseer(r.tegenrekeninghouder)
  const oms = normaliseer(r.omschrijving)
  const betaalwijze = normaliseer(r.betaalwijze)
  const isCredit = r.creditDebet === 'C'

  // 1. Interne spaarpotjes
  if (INTERNE_REKENINGEN.has(r.tegenrekening.trim())) return 'intern_spaarpot'

  // 2. Omzet: bijschrijving met factuurnummer of bekende klant
  if (isCredit && (FACTUUR_RE.test(r.omschrijving) || KLANT_HINTS.some(k => houder.includes(k)))) {
    return 'omzet'
  }

  // 3. Retour van kosten (bijv. Anthropic/Claude terugstorting)
  if (isCredit && betaalwijze.includes('retourpin')) return 'kosten_retour'

  // 4. Geleend / prive bijschrijving
  if (isCredit && (oms.includes('geleend') || VAN_NAARDEN.some(v => houder.includes(v)))) {
    return 'prive_lening'
  }

  // 5. BTW-afdracht Belastingdienst
  if (houder.includes('belastingdienst')) return 'btw_afdracht'

  // 6. Zakelijke kosten (bekende leverancier)
  for (const lev of LEVERANCIERS) {
    if (houder.includes(lev) || oms.includes(lev)) {
      // Knab zelf alleen als het om bankkosten gaat, niet iDEAL-omzet
      if ((lev === 'apple' || lev === 'spark') && isCredit) continue
      return 'zakelijke_kost'
    }
  }
  // Knab pakket-/overschrijvingskosten
  if (houder === 'knab' && (betaalwijze.includes('kosten') || betaalwijze.includes('pakket'))) {
    return 'zakelijke_kost'
  }

  // 7. Prive overboeking naar eigen rekening of partner
  if (!isCredit && (EIGEN_PRIVE_REKENINGEN.has(r.tegenrekening.trim()) || VAN_NAARDEN.some(v => houder.includes(v)))) {
    return 'prive_overboeking'
  }

  // 8. Rest: prive (horeca / boodschappen / sport / eten / medisch)
  return 'prive_overig'
}

/** Herken het factuurnummer in een omschrijving (zoals in de bank staat). */
export function herkenFactuurNummer(omschrijving: string): string | null {
  const m = FACTUUR_RE.exec(omschrijving || '')
  return m ? m[0] : null
}

/** Kernsleutel voor matching, bijv. '260603-01'. */
function factuurKern(s: string): string | null {
  const m = FACTUUR_KERN_RE.exec(s || '')
  return m ? m[0] : null
}

export interface FactuurLite {
  id: string
  number: string
  client_name: string
  date: string
  subtotal: number
  total: number
  company_id: string
  status: string
  paid_at: string | null
}

/**
 * Koppel een omzet-ontvangst aan een factuur op factuurnummer (kern
 * 'YYMMDD-NN'), robuust tegen F/G-prefix en streepjes. Matcht bewust NIET op
 * bedrag alleen: twee facturen kunnen toevallig hetzelfde bedrag hebben.
 */
export function matchFactuur(
  omschrijving: string,
  facturen: FactuurLite[],
): FactuurLite | null {
  const kern = factuurKern(omschrijving)
  if (!kern) return null
  return facturen.find(f => factuurKern(f.number) === kern) ?? null
}

// ─────────────────────────────────────────────────────────────────────────
// Aangifte-berekening
// ─────────────────────────────────────────────────────────────────────────

export type BtwBehandeling = 'nl_21' | 'nl_9' | 'verlegd' | 'vrij' | 'geen'

export interface KostenpostLite {
  bedrag_incl: number
  bedrag_excl: number
  btw_bedrag: number
  btw_behandeling: BtwBehandeling
  aftrekbaar_pct: number
}

export interface BtwBerekening {
  // Rubriek 1a: omzet en verschuldigde BTW hoog tarief (facturen)
  omzet1aExcl: number
  omzet1aBtw: number
  // Correctie eerdere periode (onder EUR 1.000 hier meegenomen)
  correctieExcl: number
  correctieBtw: number
  // Rubriek 4b: verwerving diensten/goederen uit het buitenland (verlegd)
  verlegdGrondslag: number
  verlegdBtw: number
  // Rubriek 5b: voorbelasting
  voorbelastingNl: number       // NL-inkoop-BTW (aftrekbaar deel)
  voorbelastingVerlegd: number  // verlegde BTW die je terugkrijgt
  voorbelastingTotaal: number
  // Saldo
  verschuldigd: number          // 1a + correctie + 4b
  teBetalen: number             // verschuldigd - voorbelasting
  aantalKosten: number
}

function n(x: unknown): number {
  const v = typeof x === 'number' ? x : parseFloat(String(x ?? 0))
  return isNaN(v) ? 0 : v
}

/** Bereken de BTW-aangifte uit facturen, kostenposten en een correctie. */
export function berekenBtwAangifte(
  facturen: { subtotal: number | string; btw_amount: number | string }[],
  kosten: KostenpostLite[],
  correctieExcl = 0,
  correctieBtw = 0,
): BtwBerekening {
  const omzet1aExcl = facturen.reduce((s, f) => s + n(f.subtotal), 0)
  const omzet1aBtw = facturen.reduce((s, f) => s + n(f.btw_amount), 0)

  let verlegdGrondslag = 0
  let verlegdBtw = 0
  let voorbelastingNl = 0
  let voorbelastingVerlegd = 0

  for (const k of kosten) {
    const pct = n(k.aftrekbaar_pct) / 100
    const btw = n(k.btw_bedrag)
    if (k.btw_behandeling === 'verlegd') {
      verlegdGrondslag += n(k.bedrag_excl)
      verlegdBtw += btw
      voorbelastingVerlegd += btw * pct
    } else if (k.btw_behandeling === 'nl_21' || k.btw_behandeling === 'nl_9') {
      voorbelastingNl += btw * pct
    }
    // 'vrij' en 'geen' leveren geen voorbelasting op
  }

  const voorbelastingTotaal = voorbelastingNl + voorbelastingVerlegd
  const verschuldigd = omzet1aBtw + correctieBtw + verlegdBtw
  const teBetalen = verschuldigd - voorbelastingTotaal

  return {
    omzet1aExcl, omzet1aBtw,
    correctieExcl, correctieBtw,
    verlegdGrondslag, verlegdBtw,
    voorbelastingNl, voorbelastingVerlegd, voorbelastingTotaal,
    verschuldigd, teBetalen,
    aantalKosten: kosten.length,
  }
}

/**
 * Kasbasis: zet de omzet-ontvangsten uit de bank om naar omzetregels
 * (subtotal/btw). Aanname: alle omzet valt onder het hoge tarief (21%).
 * Op kasbasis is de ONTVANGST leidend, niet de factuurdatum.
 */
export function kasOmzetUitBank(
  transacties: { categorie: string; bedrag: number | string }[],
): { subtotal: number; btw_amount: number }[] {
  const r2 = (x: number) => Math.round(x * 100) / 100
  return transacties
    .filter(t => t.categorie === 'omzet')
    .map(t => {
      const incl = n(t.bedrag)
      const excl = r2(incl / 1.21)
      return { subtotal: excl, btw_amount: r2(incl - excl) }
    })
}

/**
 * Splits een kostenbedrag naar excl/btw/incl op basis van de BTW-behandeling.
 * `bedrag` is het bedrag zoals op de factuur staat: bij NL-btw is dat incl.,
 * bij een verlegde buitenlandse dienst is dat het (excl.) factuurbedrag.
 */
export function splitsKostenBtw(bedrag: number, behandeling: BtwBehandeling): {
  bedrag_incl: number; bedrag_excl: number; btw_bedrag: number
} {
  const b = n(bedrag)
  const r2 = (x: number) => Math.round(x * 100) / 100
  switch (behandeling) {
    case 'nl_21': {
      const excl = r2(b / 1.21)
      return { bedrag_incl: r2(b), bedrag_excl: excl, btw_bedrag: r2(b - excl) }
    }
    case 'nl_9': {
      const excl = r2(b / 1.09)
      return { bedrag_incl: r2(b), bedrag_excl: excl, btw_bedrag: r2(b - excl) }
    }
    case 'verlegd':
      // Buitenlandse dienst: factuurbedrag is excl.; 21% btw wordt verlegd.
      return { bedrag_incl: r2(b), bedrag_excl: r2(b), btw_bedrag: r2(b * 0.21) }
    case 'vrij':
    case 'geen':
    default:
      return { bedrag_incl: r2(b), bedrag_excl: r2(b), btw_bedrag: 0 }
  }
}
