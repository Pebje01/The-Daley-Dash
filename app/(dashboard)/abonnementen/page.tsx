'use client'

import { useEffect, useState } from 'react'
import { Plus, Repeat2, Search, Pencil, Trash2 } from 'lucide-react'
import { Abonnement, AbonnementStatus, AbonnementInterval, CompanyId } from '@/lib/types'
import { getCompany, COMPANIES } from '@/lib/companies'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

const statusTabs: { label: string; value: AbonnementStatus | 'alle' }[] = [
  { label: 'Alle', value: 'alle' },
  { label: 'Actief', value: 'actief' },
  { label: 'Gepauzeerd', value: 'gepauzeerd' },
  { label: 'Opgezegd', value: 'opgezegd' },
  { label: 'Verlopen', value: 'verlopen' },
]

function AbonnementStatusBadge({ status }: { status: AbonnementStatus }) {
  const styles: Record<AbonnementStatus, string> = {
    actief: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    gepauzeerd: 'bg-amber-50 text-amber-700 border-amber-200',
    opgezegd: 'bg-red-50 text-red-600 border-red-200',
    verlopen: 'bg-gray-50 text-gray-600 border-gray-200',
  }
  const labels: Record<AbonnementStatus, string> = {
    actief: 'Actief',
    gepauzeerd: 'Gepauzeerd',
    opgezegd: 'Opgezegd',
    verlopen: 'Verlopen',
  }
  return (
    <span className={`pill border ${styles[status]}`}>{labels[status]}</span>
  )
}

const intervalLabels: Record<AbonnementInterval, string> = {
  maandelijks: 'Maandelijks',
  kwartaal: 'Per kwartaal',
  jaarlijks: 'Jaarlijks',
}

export default function AbonnementenPage() {
  const [abonnementen, setAbonnementen] = useState<Abonnement[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<AbonnementStatus | 'alle'>('alle')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [formCompanyId, setFormCompanyId] = useState<CompanyId>('wgb')
  const [formClientName, setFormClientName] = useState('')
  const [formClientEmail, setFormClientEmail] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formBtw, setFormBtw] = useState(21)
  const [formInterval, setFormInterval] = useState<AbonnementInterval>('maandelijks')
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split('T')[0])
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const loadAbonnementen = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'alle') params.set('status', statusFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/abonnementen?${params}`)
      if (res.ok) setAbonnementen(await res.json())
    } catch { /* */ }
    setLoading(false)
  }

  useEffect(() => { loadAbonnementen() }, [statusFilter, search])

  const activeCount = abonnementen.filter(a => a.status === 'actief').length
  const monthlyTotal = abonnementen
    .filter(a => a.status === 'actief')
    .reduce((sum, a) => {
      if (a.interval === 'maandelijks') return sum + a.amount
      if (a.interval === 'kwartaal') return sum + a.amount / 3
      if (a.interval === 'jaarlijks') return sum + a.amount / 12
      return sum
    }, 0)
  const yearlyTotal = monthlyTotal * 12

  const handleSave = async () => {
    if (!formClientName || !formDescription || !formAmount) return
    setSaving(true)
    try {
      const res = await fetch('/api/abonnementen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: formCompanyId,
          client: { name: formClientName, email: formClientEmail || undefined },
          description: formDescription,
          amount: parseFloat(formAmount),
          btwPercentage: formBtw,
          interval: formInterval,
          startDate: formStartDate,
          notes: formNotes || undefined,
        }),
      })
      if (res.ok) {
        setShowForm(false)
        setFormClientName(''); setFormClientEmail(''); setFormDescription('')
        setFormAmount(''); setFormNotes('')
        loadAbonnementen()
      }
    } catch { /* */ }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit abonnement wilt verwijderen?')) return
    await fetch(`/api/abonnementen/${id}`, { method: 'DELETE' })
    loadAbonnementen()
  }

  const handleStatusChange = async (id: string, status: AbonnementStatus) => {
    await fetch(`/api/abonnementen/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadAbonnementen()
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">Abonnementen</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            Beheer lopende abonnementen en terugkerende facturatie.
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus size={14} /> Nieuw abonnement
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Actieve abonnementen</p>
          <p className="font-uxum text-stat text-brand-text-primary">{activeCount}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Terugkerend per maand</p>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(monthlyTotal)}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Verwachte jaaromzet</p>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(yearlyTotal)}</p>
        </div>
      </div>

      {/* Nieuw abonnement formulier */}
      {showForm && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-body">Nieuw abonnement toevoegen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-caption text-brand-text-secondary block mb-1">Bedrijf</label>
              <select value={formCompanyId} onChange={e => setFormCompanyId(e.target.value as CompanyId)} className="input w-full">
                {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-caption text-brand-text-secondary block mb-1">Klant *</label>
              <input value={formClientName} onChange={e => setFormClientName(e.target.value)} className="input w-full" placeholder="Klantnaam" />
            </div>
            <div>
              <label className="text-caption text-brand-text-secondary block mb-1">Email</label>
              <input value={formClientEmail} onChange={e => setFormClientEmail(e.target.value)} className="input w-full" placeholder="klant@email.nl" />
            </div>
            <div>
              <label className="text-caption text-brand-text-secondary block mb-1">Omschrijving *</label>
              <input value={formDescription} onChange={e => setFormDescription(e.target.value)} className="input w-full" placeholder="Website onderhoud" />
            </div>
            <div>
              <label className="text-caption text-brand-text-secondary block mb-1">Bedrag excl. BTW *</label>
              <input type="number" step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} className="input w-full" placeholder="100.00" />
            </div>
            <div>
              <label className="text-caption text-brand-text-secondary block mb-1">BTW %</label>
              <select value={formBtw} onChange={e => setFormBtw(Number(e.target.value))} className="input w-full">
                <option value={21}>21%</option>
                <option value={9}>9%</option>
                <option value={0}>0%</option>
              </select>
            </div>
            <div>
              <label className="text-caption text-brand-text-secondary block mb-1">Interval</label>
              <select value={formInterval} onChange={e => setFormInterval(e.target.value as AbonnementInterval)} className="input w-full">
                <option value="maandelijks">Maandelijks</option>
                <option value="kwartaal">Per kwartaal</option>
                <option value="jaarlijks">Jaarlijks</option>
              </select>
            </div>
            <div>
              <label className="text-caption text-brand-text-secondary block mb-1">Startdatum</label>
              <input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} className="input w-full" />
            </div>
          </div>
          <div>
            <label className="text-caption text-brand-text-secondary block mb-1">Opmerkingen</label>
            <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} className="input w-full" rows={2} placeholder="Contractdetails, voorwaarden..." />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !formClientName || !formDescription || !formAmount} className="btn-primary">
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Annuleren</button>
          </div>
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
            placeholder="Zoek op klant..."
            className="input pl-9 w-full"
          />
        </div>
      </div>

      {/* Tabel */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-brand-text-secondary">Laden...</div>
        ) : abonnementen.length === 0 ? (
          <div className="p-8 text-center">
            <Repeat2 size={32} className="mx-auto text-brand-text-secondary/30 mb-3" />
            <p className="text-body text-brand-text-primary">Nog geen abonnementen</p>
            <p className="text-caption text-brand-text-secondary mt-1">
              Voeg een abonnement toe om terugkerende facturatie bij te houden.
            </p>
          </div>
        ) : (
          <table className="w-full text-body">
            <thead className="bg-brand-page-light border-b border-brand-page-medium">
              <tr>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Klant</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrijf</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Omschrijving</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Interval</th>
                <th className="text-right px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrag</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Volgende factuur</th>
                <th className="text-center px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-page-medium">
              {abonnementen.map(a => {
                const company = getCompany(a.companyId)
                return (
                  <tr key={a.id} className="hover:bg-brand-page-light/50 transition-colors">
                    <td className="px-4 py-3 font-semibold">{a.client.name}</td>
                    <td className="px-4 py-3">
                      {company && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: company.color }} />
                          {company.shortName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{a.description}</td>
                    <td className="px-4 py-3">
                      <select
                        value={a.status}
                        onChange={e => handleStatusChange(a.id, e.target.value as AbonnementStatus)}
                        className="text-caption bg-transparent border-0 cursor-pointer p-0"
                      >
                        <option value="actief">Actief</option>
                        <option value="gepauzeerd">Gepauzeerd</option>
                        <option value="opgezegd">Opgezegd</option>
                        <option value="verlopen">Verlopen</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-brand-text-secondary">{intervalLabels[a.interval]}</td>
                    <td className="px-4 py-3 text-right font-semibold">{euro(a.amount)}</td>
                    <td className="px-4 py-3 text-brand-text-secondary">
                      {a.nextInvoiceDate ? new Date(a.nextInvoiceDate).toLocaleDateString('nl-NL') : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleDelete(a.id)} className="text-brand-text-secondary/50 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
