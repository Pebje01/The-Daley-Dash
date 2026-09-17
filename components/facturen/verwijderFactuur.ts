'use client'
/**
 * Verwijderen van een factuur vanuit het scherm, met dezelfde bevestigingen op
 * elke plek: de factuurkaart en de melding "PDF ontbreekt" op de facturenpagina.
 * Server-side loopt het via verwijderFactuurVeilig(): eerst een kopie naar de
 * prullenbak, gekoppelde uren komen weer vrij, en een verstuurde factuur gaat
 * alleen weg na een tweede, expliciete bevestiging.
 */
import type { Factuur } from '@/lib/types'
import type { useMelding } from '@/components/MeldingProvider'

type Melding = ReturnType<typeof useMelding>

export async function verwijderFactuurMetBevestiging(
  factuur: Pick<Factuur, 'id' | 'number' | 'total' | 'client'>,
  melding: Melding,
  opties: { aanleiding?: string } = {},
): Promise<boolean> {
  const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(factuur.total)
  const wilVerwijderen = await melding.bevestig({
    titel: `${factuur.number} verwijderen?`,
    tekst: [
      opties.aanleiding,
      `${euro} voor ${factuur.client.name}.`,
      'Er gaat eerst een kopie naar de prullenbak en de gekoppelde uren komen weer vrij.',
    ].filter(Boolean).join('\n\n'),
    bevestigLabel: 'Verwijderen',
    gevaarlijk: true,
  })
  if (!wilVerwijderen) return false

  const verwijder = (bevestigdVerstuurd: boolean) =>
    fetch(`/api/facturen/${factuur.id}${bevestigdVerstuurd ? '?bevestigdVerstuurd=true' : ''}`, { method: 'DELETE' })

  try {
    let res = await verwijder(false)

    // Een verstuurde factuur is de deur uit en is een wettelijk document.
    // Die gaat alleen weg na een tweede, expliciete bevestiging.
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}))
      if (!data?.needsBevestiging) {
        melding.fout(data?.error ?? 'Verwijderen mislukt')
        return false
      }
      const tochWeg = await melding.bevestig({
        titel: 'Deze factuur is al verstuurd',
        tekst: `${factuur.number} is de deur uit naar ${factuur.client.name}. Een verstuurde factuur hoort in je administratie te blijven.\n\nWeet je zeker dat je hem toch wilt verwijderen?`,
        bevestigLabel: 'Toch verwijderen',
        gevaarlijk: true,
      })
      if (!tochWeg) return false
      res = await verwijder(true)
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      melding.fout(data?.error ?? 'Verwijderen mislukt')
      return false
    }

    const data = await res.json().catch(() => ({}))
    melding.gelukt(
      data?.urenVrijgegeven > 0
        ? `${factuur.number} staat in de prullenbak. ${data.urenVrijgegeven} uur-registratie${data.urenVrijgegeven === 1 ? '' : 's'} staat weer open.`
        : `${factuur.number} staat in de prullenbak.`,
    )
    return true
  } catch {
    melding.fout('Verwijderen mislukt')
    return false
  }
}
