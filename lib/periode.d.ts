/**
 * Types bij `periode.mjs`. De implementatie staat bewust in gewoon JavaScript,
 * zodat `node --test` hem direct kan draaien zonder extra bouwstap of extra
 * dependency. Deze tests zijn er niet voor niets: de omzetkaarten filterden
 * maandenlang zonder bovengrens.
 */
export interface Periode {
  begin: string
  eind: string
}

export function alleenDatum(waarde: unknown): string
export function jaarPeriode(peil: Date): Periode
export function maandPeriode(peil: Date): Periode
export function valtBinnen(datum: string, periode: Periode): boolean
