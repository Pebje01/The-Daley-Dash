import type { User } from '@supabase/supabase-js'

/**
 * Persoonlijke gegevens van Daley, voor het profiel achter het bolletje
 * onderin de sidebar.
 *
 * Staat in de user_metadata van de Supabase-login (sleutel `profiel`), niet in
 * een eigen tabel. Er is maar één gebruiker, er hoeft geen migratie voor te
 * draaien, en omdat inloggen in live en test via hetzelfde project gaat, is
 * het profiel in beide versies hetzelfde. Houd het bij korte tekstvelden: de
 * metadata gaat mee in elk sessietoken, dus een foto hoort hier niet in.
 */
export interface Profiel {
  voornaam?: string
  achternaam?: string
  roepnaam?: string
  functie?: string
  telefoon?: string
  geboortedatum?: string
  straat?: string
  postcode?: string
  plaats?: string
  land?: string
  website?: string
  linkedin?: string
  instagram?: string
  voorkeuren?: string
}

export function profielVan(user: User | null | undefined): Profiel {
  const p = user?.user_metadata?.profiel
  return p && typeof p === 'object' ? (p as Profiel) : {}
}

export function volledigeNaam(p: Profiel): string {
  return [p.voornaam, p.achternaam].map(s => s?.trim()).filter(Boolean).join(' ')
}

/** Naam voor in de sidebar: je volledige naam, anders je mailadres. */
export function weergaveNaam(p: Profiel, email?: string | null): string {
  return volledigeNaam(p) || email || ''
}

export function initialen(p: Profiel, email?: string | null): string {
  const v = p.voornaam?.trim()?.[0] ?? ''
  const a = p.achternaam?.trim().split(/\s+/).pop()?.[0] ?? ''
  const i = (v + a).toUpperCase()
  return i || (email?.[0] ?? '?').toUpperCase()
}

/** Lege velden gaan eruit, zodat de metadata niet volloopt met lege strings. */
export function schoonProfiel(p: Profiel): Profiel {
  const uit: Profiel = {}
  for (const [k, v] of Object.entries(p)) {
    const t = typeof v === 'string' ? v.trim() : ''
    if (t) uit[k as keyof Profiel] = t
  }
  return uit
}
