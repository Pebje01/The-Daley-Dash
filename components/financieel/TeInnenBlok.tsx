'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Coins } from 'lucide-react'
import { ActieRij } from '@/components/ActiesWidget'
import { useActiveCompany } from '@/components/CompanyContext'
import { onDataChanged } from '@/lib/events'
import type { Actie } from '@/lib/types'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

/**
 * "Nog te factureren en te innen" op /financieel. Stond eerst als "Geld dat
 * klaarligt" op het dashboard, maar dat is een overzichtspagina; alles wat
 * financieel is hoort hier (september 2026, Daley's keuze).
 *
 * Vier stappen die een bedrag doorloopt: uren of offerte, dan een factuur
 * (openstaand), dan betaald. Blijft hij liggen, dan is hij te laat. Alles
 * incl. btw; voor open uren is 21% aangenomen.
 *
 * Daaronder de acties die de Dash zelf klaarzet (betaalherinneringen, offertes
 * die op antwoord wachten of verlopen). Die stonden in "Vandaag oppakken" op het
 * dashboard, maar het zijn allemaal geldzaken.
 */
export default function TeInnenBlok({
  openUren,
  openUrenIncl,
  nogTeFactureren,
  nogTeFacturerenAantal,
  totalOpenAmount,
  openFacturen,
  overdueBedrag,
  overdueFacturen,
  className = '',
}: {
  openUren: number
  openUrenIncl: number
  nogTeFactureren: number
  nogTeFacturerenAantal: number
  totalOpenAmount: number
  openFacturen: number
  overdueBedrag: number
  overdueFacturen: number
  className?: string
}) {
  const { scope, scopeGeladen } = useActiveCompany()
  const [acties, setActies] = useState<Actie[]>([])

  const laad = useCallback(async () => {
    const a: Actie[] = await fetch('/api/acties').then(r => r.ok ? r.json() : []).catch(() => [])
    setActies(a.filter(x => scope === 'alle' || !x.metadata.companyId || x.metadata.companyId === scope))
  }, [scope])

  useEffect(() => {
    if (!scopeGeladen) return
    laad()
    return onDataChanged(() => laad())
  }, [laad, scopeGeladen])

  const tegel = 'rounded-brand-sm border border-brand-card-border/60 p-3 xl:p-2.5 hover:opacity-80 transition-opacity min-w-0'

  return (
    <div className={`card xl:p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3 xl:mb-2">
        <h2 className="font-semibold text-body flex items-center gap-2">
          <Coins size={15} className="text-brand-lav-accent" /> Nog te factureren en te innen
          <span className="text-caption font-normal text-brand-text-secondary">incl. btw</span>
        </h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link href="/uren" title="Gewerkte uren waar nog geen factuur van is. Verdiend, maar nog niet gevraagd. Btw is op 21% aangenomen." className={`${tegel} bg-brand-lavender-accent`}>
          <p className="text-caption text-brand-text-secondary mb-1 truncate">Uren te factureren</p>
          <p className="font-semibold text-body text-brand-text-primary">{euro(openUrenIncl)}</p>
          <p className="text-caption text-brand-text-secondary">{openUren.toLocaleString('nl-NL')} uur</p>
        </Link>
        <Link href="/offertes?status=akkoord" title="Goedgekeurde offertes, min wat er al van gefactureerd is." className={`${tegel} bg-brand-lime`}>
          <p className="text-caption text-brand-text-secondary mb-1 truncate">Offertes te factureren</p>
          <p className="font-semibold text-body text-brand-text-primary">{euro(nogTeFactureren)}</p>
          <p className="text-caption text-brand-text-secondary">{nogTeFacturerenAantal} {nogTeFacturerenAantal === 1 ? 'offerte' : 'offertes'}</p>
        </Link>
        <Link href="/facturen?status=verzonden" title="Verstuurde facturen die nog niet betaald zijn." className={`${tegel} bg-brand-light-blue`}>
          <p className="text-caption text-brand-text-secondary mb-1 truncate">Openstaand</p>
          <p className="font-semibold text-body text-brand-text-primary">{euro(totalOpenAmount)}</p>
          <p className="text-caption text-brand-text-secondary">{openFacturen} {openFacturen === 1 ? 'factuur' : 'facturen'}</p>
        </Link>
        <Link
          href="/facturen?status=te-laat"
          title="Facturen waarvan de betaaltermijn voorbij is: tijd voor een herinnering."
          className={`${tegel} ${overdueFacturen > 0 ? 'bg-brand-status-red/10 border-brand-status-red/30' : 'bg-brand-pink'}`}
        >
          <p className="text-caption text-brand-text-secondary mb-1 truncate flex items-center gap-1">
            {overdueFacturen > 0 && <AlertCircle size={12} className="text-brand-status-red" />} Te laat
          </p>
          <p className={`font-semibold text-body ${overdueFacturen > 0 ? 'text-brand-status-red' : 'text-brand-text-primary'}`}>{euro(overdueBedrag)}</p>
          <p className="text-caption text-brand-text-secondary">{overdueFacturen === 0 ? 'alles op tijd' : `${overdueFacturen} ${overdueFacturen === 1 ? 'factuur' : 'facturen'}`}</p>
        </Link>
      </div>

      {acties.length > 0 && (
        <div className="mt-3 pt-2 border-t border-brand-page-medium">
          <p className="text-caption text-brand-text-secondary mb-1">Klaargezet door de Dash ({acties.length})</p>
          {acties.map(a => <ActieRij key={a.id} actie={a} onUpdate={laad} />)}
        </div>
      )}
    </div>
  )
}
