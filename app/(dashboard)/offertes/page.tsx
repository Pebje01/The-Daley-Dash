'use client'
import { Suspense, useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, Search, RefreshCw, ChevronDown, Trash2, Upload, FolderOpen } from 'lucide-react'
import { getCompany, COMPANIES } from '@/lib/companies'
import { Offerte, OfferteStatus, CompanyId } from '@/lib/types'
import { OfferteStatusBadge } from '@/components/StatusBadge'
import { useActiveCompany } from '@/components/CompanyContext'
import { dataChanged, onDataChanged } from '@/lib/events'
import { pickOfferteFolder, getOfferteFolder } from '@/lib/pdf/folderStorage'
import { useDrawer } from '@/components/DrawerContext'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

const STATUS_LIST: { key: OfferteStatus; label: string; dotClass: string }[] = [
  { key: 'concept', label: 'CONCEPT', dotClass: 'bg-brand-text-secondary' },
  { key: 'opgeslagen', label: 'OPGESLAGEN', dotClass: 'bg-brand-lav-accent' },
  { key: 'verstuurd', label: 'VERSTUURD', dotClass: 'bg-brand-blue-accent' },
  { key: 'akkoord', label: 'AKKOORD', dotClass: 'bg-brand-lime-accent' },
  { key: 'afgewezen', label: 'AFGEWEZEN', dotClass: 'bg-brand-pink-accent' },
  { key: 'verlopen', label: 'VERLOPEN', dotClass: 'bg-brand-status-orange' },
]

function InlineStatusSelect({
  status,
  onChangeStatus,
}: {
  status: OfferteStatus
  onChangeStatus: (newStatus: OfferteStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Bereken fixed positie zodat dropdown niet wordt afgesneden door overflow-hidden
  const [pos, setPos] = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (!open || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dropdownHeight = 190
    const spaceBelow = window.innerHeight - rect.bottom
    const shouldDropUp = spaceBelow < dropdownHeight
    setDropUp(shouldDropUp)
    setPos({
      top: shouldDropUp ? rect.top - dropdownHeight : rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
  }, [open])

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="inline-flex items-center gap-1 group"
      >
        <OfferteStatusBadge status={status} />
        <ChevronDown size={12} className="text-brand-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {open && (
        <div
          className="fixed z-50 bg-brand-card-bg rounded-brand-sm shadow-xl border border-brand-card-border py-1"
          style={{ top: pos.top, right: pos.right }}
        >
          {STATUS_LIST.map((opt) => (
            <button
              key={opt.key}
              onClick={(e) => {
                e.stopPropagation()
                if (opt.key !== status) onChangeStatus(opt.key)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-1.5 text-caption tracking-wide hover:bg-brand-page-light transition-colors flex items-center gap-2.5 whitespace-nowrap ${
                opt.key === status ? 'bg-brand-page-light' : ''
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.dotClass}`} />
              <span className={opt.key === status ? 'font-semibold text-brand-text-primary' : 'text-brand-text-secondary'}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ClickUp-stijl inline bewerkbare cel — enkelklik om te bewerken
function InlineEditableCell({
  value,
  type = 'text',
  onSave,
  formatDisplay,
  validate,
  className = '',
}: {
  value: string
  type?: 'text' | 'date'
  onSave: (_newValue: string) => Promise<void>
  formatDisplay?: (_value: string) => string
  validate?: (_value: string) => string | null
  className?: string
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)

  // Sync externe waarde wanneer niet aan het bewerken
  useEffect(() => {
    if (!isEditing) setEditValue(value)
  }, [value, isEditing])

  // Auto-focus + selecteer tekst bij start editing
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      if (type === 'text') inputRef.current.select()
    }
  }, [isEditing, type])

  const handleSave = async () => {
    if (savingRef.current) return
    // Geen wijziging → sluit zonder save
    if (editValue === value) {
      setIsEditing(false)
      setError(null)
      return
    }
    // Validatie
    if (validate) {
      const err = validate(editValue)
      if (err) {
        setError(err)
        return
      }
    }
    savingRef.current = true
    setIsSaving(true)
    setError(null)
    try {
      await onSave(editValue)
      setIsEditing(false)
    } catch {
      setError('Opslaan mislukt')
    }
    setIsSaving(false)
    savingRef.current = false
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(value)
      setIsEditing(false)
      setError(null)
    }
  }

  const handleBlur = () => {
    // Kleine delay voor date picker interactie
    setTimeout(() => {
      if (!savingRef.current && isEditing) handleSave()
    }, 150)
  }

  const displayValue = formatDisplay ? formatDisplay(value) : value

  if (isEditing) {
    return (
      <td className={className}>
        <div className="-my-1.5">
          <input
            ref={inputRef}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={isSaving}
            className={`w-full bg-white border rounded-brand-sm px-2 py-1 text-body text-brand-text-primary outline-none transition-colors
              ${error ? 'border-brand-status-red' : 'border-brand-purple/50 focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20'}
              ${isSaving ? 'opacity-50' : ''}
            `}
          />
          {error && <p className="text-brand-status-red text-[11px] leading-tight mt-0.5">{error}</p>}
        </div>
      </td>
    )
  }

  return (
    <td
      className={`${className} cursor-text hover:bg-brand-lavender-light/30 transition-colors`}
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      title="Klik om te bewerken"
    >
      <span className="border-b border-dashed border-transparent group-hover:border-brand-text-secondary/30 transition-colors">
        {displayValue}
      </span>
    </td>
  )
}

const STATUS_TABS: { key: OfferteStatus | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'concept', label: 'Concept' },
  { key: 'opgeslagen', label: 'Opgeslagen' },
  { key: 'verstuurd', label: 'Verstuurd' },
  { key: 'akkoord', label: 'Akkoord' },
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
  const searchParams = useSearchParams()
  const { activeCompany } = useActiveCompany()
  const { openDrawer } = useDrawer()
  const [offertes, setOffertes] = useState<Offerte[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OfferteStatus | 'alle'>('alle')
  const [showInclBtw, setShowInclBtw] = useState(true)
  const [companyFilter, setCompanyFilter] = useState<CompanyId | 'alle'>(
    (searchParams.get('bedrijf') as CompanyId) || 'alle'
  )
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: string; clientName: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [folderName, setFolderName] = useState<string | null>(null)

  // Laad opgeslagen mapnaam bij mount
  useEffect(() => {
    getOfferteFolder().then(h => { if (h) setFolderName(h.name) })
  }, [])

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

  // Luister naar data-changed events (bijv. vanuit de drawer)
  useEffect(() => {
    const cleanup = onDataChanged((type) => {
      if (type === 'offertes') fetchOffertes()
    })
    return cleanup
  }, [fetchOffertes])

  const filtered = offertes.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    return o.client.name.toLowerCase().includes(q) || o.number.toLowerCase().includes(q)
  })

  const handleStatusChange = async (offerteId: string, newStatus: OfferteStatus) => {
    // Optimistic update
    setOffertes(prev => prev.map(o =>
      o.id === offerteId ? { ...o, status: newStatus } : o
    ))
    try {
      const res = await fetch(`/api/offertes/${offerteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      dataChanged('offertes')
    } catch {
      // Revert bij fout
      fetchOffertes()
    }
  }

  const handleClientNameChange = async (offerteId: string, newName: string) => {
    const current = offertes.find(o => o.id === offerteId)
    if (!current) return
    const updatedClient = { ...current.client, name: newName }
    // Optimistic update
    setOffertes(prev => prev.map(o =>
      o.id === offerteId ? { ...o, client: updatedClient } : o
    ))
    try {
      const res = await fetch(`/api/offertes/${offerteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: updatedClient }),
      })
      if (!res.ok) throw new Error()
      dataChanged('offertes')
    } catch {
      fetchOffertes()
      throw new Error('Opslaan mislukt')
    }
  }

  const handleDateChange = async (offerteId: string, newDate: string) => {
    // Geldig tot = datum + 14 dagen
    const validUntil = new Date(newDate)
    validUntil.setDate(validUntil.getDate() + 14)
    const validUntilStr = validUntil.toISOString().split('T')[0]
    // Optimistic update
    setOffertes(prev => prev.map(o =>
      o.id === offerteId ? { ...o, date: newDate, validUntil: validUntilStr } : o
    ))
    try {
      const res = await fetch(`/api/offertes/${offerteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, validUntil: validUntilStr }),
      })
      if (!res.ok) throw new Error()
      dataChanged('offertes')
    } catch {
      fetchOffertes()
      throw new Error('Opslaan mislukt')
    }
  }

  const handleDeleteOfferte = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await fetch(`/api/offertes/${deleteTarget.id}`, { method: 'DELETE' })
      setDeleteTarget(null)
      fetchOffertes()
      dataChanged('offertes')
    } catch {
      alert('Verwijderen mislukt')
    }
    setDeleting(false)
  }

  const totalOpen = offertes.filter(o => o.status === 'verstuurd').reduce((s, o) => s + (showInclBtw ? o.total : o.subtotal), 0)

  const newOfferteHref = companyFilter !== 'alle'
    ? `/offertes/nieuw?bedrijf=${companyFilter}`
    : `/offertes/nieuw?bedrijf=${activeCompany}`

  return (
    <div className="p-8 flex flex-col min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-uxum text-sidebar-t text-brand-text-primary">Offertes</h1>
          <p className="text-body text-brand-text-secondary mt-0.5">
            {offertes.length} offertes · <span className="text-brand-blue-accent font-medium">{euro(totalOpen)} uitstaand</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const handle = await pickOfferteFolder()
              if (handle) setFolderName(handle.name)
            }}
            className="btn-secondary px-2.5 flex items-center gap-1.5"
            title={folderName ? `Map: ${folderName}` : 'Selecteer offertes map'}
          >
            <FolderOpen size={15} />
            {folderName && <span className="text-caption max-w-[120px] truncate">{folderName}</span>}
          </button>
          <button onClick={fetchOffertes} className="btn-secondary px-2.5" title="Vernieuwen">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => openDrawer({ type: 'offerte-nieuw' })} className="btn-primary">
            <Plus size={15} /> Nieuwe offerte
          </button>
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

      {/* Delete bevestigingsmodal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-brand border border-brand-card-border shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-brand-sm bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <h2 className="font-semibold text-body text-brand-text-primary">Offerte verwijderen</h2>
                <p className="text-caption text-brand-text-secondary">Dit kan niet ongedaan worden gemaakt.</p>
              </div>
            </div>
            <p className="text-body text-brand-text-secondary mb-6">
              Weet je zeker dat je <span className="font-semibold text-brand-text-primary">{deleteTarget.number}</span> van{' '}
              <span className="font-semibold text-brand-text-primary">{deleteTarget.clientName}</span> permanent wilt verwijderen?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="btn-secondary"
              >
                Annuleren
              </button>
              <button
                onClick={handleDeleteOfferte}
                disabled={deleting}
                className="btn-primary bg-red-500 hover:bg-red-600 border-red-500 hover:border-red-600 flex items-center gap-1.5"
              >
                <Trash2 size={14} /> {deleting ? 'Verwijderen…' : 'Ja, verwijder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden flex-1">
        <table className="w-full text-body">
          <thead className="bg-brand-page-light border-b border-brand-card-border/30">
            <tr>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Nummer</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide border-l border-brand-card-border/15">Klant</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide border-l border-brand-card-border/15">Bedrijf</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide border-l border-brand-card-border/15">Datum</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide border-l border-brand-card-border/15">Geldig tot</th>
              <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide border-l border-brand-card-border/15">
                <button
                  onClick={() => setShowInclBtw(!showInclBtw)}
                  className="inline-flex items-center gap-1.5 hover:text-brand-text-primary transition-colors"
                >
                  Bedrag
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-page-medium text-brand-text-secondary normal-case">
                    {showInclBtw ? 'incl' : 'excl'}
                  </span>
                </button>
              </th>
              <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide border-l border-brand-card-border/15">Status</th>
              <th className="px-3 py-3 border-l border-brand-card-border/15" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-card-border/15">
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-brand-text-secondary">
                  <RefreshCw size={18} className="animate-spin inline mr-2" /> Laden…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-brand-text-secondary">
                  {offertes.length === 0 ? (
                    <div className="max-w-md mx-auto">
                      <p className="mb-4 text-body">Nog geen offertes aangemaakt</p>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => openDrawer({ type: 'offerte-nieuw' })}
                          className="flex flex-col items-center gap-2 px-6 py-4 rounded-brand border border-brand-card-border hover:border-brand-purple hover:bg-brand-lavender-light/30 transition-all group"
                        >
                          <Plus size={20} className="text-brand-purple" />
                          <span className="text-body font-semibold text-brand-text-primary">Maak offerte</span>
                          <span className="text-caption text-brand-text-secondary">Begin een nieuwe offerte</span>
                        </button>
                        <label className="flex flex-col items-center gap-2 px-6 py-4 rounded-brand border border-brand-card-border hover:border-brand-purple hover:bg-brand-lavender-light/30 transition-all cursor-pointer group">
                          <Upload size={20} className="text-brand-purple" />
                          <span className="text-body font-semibold text-brand-text-primary">Importeer offertes</span>
                          <span className="text-caption text-brand-text-secondary">Upload een JSON-bestand</span>
                          <input
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              try {
                                const text = await file.text()
                                const data = JSON.parse(text)
                                const items = Array.isArray(data) ? data : [data]
                                for (const item of items) {
                                  await fetch('/api/offertes', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(item),
                                  })
                                }
                                dataChanged('offertes')
                                fetchOffertes()
                              } catch {
                                alert('Import mislukt — controleer het bestandsformaat')
                              }
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : 'Geen resultaten gevonden'}
                </td>
              </tr>
            ) : filtered.map(o => {
              const co = getCompany(o.companyId)
              const isExpired = o.status === 'verstuurd' && new Date(o.validUntil) < new Date()
              return (
                <tr
                  key={o.id}
                  className="hover:bg-brand-page-light transition-colors group"
                >
                  {/* Nummer — opent drawer */}
                  <td className="px-5 py-3.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); openDrawer({ type: 'offerte-detail', id: o.id }) }}
                      className="font-mono text-caption text-brand-purple hover:text-brand-purple/80 underline underline-offset-2 decoration-brand-purple/30 hover:decoration-brand-purple/60 transition-colors"
                    >
                      {o.number}
                    </button>
                  </td>

                  {/* Klant — bewerkbaar */}
                  <InlineEditableCell
                    value={o.client.name}
                    type="text"
                    onSave={(newName) => handleClientNameChange(o.id, newName)}
                    validate={(v) => v.trim() === '' ? 'Klantnaam is verplicht' : null}
                    className="px-5 py-3.5 font-semibold text-brand-text-primary border-l border-brand-card-border/10"
                  />

                  {/* Bedrijf — read-only */}
                  <td className="px-5 py-3.5 border-l border-brand-card-border/10">
                    <span className="text-pill px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: co.bgColor, color: co.color }}>
                      {co.shortName}
                    </span>
                  </td>

                  {/* Datum — bewerkbaar */}
                  <InlineEditableCell
                    value={o.date.split('T')[0]}
                    type="date"
                    onSave={(newDate) => handleDateChange(o.id, newDate)}
                    formatDisplay={(d) => new Date(d).toLocaleDateString('nl-NL')}
                    className="px-5 py-3.5 text-brand-text-secondary border-l border-brand-card-border/10"
                  />

                  {/* Geldig tot — automatisch berekend, read-only */}
                  <td className={`px-5 py-3.5 border-l border-brand-card-border/10 ${isExpired ? 'text-brand-status-red font-semibold' : 'text-brand-text-secondary'}`}>
                    {new Date(o.validUntil).toLocaleDateString('nl-NL')}
                  </td>

                  {/* Bedrag — read-only */}
                  <td className="px-5 py-3.5 text-right font-semibold text-brand-text-primary border-l border-brand-card-border/10">{euro(showInclBtw ? o.total : o.subtotal)}</td>

                  {/* Status — bewerkbaar via bestaande dropdown */}
                  <td className="px-5 py-3.5 text-right border-l border-brand-card-border/10">
                    <InlineStatusSelect
                      status={isExpired ? 'verlopen' : o.status}
                      onChangeStatus={(newStatus) => handleStatusChange(o.id, newStatus)}
                    />
                  </td>

                  {/* Acties */}
                  <td className="px-3 py-3.5 text-right border-l border-brand-card-border/10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget({ id: o.id, number: o.number, clientName: o.client.name })
                      }}
                      className="p-1.5 rounded-brand-sm text-brand-text-secondary hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      title="Verwijderen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
