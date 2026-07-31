'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Ban, RefreshCw, Undo2, BadgeDollarSign, Building2, ContactRound } from 'lucide-react'

interface BlockRecord {
  id: string
  entity_type: 'lead' | 'contact' | 'company'
  name: string
  status?: string | null
  contact_status_reden?: string | null
  laatste_contact?: string | null
  updated_at?: string | null
}

const ENTITY_META: Record<BlockRecord['entity_type'], { label: string; href: string; icon: typeof Ban }> = {
  lead: { label: 'Lead', href: '/crm/leads', icon: BadgeDollarSign },
  contact: { label: 'Contact', href: '/crm/contacten', icon: ContactRound },
  company: { label: 'Bedrijf', href: '/crm/bedrijven', icon: Building2 },
}

function fmtDatum(iso?: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function BlocklistPage() {
  const [items, setItems] = useState<BlockRecord[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'done'>('loading')
  const [bezig, setBezig] = useState<string | null>(null)

  const load = useCallback(() => {
    setState('loading')
    fetch('/api/crm/blocklist', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => { setItems(Array.isArray(d.items) ? d.items : []); setState('done') })
      .catch(() => setState('error'))
  }, [])

  useEffect(() => { load() }, [load])

  const deblokkeer = async (rec: BlockRecord) => {
    if (!confirm(`${rec.name} weer benaderbaar maken?`)) return
    setBezig(rec.id)
    try {
      const res = await fetch(`/api/crm/records/${rec.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_status: 'open' }),
      })
      if (!res.ok) throw new Error()
      setItems((prev) => prev.filter((i) => i.id !== rec.id))
    } catch {
      alert('Deblokkeren mislukt, probeer opnieuw.')
    } finally {
      setBezig(null)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary flex items-center gap-2">
            <Ban size={22} className="text-gray-700" /> Blocklist
          </h1>
          <p className="text-sm text-brand-text-secondary mt-0.5">
            {items.length} {items.length === 1 ? 'relatie wil' : 'relaties willen'} niet meer benaderd worden
          </p>
        </div>
        <button onClick={load} className="btn-secondary text-sm" disabled={state === 'loading'}>
          <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} /> Ververs
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {state === 'loading' ? (
          <div className="text-center py-16 text-brand-text-secondary text-sm">
            <RefreshCw size={16} className="animate-spin inline mr-2" /> Laden…
          </div>
        ) : state === 'error' ? (
          <div className="text-center py-16">
            <p className="text-sm text-red-500 mb-3">Blocklist laden mislukt.</p>
            <button onClick={load} className="btn-secondary text-sm">
              <RefreshCw size={13} /> Opnieuw proberen
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Ban size={28} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-brand-text-secondary">Niemand op de blocklist.</p>
            <p className="text-xs text-brand-text-secondary mt-1 opacity-70">
              Zet een relatie op &quot;Nooit meer benaderen&quot; via de contactstatus op haar kaart.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-brand-card-border">
            {items.map((rec) => {
              const meta = ENTITY_META[rec.entity_type]
              const Icoon = meta.icon
              const laatste = fmtDatum(rec.laatste_contact)
              return (
                <div key={rec.id} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-page-light transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <Icoon size={15} className="text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`${meta.href}?open=${encodeURIComponent(rec.name)}`}
                        className="text-sm font-medium text-brand-text-primary hover:text-brand-lavender truncate"
                      >
                        {rec.name}
                      </Link>
                      <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 shrink-0">
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-brand-text-secondary truncate">
                      {rec.contact_status_reden || 'Geen reden genoteerd'}
                      {laatste && <span className="opacity-60"> · laatste contact {laatste}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => deblokkeer(rec)}
                    disabled={bezig === rec.id}
                    className="btn-secondary text-xs shrink-0 disabled:opacity-50"
                    title="Weer benaderbaar maken"
                  >
                    {bezig === rec.id ? <RefreshCw size={12} className="animate-spin" /> : <Undo2 size={12} />}
                    Deblokkeren
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
