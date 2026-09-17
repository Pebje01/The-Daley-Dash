/**
 * Welke administratie de Dash inleest.
 *
 * De Dash begint bij 2026. Alles daarvoor is administratie van vóór dit
 * systeem: die hoort er niet in en wordt nergens meer aangeboden om te
 * importeren.
 *
 * Deze regel staat hier los, omdat zowel de bestandssync (`/api/admin/sync`),
 * de mapcontrole (`/api/admin/scan`) als de lijst "Lokale bestanden" hem nodig
 * hebben. Stond hij op één plek in de sync, dan bleef de lijst oude PDF's als
 * "Nieuw" tonen en kon één klik op importeren ze alsnog binnenhalen. Dat is op
 * 17 september 2026 ook echt gebeurd: een achtergrondsync haalde 32 oude
 * offertes binnen met nummers als OF-0011 en de typfout OF-271101.
 */

/** Eerste jaar waarvan de administratie in de Dash hoort. */
export const EERSTE_DASH_JAAR = 2026

/** De nummerreeks van vóór de Dash: 2020F-0010, 2024F-1011-01, 2026F-0306-01. */
export const OUDE_NUMMERREEKS = /^\d{4}F-/

/** OF-231025-01 en F-250713-01 zijn van vóór de Dash, OF-260316-01 niet. */
export function isVanVoorDeDash(number: string): boolean {
  const m = number.match(/^(?:OF|F)-(\d{2})\d{4}(?:-\d{2})?$/i)
  if (!m) return false
  return 2000 + Number(m[1]) < EERSTE_DASH_JAAR
}

/**
 * Alles wat de Dash niet meer inleest: de oude factuurreeks, en elk nummer met
 * een jaar vóór {@link EERSTE_DASH_JAAR}.
 *
 * Importeren van die bestanden is geen kwestie van de filter weghalen: het
 * nummer ín die oude PDF's wijkt bij 71 van de 72 offertes af van de
 * bestandsnaam, en varianten als `_reacties` en `(kopie)` dragen hetzelfde
 * nummer. Wil je ze alsnog in de Dash, doe dat dan met een eenmalig script met
 * het nummer uit de bestandsnaam als leidend en een lijst vooraf.
 */
export function valtBuitenDeDash(number: string): boolean {
  return OUDE_NUMMERREEKS.test(number) || isVanVoorDeDash(number)
}
