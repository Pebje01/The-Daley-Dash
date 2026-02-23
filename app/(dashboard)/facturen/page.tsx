'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { getFacturen } from '@/lib/store'
import { getCompany } from '@/lib/companies'
import { Factuur, FactuurStatus } from '@/lib/types'
import { FactuurStatusBadge } from '@/components/StatusBadge'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function FacturenPage() {
  const [facturen, setFacturen] = useState<Factuur[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FactuurStatus | 'alle'>('alle')

  useEffect(() => { setFacturen(getFacturen()) }, [])

  const filtered = facturen.filter(f => {
    const matchSearch = !search || f.client.name.toLowerCase().includes(search.toLowerCase()) || f.number.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filter === 'alle' || f.status === filter
    return matchSearch && matchStatus
  })

  const totalOpen = facturen.filter(f => f.status === 'verzonden' || f.status === 'te-laat').reduce((s, f) => s + f.total, 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-uxum text-sidebar-t text-brand-text-primary">Facturen</h1>
          <p className="text-body text-brand-text-secondary mt-0.5">{facturen.length} facturen · <span className="text-brand-status-orange font-medium">{euro(totalOpen)} openstaand</span></p>
        </div>
        <Link href="/facturen/nieuw" className="btn-primary">
          <Plus size={15} /> Nieuwe factuur
        </Link>
      </div>

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary" />
          <input className="input pl-8" placeholder="Zoek op naam of nummer…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-brand-card-bg border-brand border-brand-card-border rounded-brand-btn p-1">
          {(['alle', 'concept', 'verzonden', 'betaald', 'te-laat'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-brand-sm text-pill font-medium transition-colors ${filter === s ? 'bg-brand-purple text-white' : 'text-brand-text-secondary hover:text-brand-text-primary'}`}>
              {s === 'alle' ? 'Alle' : s === 'te-laat' ? 'Te laat' : s}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-body">
          <thead className="bg-brand-page-light border-b border-brand-page-medium">
            <tr>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Nummer</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Klant</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrijf</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Datum</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Vervaldatum</th>
              <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrag</th>
              <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-page-medium">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-brand-text-secondary">
                {facturen.length === 0 ? (
                  <div>
                    <p className="mb-2">Nog geen facturen aangemaakt</p>
                    <Link href="/facturen/nieuw" className="text-brand-purple font-semibold underline underline-offset-2 text-body">Maak je eerste factuur</Link>
                  </div>
                ) : 'Geen resultaten gevonden'}
              </td></tr>
            ) : filtered.map(f => {
              const co = getCompany(f.companyId)
              const isLate = f.status === 'te-laat' || (f.status === 'verzonden' && new Date(f.dueDate) < new Date())
              return (
                <tr key={f.id} className="hover:bg-brand-page-light cursor-pointer">
                  <td className="px-5 py-3.5 font-mono text-caption text-brand-text-secondary">{f.number}</td>
                  <td className="px-5 py-3.5 font-semibold text-brand-text-primary">{f.client.name}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-pill px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: co.bgColor, color: co.color }}>{co.shortName}</span>
                  </td>
                  <td className="px-5 py-3.5 text-brand-text-secondary">{new Date(f.date).toLocaleDateString('nl-NL')}</td>
                  <td className={`px-5 py-3.5 ${isLate ? 'text-brand-status-red font-semibold' : 'text-brand-text-secondary'}`}>
                    {new Date(f.dueDate).toLocaleDateString('nl-NL')}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-brand-text-primary">{euro(f.total)}</td>
                  <td className="px-5 py-3.5 text-right"><FactuurStatusBadge status={f.status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
