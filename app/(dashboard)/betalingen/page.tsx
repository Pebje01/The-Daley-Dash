'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CreditCard, RefreshCw, Search } from 'lucide-react'
import { Betaling, BetalingStatus } from '@/lib/types'
import { getCompany } from '@/lib/companies'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

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
  const [betalingen, setBetalingen] = useState<Betaling[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<BetalingStatus | 'alle'>('alle')
  const [search, setSearch] = useState('')

  const loadBetalingen = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'alle') params.set('status', statusFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/betalingen?${params}`)
      if (res.ok) setBetalingen(await res.json())
    } catch { /* */ }
    setLoading(false)
  }

  useEffect(() => { loadBetalingen() }, [statusFilter, search])

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
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Referentie</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Klant</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrijf</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Methode</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Datum</th>
                <th className="text-right px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-page-medium">
              {betalingen.map(b => {
                const company = getCompany(b.companyId)
                return (
                  <tr key={b.id} className="hover:bg-brand-page-light/50 transition-colors">
                    <td className="px-4 py-3 font-semibold">{b.reference || '—'}</td>
                    <td className="px-4 py-3">{b.client.name}</td>
                    <td className="px-4 py-3">
                      {company && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: company.color }} />
                          {company.shortName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3"><BetalingStatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-brand-text-secondary capitalize">{b.method || '—'}</td>
                    <td className="px-4 py-3 text-brand-text-secondary">
                      {b.paidAt ? new Date(b.paidAt).toLocaleDateString('nl-NL') : new Date(b.createdAt).toLocaleDateString('nl-NL')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{euro(b.amount)}</td>
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
          <h2 className="font-semibold text-body">Mollie integratie</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-4">
            <p className="text-caption text-brand-text-secondary mb-1">Koppeling</p>
            <p className="font-semibold text-body">Nog niet gekoppeld</p>
          </div>
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-4">
            <p className="text-caption text-brand-text-secondary mb-1">Sync logs</p>
            <p className="font-semibold text-body">Beschikbaar na koppeling</p>
          </div>
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-4">
            <p className="text-caption text-brand-text-secondary mb-1">Webhook status</p>
            <p className="font-semibold text-body">Beschikbaar na koppeling</p>
          </div>
        </div>
      </div>
    </div>
  )
}
