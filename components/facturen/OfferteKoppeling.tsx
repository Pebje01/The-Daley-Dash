'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMelding } from '@/components/MeldingProvider'
import { dataChanged } from '@/lib/events'
import type { Offerte } from '@/lib/types'

const euro = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

/**
 * "Hoort bij offerte" op de factuurkaart. Met deze koppeling weet de Dash wat er
 * van een offerte al gefactureerd is (aanbetaling, termijnen, restant).
 * Slaat direct op, los van Bewerken: de koppeling staat niet op de PDF.
 */
export default function OfferteKoppeling({ factuurId, offerteId, klantnaam, onGewijzigd }: {
  factuurId: string
  offerteId?: string
  klantnaam: string
  onGewijzigd: (offerteId: string | null) => void
}) {
  const router = useRouter()
  const melding = useMelding()
  const [offertes, setOffertes] = useState<Offerte[] | null>(null)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    // Akkoord-offertes, plus de huidige koppeling als die een andere status heeft
    Promise.all([
      fetch('/api/offertes?status=akkoord').then(r => r.ok ? r.json() : []),
      offerteId ? fetch(`/api/offertes/${offerteId}`).then(r => r.ok ? r.json() : null) : null,
    ]).then(([akkoord, huidig]: [Offerte[], Offerte | null]) => {
      const lijst = huidig && !akkoord.some(o => o.id === huidig.id) ? [huidig, ...akkoord] : akkoord
      // Offertes van dezelfde klant bovenaan
      const naam = klantnaam.toLowerCase()
      const zelfdeKlant = (o: Offerte) => o.client.name.toLowerCase() === naam ? 0 : 1
      setOffertes([...lijst].sort((a, b) => zelfdeKlant(a) - zelfdeKlant(b) || b.date.localeCompare(a.date)))
    }).catch(() => setOffertes([]))
  }, [offerteId, klantnaam])

  async function kies(nieuw: string) {
    const waarde = nieuw || null
    setBezig(true)
    const res = await fetch(`/api/facturen/${factuurId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerteId: waarde }),
    }).catch(() => null)
    setBezig(false)
    if (!res?.ok) {
      const data = await res?.json().catch(() => null)
      melding.fout(data?.error ?? 'Koppelen mislukt')
      return
    }
    onGewijzigd(waarde)
    dataChanged('facturen')
    melding.gelukt(waarde ? 'Factuur gekoppeld aan de offerte' : 'Koppeling met de offerte verwijderd')
  }

  return (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
      <dt className="text-brand-text-secondary shrink-0">Hoort bij offerte</dt>
      <dd className="flex items-center gap-2 min-w-0">
        <select
          value={offerteId ?? ''}
          onChange={e => kies(e.target.value)}
          disabled={bezig || offertes === null}
          className="input py-1 text-caption min-w-0 max-w-[16rem] disabled:opacity-50"
        >
          <option value="">{offertes === null ? 'Laden...' : 'Geen offerte'}</option>
          {offertes?.map(o => (
            <option key={o.id} value={o.id}>
              {o.number} · {o.client.name} · {euro(o.total)}
            </option>
          ))}
        </select>
        {offerteId && (
          <button
            onClick={() => router.push(`/offertes/${offerteId}`)}
            className="text-caption text-brand-purple font-semibold underline underline-offset-2 shrink-0"
          >
            Bekijk
          </button>
        )}
      </dd>
    </div>
  )
}
