'use client'
import { Suspense, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, RefreshCw } from 'lucide-react'
import { getCompany, COMPANIES } from '@/lib/companies'
import { Offerte, OfferteStatus, CompanyId } from '@/lib/types'
import { OfferteStatusBadge } from '@/components/StatusBadge'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

const STATUS_TABS: { key: OfferteStatus | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'concept', label: 'Concept' },
  { key: 'verzonden', label: 'Verzonden' },
  { key: 'geaccepteerd', label: 'Geaccepteerd' },
  { key: 'afgewezen', label: 'Afgewezen' },
  { key: 'verlopen', label: 'Verlopen' },
]

export default function OffertesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-brand-text-secondary">Laden…</div>}>
      <OffertesContent />
    </Suspense>
  )
}

function OffertesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [offertes, setOffertes] = useState<Offerte[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OfferteStatus | 'alle'>('alle')
  const [companyFilter, setCompanyFilter] = useState<CompanyId | 'alle'>(
    (searchParams.get('bedrijf') as CompanyId) || 'alle'
  )

  const fetchOffertes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'alle') params.set('status', statusFilter)
      if (companyFilter !== 'alle') params.set('company', companyFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/offertes?${params}`)
      if (res.ok) setOffertes(await res.json())
    } catch (e) {
      console.error('Failed to fetch offertes:', e)
    }
    setLoading(false)
  }, [statusFilter, companyFilter, search])

  useEffect(() => { fetchOffertes() }, [fetchOffertes])

  const filtered = offertes.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    return o.client.name.toLowerCase().includes(q) || o.number.toLowerCase().includes(q)
  })

  const totalOpen = offertes.filter(o => o.status === 'verzonden').reduce((s, o) => s + o.total, 0)

  const newOfferteHref = companyFilter !== 'alle'
    ? `/offertes/nieuw?bedrijf=${companyFilter}`
    : '/offertes/nieuw'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-uxum text-sidebar-t text-brand-text-primary">Offertes</h1>
          <p className="text-body text-brand-text-secondary mt-0.5">
            {offertes.length} offertes · <span className="text-brand-blue-accent font-medium">{euro(totalOpen)} uitstaand</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchOffertes} className="btn-secondary px-2.5" title="Vernieuwen">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <Link href={newOfferteHref} className="btn-primary">
            <Plus size={15} /> Nieuwe offerte
          </Link>
        </div>
      </div>

      {/* Company tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setCompanyFilter('alle')}
          className={`px-3 py-1.5 rounded-brand-btn text-caption font-medium transition-colors border ${
            companyFilter === 'alle'
              ? 'bg-brand-purple text-white border-brand-purple'
              : 'border-brand-card-border text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          Alle bedrijven
        </button>
        {COMPANIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCompanyFilter(c.id)}
            className={`px-3 py-1.5 rounded-brand-btn text-caption font-medium transition-colors border flex items-center gap-1.5 ${
              companyFilter === c.id
                ? 'text-white border-transparent'
                : 'border-brand-card-border text-brand-text-secondary hover:text-brand-text-primary'
            }`}
            style={companyFilter === c.id ? { backgroundColor: c.color } : undefined}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: companyFilter === c.id ? 'white' : c.color }} />
            {c.shortName}
          </button>
        ))}
      </div>

      {/* Search + status filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary" />
          <input
            className="input pl-8"
            placeholder="Zoek op naam of nummer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchOffertes()}
          />
        </div>
        <div className="flex gap-1 bg-brand-card-bg border-brand border-brand-card-border rounded-brand-btn p-1">
          {STATUS_TABS.map(s => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={`px-3 py-1 rounded-brand-sm text-pill font-medium transition-colors ${
                statusFilter === s.key
                  ? 'bg-brand-purple text-white'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-body">
          <thead className="bg-brand-page-light border-b border-brand-page-medium">
            <tr>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Nummer</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Klant</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrijf</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Datum</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Geldig tot</th>
              <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrag</th>
              <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-page-medium">
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-brand-text-secondary">
                  <RefreshCw size={18} className="animate-spin inline mr-2" /> Laden…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-brand-text-secondary">
                  {offertes.length === 0 ? (
                    <div>
                      <p className="mb-2">Nog geen offertes aangemaakt</p>
                      <Link href="/offertes/nieuw" className="text-brand-purple font-semibold underline underline-offset-2 text-body">
                        Maak je eerste offerte
                      </Link>
                    </div>
                  ) : 'Geen resultaten gevonden'}
                </td>
              </tr>
            ) : filtered.map(o => {
              const co = getCompany(o.companyId)
              const isExpired = o.status === 'verzonden' && new Date(o.validUntil) < new Date()
              return (
                <tr
                  key={o.id}
                  className="hover:bg-brand-page-light cursor-pointer transition-colors"
                  onClick={() => router.push(`/offertes/${o.id}`)}
                >
                  <td className="px-5 py-3.5 font-mono text-caption text-brand-text-secondary">{o.number}</td>
                  <td className="px-5 py-3.5 font-semibold text-brand-text-primary">{o.client.name}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-pill px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: co.bgColor, color: co.color }}>
                      {co.shortName}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-brand-text-secondary">{new Date(o.date).toLocaleDateString('nl-NL')}</td>
                  <td className={`px-5 py-3.5 ${isExpired ? 'text-brand-status-red font-semibold' : 'text-brand-text-secondary'}`}>
                    {new Date(o.validUntil).toLocaleDateString('nl-NL')}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-brand-text-primary">{euro(o.total)}</td>
                  <td className="px-5 py-3.5 text-right"><OfferteStatusBadge status={isExpired ? 'verlopen' : o.status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
