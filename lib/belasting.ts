/**
 * Belastingberekeningen voor ZZP'ers (grove schatting 2025/2026).
 * BTW is exact (21%), inkomstenbelasting is een indicatie.
 */

// --- IB constanten (2025/2026 schattingen) ---

const ZELFSTANDIGENAFTREK = 3750
const MKB_WINSTVRIJSTELLING_PCT = 0.1331

// Belastingschijven
const SCHIJF_1_GRENS = 75518
const SCHIJF_1_TARIEF = 0.3697
const SCHIJF_2_TARIEF = 0.4950

// Heffingskortingen (maxima, worden afgebouwd bij hoger inkomen)
const ALGEMENE_HEFFINGSKORTING_MAX = 3362
const ALGEMENE_HEFFINGSKORTING_AFBOUW_START = 24813
const ALGEMENE_HEFFINGSKORTING_AFBOUW_PCT = 0.06095

const ARBEIDSKORTING_MAX = 5532
const ARBEIDSKORTING_OPBOUW_GRENS = 11491
const ARBEIDSKORTING_OPBOUW_PCT = 0.28461
const ARBEIDSKORTING_AFBOUW_START = 39958
const ARBEIDSKORTING_AFBOUW_PCT = 0.06510

// --- Berekeningsfuncties ---

export interface IBBreakdown {
  brutoWinst: number
  zelfstandigenaftrek: number
  winstNaAftrek: number
  mkbVrijstelling: number
  belastbaarInkomen: number
  belastingSchijf1: number
  belastingSchijf2: number
  brutoBelasting: number
  algemeneHeffingskorting: number
  arbeidskorting: number
  geschatteIB: number
}

/** Bereken de algemene heffingskorting (met afbouw bij hoger inkomen) */
function berekenAlgemeneHeffingskorting(belastbaarInkomen: number): number {
  if (belastbaarInkomen <= ALGEMENE_HEFFINGSKORTING_AFBOUW_START) {
    return ALGEMENE_HEFFINGSKORTING_MAX
  }
  const afbouw = (belastbaarInkomen - ALGEMENE_HEFFINGSKORTING_AFBOUW_START) * ALGEMENE_HEFFINGSKORTING_AFBOUW_PCT
  return Math.max(0, ALGEMENE_HEFFINGSKORTING_MAX - afbouw)
}

/** Bereken de arbeidskorting (opbouw + afbouw) */
function berekenArbeidskorting(belastbaarInkomen: number): number {
  if (belastbaarInkomen <= 0) return 0

  // Opbouw fase
  let korting = Math.min(belastbaarInkomen, ARBEIDSKORTING_OPBOUW_GRENS) * ARBEIDSKORTING_OPBOUW_PCT
  if (belastbaarInkomen > ARBEIDSKORTING_OPBOUW_GRENS) {
    korting = ARBEIDSKORTING_MAX
  }

  // Afbouw fase
  if (belastbaarInkomen > ARBEIDSKORTING_AFBOUW_START) {
    const afbouw = (belastbaarInkomen - ARBEIDSKORTING_AFBOUW_START) * ARBEIDSKORTING_AFBOUW_PCT
    korting = Math.max(0, korting - afbouw)
  }

  return korting
}

/** Bereken geschatte inkomstenbelasting voor ZZP'er */
export function berekenInkomstenbelasting(brutoWinst: number): IBBreakdown {
  // Stap 1: Zelfstandigenaftrek
  const zelfstandigenaftrek = Math.min(ZELFSTANDIGENAFTREK, brutoWinst)
  const winstNaAftrek = Math.max(0, brutoWinst - zelfstandigenaftrek)

  // Stap 2: MKB-winstvrijstelling
  const mkbVrijstelling = winstNaAftrek * MKB_WINSTVRIJSTELLING_PCT
  const belastbaarInkomen = Math.max(0, winstNaAftrek - mkbVrijstelling)

  // Stap 3: Belasting per schijf
  const inSchijf1 = Math.min(belastbaarInkomen, SCHIJF_1_GRENS)
  const inSchijf2 = Math.max(0, belastbaarInkomen - SCHIJF_1_GRENS)
  const belastingSchijf1 = inSchijf1 * SCHIJF_1_TARIEF
  const belastingSchijf2 = inSchijf2 * SCHIJF_2_TARIEF
  const brutoBelasting = belastingSchijf1 + belastingSchijf2

  // Stap 4: Heffingskortingen
  const algemeneHeffingskorting = berekenAlgemeneHeffingskorting(belastbaarInkomen)
  const arbeidskorting = berekenArbeidskorting(belastbaarInkomen)

  // Stap 5: Netto belasting
  const geschatteIB = Math.max(0, brutoBelasting - algemeneHeffingskorting - arbeidskorting)

  return {
    brutoWinst,
    zelfstandigenaftrek,
    winstNaAftrek,
    mkbVrijstelling,
    belastbaarInkomen,
    belastingSchijf1,
    belastingSchijf2,
    brutoBelasting,
    algemeneHeffingskorting,
    arbeidskorting,
    geschatteIB,
  }
}

// --- BTW hulpfuncties ---

export interface KwartaalData {
  kwartaal: number          // 1-4
  label: string             // "Q1", "Q2", etc.
  maanden: string           // "jan - mrt", etc.
  omzetExcl: number
  btwBedrag: number
  omzetIncl: number
  aantalFacturen: number
}

export interface MaandData {
  maand: number             // 0-11
  label: string             // "Januari", etc.
  omzetExcl: number
  btwBedrag: number
  omzetIncl: number
  aantalFacturen: number
}

const KWARTAAL_LABELS = [
  { label: 'Q1', maanden: 'jan - mrt' },
  { label: 'Q2', maanden: 'apr - jun' },
  { label: 'Q3', maanden: 'jul - sep' },
  { label: 'Q4', maanden: 'okt - dec' },
]

const MAAND_NAMEN = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
]

interface FactuurRij {
  subtotal: number
  total: number
  date: string
}

/** Aggregeer facturen per kwartaal */
export function aggregeerPerKwartaal(facturen: FactuurRij[]): KwartaalData[] {
  const kwartalen: KwartaalData[] = KWARTAAL_LABELS.map((kw, i) => ({
    kwartaal: i + 1,
    label: kw.label,
    maanden: kw.maanden,
    omzetExcl: 0,
    btwBedrag: 0,
    omzetIncl: 0,
    aantalFacturen: 0,
  }))

  for (const f of facturen) {
    const maand = new Date(f.date).getMonth()
    const kwIdx = Math.floor(maand / 3)
    kwartalen[kwIdx].omzetExcl += f.subtotal ?? 0
    kwartalen[kwIdx].omzetIncl += f.total ?? 0
    kwartalen[kwIdx].btwBedrag += (f.total ?? 0) - (f.subtotal ?? 0)
    kwartalen[kwIdx].aantalFacturen += 1
  }

  return kwartalen
}

/** Aggregeer facturen per maand */
export function aggregeerPerMaand(facturen: FactuurRij[]): MaandData[] {
  const maanden: MaandData[] = MAAND_NAMEN.map((naam, i) => ({
    maand: i,
    label: naam,
    omzetExcl: 0,
    btwBedrag: 0,
    omzetIncl: 0,
    aantalFacturen: 0,
  }))

  for (const f of facturen) {
    const mIdx = new Date(f.date).getMonth()
    maanden[mIdx].omzetExcl += f.subtotal ?? 0
    maanden[mIdx].omzetIncl += f.total ?? 0
    maanden[mIdx].btwBedrag += (f.total ?? 0) - (f.subtotal ?? 0)
    maanden[mIdx].aantalFacturen += 1
  }

  return maanden
}

/** Huidig kwartaal (1-4) */
export function huidigKwartaal(): number {
  return Math.floor(new Date().getMonth() / 3) + 1
}
