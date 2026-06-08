/**
 * IB-aangifte berekeningen voor ZZP'ers, per jaar.
 * Afzonderlijk van belasting.ts zodat lopend-jaar dashboard ongewijzigd blijft.
 */

export interface JaarConstanten {
  zelfstandigenaftrek: number
  startersaftrek: number
  mkbVrijstellingPct: number
  schijf1Grens: number
  schijf1Tarief: number
  schijf2Tarief: number
  kiaMinimumTotaal: number
  kiaMinimumPerItem: number
  kiaMaxAftrek: number
  kiaPct: number
  ahkMax: number
  ahkAfbouwStart: number
  ahkAfbouwPct: number
  akMax: number
  akOpbouwGrens: number
  akOpbouwPct: number
  akAfbouwStart: number
  akAfbouwPct: number
}

export const CONSTANTEN_PER_JAAR: Record<number, JaarConstanten> = {
  2023: {
    zelfstandigenaftrek: 5030,
    startersaftrek: 2123,
    mkbVrijstellingPct: 0.14,
    schijf1Grens: 73031,
    schijf1Tarief: 0.3693,
    schijf2Tarief: 0.4950,
    kiaMinimumTotaal: 2401,
    kiaMinimumPerItem: 450,
    kiaMaxAftrek: 19765,
    kiaPct: 0.28,
    ahkMax: 3070,
    ahkAfbouwStart: 22261,
    ahkAfbouwPct: 0.06095,
    akMax: 5052,
    akOpbouwGrens: 10741,
    akOpbouwPct: 0.47198,
    akAfbouwStart: 37691,
    akAfbouwPct: 0.05860,
  },
  2024: {
    zelfstandigenaftrek: 3750,
    startersaftrek: 2123,
    mkbVrijstellingPct: 0.1331,
    schijf1Grens: 75518,
    schijf1Tarief: 0.3697,
    schijf2Tarief: 0.4950,
    kiaMinimumTotaal: 2901,
    kiaMinimumPerItem: 450,
    kiaMaxAftrek: 19778,
    kiaPct: 0.28,
    ahkMax: 3362,
    ahkAfbouwStart: 24813,
    ahkAfbouwPct: 0.06095,
    akMax: 5532,
    akOpbouwGrens: 11491,
    akOpbouwPct: 0.28461,
    akAfbouwStart: 39958,
    akAfbouwPct: 0.06510,
  },
  2025: {
    zelfstandigenaftrek: 2470,
    startersaftrek: 2123,
    mkbVrijstellingPct: 0.1270,
    schijf1Grens: 76817,
    schijf1Tarief: 0.3682,
    schijf2Tarief: 0.4950,
    kiaMinimumTotaal: 2901,
    kiaMinimumPerItem: 450,
    kiaMaxAftrek: 19778,
    kiaPct: 0.28,
    ahkMax: 3068,
    ahkAfbouwStart: 24813,
    ahkAfbouwPct: 0.06095,
    akMax: 5599,
    akOpbouwGrens: 11491,
    akOpbouwPct: 0.28461,
    akAfbouwStart: 39958,
    akAfbouwPct: 0.06510,
  },
  2026: {
    zelfstandigenaftrek: 1200,
    startersaftrek: 2123,
    mkbVrijstellingPct: 0.1270,
    schijf1Grens: 76817,
    schijf1Tarief: 0.3682,
    schijf2Tarief: 0.4950,
    kiaMinimumTotaal: 2901,
    kiaMinimumPerItem: 450,
    kiaMaxAftrek: 19778,
    kiaPct: 0.28,
    ahkMax: 3068,
    ahkAfbouwStart: 24813,
    ahkAfbouwPct: 0.06095,
    akMax: 5599,
    akOpbouwGrens: 11491,
    akOpbouwPct: 0.28461,
    akAfbouwStart: 39958,
    akAfbouwPct: 0.06510,
  },
}

export function getConstanten(jaar: number): JaarConstanten {
  return CONSTANTEN_PER_JAAR[jaar] ?? CONSTANTEN_PER_JAAR[2025]
}

export interface AangifteInput {
  jaar: number
  omzetExcl: number
  kosten: number
  afschrijvingen: number
  urencriterium: boolean
  claimZelfstandigenaftrek: boolean
  claimStartersaftrek: boolean
  kiaAftrek: number
  forVrijval: number
}

export interface IBBreakdownAangifte {
  schijf1Basis: number
  schijf2Basis: number
  belastingSchijf1: number
  belastingSchijf2: number
  brutoBelasting: number
  ahk: number
  ak: number
  geschatteIB: number
}

export interface AangifteUitkomst {
  winstVoorAftrek: number
  zelfstandigenaftrek: number
  startersaftrek: number
  kia: number
  winstNaAftrek: number
  mkbVrijstelling: number
  forVrijval: number
  belastbaarInkomen: number
  ib: IBBreakdownAangifte
}

function berekenAHK(inkomen: number, c: JaarConstanten): number {
  if (inkomen <= c.ahkAfbouwStart) return c.ahkMax
  const afbouw = (inkomen - c.ahkAfbouwStart) * c.ahkAfbouwPct
  return Math.max(0, c.ahkMax - afbouw)
}

function berekenAK(inkomen: number, c: JaarConstanten): number {
  if (inkomen <= 0) return 0
  let korting = Math.min(inkomen, c.akOpbouwGrens) * c.akOpbouwPct
  if (inkomen > c.akOpbouwGrens) korting = c.akMax
  if (inkomen > c.akAfbouwStart) {
    const afbouw = (inkomen - c.akAfbouwStart) * c.akAfbouwPct
    korting = Math.max(0, korting - afbouw)
  }
  return korting
}

export function berekenAangifte(input: AangifteInput): AangifteUitkomst {
  const c = getConstanten(input.jaar)

  const winstVoorAftrek = input.omzetExcl - input.kosten - input.afschrijvingen

  const zelfstandigenaftrek =
    input.urencriterium && input.claimZelfstandigenaftrek
      ? Math.min(c.zelfstandigenaftrek, Math.max(0, winstVoorAftrek))
      : 0

  const startersaftrek =
    input.urencriterium && input.claimStartersaftrek ? c.startersaftrek : 0

  const kia = input.kiaAftrek

  const winstNaAftrek = winstVoorAftrek - zelfstandigenaftrek - startersaftrek - kia

  const mkbVrijstelling = winstNaAftrek > 0 ? winstNaAftrek * c.mkbVrijstellingPct : 0

  const forVrijval = input.forVrijval

  const belastbaarInkomen = Math.max(0, winstNaAftrek - mkbVrijstelling + forVrijval)

  const schijf1Basis = Math.min(belastbaarInkomen, c.schijf1Grens)
  const schijf2Basis = Math.max(0, belastbaarInkomen - c.schijf1Grens)
  const belastingSchijf1 = schijf1Basis * c.schijf1Tarief
  const belastingSchijf2 = schijf2Basis * c.schijf2Tarief
  const brutoBelasting = belastingSchijf1 + belastingSchijf2

  const ahk = berekenAHK(belastbaarInkomen, c)
  const ak = berekenAK(belastbaarInkomen, c)
  const geschatteIB = Math.max(0, brutoBelasting - ahk - ak)

  return {
    winstVoorAftrek,
    zelfstandigenaftrek,
    startersaftrek,
    kia,
    winstNaAftrek,
    mkbVrijstelling,
    forVrijval,
    belastbaarInkomen,
    ib: { schijf1Basis, schijf2Basis, belastingSchijf1, belastingSchijf2, brutoBelasting, ahk, ak, geschatteIB },
  }
}

export function berekenKIA(
  investeringen: Array<{ bedrag: number }>,
  jaar: number
): number {
  const c = getConstanten(jaar)
  const heeftItemBoven450 = investeringen.some(i => i.bedrag >= c.kiaMinimumPerItem)
  const totaal = investeringen.reduce((s, i) => s + i.bedrag, 0)
  if (totaal < c.kiaMinimumTotaal || !heeftItemBoven450) return 0
  return Math.min(totaal * c.kiaPct, c.kiaMaxAftrek)
}

export function berekenAfschrijvingDitJaar(
  bedrag: number,
  termijnJaren: number
): number {
  return bedrag / Math.max(1, termijnJaren)
}
