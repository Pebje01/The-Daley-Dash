'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCircle2, UserRound } from 'lucide-react'
import { ActieRij } from '@/components/ActiesWidget'
import { useActiveCompany } from '@/components/CompanyContext'
import { onDataChanged } from '@/lib/events'
import { faseDef, moetVandaagOpgepakt, opvolgLabel, opvolgStand } from '@/lib/crm/pipeline'
import type { Actie } from '@/lib/types'

interface LeadKort {
  id: string
  name: string
  status: string | null
  volgende_actie: string | null
  volgende_actie_notitie: string | null
  contact_status?: string | null
  contact_status_tot?: string | null
}

/**
 * Alles wat vandaag aandacht vraagt, op één plek op het dashboard: de acties
 * die de Dash zelf klaarzet (betaalherinneringen, offertes die wachten) en de
 * leads die volgens "Vandaag oppakken" in het CRM aan de beurt zijn.
 */
export default function VandaagOppakken({ className = '' }: { className?: string }) {
  const { scope, scopeGeladen } = useActiveCompany()
  const [acties, setActies] = useState<Actie[] | null>(null)
  const [leads, setLeads] = useState<LeadKort[] | null>(null)

  const laad = useCallback(async () => {
    const bedrijf = scope === 'alle' ? '' : `&company=${scope}`
    const [a, l] = await Promise.all([
      fetch('/api/acties').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/crm/records?entity=lead&limit=500${bedrijf}`).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
    ])
    setActies((a as Actie[]).filter(x => scope === 'alle' || !x.metadata.companyId || x.metadata.companyId === scope))
    setLeads(((l.items ?? []) as LeadKort[])
      .filter(r => moetVandaagOpgepakt(r))
      .sort((x, y) => (x.volgende_actie || '').localeCompare(y.volgende_actie || '')))
  }, [scope])

  useEffect(() => {
    if (!scopeGeladen) return
    laad()
    const onFocus = () => laad()
    window.addEventListener('focus', onFocus)
    const stop = onDataChanged(() => laad())
    return () => {
      window.removeEventListener('focus', onFocus)
      stop()
    }
  }, [laad, scopeGeladen])

  const laden = acties === null || leads === null
  const aantal = (acties?.length ?? 0) + (leads?.length ?? 0)
  const teLaat = (leads ?? []).filter(l => opvolgStand(l.volgende_actie) === 'te laat').length

  return (
    <div className={`card flex flex-col min-h-0 xl:p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-1 shrink-0">
        <Bell size={15} className={teLaat > 0 ? 'text-brand-status-red' : 'text-brand-status-orange'} />
        <h2 className="font-semibold text-body text-brand-text-primary">Vandaag oppakken</h2>
        {aantal > 0 && (
          <span className="text-caption text-brand-text-secondary bg-brand-page-medium rounded-full px-2 py-0.5">{aantal}</span>
        )}
        {teLaat > 0 && (
          <span className="text-caption text-brand-status-red bg-brand-status-red/10 rounded-full px-2 py-0.5">{teLaat} te laat</span>
        )}
        <Link href="/crm/leads" className="ml-auto text-caption text-brand-text-secondary hover:text-brand-text-primary">
          Leadbord
        </Link>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {laden ? (
          <p className="text-caption text-brand-text-secondary py-3">Laden...</p>
        ) : aantal === 0 ? (
          <p className="text-body text-brand-text-secondary py-3 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-brand-status-green" /> Niets dat vandaag op je wacht
          </p>
        ) : (
          <>
            {acties!.map(a => <ActieRij key={a.id} actie={a} onUpdate={laad} />)}
            {leads!.map(l => {
              const stand = opvolgStand(l.volgende_actie)
              return (
                <Link
                  key={l.id}
                  href={`/crm/leads?open=${encodeURIComponent(l.name)}`}
                  className="flex items-center gap-3 py-2.5 border-b border-brand-card-border/15 last:border-0 hover:bg-brand-page-light rounded px-1 -mx-1"
                >
                  <UserRound size={16} className="text-brand-lav-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-body text-brand-text-primary truncate">
                      {l.name}
                      <span className="text-caption text-brand-text-secondary ml-2">{faseDef(l.status)?.label ?? l.status}</span>
                    </p>
                    {l.volgende_actie_notitie && (
                      <p className="text-caption text-brand-text-secondary truncate">{l.volgende_actie_notitie}</p>
                    )}
                  </div>
                  <span className={`text-caption shrink-0 ${stand === 'te laat' ? 'text-brand-status-red' : 'text-brand-status-orange'}`}>
                    {opvolgLabel(l.volgende_actie)}
                  </span>
                </Link>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
