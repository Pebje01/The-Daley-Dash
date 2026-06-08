'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ChevronDown, ChevronRight, Check, ExternalLink,
  RefreshCw, Search, Plus, X, Save, Trash2, LayoutList, Columns3, ArrowRight,
} from 'lucide-react'

type EntityType = 'daley_list' | 'lead' | 'company' | 'contact' | 'assignment' | 'clickup_invoice'

interface CrmRecord {
  id: string
  entity_type: EntityType
  clickup_task_id: string
  clickup_list_id: string
  name: string
  status?: string | null
  url?: string | null
  archived?: boolean
  active?: boolean
  assignees?: Array<{ id?: string | number; username?: string; email?: string; profilePicture?: string }>
  tags?: Array<{ name?: string; tag_fg?: string; tag_bg?: string }>
  custom_fields?: Array<any>
  due_date?: string | null
  clickup_date_updated?: string | null
  clickup_date_created?: string | null
  synced_at?: string | null
  raw?: any
}

// ── Status visual config ────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  'nieuwe kans':             'bg-cyan-500 text-white',
  'open':                    'bg-cyan-500 text-white',
  'nieuwe opdracht':         'bg-cyan-500 text-white',
  'on hold':                 'bg-amber-500 text-white',
  'klant on hold':           'bg-amber-500 text-white',
  'in gesprek':              'bg-indigo-500 text-white',
  'eigen bedrijf':           'bg-purple-500 text-white',
  'factuur open':            'bg-amber-500 text-white',
  'gewonnen':                'bg-green-500 text-white',
  'afgerond':                'bg-green-500 text-white',
  'klant':                   'bg-green-500 text-white',
  'factuur betaald':         'bg-green-500 text-white',
  'blacklist':               'bg-gray-600 text-white',
  'verloren':                'bg-rose-500 text-white',
  'niets uitgekomen':        'bg-orange-400 text-white',
  'archief':                 'bg-gray-400 text-white',
  'geannuleerd':             'bg-rose-400 text-white',
  'samenwerking afgesloten': 'bg-gray-500 text-white',
  'geen samenwerking':       'bg-gray-400 text-white',
  'samenwerking negatief':   'bg-rose-400 text-white',
  'lopende samenwerking':    'bg-emerald-500 text-white',
}

const STATUS_HEX: Record<string, string> = {
  'nieuwe kans':             '#06b6d4',
  'open':                    '#06b6d4',
  'nieuwe opdracht':         '#06b6d4',
  'on hold':                 '#f59e0b',
  'klant on hold':           '#f59e0b',
  'in gesprek':              '#6366f1',
  'eigen bedrijf':           '#8b5cf6',
  'factuur open':            '#f59e0b',
  'gewonnen':                '#22c55e',
  'afgerond':                '#22c55e',
  'klant':                   '#22c55e',
  'factuur betaald':         '#22c55e',
  'blacklist':               '#4b5563',
  'verloren':                '#f43f5e',
  'niets uitgekomen':        '#fb923c',
  'archief':                 '#9ca3af',
  'geannuleerd':             '#f43f5e',
  'samenwerking afgesloten': '#9ca3af',
  'geen samenwerking':       '#9ca3af',
  'samenwerking negatief':   '#f43f5e',
  'lopende samenwerking':    '#10b981',
}

const STATUS_GROUP_ORDER = ['Not started', 'Active', 'Done', 'Closed']

const STATUS_GROUP_MAP: Record<string, string> = {
  'nieuwe kans':             'Not started',
  'open':                    'Not started',
  'nieuwe opdracht':         'Not started',
  'on hold':                 'Active',
  'klant on hold':           'Active',
  'in gesprek':              'Active',
  'eigen bedrijf':           'Active',
  'factuur open':            'Active',
  'gewonnen':                'Done',
  'afgerond':                'Done',
  'klant':                   'Done',
  'factuur betaald':         'Done',
  'blacklist':               'Done',
  'verloren':                'Closed',
  'niets uitgekomen':        'Closed',
  'archief':                 'Closed',
  'geannuleerd':             'Closed',
  'samenwerking afgesloten': 'Closed',
  'geen samenwerking':       'Closed',
  'samenwerking negatief':   'Closed',
  'lopende samenwerking':    'Active',
}

// ── Entity-specific status order (matches ClickUp list config) ──────

const ENTITY_STATUS_ORDER: Partial<Record<EntityType, string[]>> = {
  lead: [
    'nieuwe kans',
    'on hold',
    'in gesprek',
    'klant on hold',
    'verloren',
    'niets uitgekomen',
    'gewonnen',
    'archief',
    'blacklist',
  ],
  assignment: [
    'nieuwe opdracht',
    'on hold',
    'in uitvoering',
    'afgerond',
    'geannuleerd',
  ],
  company: [
    'open',
    'in gesprek',
    'lopende samenwerking',
    'eigen bedrijf',
    'klant',
    'geen samenwerking',
    'samenwerking negatief',
    'samenwerking afgesloten',
  ],
  contact: ['open', 'klant', 'archief'],
  clickup_invoice: ['factuur open', 'factuur betaald', 'geannuleerd'],
}

function normalizeStatus(s?: string | null) { return (s || '').toLowerCase().trim() }
function statusHex(s?: string | null) { return STATUS_HEX[normalizeStatus(s)] ?? '#9ca3af' }
function statusGroup(s?: string | null) { return STATUS_GROUP_MAP[normalizeStatus(s)] ?? 'Active' }
function statusBadge(s?: string | null) { return STATUS_BADGE[normalizeStatus(s)] ?? 'bg-gray-400 text-white' }

function groupStatuses(statuses: string[]): { label: string; items: string[] }[] {
  const map: Record<string, string[]> = {}
  for (const s of statuses) {
    const g = STATUS_GROUP_MAP[normalizeStatus(s)] ?? 'Active'
    if (!map[g]) map[g] = []
    map[g].push(s)
  }
  return STATUS_GROUP_ORDER.filter((g) => map[g]).map((g) => ({ label: g, items: map[g] }))
}

// ── Status icon (ClickUp-style SVG) ────────────────────────────────

function StatusIcon({ status, size = 14 }: { status: string | null; size?: number }) {
  const hex = statusHex(status)
  const group = statusGroup(status)

  if (group === 'Done') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
        <circle cx="8" cy="8" r="8" fill={hex} />
        <path d="M4.5 8.5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (group === 'Closed') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
        <circle cx="8" cy="8" r="8" fill={hex} fillOpacity="0.2" />
        <circle cx="8" cy="8" r="5.5" fill={hex} fillOpacity="0.55" />
        <path d="M5.5 8.5l2 2 3.5-4" stroke={hex} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (group === 'Not started') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
        <circle cx="8" cy="8" r="6.5" stroke={hex} strokeWidth="1.5" strokeDasharray="3.5 2" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
      <circle cx="8" cy="8" r="7.5" stroke={hex} strokeWidth="1" opacity="0.3" />
      <circle cx="8" cy="8" r="5" fill={hex} />
    </svg>
  )
}

// ── Helper functions ────────────────────────────────────────────────

function fmtDate(input?: string | null): string | null {
  if (!input) return null
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' })
}

function normalizeCustomFieldValue(field: any): string | null {
  const value = field?.value
  if (value === null || value === undefined || value === '') return null

  const type = field?.type
  const options: any[] = field?.type_config?.options || []

  // drop_down: value is an orderindex integer
  if (type === 'drop_down' && typeof value === 'number') {
    const opt = options.find((o) => o.orderindex === value)
    return opt?.name || String(value)
  }

  // labels: value is an array of option IDs (UUIDs)
  if (type === 'labels' && Array.isArray(value)) {
    const names = value.map((id: string) => {
      const opt = options.find((o) => o.id === id)
      return opt?.label || opt?.name || null
    }).filter(Boolean)
    return names.length ? names.join(', ') : null
  }

  // tasks / list_relationship: value is array of task objects
  if ((type === 'tasks' || type === 'list_relationship') && Array.isArray(value)) {
    const names = value.map((v: any) => v?.name || '').filter(Boolean)
    return names.length ? names.join(', ') : null
  }

  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nee'
  if (Array.isArray(value)) {
    const parts = value.map((v) => {
      if (typeof v === 'object' && v !== null) return v.name || v.label || String(v)
      return String(v)
    }).filter(Boolean)
    return parts.length ? parts.join(', ') : null
  }
  if (typeof value === 'object') {
    if (value.name) return String(value.name)
    if (value.label) return String(value.label)
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return String(value)
}

function cfValue(item: CrmRecord, name: string): string | null {
  const matches = (item.custom_fields || []).filter((f: any) =>
    (f?.name || '').toLowerCase() === name.toLowerCase()
  )
  // prefer the field that has a value
  const withValue = matches.find((f: any) => {
    const v = f?.value
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  })
  const field = withValue || matches[0]
  return field ? normalizeCustomFieldValue(field) : null
}

function cfLabelPills(item: CrmRecord, name: string): React.ReactNode | null {
  const field = (item.custom_fields || []).find((f: any) =>
    (f?.name || '').toLowerCase() === name.toLowerCase() && f?.type === 'labels'
  )
  if (!field || !Array.isArray(field.value) || !field.value.length) return null
  const options: any[] = field.type_config?.options || []
  return (
    <div className="flex gap-1 flex-wrap">
      {(field.value as string[]).slice(0, 3).map((id) => {
        const opt = options.find((o) => o.id === id)
        if (!opt) return null
        return (
          <span
            key={id}
            className="text-xs px-2 py-0.5 rounded font-medium"
            style={{ background: opt.color || '#e9d5ff', color: '#fff' }}
          >
            {opt.label || opt.name || id}
          </span>
        )
      })}
    </div>
  )
}

/** Rendert een dropdown-veld als gekleurde pill (kleur uit ClickUp type_config). */
function cfDropdownPill(item: CrmRecord, fieldName: string): React.ReactNode | null {
  const field = (item.custom_fields || []).find(
    (f: any) => (f?.name || '').toLowerCase() === fieldName.toLowerCase() && f?.type === 'drop_down'
  )
  if (!field || field.value === null || field.value === undefined) return null
  const options: any[] = field.type_config?.options || []
  const opt = options.find((o: any) => o.orderindex === field.value)
  if (!opt) return null
  return pill(opt.name, opt.color || '#e2e8f0', opt.color ? '#fff' : '#374151')
}

/** Rendert een URL als klikbare link (met extern-icoon). */
function urlCell(val: string | null): React.ReactNode {
  if (!val) return DASH
  const href = val.startsWith('http') ? val : `https://${val}`
  const display = val.replace(/^https?:\/\/(www\.)?/, '')
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      onClick={(e) => e.stopPropagation()}
      className="text-xs text-indigo-500 hover:underline flex items-center gap-1 min-w-0"
    >
      <ExternalLink size={10} className="shrink-0" />
      <span className="truncate">{display}</span>
    </a>
  )
}

function promoteInfo(entity: EntityType, status?: string | null): { label: string; targetLabel: string } | null {
  const s = (status || '').toLowerCase()
  if (entity === 'lead' && (s === 'gewonnen' || s === 'klant')) {
    return { label: 'Maak opdracht aan', targetLabel: 'opdracht' }
  }
  if (entity === 'assignment' && s === 'afgerond') {
    return { label: 'Maak factuur aan', targetLabel: 'factuur' }
  }
  return null
}

function titleFor(entity: EntityType): string {
  const map: Record<EntityType, string> = {
    daley_list: "Daley Jansen's List",
    lead: 'Leads (kansen)',
    company: 'Bedrijven',
    assignment: 'Opdrachten',
    clickup_invoice: 'Facturatie',
    contact: 'Contacten',
  }
  return map[entity]
}

// ── Column definitions ────────────────────────────────────────────

interface Column {
  key: string
  label: string
  width: number
  render: (item: CrmRecord) => React.ReactNode
}

const DASH = <span className="text-gray-300">–</span>

function pill(label: string, bg?: string, fg?: string) {
  return (
    <span
      className="inline-flex text-xs px-2 py-0.5 rounded font-medium truncate max-w-full"
      style={bg ? { background: bg, color: fg || '#fff' } : { background: '#e9d5ff', color: '#6b21a8' }}
    >
      {label}
    </span>
  )
}

function textCell(val: string | null) {
  return val
    ? <span className="text-xs text-gray-700 truncate block">{val}</span>
    : DASH
}

const LEAD_COLUMNS: Column[] = [
  { key: 'bedrijf',         label: 'Bedrijf',         width: 140, render: (r) => textCell(cfValue(r, 'Bedrijf')) },
  { key: 'contact',         label: 'Contactpersoon',   width: 130, render: (r) => textCell(cfValue(r, 'Contactpersoon')) },
  { key: 'details',         label: 'Details opdracht', width: 160, render: (r) => textCell(cfValue(r, 'Details opdracht')) },
  {
    key: 'producten', label: 'Producten', width: 120,
    render: (r) => {
      const pills = cfLabelPills(r, 'Producten')
      if (pills) return pills
      const tags = r.tags?.filter((t) => t.name)
      if (tags?.length) {
        return (
          <div className="flex gap-1 flex-wrap">
            {tags.slice(0, 2).map((t, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded font-medium"
                style={t.tag_bg ? { background: t.tag_bg, color: t.tag_fg || '#fff' } : undefined}
              >
                {t.name}
              </span>
            ))}
          </div>
        )
      }
      return DASH
    },
  },
  { key: 'prijs',           label: 'Prijs',            width: 108, render: (r) => textCell(cfValue(r, 'Prijs incl. BTW')) },
  { key: 'bron',            label: 'Bron',             width: 110, render: (r) => cfDropdownPill(r, 'Bron') ?? DASH },
  {
    key: 'type_kans', label: 'Type kans', width: 120,
    render: (r) => {
      const v = cfValue(r, 'Type kans')
      return v ? pill(v, '#dcfce7', '#166534') : DASH
    },
  },
  { key: 'deadline',        label: 'Beslissing',       width: 96,  render: (r) => textCell(fmtDate(cfValue(r, '(Verwachte) beslissingsdatum') || r.due_date)) },
  { key: 'date_created',    label: 'Aangemaakt',       width: 96,  render: (r) => textCell(fmtDate(r.clickup_date_created || r.synced_at)) },
]

const ASSIGNMENT_COLUMNS: Column[] = [
  { key: 'bedrijf',      label: 'Bedrijf',         width: 140, render: (r) => textCell(cfValue(r, 'Bedrijf')) },
  { key: 'contact',      label: 'Contactpersoon',   width: 130, render: (r) => textCell(cfValue(r, 'Contactpersoon')) },
  { key: 'details',      label: 'Details opdracht', width: 160, render: (r) => textCell(cfValue(r, 'Details opdracht') || cfValue(r, 'Details')) },
  { key: 'producten',    label: 'Producten',        width: 120, render: (r) => cfLabelPills(r, 'Producten') ?? DASH },
  { key: 'prijs',        label: 'Prijs',            width: 108, render: (r) => textCell(cfValue(r, 'Prijs incl. BTW')) },
  { key: 'bron',         label: 'Bron',             width: 110, render: (r) => cfDropdownPill(r, 'Bron') ?? DASH },
  { key: 'datum_afgerond', label: 'Afgerond',       width: 96,  render: (r) => textCell(fmtDate(cfValue(r, 'Datum afgerond') || r.due_date)) },
  { key: 'date_created', label: 'Aangemaakt',       width: 96,  render: (r) => textCell(fmtDate(r.clickup_date_created || r.synced_at)) },
]

const INVOICE_COLUMNS: Column[] = [
  { key: 'bedrijf',      label: 'Bedrijf',          width: 160, render: (r) => textCell(cfValue(r, 'Bedrijf')) },
  { key: 'prijs',        label: 'Bedrag incl. BTW', width: 140, render: (r) => textCell(cfValue(r, 'Prijs incl. BTW') || cfValue(r, 'Bedrag')) },
  { key: 'due_date',     label: 'Vervaldatum',      width: 110, render: (r) => textCell(fmtDate(r.due_date)) },
  { key: 'date_created', label: 'Date created',     width: 110, render: (r) => textCell(fmtDate(r.clickup_date_created || r.synced_at)) },
]

const GENERIC_COLUMNS: Column[] = [
  {
    key: 'tags', label: 'Tags', width: 160,
    render: (r) => {
      const tags = r.tags?.filter((t) => t.name)
      if (!tags?.length) return DASH
      return (
        <div className="flex gap-1 flex-wrap">
          {tags.slice(0, 3).map((t, i) => (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={t.tag_bg ? { background: t.tag_bg, color: t.tag_fg || '#fff' } : undefined}
            >
              {t.name}
            </span>
          ))}
        </div>
      )
    },
  },
  { key: 'assignee',     label: 'Assignee',     width: 130, render: (r) => textCell(r.assignees?.[0]?.username || r.assignees?.[0]?.email || null) },
  { key: 'date_created', label: 'Date created', width: 110, render: (r) => textCell(fmtDate(r.clickup_date_created || r.synced_at)) },
]

function contactColumns(klantMap: Map<string, string>): Column[] {
  return [
    { key: 'bedrijf',     label: 'Bedrijf',           width: 140,
      render: (r) => textCell(cfValue(r, 'Bedrijf')) },
    { key: 'bron',        label: 'Bron',               width: 150,
      render: (r) => cfDropdownPill(r, 'Bron') ?? DASH },
    { key: 'email',       label: 'E-mail',             width: 168,
      render: (r) => textCell(cfValue(r, 'E-mail') || cfValue(r, 'Email')) },
    { key: 'gerelateerd', label: 'Gerelateerde kans',  width: 164,
      render: (r) => textCell(cfValue(r, 'Gerelateerde kans') || cfValue(r, 'Related tasks') || cfValue(r, 'Opdracht')) },
    { key: 'website',     label: 'Website',            width: 156,
      render: (r) => urlCell(cfValue(r, 'Website')) },
    { key: 'klantnummer', label: 'Klantnr',            width: 84,
      render: (r) => {
        const nr = klantMap.get(r.name.toLowerCase().trim())
        return nr
          ? <span className="text-xs font-mono text-indigo-600 tracking-wider">{nr}</span>
          : DASH
      },
    },
  ]
}

function companyColumns(klantMap: Map<string, string>): Column[] {
  return [
    {
      key: 'klantnummer', label: 'Klantnr', width: 88,
      render: (r) => {
        // Prefer ClickUp field 'Klantnummer', fallback op uren_klanten map
        const clickupNr = cfValue(r, 'Klantnummer')
        const urenNr = klantMap.get(r.name.toLowerCase().trim())
        const nr = clickupNr || urenNr
        return nr
          ? <span className="text-xs font-mono text-indigo-600 tracking-wider">{nr}</span>
          : DASH
      },
    },
    { key: 'contactpersoon', label: 'Contactpersoon', width: 140, render: (r) => textCell(cfValue(r, 'Contactpersoon')) },
    { key: 'website',        label: 'Website',        width: 156, render: (r) => urlCell(cfValue(r, 'Website')) },
    { key: 'date_updated',   label: 'Bijgewerkt',     width: 100, render: (r) => textCell(fmtDate(r.clickup_date_updated || r.synced_at)) },
  ]
}

function getColumns(entity: EntityType, klantMap: Map<string, string> = new Map()): Column[] {
  if (entity === 'lead') return LEAD_COLUMNS
  if (entity === 'contact') return contactColumns(klantMap)
  if (entity === 'assignment') return ASSIGNMENT_COLUMNS
  if (entity === 'clickup_invoice') return INVOICE_COLUMNS
  if (entity === 'company') return companyColumns(klantMap)
  return GENERIC_COLUMNS
}

// ── StatusPicker ───────────────────────────────────────────────────

function StatusPicker({
  recordId,
  currentStatus,
  allStatuses,
  onStatusChange,
  iconOnly = false,
}: {
  recordId: string
  currentStatus: string | null
  allStatuses: string[]
  onStatusChange: (id: string, status: string) => void
  iconOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = search.trim()
    ? allStatuses.filter((s) => s.toLowerCase().includes(search.toLowerCase()))
    : allStatuses
  const groups = groupStatuses(filtered)

  const handleSelect = async (status: string) => {
    if (status === currentStatus) { setOpen(false); setSearch(''); return }
    setOpen(false)
    setSearch('')
    setSaving(true)
    onStatusChange(recordId, status)
    try {
      await fetch(`/api/integrations/clickup/records/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    } catch { /* best effort */ } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        className={
          iconOnly
            ? 'flex items-center justify-center hover:opacity-70 transition-opacity'
            : `inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wide transition-opacity hover:opacity-80 ${statusBadge(currentStatus)}`
        }
        title={iconOnly ? (currentStatus || 'Status') : undefined}
      >
        {iconOnly ? (
          saving
            ? <RefreshCw size={13} className="animate-spin text-gray-400" />
            : <StatusIcon status={currentStatus} size={16} />
        ) : (
          <>
            <StatusIcon status={currentStatus} size={10} />
            {currentStatus || '–'}
          </>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white rounded-lg border border-gray-200 shadow-xl w-60">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="Zoeken..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {groups.length === 0 && (
              <p className="text-xs text-gray-400 px-3 py-2">Geen resultaten</p>
            )}
            {groups.map(({ label, items }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold text-gray-400 px-3 pt-2 pb-0.5 uppercase tracking-wider">{label}</p>
                {items.map((s) => {
                  const isCurrent = s === currentStatus
                  return (
                    <button
                      key={s}
                      onClick={() => handleSelect(s)}
                      className="w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <StatusIcon status={s} size={14} />
                      <span className={`text-xs flex-1 font-medium uppercase tracking-wide ${isCurrent ? 'text-gray-900' : 'text-gray-700'}`}>
                        {s}
                      </span>
                      {isCurrent && <Check size={13} className="text-gray-400 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Grouped list view (ClickUp-style) ─────────────────────────────

function GroupedListView({
  items,
  allStatuses,
  onStatusChange,
  onRowClick,
  entity,
  klantMap,
}: {
  items: CrmRecord[]
  allStatuses: string[]
  onStatusChange: (id: string, status: string) => void
  onRowClick: (r: CrmRecord) => void
  entity: EntityType
  klantMap: Map<string, string>
}) {
  const columns = getColumns(entity, klantMap)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const groups = useMemo(() => {
    const byStatus: Record<string, CrmRecord[]> = {}
    for (const item of items) {
      const s = item.status || '(geen status)'
      if (!byStatus[s]) byStatus[s] = []
      byStatus[s].push(item)
    }

    const priorityOrder = ENTITY_STATUS_ORDER[entity] ?? []
    const ordered: string[] = []

    // First: entity-specific order (case-insensitive match)
    for (const key of priorityOrder) {
      for (const actual of Object.keys(byStatus)) {
        if (actual.toLowerCase() === key.toLowerCase() && !ordered.includes(actual)) ordered.push(actual)
      }
    }
    // Then: any remaining statuses in STATUS_GROUP_MAP order
    for (const mapKey of Object.keys(STATUS_GROUP_MAP)) {
      for (const actual of Object.keys(byStatus)) {
        if (actual.toLowerCase() === mapKey && !ordered.includes(actual)) ordered.push(actual)
      }
    }
    // Finally: anything else
    for (const key of Object.keys(byStatus)) {
      if (!ordered.includes(key)) ordered.push(key)
    }

    return ordered.map((s) => ({ status: s, items: byStatus[s] }))
  }, [items, entity])

  const toggle = (s: string) => setCollapsed((prev) => ({ ...prev, [s]: !prev[s] }))

  if (groups.length === 0) {
    return <p className="text-gray-400 text-sm py-10 text-center">Geen records gevonden.</p>
  }

  const colTotalWidth = columns.reduce((acc, c) => acc + c.width, 0)
  const minWidth = 36 + 36 + 280 + colTotalWidth + 36

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }}>
        {/* Column header row */}
        <div className="flex items-center border-b border-gray-200 bg-gray-50/80">
          <div className="w-9 shrink-0" />
          <div className="w-9 shrink-0" />
          <div className="flex-1 min-w-0 px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider" style={{ minWidth: 280 }}>
            Naam
          </div>
          {columns.map((col) => (
            <div
              key={col.key}
              className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0"
              style={{ width: col.width }}
            >
              {col.label}
            </div>
          ))}
          <div className="w-9 shrink-0" />
        </div>

        {/* Status groups */}
        {groups.map(({ status, items: groupItems }) => {
          const isCollapsed = collapsed[status]
          return (
            <div key={status}>
              {/* Group header */}
              <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-b border-gray-100">
                <button
                  onClick={() => toggle(status)}
                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0 transition-colors rounded hover:bg-gray-100"
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <StatusIcon status={status} size={16} />
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${statusBadge(status)}`}>
                  {status}
                </span>
                <span className="text-xs text-gray-400 font-medium">{groupItems.length}</span>
              </div>

              {/* Rows */}
              {!isCollapsed && groupItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center border-b border-gray-100 hover:bg-blue-50/25 transition-colors cursor-pointer group"
                  onClick={() => onRowClick(item)}
                >
                  <div className="w-9 shrink-0" />

                  {/* Status icon — opens picker */}
                  <div
                    className="w-9 shrink-0 flex items-center justify-center py-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <StatusPicker
                      recordId={item.id}
                      currentStatus={item.status ?? null}
                      allStatuses={allStatuses}
                      onStatusChange={onStatusChange}
                      iconOnly
                    />
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0 px-3 py-1" style={{ minWidth: 280 }}>
                    <span className="text-sm text-gray-900 group-hover:text-indigo-700 truncate block transition-colors">
                      {item.name}
                    </span>
                  </div>

                  {/* Entity columns */}
                  {columns.map((col) => (
                    <div
                      key={col.key}
                      className="px-3 py-1 shrink-0 overflow-hidden"
                      style={{ width: col.width }}
                    >
                      {col.render(item)}
                    </div>
                  ))}

                  {/* External link */}
                  <div
                    className="w-9 shrink-0 flex items-center justify-center py-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener"
                        className="text-gray-300 hover:text-indigo-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Openen in ClickUp"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              ))}

              {!isCollapsed && (
                <div className="flex items-center border-b border-gray-100 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50/60 transition-colors cursor-default">
                  <div className="w-9 shrink-0" />
                  <div className="w-9 shrink-0" />
                  <div className="flex items-center gap-1.5 px-3">
                    <Plus size={12} />
                    Add Task
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Board card ──────────────────────────────────────────────────────

function BoardCard({
  item,
  allStatuses,
  onStatusChange,
  onClick,
}: {
  item: CrmRecord
  allStatuses: string[]
  onStatusChange: (id: string, status: string) => void
  onClick: () => void
}) {
  const assignee = item.assignees?.[0]
  const fields = (item.custom_fields || [])
    .map((f) => ({ label: f?.name, value: normalizeCustomFieldValue(f) }))
    .filter((f) => f.label && f.value)
    .slice(0, 2)

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-brand border border-brand-card-border hover:border-brand-lavender hover:shadow-md transition-all p-3 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-brand-text-primary leading-snug flex-1">{item.name}</p>
        <StatusPicker
          recordId={item.id}
          currentStatus={item.status ?? null}
          allStatuses={allStatuses}
          onStatusChange={onStatusChange}
        />
      </div>
      {fields.length > 0 && (
        <div className="space-y-0.5">
          {fields.map((f, i) => (
            <p key={i} className="text-xs text-brand-text-secondary truncate">
              <span className="opacity-70">{f.label}:</span> {f.value}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {item.tags?.slice(0, 2).map((tag, i) => (
            <span
              key={i}
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={tag.tag_bg ? { backgroundColor: tag.tag_bg, color: tag.tag_fg || '#fff' } : undefined}
            >
              {tag.name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.due_date && (
            <span className="text-xs text-brand-text-secondary">{fmtDate(item.due_date)}</span>
          )}
          {assignee && (
            <div
              className="w-5 h-5 rounded-full bg-brand-lavender text-white text-xs flex items-center justify-center font-semibold shrink-0"
              title={assignee.username || assignee.email}
            >
              {(assignee.username || assignee.email || '?')[0].toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Board view ──────────────────────────────────────────────────────

function BoardView({
  items,
  allStatuses,
  onStatusChange,
  onCardClick,
}: {
  items: CrmRecord[]
  allStatuses: string[]
  onStatusChange: (id: string, status: string) => void
  onCardClick: (r: CrmRecord) => void
}) {
  const columns = useMemo(() => {
    const groups: Record<string, CrmRecord[]> = {}
    for (const item of items) {
      const s = item.status || '(geen status)'
      if (!groups[s]) groups[s] = []
      groups[s].push(item)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 min-h-[300px]">
      {columns.map(([status, cards]) => (
        <div key={status} className="flex-shrink-0 w-64">
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <StatusIcon status={status} size={14} />
            <span className="text-sm font-semibold text-brand-text-primary flex-1 truncate">{status}</span>
            <span className="text-xs text-brand-text-secondary bg-brand-page-medium rounded-full px-2 py-0.5 shrink-0">
              {cards.length}
            </span>
          </div>
          <div className="space-y-2">
            {cards.map((card) => (
              <BoardCard
                key={card.id}
                item={card}
                allStatuses={allStatuses}
                onStatusChange={onStatusChange}
                onClick={() => onCardClick(card)}
              />
            ))}
          </div>
        </div>
      ))}
      {columns.length === 0 && (
        <p className="text-brand-text-secondary text-sm py-10 px-4">Geen records gevonden.</p>
      )}
    </div>
  )
}

// ── Detail modal (centered popup) ──────────────────────────────────

function RecordDetailModal({
  record,
  allStatuses,
  onStatusChange,
  onClose,
  onSaved,
  onDeleted,
}: {
  record: CrmRecord
  allStatuses: string[]
  onStatusChange: (id: string, status: string) => void
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [full, setFull] = useState<CrmRecord | null>(null)
  const [loadingFull, setLoadingFull] = useState(true)
  const [name, setName] = useState(record.name)
  const [currentStatus, setCurrentStatus] = useState(record.status || '')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  // Klantnummer + uren-koppeling
  const [klantnummer, setKlantnummer] = useState('')
  const [origKlantnummer, setOrigKlantnummer] = useState('')
  const [klantId, setKlantId] = useState<string | null>(null)
  const [crmBedrijfId, setCrmBedrijfId] = useState<string | null>(null)
  const [loadingKlant, setLoadingKlant] = useState(true)
  const [toevoegenAanUren, setToevoegenAanUren] = useState(false)
  // Uren-samenvatting
  const [urenSamenvatting, setUrenSamenvatting] = useState<{ totaalUren: number; totaalOmzet: number; openstaand: number } | null>(null)
  const [loadingUren, setLoadingUren] = useState(false)

  useEffect(() => {
    setLoadingFull(true)
    fetch(`/api/integrations/clickup/records/${record.id}`)
      .then((r) => r.json())
      .then((d) => {
        const item = d.item || null
        setFull(item)
        if (item?.raw?.notes) setNotes(item.raw.notes)
        setLoadingFull(false)
      })
      .catch(() => setLoadingFull(false))
  }, [record.id])

  useEffect(() => {
    setLoadingKlant(true)
    Promise.all([
      fetch('/api/uren-klanten').then(r => r.json()),
      fetch('/api/crm/bedrijven?lite=true').then(r => r.json()),
    ])
      .then(([klanten, crmBedrijven]: [any[], any[]]) => {
        // Zoek het crm_bedrijven record op naam
        const crmBedrijf = crmBedrijven.find(
          (cb: any) => cb.naam?.toLowerCase() === record.name?.toLowerCase()
        )
        setCrmBedrijfId(crmBedrijf?.id ?? null)

        // Zoek uren_klant: eerst via crm_bedrijf_id (FK), fallback op naam
        let match: any = null
        if (crmBedrijf?.id) {
          match = klanten.find((k: any) => k.crmBedrijfId === crmBedrijf.id)
        }
        if (!match) {
          match = klanten.find((k: any) => k.naam?.toLowerCase() === record.name?.toLowerCase())
        }

        if (match) {
          setKlantId(match.id)
          setKlantnummer(match.klantnummer ?? '')
          setOrigKlantnummer(match.klantnummer ?? '')
        }
        setLoadingKlant(false)
      })
      .catch(() => setLoadingKlant(false))
  }, [record.name])

  useEffect(() => {
    if (!klantId) return
    setLoadingUren(true)
    fetch(`/api/uren?klant=${encodeURIComponent(record.name)}`)
      .then(r => r.json())
      .then((uren: any[]) => {
        if (!Array.isArray(uren)) return
        const totaalUren = uren.reduce((s, u) => s + (Number(u.uren) || 0), 0)
        const totaalOmzet = uren.reduce((s, u) => s + ((Number(u.uren) || 0) * (Number(u.uurtarief) || 0)), 0)
        const openstaand = uren.filter(u => !u.gefactureerd).reduce((s, u) => s + ((Number(u.uren) || 0) * (Number(u.uurtarief) || 0)), 0)
        setUrenSamenvatting({ totaalUren, totaalOmzet, openstaand })
        setLoadingUren(false)
      })
      .catch(() => setLoadingUren(false))
  }, [klantId, record.name])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleStatusChange = (id: string, status: string) => {
    setCurrentStatus(status)
    onStatusChange(id, status)
  }

  const raw = full?.raw || {}
  const allFields = ((full?.custom_fields || record.custom_fields) ?? [])
    .map((f: any) => ({ label: f?.name || f?.type || 'Veld', value: normalizeCustomFieldValue(f) ?? '' }))
    .filter((f: any) => f.label && f.value)
  const description: string | null = raw.description || null
  const assignees = full?.assignees || record.assignees || []
  const tags = full?.tags || record.tags || []
  const created = fmtDate(full?.clickup_date_created || record.clickup_date_created)
  const updated = fmtDate(full?.clickup_date_updated || record.clickup_date_updated)
  const url = full?.url || record.url

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const [res] = await Promise.all([
        fetch(`/api/integrations/clickup/records/${record.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, status: currentStatus || undefined, notes }),
        }),
        // Sla klantnummer op in Supabase als het gewijzigd is
        klantId && klantnummer !== origKlantnummer
          ? fetch(`/api/uren-klanten/${klantId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ klantnummer: klantnummer.trim() }),
            })
          : Promise.resolve(null),
      ])
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Update mislukt')
      setOrigKlantnummer(klantnummer)
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Update mislukt')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Weet je zeker dat je dit record wilt verwijderen?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/integrations/clickup/records/${record.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Verwijderen mislukt')
      onDeleted()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Verwijderen mislukt')
    } finally {
      setDeleting(false)
    }
  }

  const handleVoegToeAanUren = async () => {
    setToevoegenAanUren(true)
    setError('')
    try {
      const res = await fetch('/api/uren-klanten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: record.name, crmBedrijfId: crmBedrijfId ?? undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Aanmaken mislukt')
      setKlantId(json.id)
      setKlantnummer(json.klantnummer ?? '')
      setOrigKlantnummer(json.klantnummer ?? '')
      setInfo(`Klant aangemaakt in urenregistratie (${json.klantnummer ?? ''})`)
    } catch (e: any) {
      setError(e.message || 'Kon klant niet aanmaken')
    } finally {
      setToevoegenAanUren(false)
    }
  }

  const promote = promoteInfo(record.entity_type, currentStatus)
  const handlePromote = async () => {
    if (!promote) return
    setPromoting(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch(`/api/integrations/clickup/records/${record.id}/promote`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Promote mislukt')
      setInfo(`Nieuwe ${promote.targetLabel} aangemaakt en gekoppeld.`)
      onSaved()
    } catch (e: any) {
      setError(e.message || 'Promote mislukt')
    } finally {
      setPromoting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!saving && !deleting) handleSave() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPicker
                recordId={record.id}
                currentStatus={currentStatus || null}
                allStatuses={allStatuses}
                onStatusChange={handleStatusChange}
              />
              {url && (
                <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline">
                  <ExternalLink size={12} /> Openen in ClickUp
                </a>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors shrink-0 mt-0.5">
              <X size={20} />
            </button>
          </div>
          <textarea
            className="w-full text-xl font-semibold text-gray-900 bg-transparent border-0 outline-none resize-none leading-snug placeholder:text-gray-300 focus:bg-gray-50/60 rounded-lg px-1 -mx-1 py-1 transition-colors"
            value={name}
            onChange={(e) => setName(e.target.value)}
            rows={1}
            style={{ fieldSizing: 'content' as any, minHeight: 36 }}
          />
        </div>

        {/* Body: two columns */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: description + notes */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 min-w-0">

            {loadingFull ? (
              <div className="text-xs text-gray-400 flex items-center gap-1.5 pt-2">
                <RefreshCw size={11} className="animate-spin" /> Laden...
              </div>
            ) : description ? (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Beschrijving</p>
                <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl p-4 leading-relaxed border border-gray-100">
                  {description}
                </div>
              </div>
            ) : null}

            {/* Notities */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Notities</p>
              <textarea
                className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent placeholder:text-gray-300 leading-relaxed bg-white"
                placeholder="Voeg een notitie toe..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
              />
            </div>

            {/* Assignees */}
            {assignees.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Toegewezen aan</p>
                <div className="flex flex-wrap gap-2">
                  {assignees.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5 border border-gray-100">
                      <div className="w-6 h-6 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center font-semibold shrink-0">
                        {(a.username || a.email || '?')[0].toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-700">{a.username || a.email}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={tag.tag_bg ? { backgroundColor: tag.tag_bg, color: tag.tag_fg || '#fff' } : { background: '#e0e7ff', color: '#4338ca' }}
                    >
                      {tag.name || 'tag'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar: meta info */}
          <div className="w-60 shrink-0 border-l border-gray-100 overflow-y-auto px-5 py-5 space-y-5 bg-gray-50/40">

            {/* Klantnummer + uren-koppeling */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Urenregistratie</p>
              {loadingKlant ? (
                <p className="text-xs text-gray-400">Laden...</p>
              ) : klantId ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={klantnummer}
                    onChange={e => setKlantnummer(e.target.value.toUpperCase())}
                    placeholder="bijv. DRI001"
                    maxLength={10}
                    className="text-sm font-mono w-full border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent tracking-wider"
                  />
                  <a
                    href={`/uren`}
                    className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline"
                  >
                    <ArrowRight size={11} /> Bekijk uren
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 italic">Niet gekoppeld aan uren</p>
                  <button
                    onClick={handleVoegToeAanUren}
                    disabled={toevoegenAanUren}
                    className="w-full text-left text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                  >
                    <Plus size={11} /> {toevoegenAanUren ? 'Aanmaken...' : 'Toevoegen aan uren'}
                  </button>
                </div>
              )}
            </div>

            {/* Uren-samenvatting */}
            {klantId && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Uren overzicht</p>
                {loadingUren ? (
                  <p className="text-xs text-gray-400">Laden...</p>
                ) : urenSamenvatting ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Totaal uren</span>
                      <span className="font-medium text-gray-800">{urenSamenvatting.totaalUren.toFixed(1)}u</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Totale omzet</span>
                      <span className="font-medium text-gray-800">{new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(urenSamenvatting.totaalOmzet)}</span>
                    </div>
                    {urenSamenvatting.openstaand > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-amber-600">Openstaand</span>
                        <span className="font-medium text-amber-700">{new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(urenSamenvatting.openstaand)}</span>
                      </div>
                    )}
                    {urenSamenvatting.totaalUren === 0 && (
                      <p className="text-xs text-gray-400 italic">Nog geen uren geboekt</p>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Custom fields */}
            {allFields.length > 0 && (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Velden</p>
                {allFields.map((f, i) => (
                  <div key={i}>
                    <p className="text-[11px] text-gray-400 mb-0.5">{f.label}</p>
                    <p className="text-sm text-gray-800 font-medium break-words">{f.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Dates */}
            <div className="space-y-3">
              {created && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5">Aangemaakt</p>
                  <p className="text-sm text-gray-700">{created}</p>
                </div>
              )}
              {updated && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5">Bijgewerkt</p>
                  <p className="text-sm text-gray-700">{updated}</p>
                </div>
              )}
              {full?.due_date && (
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5">Deadline</p>
                  <p className="text-sm text-gray-700">{fmtDate(full.due_date)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/40 shrink-0">
          <div className="flex-1 min-w-0">
            {error && <p className="text-xs text-red-500 truncate">{error}</p>}
            {!error && info && <p className="text-xs text-green-600 truncate">{info}</p>}
          </div>
          {promote && (
            <button
              onClick={handlePromote}
              disabled={promoting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60 transition-colors"
            >
              <ArrowRight size={13} /> {promoting ? 'Bezig...' : promote.label}
            </button>
          )}
          <button onClick={handleDelete} className="btn-secondary text-red-500 text-sm" disabled={deleting}>
            <Trash2 size={13} /> {deleting ? 'Verwijderen...' : 'Verwijder'}
          </button>
          <button onClick={handleSave} className="btn-primary text-sm" disabled={saving}>
            <Save size={13} /> {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create new record form ──────────────────────────────────────────

function NewRecordForm({
  entity,
  onClose,
  onCreated,
}: {
  entity: EntityType
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [status, setStatus] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) { setError('Naam is verplicht'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/integrations/clickup/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: entity, name: name.trim(), status: status || undefined, description: description || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Aanmaken mislukt')
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Aanmaken mislukt')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-page-medium">
          <h2 className="font-uxum text-base font-semibold">Nieuw record</h2>
          <button onClick={onClose} className="text-brand-text-secondary hover:text-brand-text-primary"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs text-brand-text-secondary block mb-1">Naam *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-brand-text-secondary block mb-1">Status</label>
            <input className="input" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="bijv. nieuwe kans" />
          </div>
          <div>
            <label className="text-xs text-brand-text-secondary block mb-1">Beschrijving</label>
            <textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-brand-page-medium flex justify-end">
          <button onClick={handleCreate} className="btn-primary" disabled={saving}>
            <Plus size={14} /> {saving ? 'Aanmaken...' : 'Aanmaken'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────

export default function ClickUpCrmRecordsPage({ entity }: { entity: EntityType }) {
  const searchParams = useSearchParams()
  const openParam = searchParams.get('open') // naam van het record om direct te openen

  const [items, setItems] = useState<CrmRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [detailRecord, setDetailRecord] = useState<CrmRecord | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [klantMap, setKlantMap] = useState<Map<string, string>>(new Map())
  const autoOpenedRef = useRef(false)

  const allStatuses = useMemo(() => {
    const s = new Set(items.map((i) => i.status || '').filter(Boolean))
    return Array.from(s).sort()
  }, [items])

  const handleStatusChange = (id: string, status: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)))
  }

  const visibleItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      (item.status || '').toLowerCase().includes(q) ||
      (item.custom_fields || []).some((f: any) => {
        const v = normalizeCustomFieldValue(f)
        return v && (`${f?.name} ${v}`).toLowerCase().includes(q)
      })
    )
  }, [items, search])

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch(`/api/integrations/clickup/records?entity=${entity}&limit=500`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kon records niet laden')
      setItems(Array.isArray(json.items) ? json.items : [])
    } catch (e: any) {
      setMessage(e.message || 'Kon records niet laden')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const runSync = async () => {
    setSyncing(true)
    setMessage('')
    try {
      const res = await fetch('/api/integrations/clickup/sync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Sync mislukt')
      setMessage(`Sync klaar: ${json?.counts?.tasksUpserted ?? 0} records bijgewerkt`)
      await load()
    } catch (e: any) {
      setMessage(e.message || 'Sync mislukt')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity])

  // Auto-open het record waarvan de naam overeenkomt met ?open=naam
  useEffect(() => {
    if (!openParam || loading || items.length === 0 || autoOpenedRef.current) return
    const match = items.find(
      (item) => item.name.toLowerCase().trim() === openParam.toLowerCase().trim()
    )
    if (match) {
      autoOpenedRef.current = true
      setDetailRecord(match)
    }
  }, [openParam, loading, items])

  useEffect(() => {
    fetch('/api/uren-klanten')
      .then(r => r.json())
      .then((klanten: any[]) => {
        const map = new Map<string, string>()
        for (const k of klanten) {
          if (k.naam && k.klantnummer) {
            map.set(k.naam.toLowerCase().trim(), k.klantnummer)
          }
        }
        setKlantMap(map)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">{titleFor(entity)}</h1>
          <p className="text-sm text-brand-text-secondary mt-0.5">{items.length} records gesynchroniseerd vanuit ClickUp</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/crm-sync" className="btn-secondary text-sm">CRM Sync</Link>
          <button onClick={load} className="btn-secondary text-sm" disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Ververs
          </button>
          <button onClick={runSync} className="btn-secondary text-sm" disabled={syncing}>
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncen…' : 'Nu syncen'}
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
            <Plus size={13} /> Nieuw
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary" />
          <input
            className="input pl-8 text-sm"
            placeholder={`Zoek in ${titleFor(entity).toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex border border-brand-card-border rounded-brand-sm overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 flex items-center gap-1.5 text-sm transition-colors ${viewMode === 'list' ? 'bg-brand-lavender text-white' : 'bg-white text-brand-text-secondary hover:bg-brand-page-light'}`}
          >
            <LayoutList size={14} /> Lijst
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={`px-3 py-1.5 flex items-center gap-1.5 text-sm transition-colors border-l border-brand-card-border ${viewMode === 'board' ? 'bg-brand-lavender text-white' : 'bg-white text-brand-text-secondary hover:bg-brand-page-light'}`}
          >
            <Columns3 size={14} /> Board
          </button>
        </div>
        {message && <p className="text-xs text-brand-text-secondary">{message}</p>}
      </div>

      {/* Content */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-brand-text-secondary text-sm">
            <RefreshCw size={16} className="animate-spin inline mr-2" /> Laden…
          </div>
        ) : viewMode === 'list' ? (
          <GroupedListView
            items={visibleItems}
            allStatuses={allStatuses}
            onStatusChange={handleStatusChange}
            onRowClick={setDetailRecord}
            entity={entity}
            klantMap={klantMap}
          />
        ) : (
          <div className="p-5">
            <BoardView
              items={visibleItems}
              allStatuses={allStatuses}
              onStatusChange={handleStatusChange}
              onCardClick={setDetailRecord}
            />
          </div>
        )}
      </div>

      {detailRecord && (
        <RecordDetailModal
          record={detailRecord}
          allStatuses={allStatuses}
          onStatusChange={handleStatusChange}
          onClose={() => setDetailRecord(null)}
          onSaved={load}
          onDeleted={() => { load(); setDetailRecord(null) }}
        />
      )}

      {showCreate && (
        <NewRecordForm
          entity={entity}
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  )
}
