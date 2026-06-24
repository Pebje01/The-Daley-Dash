'use client'
import { Suspense, useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, Search, RefreshCw, ChevronDown, Upload, FolderOpen, Eye, ExternalLink, ArrowUp, ArrowDown, ArrowUpDown, TrendingUp, CalendarDays, X } from 'lucide-react'
import LocaleBestandenSection from '@/components/LocaleBestandenSection'
import SyncAllesKnop from '@/components/SyncAllesKnop'
import { getCompany, COMPANIES } from '@/lib/companies'
import { Factuur, FactuurStatus, CompanyId } from '@/lib/types'
import { FactuurStatusBadge } from '@/components/StatusBadge'
import { useActiveCompany } from '@/components/CompanyContext'
import { pickFacturenFolder, getFacturenFolder, findFactuurPdfHandle } from '@/lib/pdf/folderStorage'
import { dataChanged, onDataChanged } from '@/lib/events'
import { useDrawer } from '@/components/DrawerContext'
import { createClient } from '@/lib/supabase/client'
import { useColumnOrder, useColumnDnD } from '@/lib/columnOrder'
import { ColumnGrip } from '@/components/ColumnGrip'

// Verschuifbare kolommen voor de facturen-tabel (keys = sorteervelden).
const FACTUUR_KOLOMMEN: { key: string; label: string; align?: 'right' }[] = [
  { key: 'number', label: 'Nummer' },
  { key: 'client', label: 'Klant' },
  { key: 'companyId', label: 'Bedrijf' },
  { key: 'date', label: 'Datum' },
  { key: 'dueDate', label: 'Vervaldatum' },
  { key: 'amount', label: 'Bedrag', align: 'right' },
  { key: 'status', label: 'Status', align: 'right' },
]

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

// Bepaalt start/eind (YYYY-MM-DD), label en type voor een omzetperiode.
// Ondersteunt ?periode=maand|jaar (huidige periode, optioneel &jaar=YYYY)
// en ?maand=YYYY-MM voor een specifieke maand.
function getPeriodeRange(
  periode: string | null,
  jaarParam: string | null,
  maandParam: string | null
): { start: string; end: string; label: string; type: 'maand' | 'jaar' } | null {
  const now = new Date()

  // Specifieke maand: ?maand=2026-03
  if (maandParam && /^\d{4}-\d{2}$/.test(maandParam)) {
    const [y, m] = maandParam.split('-').map(Number)
    const label = new Date(y, m - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
    return {
      start: `${maandParam}-01`,
      end: `${maandParam}-31`,
      label,
      type: 'maand',
    }
  }

  const jaar = jaarParam ? Number(jaarParam) : now.getFullYear()
  if (periode === 'maand') {
    const m = now.getMonth()
    const mm = String(m + 1).padStart(2, '0')
    return {
      start: `${jaar}-${mm}-01`,
      end: `${jaar}-${mm}-31`,
      label: now.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }),
      type: 'maand',
    }
  }
  if (periode === 'jaar') {
    return { start: `${jaar}-01-01`, end: `${jaar}-12-31`, label: `${jaar}`, type: 'jaar' }
  }
  return null
}

const STATUS_LIST: { key: FactuurStatus; label: string; dotClass: string }[] = [
  { key: 'concept', label: 'CONCEPT', dotClass: 'bg-brand-text-secondary' },
  { key: 'verzonden', label: 'VERZONDEN', dotClass: 'bg-brand-blue-accent' },
  { key: 'herinnering-verzonden', label: 'HERINNERING VERZONDEN', dotClass: 'bg-brand-status-orange' },
  { key: 'betaald', label: 'BETAALD', dotClass: 'bg-brand-lime-accent' },
  { key: 'te-laat', label: 'TE LAAT', dotClass: 'bg-brand-pink-accent' },
  { key: 'geannuleerd', label: 'GEANNULEERD', dotClass: 'bg-brand-text-secondary' },
]

function InlineStatusSelect({
  status,
  onChangeStatus,
}: {
  status: FactuurStatus
  onChangeStatus: (newStatus: FactuurStatus) => void
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
        <FactuurStatusBadge status={status} />
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
                onChangeStatus(opt.key)
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

const STATUS_TABS: { key: FactuurStatus | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'concept', label: 'Concept' },
  { key: 'verzonden', label: 'Verzonden' },
  { key: 'herinnering-verzonden', label: 'Herinnering' },
  { key: 'betaald', label: 'Betaald' },
  { key: 'te-laat', label: 'Te laat' },
  { key: 'geannuleerd', label: 'Geannuleerd' },
]

type FactuurSortField = 'number' | 'client' | 'companyId' | 'date' | 'dueDate' | 'amount' | 'status'

export default function FacturenPage() {
  return (
    <Suspense fallback={<div className="p-8 text-brand-text-secondary">Laden...</div>}>
      <FacturenContent />
    </Suspense>
  )
}

function FacturenContent() {
  const searchParams = useSearchParams()
  const { activeCompany } = useActiveCompany()
  const { openDrawer } = useDrawer()
  const { order, move } = useColumnOrder('facturen', FACTUUR_KOLOMMEN.map(c => c.key))
  const dnd = useColumnDnD(move)
  const [facturen, setFacturen] = useState<Factuur[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FactuurStatus | 'alle'>(
    (searchParams.get('status') as FactuurStatus) || 'alle'
  )

  // Omzetperiode uit URL (?periode=maand|jaar of ?maand=YYYY-MM)
  const periodeRange = getPeriodeRange(
    searchParams.get('periode'),
    searchParams.get('jaar'),
    searchParams.get('maand')
  )
  const [showInclBtw, setShowInclBtw] = useState(true)
  const [companyFilter, setCompanyFilter] = useState<CompanyId | 'alle'>(
    (searchParams.get('bedrijf') as CompanyId) || 'alle'
  )
  const [folderName, setFolderName] = useState<string | null>(null)
  const [sortField, setSortField] = useState<FactuurSortField>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [fetchError, setFetchError] = useState(false)

  // Laad opgeslagen mapnaam bij mount
  useEffect(() => {
    getFacturenFolder().then(h => { if (h) setFolderName(h.name) })
  }, [])

  const fetchFacturen = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const params = new URLSearchParams()
      // 'te-laat' bevat ook verzonden+vervallen facturen — client-side filteren
      if (statusFilter !== 'alle' && statusFilter !== 'te-laat') params.set('status', statusFilter)
      if (companyFilter !== 'alle') params.set('company', companyFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/facturen?${params}`)
      if (res.ok) {
        setFacturen(await res.json())
      } else {
        setFetchError(true)
      }
    } catch (e) {
      console.error('Failed to fetch facturen:', e)
      setFetchError(true)
    }
    setLoading(false)
  }, [statusFilter, companyFilter, search])

  useEffect(() => { fetchFacturen() }, [fetchFacturen])

  // Luister naar data-changed events (bijv. vanuit de drawer)
  useEffect(() => {
    const cleanup = onDataChanged((type) => {
      if (type === 'facturen') fetchFacturen()
    })
    return cleanup
  }, [fetchFacturen])

  // Supabase Realtime: herlaad direct bij wijzigingen in facturen tabel
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('facturen-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facturen' }, () => fetchFacturen())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchFacturen])

  // Vangnet: herlaad zodra het venster weer focus/zichtbaar wordt.
  // Werkt ook als Supabase Realtime niet aanstaat.
  useEffect(() => {
    const onFocus = () => fetchFacturen()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchFacturen() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchFacturen])

  const now = new Date()
  const filtered = facturen.filter(f => {
    // Omzetperiode: alleen betaalde facturen met factuurdatum binnen de periode, excl. uitgesloten
    if (periodeRange) {
      const datum = (f.revenueDate || f.date || '').split('T')[0]
      if (f.status !== 'betaald') return false
      if (f.excludeFromRevenue) return false
      if (datum < periodeRange.start || datum > periodeRange.end) return false
    }
    // Status filter client-side (zodat verzonden+vervallen ook onder 'te-laat' valt)
    if (statusFilter !== 'alle' && !periodeRange) {
      const effectief = (f.status === 'verzonden' && f.dueDate && new Date(f.dueDate) < now) ? 'te-laat' : f.status
      if (effectief !== statusFilter) return false
    }
    if (!search) return true
    const q = search.toLowerCase()
    return f.client.name.toLowerCase().includes(q) || f.number.toLowerCase().includes(q)
  })

  // Omzettotalen voor de actieve periode
  const periodeOmzetExcl = periodeRange ? filtered.reduce((s, f) => s + f.subtotal, 0) : 0
  const periodeOmzetIncl = periodeRange ? filtered.reduce((s, f) => s + f.total, 0) : 0

  const handleSort = useCallback((field: FactuurSortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }, [sortField])

  const si = (field: FactuurSortField) =>
    sortField === field
      ? sortDir === 'asc' ? <ArrowUp size={11} className="shrink-0" /> : <ArrowDown size={11} className="shrink-0" />
      : <ArrowUpDown size={11} className="opacity-30 shrink-0" />

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case 'number': cmp = (a.number ?? '').localeCompare(b.number ?? ''); break
      case 'client': cmp = (a.client.name ?? '').localeCompare(b.client.name ?? ''); break
      case 'companyId': cmp = (a.companyId ?? '').localeCompare(b.companyId ?? ''); break
      case 'date': cmp = (a.date ?? '').localeCompare(b.date ?? ''); break
      case 'dueDate': cmp = (a.dueDate ?? '').localeCompare(b.dueDate ?? ''); break
      case 'amount': cmp = (showInclBtw ? a.total : a.subtotal) - (showInclBtw ? b.total : b.subtotal); break
      case 'status': cmp = (a.status ?? '').localeCompare(b.status ?? ''); break
    }
    return sortDir === 'asc' ? cmp : -cmp
  }), [filtered, sortField, sortDir, showInclBtw])

  const handleStatusChange = async (factuurId: string, newStatus: FactuurStatus) => {
    // Optimistic update
    setFacturen(prev => prev.map(f =>
      f.id === factuurId ? { ...f, status: newStatus } : f
    ))
    try {
      const body: Record<string, unknown> = { status: newStatus }
      // Stel paid_at in bij markeren als betaald
      if (newStatus === 'betaald') body.paidAt = new Date().toISOString()

      const res = await fetch(`/api/facturen/${factuurId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '(geen body)')
        console.error(`Status wijzigen mislukt (${res.status}):`, errText)
        throw new Error(`HTTP ${res.status}`)
      }
      // Bevestig update vanuit server-response (niet puur optimistisch)
      const updated: Factuur = await res.json()
      if (updated?.id) {
        setFacturen(prev => prev.map(f => f.id === updated.id ? updated : f))
      }
    } catch (err) {
      console.error('handleStatusChange fout:', err)
      // Revert bij fout
      fetchFacturen()
    }
  }

  const handleToggleOmzet = async (factuurId: string, current: boolean) => {
    const next = !current
    setFacturen(prev => prev.map(f => f.id === factuurId ? { ...f, excludeFromRevenue: next } : f))
    await fetch(`/api/facturen/${factuurId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludeFromRevenue: next }),
    }).catch(() => fetchFacturen())
  }

  const handleSetRevenueDate = async (factuurId: string, date: string | null) => {
    setFacturen(prev => prev.map(f => f.id === factuurId ? { ...f, revenueDate: date ?? undefined } : f))
    await fetch(`/api/facturen/${factuurId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revenueDate: date }),
    }).catch(() => fetchFacturen())
  }

  const [revenueDateEdit, setRevenueDateEdit] = useState<string | null>(null)

  const totalOpen = facturen.filter(f => f.status === 'verzonden' || f.status === 'herinnering-verzonden' || f.status === 'te-laat').reduce((s, f) => s + (showInclBtw ? f.total : f.subtotal), 0)

  const [openingPdf, setOpeningPdf] = useState<string | null>(null)
  const [localFileMap, setLocalFileMap] = useState<Map<string, string>>(new Map())
  const localFileSignatureRef = useRef('')
  const backgroundSyncRef = useRef(false)

  const fetchLocalFiles = useCallback(() => {
    fetch('/api/admin/scan')
      .then(r => r.json())
      .then((all: { number: string | null; absolutePath: string; type: string }[]) => {
        const map = new Map<string, string>()
        all.filter(f => f.type === 'factuur' && f.number).forEach(f => map.set(f.number!.toUpperCase(), f.absolutePath))
        const signature = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([n, p]) => `${n}:${p}`).join('|')
        const previousSignature = localFileSignatureRef.current
        localFileSignatureRef.current = signature
        setLocalFileMap(map)
        if (previousSignature && previousSignature !== signature && !backgroundSyncRef.current) {
          backgroundSyncRef.current = true
          fetch('/api/admin/sync', { method: 'POST' })
            .then(r => r.text())
            .finally(() => {
              backgroundSyncRef.current = false
              fetchFacturen()
              dataChanged('facturen')
              dataChanged('offertes')
            })
        }
      })
      .catch(() => {})
  }, [fetchFacturen])

  useEffect(() => { fetchLocalFiles() }, [fetchLocalFiles])

  // Auto-refresh lokale bestanden elke 30 seconden
  useEffect(() => {
    const id = setInterval(fetchLocalFiles, 30_000)
    return () => clearInterval(id)
  }, [fetchLocalFiles])

  const callFileAction = async (absolutePath: string, action: 'open' | 'reveal') => {
    await fetch('/api/admin/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ absolutePath, action }),
    }).catch(() => {})
  }

  const handleOpenPdf = async (e: React.MouseEvent, factuur: Factuur) => {
    e.stopPropagation()
    setOpeningPdf(factuur.id)
    try {
      const folderHandle = await getFacturenFolder()
      if (!folderHandle) {
        alert('Selecteer eerst de facturen map via het map-icoontje rechtsboven.')
        return
      }
      const fileHandle = await findFactuurPdfHandle(factuur.number, folderHandle)
      if (!fileHandle) {
        alert(`PDF niet gevonden voor ${factuur.number}.\nControleer of de PDF is opgeslagen in de geselecteerde map.`)
        return
      }
      const file = await fileHandle.getFile()
      const url = URL.createObjectURL(file)
      window.open(url, '_blank')
    } finally {
      setOpeningPdf(null)
    }
  }

  const handleOpenFolder = async () => {
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: companyFilter }),
    })
  }

  const newFactuurHref = companyFilter !== 'alle'
    ? `/facturen/nieuw?bedrijf=${companyFilter}`
    : `/facturen/nieuw?bedrijf=${activeCompany}`

  return (
    <div className="p-8 flex flex-col min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-uxum text-sidebar-t text-brand-text-primary">Facturen</h1>
          <p className="text-body text-brand-text-secondary mt-0.5">
            {facturen.length} facturen · <span className="text-brand-status-orange font-medium">{euro(totalOpen)} openstaand</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const handle = await pickFacturenFolder()
              if (handle) setFolderName(handle.name)
            }}
            className="btn-secondary px-2.5 flex items-center gap-1.5"
            title={folderName ? `Map: ${folderName}` : 'Selecteer facturen map'}
          >
            <FolderOpen size={15} />
            {folderName && <span className="text-caption max-w-[120px] truncate">{folderName}</span>}
          </button>
          <button
            onClick={handleOpenFolder}
            className="btn-secondary px-2.5 flex items-center gap-1.5"
            title="Open facturen map in Finder"
          >
            <ExternalLink size={15} />
            <span className="text-caption">Finder</span>
          </button>
          <SyncAllesKnop onRefresh={() => { fetchFacturen(); fetchLocalFiles() }} />
          <button onClick={() => openDrawer({ type: 'factuur-nieuw' })} className="btn-primary">
            <Plus size={15} /> Nieuwe factuur
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
            placeholder="Zoek op naam of nummer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchFacturen()}
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

      {/* Omzetperiode banner */}
      {periodeRange && (
        <div className="mb-4 rounded-brand border border-brand-lime-accent/40 bg-brand-lime/20 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-caption text-brand-text-secondary uppercase tracking-wide">
              Omzet {periodeRange.type === 'jaar' ? `jaar ${periodeRange.label}` : periodeRange.label}
            </p>
            <p className="font-uxum text-stat text-brand-text-primary">
              {euro(periodeOmzetExcl)}
              <span className="text-body text-brand-text-secondary font-sans ml-2">excl. btw</span>
            </p>
            <p className="text-caption text-brand-text-secondary mt-0.5">
              incl. btw: {euro(periodeOmzetIncl)} | {filtered.length} betaalde factuur{filtered.length === 1 ? '' : 'en'}
            </p>
          </div>
          <Link href="/facturen" className="btn-secondary">
            Filter wissen
          </Link>
        </div>
      )}

      {/* Foutbanner als data niet geladen kon worden */}
      {fetchError && (
        <div className="mb-4 rounded-brand border border-brand-pink-accent/40 bg-brand-pink/20 px-5 py-4 flex items-center justify-between gap-4">
          <p className="text-body text-brand-status-red font-medium">
            Data kon niet worden geladen. De server is mogelijk niet bereikbaar.
          </p>
          <button onClick={fetchFacturen} className="btn-secondary shrink-0">
            <RefreshCw size={14} /> Opnieuw proberen
          </button>
        </div>
      )}

      {/* Supabase tabel */}
      <div className="card p-0 overflow-hidden flex-1">
        <table className="w-full text-body">
          <thead className="bg-brand-page-light border-b border-brand-page-medium">
            <tr>
              {(() => {
                const headerInner: Record<string, ReactNode> = {
                  number: <button onClick={() => handleSort('number')} className="inline-flex items-center gap-1 hover:text-brand-text-primary transition-colors">Nummer {si('number')}</button>,
                  client: <button onClick={() => handleSort('client')} className="inline-flex items-center gap-1 hover:text-brand-text-primary transition-colors">Klant {si('client')}</button>,
                  companyId: <button onClick={() => handleSort('companyId')} className="inline-flex items-center gap-1 hover:text-brand-text-primary transition-colors">Bedrijf {si('companyId')}</button>,
                  date: <button onClick={() => handleSort('date')} className="inline-flex items-center gap-1 hover:text-brand-text-primary transition-colors">Datum {si('date')}</button>,
                  dueDate: <button onClick={() => handleSort('dueDate')} className="inline-flex items-center gap-1 hover:text-brand-text-primary transition-colors">Vervaldatum {si('dueDate')}</button>,
                  amount: (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setShowInclBtw(!showInclBtw)}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-page-medium text-brand-text-secondary hover:text-brand-text-primary transition-colors normal-case"
                      >
                        {showInclBtw ? 'incl' : 'excl'}
                      </button>
                      <button onClick={() => handleSort('amount')} className="inline-flex items-center gap-1 hover:text-brand-text-primary transition-colors">Bedrag {si('amount')}</button>
                    </div>
                  ),
                  status: <button onClick={() => handleSort('status')} className="inline-flex items-center gap-1 hover:text-brand-text-primary transition-colors">Status {si('status')}</button>,
                }
                return order.map(key => {
                  const col = FACTUUR_KOLOMMEN.find(c => c.key === key)
                  if (!col) return null
                  return (
                    <th
                      key={key}
                      {...dnd.headerProps(key)}
                      className={`group/col px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide cursor-grab active:cursor-grabbing select-none hover:bg-black/[0.03] transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'} ${dnd.isOver(key) ? 'border-l-2 border-indigo-500 bg-indigo-50/40' : 'border-l-2 border-transparent'} ${dnd.isDragging(key) ? 'opacity-40' : ''}`}
                      title="Sleep om te verplaatsen · klik op de titel om te sorteren"
                    >
                      <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                        <ColumnGrip />
                        {headerInner[key]}
                      </span>
                    </th>
                  )
                })
              })()}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-page-medium">
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-brand-text-secondary">
                  <RefreshCw size={18} className="animate-spin inline mr-2" /> Laden...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-brand-text-secondary">
                  {facturen.length === 0 ? (
                    <div className="max-w-md mx-auto">
                      <p className="mb-4 text-body">Nog geen facturen aangemaakt</p>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => openDrawer({ type: 'factuur-nieuw' })}
                          className="flex flex-col items-center gap-2 px-6 py-4 rounded-brand border border-brand-card-border hover:border-brand-purple hover:bg-brand-lavender-light/30 transition-all group"
                        >
                          <Plus size={20} className="text-brand-purple" />
                          <span className="text-body font-semibold text-brand-text-primary">Maak factuur</span>
                          <span className="text-caption text-brand-text-secondary">Begin een nieuwe factuur</span>
                        </button>
                        <label className="flex flex-col items-center gap-2 px-6 py-4 rounded-brand border border-brand-card-border hover:border-brand-purple hover:bg-brand-lavender-light/30 transition-all cursor-pointer group">
                          <Upload size={20} className="text-brand-purple" />
                          <span className="text-body font-semibold text-brand-text-primary">Importeer facturen</span>
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
                                  await fetch('/api/facturen', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(item),
                                  })
                                }
                                fetchFacturen()
                              } catch {
                                alert('Import mislukt, controleer het bestandsformaat')
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
            ) : sorted.map(f => {
              const co = getCompany(f.companyId)
              const isOverdue = f.status === 'te-laat' || ((f.status === 'verzonden' || f.status === 'herinnering-verzonden') && new Date(f.dueDate) < new Date())
              const cell: Record<string, ReactNode> = {
                number: (
                  <td key="number" className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const localPath = localFileMap.get(f.number.toUpperCase())
                        return (
                          <>
                            {localPath ? (
                              <button
                                onClick={() => callFileAction(localPath, 'open')}
                                title="Open PDF"
                                className="font-mono text-caption text-brand-text-secondary hover:text-brand-purple hover:underline transition-colors"
                              >
                                {f.number}
                              </button>
                            ) : (
                              <span className="font-mono text-caption text-brand-text-secondary">{f.number}</span>
                            )}
                            <button
                              onClick={() => localPath ? callFileAction(localPath, 'reveal') : handleOpenFolder()}
                              title={localPath ? 'Toon in Finder' : 'Open facturen map'}
                              className="text-brand-text-secondary hover:text-brand-purple transition-colors opacity-0 group-hover:opacity-60 hover:!opacity-100"
                            >
                              <FolderOpen size={12} />
                            </button>
                          </>
                        )
                      })()}
                    </div>
                  </td>
                ),
                client: <td key="client" className="px-5 py-3.5 font-semibold text-brand-text-primary">{f.client.name}</td>,
                companyId: (
                  <td key="companyId" className="px-5 py-3.5">
                    <span className="text-pill px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: co.bgColor, color: co.color }}>
                      {co.shortName}
                    </span>
                  </td>
                ),
                date: <td key="date" className="px-5 py-3.5 text-brand-text-secondary">{new Date(f.date).toLocaleDateString('nl-NL')}</td>,
                dueDate: (
                  <td key="dueDate" className={`px-5 py-3.5 ${isOverdue ? 'text-brand-status-red font-semibold' : 'text-brand-text-secondary'}`}>
                    {new Date(f.dueDate).toLocaleDateString('nl-NL')}
                  </td>
                ),
                amount: (
                  <td key="amount" className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Omzet uitsluiten */}
                      <button
                        onClick={() => handleToggleOmzet(f.id, f.excludeFromRevenue)}
                        title={f.excludeFromRevenue ? 'Telt niet mee voor omzet — klik om te activeren' : 'Uitsluiten van omzet'}
                        className={`p-0.5 rounded transition-all ${f.excludeFromRevenue ? 'text-brand-status-orange' : 'opacity-0 group-hover:opacity-100 text-brand-text-secondary hover:text-brand-status-orange'}`}
                      >
                        <TrendingUp size={13} />
                      </button>
                      {/* Omzetdatum overschrijven */}
                      {revenueDateEdit === f.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            defaultValue={f.revenueDate ?? f.date.split('T')[0]}
                            autoFocus
                            className="text-caption border border-brand-purple/50 rounded px-1 py-0.5 outline-none w-32"
                            onBlur={e => {
                              handleSetRevenueDate(f.id, e.target.value || null)
                              setRevenueDateEdit(null)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { handleSetRevenueDate(f.id, (e.target as HTMLInputElement).value || null); setRevenueDateEdit(null) }
                              if (e.key === 'Escape') setRevenueDateEdit(null)
                            }}
                          />
                          {f.revenueDate && (
                            <button onClick={() => { handleSetRevenueDate(f.id, null); setRevenueDateEdit(null) }} className="text-brand-text-secondary hover:text-red-500">
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          {f.revenueDate && (
                            <span className="text-[10px] text-brand-purple font-medium" title="Omzetdatum overschreven">
                              {new Date(f.revenueDate).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })}
                            </span>
                          )}
                          <button
                            onClick={() => setRevenueDateEdit(f.id)}
                            title={f.revenueDate ? `Omzetdatum: ${new Date(f.revenueDate).toLocaleDateString('nl-NL')} — klik om te wijzigen` : 'Omzetdatum instellen'}
                            className={`p-0.5 rounded transition-all ${f.revenueDate ? 'text-brand-purple' : 'opacity-0 group-hover:opacity-100 text-brand-text-secondary hover:text-brand-purple'}`}
                          >
                            <CalendarDays size={13} />
                          </button>
                          <span className={`font-semibold ${f.excludeFromRevenue ? 'text-brand-text-secondary line-through' : 'text-brand-text-primary'}`}>
                            {euro(showInclBtw ? f.total : f.subtotal)}
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                ),
                status: (
                  <td key="status" className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                    <InlineStatusSelect
                      status={isOverdue && f.status === 'verzonden' ? 'te-laat' : f.status}
                      onChangeStatus={(newStatus) => handleStatusChange(f.id, newStatus)}
                    />
                  </td>
                ),
              }
              return (
                <tr
                  key={f.id}
                  className={`group hover:bg-brand-page-light cursor-pointer transition-colors ${isOverdue ? 'bg-brand-pink/30' : ''}`}
                  onClick={() => openDrawer({ type: 'factuur-detail', id: f.id })}
                >
                  {order.map(key => cell[key])}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <LocaleBestandenSection type="factuur" />
    </div>
  )
}
