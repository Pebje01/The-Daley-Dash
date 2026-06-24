'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, CreditCard, RefreshCw, Search } from 'lucide-react'
import { Betaling, BetalingStatus } from '@/lib/types'
import { getCompany } from '@/lib/companies'
import { onDataChanged } from '@/lib/events'
import { createClient } from '@/lib/supabase/client'
import { useColumnOrder, useColumnDnD } from '@/lib/columnOrder'
import { ColumnGrip } from '@/components/ColumnGrip'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

// Kolommen voor de betalingen-tabel (verschuifbaar).
const BETALING_KOLOMMEN: { key: string; label: string; align?: 'right' }[] = [
  { key: 'referentie', label: 'Referentie' },
  { key: 'klant', label: 'Klant' },
  { key: 'bedrijf', label: 'Bedrijf' },
  { key: 'status', label: 'Status' },
  { key: 'methode', label: 'Methode' },
  { key: 'datum', label: 'Datum' },
  { key: 'bedrag', label: 'Bedrag', align: 'right' },
]

const statusTabs: { label: string; value: BetalingStatus | 'alle' }[] = [
  { label: 'Alle', value: 'alle' },
  { label: 'Openstaand', value: 'openstaand' },
  { label: 'Betaald', value: 'betaald' },
  { label: 'Mislukt', value: 'mislukt' },
  { label: 'Terugbetaald', value: 'terugbetaald' },
]

function BetalingStatusBadge({ status }: { status: BetalingStatus }) {
  const styles: Record<BetalingStatus, string> = {
    openstaand: 'bg-amber-50 text-amber-700 border-amber-200',
    betaald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    mislukt: 'bg-red-50 text-red-700 border-red-200',
    terugbetaald: 'bg-gray-50 text-gray-600 border-gray-200',
  }
  const labels: Record<BetalingStatus, string> = {
    openstaand: 'Openstaand',
    betaald: 'Betaald',
    mislukt: 'Mislukt',
    terugbetaald: 'Terugbetaald',
  }
  return (
    <span className={`pill border ${styles[status]}`}>{labels[status]}</span>
  )
}

export default function BetalingenPage() {
  const { order, move } = useColumnOrder('betalingen', BETALING_KOLOMMEN.map(c => c.key))
  const dnd = useColumnDnD(move)
  const [betalingen, setBetalingen] = useState<Betaling[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<BetalingStatus | 'alle'>('alle')
  const [search, setSearch] = useState('')

  const loadBetalingen = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'alle') params.set('status', statusFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/betalingen?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Betalingen laden mislukt')
      setBetalingen(json)
    } catch (e: any) {
      console.error('loadBetalingen fout:', e)
      setLoadError(e?.message || 'Betalingen laden mislukt')
      setBetalingen([])
    }
    setLoading(false)
  }

  useEffect(() => { loadBetalingen() }, [statusFilter, search])

  // Ververs mee bij wijzigingen elders (drawer, andere pagina's) en via Supabase Realtime
  useEffect(() => {
    const cleanup = onDataChanged((type) => {
      if (type === 'betalingen' || type === 'facturen') loadBetalingen()
    })
    const supabase = createClient()
    const channel = supabase
      .channel('betalingen-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'betalingen' }, () => loadBetalingen())
      .subscribe()
    const onFocus = () => loadBetalingen()
    const onVisible = () => { if (document.visibilityState === 'visible') loadBetalingen() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cleanup()
      supabase.removeChannel(channel)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search])

  const totalBetaald = betalingen.filter(b => b.status === 'betaald').reduce((s, b) => s + b.amount, 0)
  const totalOpen = betalingen.filter(b => b.status === 'openstaand').reduce((s, b) => s + b.amount, 0)
  const aantalBetaald = betalingen.filter(b => b.status === 'betaald').length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">Betalingen</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            Overzicht van ontvangen betalingen en openstaand saldo.
          </p>
        </div>
        <Link href="/facturen" className="btn-secondary">
          Facturen bekijken <ArrowRight size={14} />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Ontvangen</p>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(totalBetaald)}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Openstaand</p>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(totalOpen)}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Ontvangen betalingen</p>
          <p className="font-uxum text-stat text-brand-text-primary">{aantalBetaald}</p>
        </div>
      </div>

      {loadError && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-body text-red-700 font-medium mb-1">Betalingen konden niet geladen worden</p>
          <p className="text-caption text-red-600">{loadError}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-brand-page-light rounded-brand-sm p-1">
          {statusTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-brand-sm text-caption transition-colors ${
                statusFilter === tab.value
                  ? 'bg-white text-brand-text-primary font-medium shadow-sm'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek op klant of referentie..."
            className="input pl-9 w-full"
          />
        </div>
        <button onClick={loadBetalingen} className="btn-secondary py-1.5">
          <RefreshCw size={13} /> Vernieuwen
        </button>
      </div>

      {/* Tabel */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-brand-text-secondary">Laden...</div>
        ) : betalingen.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-body text-brand-text-primary">Nog geen betalingen</p>
            <p className="text-caption text-brand-text-secondary mt-1">
              Betalingen verschijnen hier zodra facturen betaald worden of handmatig worden toegevoegd.
            </p>
          </div>
        ) : (
          <table className="w-full text-body">
            <thead className="bg-brand-page-light border-b border-brand-page-medium">
              <tr>
                {order.map(key => {
                  const col = BETALING_KOLOMMEN.find(c => c.key === key)
                  if (!col) return null
                  return (
                    <th
                      key={key}
                      {...dnd.headerProps(key)}
                      className={`group/col px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide cursor-grab active:cursor-grabbing select-none hover:bg-black/[0.03] transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'} ${dnd.isOver(key) ? 'border-l-2 border-indigo-500 bg-indigo-50/40' : 'border-l-2 border-transparent'} ${dnd.isDragging(key) ? 'opacity-40' : ''}`}
                      title="Sleep om te verplaatsen"
                    >
                      <span className="inline-flex items-center gap-1">
                        <ColumnGrip />
                        {col.label}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-page-medium">
              {betalingen.map(b => {
                const company = getCompany(b.companyId)
                const cell: Record<string, ReactNode> = {
                  referentie: <td key="referentie" className="px-4 py-3 font-semibold">{b.reference || '–'}</td>,
                  klant: <td key="klant" className="px-4 py-3">{b.client.name}</td>,
                  bedrijf: (
                    <td key="bedrijf" className="px-4 py-3">
                      {company && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: company.color }} />
                          {company.shortName}
                        </span>
                      )}
                    </td>
                  ),
                  status: <td key="status" className="px-4 py-3"><BetalingStatusBadge status={b.status} /></td>,
                  methode: <td key="methode" className="px-4 py-3 text-brand-text-secondary capitalize">{b.method || '–'}</td>,
                  datum: (
                    <td key="datum" className="px-4 py-3 text-brand-text-secondary">
                      {b.paidAt ? new Date(b.paidAt).toLocaleDateString('nl-NL') : new Date(b.createdAt).toLocaleDateString('nl-NL')}
                    </td>
                  ),
                  bedrag: <td key="bedrag" className="px-4 py-3 text-right font-semibold">{euro(b.amount)}</td>,
                }
                return (
                  <tr key={b.id} className="hover:bg-brand-page-light/50 transition-colors">
                    {order.map(key => cell[key])}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Mollie sectie */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard size={15} />
          <h2 className="font-semibold text-body">Mollie betaallinks</h2>
        </div>
        <p className="text-body text-brand-text-secondary">
          Voeg een Mollie betaal-URL toe per factuur via de factuurdetailpagina. De link verschijnt automatisch op de PDF en op de publieke factuurpagina als groene betaalknop.
        </p>
      </div>
    </div>
  )
}
