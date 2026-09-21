'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Target } from 'lucide-react'
import { useActiveCompany } from '@/components/CompanyContext'
import { onDataChanged } from '@/lib/events'
import { contactStand, faseDef, opvolgLabel, opvolgStand, recordWaarde } from '@/lib/crm/pipeline'

interface LeadKort {
  id: string
  name: string
  status: string | null
  volgende_actie: string | null
  volgende_actie_notitie: string | null
  contact_status?: string | null
  contact_status_tot?: string | null
  custom_fields?: unknown
  ai_score?: number | null
}

const MAX_RIJEN = 8

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

/** Een lead die nog loopt: niet gewonnen, afgesloten, gepauzeerd of geblokkeerd. */
function loopt(l: LeadKort) {
  const groep = faseDef(l.status)?.groep
  if (groep === 'Done' || groep === 'Closed') return false
  const contact = contactStand(l)
  return contact !== 'blokkade' && contact !== 'pauze'
}

/** Eerst wat te laat is, dan wat vandaag moet, daarna de rest. */
function urgentie(l: LeadKort) {
  const stand = opvolgStand(l.volgende_actie)
  return stand === 'te laat' ? 0 : stand === 'vandaag' ? 1 : 2
}

/**
 * De leads die er nu het meest toe doen, op het dashboard. Dit stond eerst als
 * "Vandaag oppakken", maar dat was een tweede to-do list naast de echte. Nu is
 * het alleen leads: eerst waar de opvolging te laat is of vandaag moet, daarna
 * de lopende leads met de hoogste waarde en dan de hoogste AI-score. De
 * financiële acties (betaalherinneringen, offertes die wachten) staan op
 * /financieel.
 */
export default function BelangrijksteLeads({ className = '' }: { className?: string }) {
  const { scope, scopeGeladen } = useActiveCompany()
  const [leads, setLeads] = useState<LeadKort[] | null>(null)

  const laad = useCallback(async () => {
    const bedrijf = scope === 'alle' ? '' : `&company=${scope}`
    const l = await fetch(`/api/crm/records?entity=lead&limit=500${bedrijf}`)
      .then(r => r.ok ? r.json() : { items: [] })
      .catch(() => ({ items: [] }))
    setLeads(((l.items ?? []) as LeadKort[])
      .filter(loopt)
      .sort((a, b) =>
        urgentie(a) - urgentie(b) ||
        (a.volgende_actie || '').localeCompare(b.volgende_actie || '') ||
        recordWaarde(b.custom_fields) - recordWaarde(a.custom_fields) ||
        (b.ai_score ?? -1) - (a.ai_score ?? -1) ||
        a.name.localeCompare(b.name)))
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

  const aandacht = (leads ?? []).filter(l => urgentie(l) < 2).length
  const teLaat = (leads ?? []).filter(l => urgentie(l) === 0).length
  const zichtbaar = (leads ?? []).slice(0, MAX_RIJEN)
  const meer = (leads?.length ?? 0) - zichtbaar.length

  return (
    <div className={`card flex flex-col min-h-0 xl:p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-1 shrink-0">
        <Target size={15} className="text-brand-lav-accent" />
        <h2 className="font-semibold text-body text-brand-text-primary">Belangrijkste leads</h2>
        {leads && leads.length > 0 && (
          <span className="text-caption text-brand-text-secondary bg-brand-page-medium rounded-full px-2 py-0.5">{leads.length} lopend</span>
        )}
        {teLaat > 0 ? (
          <span className="text-caption text-brand-status-red bg-brand-status-red/10 rounded-full px-2 py-0.5">{teLaat} te laat</span>
        ) : aandacht > 0 ? (
          <span className="text-caption text-brand-status-orange bg-brand-status-orange/10 rounded-full px-2 py-0.5">{aandacht} vandaag</span>
        ) : null}
        <Link href="/crm/leads" className="ml-auto text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
          Leadbord <ArrowRight size={12} />
        </Link>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {leads === null ? (
          <p className="text-caption text-brand-text-secondary py-3">Laden...</p>
        ) : leads.length === 0 ? (
          <p className="text-body text-brand-text-secondary py-3 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-brand-status-green" /> Geen lopende leads
          </p>
        ) : (
          <>
            {zichtbaar.map(l => {
              const stand = opvolgStand(l.volgende_actie)
              const waarde = recordWaarde(l.custom_fields)
              const fase = faseDef(l.status)
              return (
                <Link
                  key={l.id}
                  href={`/crm/leads?open=${encodeURIComponent(l.name)}`}
                  className="flex items-center gap-3 py-2 border-b border-brand-card-border/15 last:border-0 hover:bg-brand-page-light rounded px-1 -mx-1"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: fase?.kleur ?? '#9ca3af' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-body text-brand-text-primary truncate">
                      {l.name}
                      <span className="text-caption text-brand-text-secondary ml-2">{fase?.label ?? l.status}</span>
                    </p>
                    {l.volgende_actie_notitie && stand !== 'geen' && stand !== 'gepland' && (
                      <p className="text-caption text-brand-text-secondary truncate">{l.volgende_actie_notitie}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-caption">
                    {waarde > 0 && <span className="font-semibold text-brand-text-primary">{euro(waarde)}</span>}
                    {typeof l.ai_score === 'number' && (
                      <span className="text-brand-text-secondary" title="AI-score">{l.ai_score}</span>
                    )}
                    {l.volgende_actie && (
                      <span className={stand === 'te laat' ? 'text-brand-status-red' : stand === 'vandaag' ? 'text-brand-status-orange' : 'text-brand-text-secondary'}>
                        {opvolgLabel(l.volgende_actie)}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
            {meer > 0 && (
              <Link href="/crm/leads" className="block text-caption text-brand-text-secondary hover:text-brand-text-primary pt-2">
                Nog {meer} op het leadbord
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}
