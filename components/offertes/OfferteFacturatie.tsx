'use client'

import { useCallback, useEffect, useState } from 'react'
import { ReceiptText, RotateCcw, Ban } from 'lucide-react'
import { useDrawer } from '@/components/DrawerContext'
import { useMelding } from '@/components/MeldingProvider'
import { dataChanged, onDataChanged } from '@/lib/events'
import type { OfferteFacturatie as Facturatie } from '@/lib/offertes/facturatie'

const euro = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

/**
 * Hoeveel er van deze offerte gefactureerd is en wat er nog open staat.
 * Het restant is offertebedrag min de gekoppelde facturen (lib/offertes/facturatie.ts).
 */
export default function OfferteFacturatie({ offerteId, status }: { offerteId: string; status: string }) {
  const { openDrawer } = useDrawer()
  const melding = useMelding()
  const [data, setData] = useState<Facturatie | null>(null)
  const [bezig, setBezig] = useState(false)

  const laad = useCallback(async () => {
    const res = await fetch(`/api/offertes/${offerteId}/facturatie`).catch(() => null)
    if (res?.ok) setData(await res.json())
  }, [offerteId])

  useEffect(() => { laad() }, [laad])
  // Een factuur die elders gekoppeld of aangemaakt wordt, verandert dit blok
  useEffect(() => onDataChanged(t => { if (t === 'facturen') laad() }), [laad])

  if (!data) return null
  // Zonder akkoord en zonder facturen valt er niets te zeggen
  if (status !== 'akkoord' && data.facturen.length === 0) return null

  const deel = data.offerteTotaal > 0 ? Math.min(1, data.gefactureerd / data.offerteTotaal) : 0
  const openRestant = Math.max(0, data.offerteTotaal - data.gefactureerd)

  async function zetVervallen(vervalt: boolean) {
    if (vervalt) {
      const ok = await melding.bevestig({
        titel: 'Restant laten vervallen?',
        tekst: `${euro(openRestant)} van deze offerte wordt niet meer gefactureerd en telt niet meer mee bij nog te factureren. Je kunt dit later terugdraaien.`,
        bevestigLabel: 'Restant vervalt',
      })
      if (!ok) return
    }
    setBezig(true)
    const res = await fetch(`/api/offertes/${offerteId}/facturatie`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restantVervalt: vervalt }),
    }).catch(() => null)
    const nieuw = await res?.json().catch(() => null)
    setBezig(false)
    if (!res?.ok) {
      melding.fout(nieuw?.error ?? 'Opslaan mislukt')
      return
    }
    setData(nieuw)
    dataChanged('offertes')
  }

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <h2 className="font-semibold text-body flex items-center gap-2">
          <ReceiptText size={14} /> Facturatie
        </h2>
        <p className="text-caption text-brand-text-secondary">
          {euro(data.gefactureerd)} van {euro(data.offerteTotaal)} gefactureerd
        </p>
      </div>

      <div className="h-2 rounded-full bg-brand-page-medium overflow-hidden mb-3">
        <div className="h-full bg-brand-lime-accent rounded-full transition-all" style={{ width: `${Math.round(deel * 100)}%` }} />
      </div>

      {data.facturen.length > 0 ? (
        <ul className="divide-y divide-brand-page-medium mb-3">
          {data.facturen.map(f => (
            <li key={f.id}>
              <button
                onClick={() => openDrawer({ type: 'factuur-detail', id: f.id })}
                className="w-full flex items-center justify-between gap-3 py-2 text-body hover:bg-brand-page-light rounded px-1 -mx-1 text-left"
              >
                <span className="min-w-0 truncate">
                  <span className="font-mono text-caption text-brand-text-secondary mr-2">{f.number}</span>
                  {new Date(f.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-caption text-brand-text-secondary">{f.status}</span>
                  <span className="font-semibold">{euro(f.total)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-brand-text-secondary mb-3">
          Nog geen facturen gekoppeld. Koppel een factuur via &quot;Hoort bij offerte&quot; op de factuurkaart.
        </p>
      )}

      {data.restantVervallenOp ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-caption text-brand-text-secondary">
            Restant van {euro(openRestant)} vervallen op {new Date(data.restantVervallenOp).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
          </p>
          <button onClick={() => zetVervallen(false)} disabled={bezig} className="btn-secondary py-1.5 text-caption self-start disabled:opacity-50">
            <RotateCcw size={13} /> Weer openzetten
          </button>
        </div>
      ) : data.restant > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-body">
            Nog te factureren: <span className="font-semibold">{euro(data.restant)}</span>
            <span className="text-caption text-brand-text-secondary ml-1">({euro(data.restantExcl)} excl. btw)</span>
          </p>
          <button onClick={() => zetVervallen(true)} disabled={bezig} className="btn-secondary py-1.5 text-caption self-start disabled:opacity-50">
            <Ban size={13} /> Restant vervalt
          </button>
        </div>
      ) : (
        <p className="text-caption text-brand-status-green font-medium">Helemaal gefactureerd</p>
      )}
    </div>
  )
}
