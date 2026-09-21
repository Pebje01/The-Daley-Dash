/**
 * Hoeveel er van een akkoord-offerte nog gefactureerd moet worden.
 *
 * Restant = offertebedrag min de facturen die eraan gekoppeld zijn
 * (facturen.offerte_id, geannuleerde niet meegeteld). Zo blijft na een
 * aanbetaling van 50% de andere helft zichtbaar, en valt een offerte die in
 * termijnen helemaal gefactureerd is vanzelf weg.
 *
 * Gebruikt door de dashboardtegel (getOfferteStats), de verwachte omzet
 * (getFactuurStats) en het facturatieblok op de offerte.
 */
import { createClient } from '@/lib/supabase/server'

/**
 * Afrondingsverschillen tot een euro tellen niet als restant. Een factuur van
 * € 1.633,98 op een offerte van € 1.603,25 is gewoon helemaal gefactureerd.
 */
export const RESTANT_MARGE = 1

export interface FactuurVoorOfferte {
  id: string
  number: string
  date: string
  status: string
  total: number
  subtotal: number
}

export interface OfferteFacturatie {
  offerteId: string
  offerteTotaal: number
  offerteSubtotaal: number
  gefactureerd: number
  gefactureerdExcl: number
  /** Incl. btw, 0 als alles gefactureerd is of het restant vervallen is */
  restant: number
  restantExcl: number
  restantVervallenOp: string | null
  /** Waarom het restant vervallen is, leeg bij oudere of niet vervallen offertes */
  restantVervallenReden: string | null
  facturen: FactuurVoorOfferte[]
}

type OfferteRij = {
  id: string
  total: number | null
  subtotal: number | null
  restant_vervallen_op?: string | null
  restant_vervallen_reden?: string | null
}
type FactuurRij = FactuurVoorOfferte & { offerte_id: string }

export function berekenFacturatie(offerte: OfferteRij, facturen: FactuurRij[]): OfferteFacturatie {
  const eigen = facturen.filter(f => f.offerte_id === offerte.id && f.status !== 'geannuleerd')
  const offerteTotaal = Number(offerte.total ?? 0)
  const offerteSubtotaal = Number(offerte.subtotal ?? 0)
  const gefactureerd = eigen.reduce((s, f) => s + Number(f.total ?? 0), 0)
  const gefactureerdExcl = eigen.reduce((s, f) => s + Number(f.subtotal ?? 0), 0)
  const vervallen = offerte.restant_vervallen_op ?? null
  const rest = offerteTotaal - gefactureerd
  const restExcl = offerteSubtotaal - gefactureerdExcl
  return {
    offerteId: offerte.id,
    offerteTotaal,
    offerteSubtotaal,
    gefactureerd: rond(gefactureerd),
    gefactureerdExcl: rond(gefactureerdExcl),
    restant: vervallen || rest < RESTANT_MARGE ? 0 : rond(rest),
    restantExcl: vervallen || restExcl < RESTANT_MARGE ? 0 : rond(restExcl),
    restantVervallenOp: vervallen,
    restantVervallenReden: vervallen ? offerte.restant_vervallen_reden ?? null : null,
    facturen: eigen.map(({ offerte_id: _o, ...f }) => f).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

const rond = (n: number) => Math.round(n * 100) / 100

/** True als de restantkolommen nog niet bestaan (migratie niet gedraaid). */
export function ontbrekendeRestantKolom(error: { code?: string; message?: string } | null) {
  return error?.code === '42703' || /restant_vervallen/.test(error?.message || '')
}

/**
 * Facturatie van een reeks offertes. Leest zelf de gekoppelde facturen op.
 * Zonder migratie valt hij terug op "nooit vervallen", zodat de Dash blijft werken.
 */
export async function haalFacturatie(offertes: OfferteRij[]): Promise<Map<string, OfferteFacturatie>> {
  const uit = new Map<string, OfferteFacturatie>()
  if (!offertes.length) return uit
  const { data } = await createClient()
    .from('facturen')
    .select('id, number, date, status, total, subtotal, offerte_id')
    .in('offerte_id', offertes.map(o => o.id))
  const facturen = (data ?? []) as FactuurRij[]
  for (const o of offertes) uit.set(o.id, berekenFacturatie(o, facturen))
  return uit
}

/** Offertes met de restantkolommen erbij, of zonder als de migratie er nog niet is. */
export async function selecteerOffertesMetRestant<T>(
  // Losse typering: dynamische kolommen geven bij Supabase geen bruikbaar rijtype
  bouw: (kolommen: string) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
  basisKolommen: string,
): Promise<T[]> {
  let { data, error } = await bouw(`${basisKolommen}, restant_vervallen_op, restant_vervallen_reden`)
  if (error && ontbrekendeRestantKolom(error)) ({ data, error } = await bouw(basisKolommen))
  if (error) throw error
  return (data as T[] | null) ?? []
}
