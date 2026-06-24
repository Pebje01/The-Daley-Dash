'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ChevronDown, ChevronRight, Check, ExternalLink,
  RefreshCw, Search, Plus, X, Save, Trash2, LayoutList, Columns3, ArrowRight,
  Building2, User, BadgeDollarSign, BriefcaseBusiness,
  ArrowUp, ArrowDown, Filter as FilterIcon, FileText, CalendarDays, PencilLine,
} from 'lucide-react'
import { DashTagsProvider, InlineTags, type DashTag, DASH_TAG_KLEURNAMEN } from '@/components/CrmTagPicker'
import { useColumnOrder, useColumnDnD, useColumnWidths } from '@/lib/columnOrder'
import { ColumnGrip } from '@/components/ColumnGrip'

type EntityType = 'daley_list' | 'lead' | 'company' | 'contact' | 'assignment' | 'clickup_invoice'

// ── Centrale keuze-opties (crm_field_options) ───────────────────────
// Keuzevelden (labels/drop_down) lazen hun opties uit de per-record kopie
// (field.type_config.options). Die kopie blijft bestaan als fallback, maar de
// bron van waarheid is nu de centrale lijst, hier per field_id in de cache.
type CentralOption = { id: string; label?: string; name?: string; color?: string | null; orderindex: number }
let CENTRAL_FIELD_OPTIONS: Record<string, CentralOption[]> = {}

/** Opties voor een veld: centraal indien beschikbaar, anders de per-record kopie. */
function optionsFor(field: any): any[] {
  const central = field?.id ? CENTRAL_FIELD_OPTIONS[field.id] : null
  if (central && central.length) return central
  return field?.type_config?.options || []
}

const FieldOptionsContext = createContext<{ version: number; reload: () => Promise<void> }>({
  version: 0,
  reload: async () => {},
})
function useFieldOptions() { return useContext(FieldOptionsContext) }

/** Laadt de centrale optielijst één keer en triggert een re-render bij wijziging. */
function FieldOptionsProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0)
  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/field-options')
      if (!res.ok) return
      const data = await res.json()
      CENTRAL_FIELD_OPTIONS = data.byField || {}
      setVersion((v) => v + 1)
    } catch {
      // Val stil terug op de per-record opties
    }
  }, [])
  useEffect(() => { reload() }, [reload])
  return <FieldOptionsContext.Provider value={{ version, reload }}>{children}</FieldOptionsContext.Provider>
}

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
  dash_tags?: string[]
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

// ── Live ClickUp-statusconfig (bron van waarheid voor volgorde + kleur) ──
// Gevuld door ClickUpCrmRecordsPage via /api/crm/statuses. De statische maps
// hierboven blijven als fallback wanneer ClickUp even niet bereikbaar is.
type StatusCfg = { status: string; color: string; type: string; orderindex: number }
let CU_STATUS_BY_ENTITY: Record<string, StatusCfg[]> = {}
let CU_COLOR: Record<string, string> = {}   // genormaliseerde naam -> hex
let CU_GROUP: Record<string, string> = {}    // genormaliseerde naam -> groepslabel

const CU_TYPE_TO_GROUP: Record<string, string> = {
  open: 'Not started',
  unstarted: 'Not started',
  custom: 'Active',
  done: 'Done',
  closed: 'Closed',
}

function applyClickUpStatusConfig(byEntity: Record<string, StatusCfg[]>) {
  CU_STATUS_BY_ENTITY = byEntity || {}
  const color: Record<string, string> = {}
  const group: Record<string, string> = {}
  for (const list of Object.values(byEntity || {})) {
    for (const s of list) {
      const key = (s.status || '').toLowerCase().trim()
      if (!key) continue
      if (s.color) color[key] = s.color
      const g = CU_TYPE_TO_GROUP[s.type]
      if (g) group[key] = g
    }
  }
  CU_COLOR = color
  CU_GROUP = group
}

function normalizeStatus(s?: string | null) { return (s || '').toLowerCase().trim() }
function statusHex(s?: string | null) { const k = normalizeStatus(s); return CU_COLOR[k] ?? STATUS_HEX[k] ?? '#9ca3af' }
function statusGroup(s?: string | null) { const k = normalizeStatus(s); return CU_GROUP[k] ?? STATUS_GROUP_MAP[k] ?? 'Active' }
function statusBadge(s?: string | null) { return STATUS_BADGE[normalizeStatus(s)] ?? 'bg-gray-400 text-white' }

/**
 * Statusvolgorde voor een entity: eerst de echte ClickUp-volgorde (incl. lege
 * statussen), dan statische extra's die niet in ClickUp staan, dan wat in de
 * data voorkomt. Namen behouden hun ClickUp-casing.
 */
function statusOrderFor(entity: EntityType, present: string[] = []): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (name?: string | null) => {
    if (!name) return
    const k = name.toLowerCase().trim()
    if (seen.has(k)) return
    seen.add(k)
    out.push(name)
  }
  const cu = CU_STATUS_BY_ENTITY[entity]
  if (cu && cu.length) for (const s of cu) push(s.status)
  else for (const s of (ENTITY_STATUS_ORDER[entity] ?? [])) push(s)
  for (const s of (ENTITY_STATUS_ORDER[entity] ?? [])) push(s) // extra's zoals 'blacklist'
  for (const s of present) push(s)
  return out
}

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
  const options: any[] = optionsFor(field)

  // drop_down: value is an orderindex integer
  if (type === 'drop_down' && typeof value === 'number') {
    const opt = options.find((o) => o.orderindex === value)
    return opt?.label || opt?.name || String(value)
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

/**
 * Rendert een relatieveld (Bedrijf, Contactpersoon, ...) als klikbare links
 * die de kaart van het gekoppelde record openen via ?open=<naam>.
 * Valt terug op platte tekst als link wanneer het veld een tekstveld is.
 */
function cfRelationLinks(item: CrmRecord, name: string, targetEntity: string): React.ReactNode {
  const matches = (item.custom_fields || []).filter((f: any) =>
    (f?.name || '').toLowerCase() === name.toLowerCase()
  )
  const withValue = matches.find((f: any) => {
    const v = f?.value
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  })
  const field = withValue || matches[0]
  if (!field) return DASH

  const href = ENTITY_HREF[targetEntity] || '/crm/leads'
  const linkClass = 'hover:text-indigo-600 hover:underline underline-offset-2 transition-colors'

  // Relatieveld: array van task-stubs, elke naam apart linken
  if ((field.type === 'tasks' || field.type === 'list_relationship') && Array.isArray(field.value)) {
    const stubs = field.value.filter((v: any) => v?.name)
    if (!stubs.length) return DASH
    return (
      <span className="text-sm text-brand-text-primary truncate block" onClick={(e) => e.stopPropagation()}>
        {stubs.map((stub: any, i: number) => (
          <span key={stub.id || i}>
            {i > 0 && ', '}
            <Link href={`${href}?open=${encodeURIComponent(stub.name)}`} className={linkClass} title="Open kaart">
              {stub.name}
            </Link>
          </span>
        ))}
      </span>
    )
  }

  // Tekstveld: hele waarde als één link (kaart opent als de naam exact bestaat)
  const text = normalizeCustomFieldValue(field)
  if (!text) return DASH
  return (
    <span className="text-sm text-brand-text-primary truncate block" onClick={(e) => e.stopPropagation()}>
      <Link href={`${href}?open=${encodeURIComponent(text)}`} className={linkClass} title="Open kaart">
        {text}
      </Link>
    </span>
  )
}

function cfLabelPills(item: CrmRecord, name: string): React.ReactNode | null {
  const field = (item.custom_fields || []).find((f: any) =>
    (f?.name || '').toLowerCase() === name.toLowerCase() && f?.type === 'labels'
  )
  if (!field || !Array.isArray(field.value) || !field.value.length) return null
  const options: any[] = optionsFor(field)
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
  const options: any[] = optionsFor(field)
  const opt = options.find((o: any) => o.orderindex === field.value)
  if (!opt) return null
  return pill(opt.label || opt.name, opt.color || '#e2e8f0', opt.color ? '#fff' : '#374151')
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
  /** Waarde voor kolomsortering; ontbreekt deze, dan is de kolom niet sorteerbaar */
  sortValue?: (item: CrmRecord) => string | number | null
}

function cfNumber(item: CrmRecord, name: string): number | null {
  const v = cfValue(item, name)
  if (v === null) return null
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
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
  { key: 'bedrijf',         label: 'Bedrijf',         width: 140, render: (r) => cfRelationLinks(r, 'Bedrijf', 'company'), sortValue: (r) => cfValue(r, 'Bedrijf') },
  { key: 'contact',         label: 'Contactpersoon',   width: 130, render: (r) => cfRelationLinks(r, 'Contactpersoon', 'contact'), sortValue: (r) => cfValue(r, 'Contactpersoon') },
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
  { key: 'prijs',           label: 'Prijs',            width: 108, render: (r) => textCell(cfValue(r, 'Prijs incl. BTW')), sortValue: (r) => cfNumber(r, 'Prijs incl. BTW') },
  { key: 'bron',            label: 'Bron',             width: 110, render: (r) => cfDropdownPill(r, 'Bron') ?? DASH, sortValue: (r) => cfValue(r, 'Bron') },
  {
    key: 'type_kans', label: 'Type kans', width: 120,
    render: (r) => {
      const v = cfValue(r, 'Type kans')
      return v ? pill(v, '#dcfce7', '#166534') : DASH
    },
  },
  { key: 'deadline',        label: 'Beslissing',       width: 96,  render: (r) => textCell(fmtDate(cfValue(r, '(Verwachte) beslissingsdatum') || r.due_date)), sortValue: (r) => cfValue(r, '(Verwachte) beslissingsdatum') || r.due_date || null },
  { key: 'date_created',    label: 'Aangemaakt',       width: 96,  render: (r) => textCell(fmtDate(r.clickup_date_created || r.synced_at)), sortValue: (r) => r.clickup_date_created || r.synced_at || null },
]

const ASSIGNMENT_COLUMNS: Column[] = [
  { key: 'bedrijf',      label: 'Bedrijf',         width: 140, render: (r) => cfRelationLinks(r, 'Bedrijf', 'company'), sortValue: (r) => cfValue(r, 'Bedrijf') },
  { key: 'contact',      label: 'Contactpersoon',   width: 130, render: (r) => cfRelationLinks(r, 'Contactpersoon', 'contact'), sortValue: (r) => cfValue(r, 'Contactpersoon') },
  { key: 'details',      label: 'Details opdracht', width: 160, render: (r) => textCell(cfValue(r, 'Details opdracht') || cfValue(r, 'Details')) },
  { key: 'producten',    label: 'Producten',        width: 120, render: (r) => cfLabelPills(r, 'Producten') ?? DASH },
  { key: 'prijs',        label: 'Prijs',            width: 108, render: (r) => textCell(cfValue(r, 'Prijs incl. BTW')), sortValue: (r) => cfNumber(r, 'Prijs incl. BTW') },
  { key: 'bron',         label: 'Bron',             width: 110, render: (r) => cfDropdownPill(r, 'Bron') ?? DASH, sortValue: (r) => cfValue(r, 'Bron') },
  { key: 'datum_afgerond', label: 'Afgerond',       width: 96,  render: (r) => textCell(fmtDate(cfValue(r, 'Datum afgerond') || r.due_date)), sortValue: (r) => cfValue(r, 'Datum afgerond') || r.due_date || null },
  { key: 'date_created', label: 'Aangemaakt',       width: 96,  render: (r) => textCell(fmtDate(r.clickup_date_created || r.synced_at)), sortValue: (r) => r.clickup_date_created || r.synced_at || null },
]

const INVOICE_COLUMNS: Column[] = [
  { key: 'bedrijf',      label: 'Bedrijf',          width: 160, render: (r) => cfRelationLinks(r, 'Bedrijf', 'company'), sortValue: (r) => cfValue(r, 'Bedrijf') },
  { key: 'prijs',        label: 'Bedrag incl. BTW', width: 140, render: (r) => textCell(cfValue(r, 'Prijs incl. BTW') || cfValue(r, 'Bedrag')), sortValue: (r) => cfNumber(r, 'Prijs incl. BTW') ?? cfNumber(r, 'Bedrag') },
  { key: 'due_date',     label: 'Vervaldatum',      width: 110, render: (r) => textCell(fmtDate(r.due_date)), sortValue: (r) => r.due_date || null },
  { key: 'date_created', label: 'Date created',     width: 110, render: (r) => textCell(fmtDate(r.clickup_date_created || r.synced_at)), sortValue: (r) => r.clickup_date_created || r.synced_at || null },
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
      render: (r) => cfRelationLinks(r, 'Bedrijf', 'company'), sortValue: (r) => cfValue(r, 'Bedrijf') },
    { key: 'bron',        label: 'Bron',               width: 150,
      render: (r) => cfDropdownPill(r, 'Bron') ?? DASH },
    { key: 'email',       label: 'E-mail',             width: 168,
      render: (r) => textCell(cfValue(r, 'E-mail') || cfValue(r, 'Email')), sortValue: (r) => cfValue(r, 'E-mail') || cfValue(r, 'Email') },
    { key: 'gerelateerd', label: 'Gerelateerde kans',  width: 164,
      render: (r) => {
        if (cfValue(r, 'Gerelateerde kans')) return cfRelationLinks(r, 'Gerelateerde kans', 'lead')
        if (cfValue(r, 'Related tasks')) return cfRelationLinks(r, 'Related tasks', 'lead')
        if (cfValue(r, 'Opdracht')) return cfRelationLinks(r, 'Opdracht', 'assignment')
        return DASH
      } },
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
    { key: 'contactpersoon', label: 'Contactpersoon', width: 140, render: (r) => cfRelationLinks(r, 'Contactpersoon', 'contact'), sortValue: (r) => cfValue(r, 'Contactpersoon') },
    { key: 'tags',           label: 'Tags',           width: 200, render: (r) => <InlineTags record={r} /> },
    { key: 'website',        label: 'Website',        width: 156, render: (r) => urlCell(cfValue(r, 'Website')) },
    { key: 'date_updated',   label: 'Bijgewerkt',     width: 100, render: (r) => textCell(fmtDate(r.clickup_date_updated || r.synced_at)), sortValue: (r) => r.clickup_date_updated || r.synced_at || null },
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
            : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wide transition-opacity hover:opacity-80 text-white'
        }
        style={iconOnly ? undefined : { background: statusHex(currentStatus) }}
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
  selected,
  onToggleSelect,
  onToggleGroup,
  onAddTask,
}: {
  items: CrmRecord[]
  allStatuses: string[]
  onStatusChange: (id: string, status: string) => void
  onRowClick: (r: CrmRecord) => void
  entity: EntityType
  klantMap: Map<string, string>
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleGroup: (ids: string[], select: boolean) => void
  onAddTask: (status: string) => void
}) {
  const allColumns = getColumns(entity, klantMap)
  const { order, move } = useColumnOrder(`crm:${entity}`, allColumns.map((c) => c.key))
  const dnd = useColumnDnD(move)
  // Kolommen in de (opgeslagen) volgorde; onbekende keys worden genegeerd.
  const columns = order
    .map((k) => allColumns.find((c) => c.key === k))
    .filter(Boolean) as Column[]

  // Kolombreedtes — standaard uit Column.width, overschreven door localStorage
  const defaultWidths = useMemo(() => {
    const m: Record<string, number> = { __name: 280 }
    for (const c of allColumns) m[c.key] = c.width
    return m
  }, [entity]) // eslint-disable-line react-hooks/exhaustive-deps
  const { widths, setWidth } = useColumnWidths(`crm:${entity}`, defaultWidths)

  // Resize-handle logica: mousedown op de rechterrand van een kolomkop start het slepen.
  const resizeRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null)
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeRef.current) return
      const { key, startX, startWidth } = resizeRef.current
      const newWidth = Math.max(48, startWidth + (e.clientX - startX))
      setWidth(key, newWidth)
    }
    function onMouseUp() { resizeRef.current = null }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [setWidth])

  const startResize = useCallback((key: string, clientX: number, currentWidth: number) => {
    resizeRef.current = { key, startX: clientX, startWidth: currentWidth }
  }, [])

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)

  const groups = useMemo(() => {
    const byStatus: Record<string, CrmRecord[]> = {}
    for (const item of items) {
      const s = item.status || '(geen status)'
      if (!byStatus[s]) byStatus[s] = []
      byStatus[s].push(item)
    }

    const priorityOrder = statusOrderFor(entity)
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

    // Sortering binnen elke groep
    const sortFn = (a: CrmRecord, b: CrmRecord): number => {
      if (!sort) return 0
      const get = (r: CrmRecord): string | number | null => {
        if (sort.key === '__name') return r.name.toLowerCase()
        const col = columns.find((c) => c.key === sort.key)
        return col?.sortValue ? col.sortValue(r) : null
      }
      const va = get(a)
      const vb = get(b)
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir
      return String(va).localeCompare(String(vb), 'nl') * sort.dir
    }

    return ordered.map((s) => ({
      status: s,
      items: sort ? [...byStatus[s]].sort(sortFn) : byStatus[s],
    }))
    // allStatuses verandert wanneer de ClickUp-statusconfig laadt -> herbereken volgorde
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, entity, sort, allStatuses])

  const toggle = (s: string) => setCollapsed((prev) => ({ ...prev, [s]: !prev[s] }))

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 1 }
      if (prev.dir === 1) return { key, dir: -1 }
      return null
    })
  }

  const sortIndicator = (key: string) => {
    if (sort?.key !== key) return null
    return sort.dir === 1 ? <ArrowUp size={10} className="inline ml-0.5" /> : <ArrowDown size={10} className="inline ml-0.5" />
  }

  if (groups.length === 0) {
    return <p className="text-gray-400 text-sm py-10 text-center">Geen records gevonden.</p>
  }

  const colTotalWidth = columns.reduce((acc, c) => acc + (widths[c.key] ?? c.width), 0)
  const nameWidth = widths['__name'] ?? 280
  const minWidth = 36 + 36 + nameWidth + colTotalWidth + 36
  const anySelected = selected.size > 0

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }}>
        {/* Column header row */}
        <div className="flex items-center border-b border-gray-200 bg-gray-50/80">
          <div className="w-9 shrink-0" />
          <div className="w-9 shrink-0" />
          <div className="relative group/col shrink-0" style={{ width: nameWidth }}>
            <button
              onClick={() => toggleSort('__name')}
              className="w-full px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left hover:text-gray-600 transition-colors"
            >
              Naam{sortIndicator('__name')}
            </button>
            <div
              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/40 z-10"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startResize('__name', e.clientX, nameWidth) }}
            />
          </div>
          {columns.map((col) => {
            const dropCls = dnd.isOver(col.key) ? 'border-l-2 border-indigo-500 bg-indigo-50/40' : 'border-l-2 border-transparent'
            const dragCls = dnd.isDragging(col.key) ? 'opacity-40' : ''
            const colW = widths[col.key] ?? col.width
            const inner = (
              <>
                <ColumnGrip />
                {col.label}{col.sortValue ? sortIndicator(col.key) : null}
                {/* Resize handle — mousedown stopt DnD en start breedte-sleep */}
                <div
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/40 z-10"
                  draggable={false}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startResize(col.key, e.clientX, colW) }}
                />
              </>
            )
            return col.sortValue ? (
              <button
                key={col.key}
                {...dnd.headerProps(col.key)}
                onClick={() => toggleSort(col.key)}
                className={`relative group/col inline-flex items-center gap-1 px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0 text-left hover:text-gray-600 hover:bg-gray-100/70 transition-colors cursor-grab active:cursor-grabbing ${dropCls} ${dragCls}`}
                style={{ width: colW }}
                title="Sleep om te verplaatsen · klik om te sorteren"
              >
                {inner}
              </button>
            ) : (
              <div
                key={col.key}
                {...dnd.headerProps(col.key)}
                className={`relative group/col inline-flex items-center gap-1 px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0 hover:text-gray-600 hover:bg-gray-100/70 transition-colors cursor-grab active:cursor-grabbing ${dropCls} ${dragCls}`}
                style={{ width: colW }}
                title="Sleep om te verplaatsen"
              >
                {inner}
              </div>
            )
          })}
          <div className="w-9 shrink-0" />
        </div>

        {/* Status groups */}
        {groups.map(({ status, items: groupItems }) => {
          const isCollapsed = collapsed[status]
          const groupIds = groupItems.map((i) => i.id)
          const allGroupSelected = groupIds.length > 0 && groupIds.every((id) => selected.has(id))
          return (
            <div key={status}>
              {/* Group header */}
              <div className="flex items-center gap-2 px-2 py-1.5 bg-white border-b border-gray-100 group/header">
                <button
                  onClick={() => toggle(status)}
                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0 transition-colors rounded hover:bg-gray-100"
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <input
                  type="checkbox"
                  checked={allGroupSelected}
                  onChange={() => onToggleGroup(groupIds, !allGroupSelected)}
                  className={`accent-indigo-500 transition-opacity cursor-pointer ${anySelected || allGroupSelected ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-100'}`}
                  title="Selecteer hele groep"
                />
                <StatusIcon status={status} size={16} />
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider text-white"
                  style={{ background: statusHex(status) }}
                >
                  {status}
                </span>
                <span className="text-xs text-gray-400 font-medium">{groupItems.length}</span>
              </div>

              {/* Rows */}
              {!isCollapsed && groupItems.map((item) => {
                const isSelected = selected.has(item.id)
                return (
                <div
                  key={item.id}
                  className={`flex items-center border-b border-gray-100 transition-colors cursor-pointer group ${isSelected ? 'bg-indigo-50/60' : 'hover:bg-blue-50/25'}`}
                  onClick={() => onRowClick(item)}
                >
                  {/* Selectie-checkbox */}
                  <div
                    className="w-9 shrink-0 flex items-center justify-center py-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(item.id)}
                      className={`accent-indigo-500 transition-opacity cursor-pointer ${anySelected || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    />
                  </div>

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
                  <div className="shrink-0 px-3 py-1 overflow-hidden" style={{ width: nameWidth }}>
                    <span className="text-sm text-gray-900 group-hover:text-indigo-700 truncate block transition-colors">
                      {item.name}
                    </span>
                  </div>

                  {/* Entity columns */}
                  {columns.map((col) => (
                    <div
                      key={col.key}
                      className="px-3 py-1 shrink-0 overflow-hidden"
                      style={{ width: widths[col.key] ?? col.width }}
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
                )
              })}

              {!isCollapsed && (
                <button
                  onClick={() => onAddTask(status)}
                  className="w-full flex items-center border-b border-gray-100 px-2 py-1.5 text-xs text-gray-400 hover:text-indigo-600 hover:bg-gray-50/60 transition-colors"
                >
                  <div className="w-9 shrink-0" />
                  <div className="w-9 shrink-0" />
                  <div className="flex items-center gap-1.5 px-3">
                    <Plus size={12} />
                    Nieuw record in &quot;{status}&quot;
                  </div>
                </button>
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
  entity,
  allStatuses,
  onStatusChange,
  onCardClick,
}: {
  items: CrmRecord[]
  entity: EntityType
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
    const present = Object.keys(groups)
    // Kolommen in exacte ClickUp-volgorde, inclusief lege statussen.
    return statusOrderFor(entity, present).map((name): [string, CrmRecord[]] => {
      const actual = present.find((p) => p.toLowerCase() === name.toLowerCase())
      return actual ? [actual, groups[actual]] : [name, []]
    })
    // allStatuses verandert wanneer de ClickUp-statusconfig laadt -> herbereken kolommen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, entity, allStatuses])

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

// ── Editable fields panel ─────────────────────────────────────────

const ENTITY_HREF: Record<string, string> = {
  company: '/crm/bedrijven',
  contact: '/crm/contacten',
  lead: '/crm/leads',
  assignment: '/crm/opdrachten',
  clickup_invoice: '/crm/facturen',
  daley_list: '/crm/daley-list',
}

// Relatie- en systeemvelden worden elders getoond, niet als los veld
const HIDDEN_FIELD_TYPES = new Set(['tasks', 'list_relationship', 'attachment', 'formula', 'rollup', 'automatic_progress'])

// Volgorde van velden per entity (rest komt er alfabetisch achteraan)
const FIELD_ORDER: Partial<Record<EntityType, string[]>> = {
  lead: [
    'Prijs incl. BTW', 'Type kans', 'Producten', 'Bron', 'Details opdracht',
    'Op initiatief van', 'Reden (gewonnen/verloren)', 'Beroep', '(Verwachte) beslissingsdatum',
  ],
  assignment: ['Prijs incl. BTW', 'Producten', 'Details opdracht', 'Bron', 'Datum afgerond'],
  company: ['Klantnummer', 'Website', 'Beroep', 'Bron'],
  contact: ['E-mail', 'Telefoonnummer', 'Beroep', 'Website', 'Bron'],
  clickup_invoice: ['Prijs incl. BTW', 'Bedrag'],
}

function msToDateInput(value: any): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return ''
  const d = new Date(n)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

// Kleurkeuzes voor nieuwe opties (zelfde sfeer als de bestaande ClickUp-kleuren).
const OPTIE_KLEUREN = ['#9a9a9a', '#3e63dd', '#12a594', '#e93d82', '#ffc53d', '#2ecd6f', '#e5484d', '#8b5cf6', '#f76808', '#96c7f2']

/** "+ optie"-knop bij een keuzeveld; voegt centraal een nieuwe optie toe. */
function AddFieldOptionButton({ field, entityType }: { field: any; entityType?: EntityType }) {
  const { reload } = useFieldOptions()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(OPTIE_KLEUREN[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    const naam = label.trim()
    if (!naam) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/crm/field-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_id: field.id,
          field_name: field.name,
          field_type: field.type,
          entity_type: entityType,
          label: naam,
          color,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Toevoegen mislukt')
      await reload()
      setLabel('')
      setColor(OPTIE_KLEUREN[0])
      setOpen(false)
    } catch (e: any) {
      setError(e.message || 'Toevoegen mislukt')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-0.5 rounded font-medium border border-dashed border-gray-300 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors inline-flex items-center gap-1"
      >
        <Plus size={11} /> optie
      </button>
    )
  }

  return (
    <div className="w-full mt-1 p-2 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') setOpen(false) }}
          placeholder="Nieuwe optie..."
          className="flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-indigo-300"
        />
        <button type="button" onClick={save} disabled={saving || !label.trim()} className="text-xs px-2 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
          {saving ? '...' : 'Toevoegen'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {OPTIE_KLEUREN.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`w-4 h-4 rounded-full border-2 ${color === c ? 'border-gray-800' : 'border-transparent'}`}
            style={{ background: c }}
            aria-label={`kleur ${c}`}
          />
        ))}
      </div>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  )
}

/** Eén bewerkbaar custom field. `edited` is de nog-niet-opgeslagen waarde (ClickUp write-formaat). */
function FieldEditor({
  field,
  edited,
  onEdit,
  entityType,
}: {
  field: any
  edited: { value: any } | undefined
  onEdit: (fieldId: string, value: any) => void
  entityType?: EntityType
}) {
  const type = field?.type
  const options: any[] = optionsFor(field)
  const inputCls = 'w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent'

  if (type === 'drop_down') {
    // Huidige waarde is een orderindex; schrijven gebeurt met de option-id
    const currentOptId = edited !== undefined
      ? (edited.value ?? '')
      : (options.find((o) => o.orderindex === field.value)?.id ?? '')
    return (
      <div className="space-y-1.5">
        <select
          className={inputCls}
          value={currentOptId}
          onChange={(e) => onEdit(field.id, e.target.value || null)}
        >
          <option value="">–</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label || o.name}</option>
          ))}
        </select>
        <AddFieldOptionButton field={field} entityType={entityType} />
      </div>
    )
  }

  if (type === 'labels') {
    const currentIds: string[] = edited !== undefined
      ? (Array.isArray(edited.value) ? edited.value : [])
      : (Array.isArray(field.value) ? field.value : [])
    const toggle = (optId: string) => {
      const next = currentIds.includes(optId)
        ? currentIds.filter((id) => id !== optId)
        : [...currentIds, optId]
      onEdit(field.id, next)
    }
    return (
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const active = currentIds.includes(o.id)
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              className={`text-xs px-2 py-0.5 rounded font-medium border transition-colors ${active ? 'text-white border-transparent' : 'text-gray-500 border-gray-200 bg-white hover:border-gray-300'}`}
              style={active ? { background: o.color || '#8b5cf6' } : undefined}
            >
              {o.label || o.name}
            </button>
          )
        })}
        <AddFieldOptionButton field={field} entityType={entityType} />
      </div>
    )
  }

  if (type === 'date') {
    const current = edited !== undefined ? msToDateInput(edited.value) : msToDateInput(field.value)
    return (
      <input
        type="date"
        className={inputCls}
        value={current}
        onChange={(e) => onEdit(field.id, e.target.value ? new Date(`${e.target.value}T12:00:00`).getTime() : null)}
      />
    )
  }

  if (type === 'checkbox') {
    const current = edited !== undefined
      ? Boolean(edited.value)
      : field.value === true || field.value === 'true'
    return (
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={current} onChange={(e) => onEdit(field.id, e.target.checked)} />
        {current ? 'Ja' : 'Nee'}
      </label>
    )
  }

  if (type === 'number' || type === 'currency') {
    const current = edited !== undefined ? (edited.value ?? '') : (field.value ?? '')
    return (
      <input
        type="number"
        step="any"
        className={inputCls}
        value={current}
        placeholder="–"
        onChange={(e) => onEdit(field.id, e.target.value === '' ? null : Number(e.target.value))}
      />
    )
  }

  // text, short_text, url, email, phone en onbekende typen: tekstinvoer
  const current = edited !== undefined ? (edited.value ?? '') : (typeof field.value === 'string' ? field.value : (field.value ?? ''))
  const isLong = type === 'text'
  if (isLong) {
    return (
      <textarea
        className={`${inputCls} resize-none leading-relaxed`}
        rows={3}
        value={current}
        placeholder="–"
        onChange={(e) => onEdit(field.id, e.target.value)}
      />
    )
  }
  return (
    <input
      type="text"
      className={inputCls}
      value={current}
      placeholder="–"
      onChange={(e) => onEdit(field.id, e.target.value)}
    />
  )
}

function EditableFieldsPanel({
  src,
  entity,
  edits,
  onEdit,
}: {
  src: CrmRecord
  entity: EntityType
  edits: Record<string, { value: any }>
  onEdit: (fieldId: string, value: any) => void
}) {
  const fields = useMemo(() => {
    const all = (src.custom_fields || []).filter(
      (f: any) => f?.id && f?.name && !HIDDEN_FIELD_TYPES.has(f?.type)
    )
    // Dedupliceer op naam (ClickUp heeft soms dubbele velden); hou het veld met waarde
    const byName = new Map<string, any>()
    for (const f of all) {
      const key = String(f.name).toLowerCase()
      const existing = byName.get(key)
      const hasValue = f.value !== null && f.value !== undefined && f.value !== '' && !(Array.isArray(f.value) && !f.value.length)
      if (!existing) byName.set(key, f)
      else if (hasValue) byName.set(key, f)
    }
    const deduped = Array.from(byName.values())
    const order = (FIELD_ORDER[entity] || []).map((n) => n.toLowerCase())
    return deduped.sort((a, b) => {
      const ia = order.indexOf(String(a.name).toLowerCase())
      const ib = order.indexOf(String(b.name).toLowerCase())
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
      return String(a.name).localeCompare(String(b.name))
    })
  }, [src, entity])

  if (fields.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Velden</p>
      {fields.map((f: any) => (
        <div key={f.id}>
          <p className="text-[11px] text-gray-400 mb-1">{f.name}</p>
          <FieldEditor field={f} edited={edits[f.id]} onEdit={onEdit} entityType={entity} />
        </div>
      ))}
    </div>
  )
}

// ── Relations panel ────────────────────────────────────────────────

interface RelationEdge { recordId: string; fieldId: string; taskId: string }
interface RelatedItem { id: string; naam: string; status: string | null; entity_type: string; edges?: RelationEdge[] }

interface RelationsData {
  bedrijf: RelatedItem | null
  contactpersoon: RelatedItem | null
  bedrijven: RelatedItem[]
  contacten: RelatedItem[]
  leads: RelatedItem[]
  opdrachten: RelatedItem[]
  facturen: RelatedItem[]
}

function RelationLink({ item, onUnlink }: { item: RelatedItem; onUnlink: (item: RelatedItem) => Promise<void> }) {
  const [removing, setRemoving] = useState(false)
  const canUnlink = (item.edges?.length ?? 0) > 0
  return (
    <span className="group/rel inline-flex items-center gap-1 max-w-full">
      <Link
        href={`${ENTITY_HREF[item.entity_type] || '/crm/leads'}?open=${encodeURIComponent(item.naam)}`}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline min-w-0"
        title={item.status || undefined}
      >
        <StatusIcon status={item.status} size={10} />
        <span className="truncate">{item.naam}</span>
      </Link>
      {canUnlink && (
        <button
          onClick={async (e) => {
            e.preventDefault()
            if (removing) return
            setRemoving(true)
            try { await onUnlink(item) } finally { setRemoving(false) }
          }}
          title="Ontkoppelen"
          className="shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover/rel:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-40"
          disabled={removing}
        >
          <X size={11} />
        </button>
      )}
    </span>
  )
}

// ── Koppelen: zoek-en-kies een record om aan dit record te koppelen ──

const LINKABLE_KINDS: Array<{ entity: EntityType; label: string }> = [
  { entity: 'contact', label: 'Contact' },
  { entity: 'lead', label: 'Lead' },
  { entity: 'assignment', label: 'Opdracht' },
  { entity: 'clickup_invoice', label: 'Factuur' },
  { entity: 'company', label: 'Bedrijf' },
]

// Trefwoorden om het juiste relatieveld bij een doel-entiteit te vinden.
const RELATIE_VELD_TREFWOORDEN: Record<string, string[]> = {
  company: ['bedrijf'],
  contact: ['contact'],
  lead: ['lead', 'kans'],
  assignment: ['opdracht'],
  clickup_invoice: ['factuur', 'factur'],
  daley_list: [],
}

/** Zoekt op een veldenlijst het relatieveld (tasks/list_relationship) dat naar `targetEntity` wijst. */
function relatieVeldVoor(customFields: any[] | undefined, targetEntity: string): any | null {
  const kws = RELATIE_VELD_TREFWOORDEN[targetEntity] || []
  const rel = (customFields || []).filter((f) => f?.type === 'tasks' || f?.type === 'list_relationship')
  return rel.find((f) => kws.some((k) => (f?.name || '').toLowerCase().includes(k))) || null
}

function RecordLinker({ record, onLinked }: { record: CrmRecord; onLinked: () => void }) {
  const [kind, setKind] = useState<EntityType>(() => {
    const rel = (record.custom_fields || []).find((f: any) => f?.type === 'tasks' || f?.type === 'list_relationship')
    const naam = (rel?.name || '').toLowerCase()
    if (naam.includes('opdracht')) return 'assignment'
    if (naam.includes('lead') || naam.includes('kans')) return 'lead'
    return 'contact'
  })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CrmRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    const t = setTimeout(() => {
      const q = query.trim()
      fetch(`/api/integrations/clickup/records?entity=${kind}&limit=20${q ? `&search=${encodeURIComponent(q)}` : ''}`)
        .then((r) => r.json())
        .then((d) => { if (active) { setResults(Array.isArray(d.items) ? d.items : []); setLoading(false) } })
        .catch(() => { if (active) { setResults([]); setLoading(false) } })
    }, 220)
    return () => { active = false; clearTimeout(t) }
  }, [kind, query])

  const link = async (target: CrmRecord) => {
    setError('')
    setLinkingId(target.id)
    try {
      // Schrijf bij voorkeur op het huidige record; val anders terug op het doelrecord.
      let patchId = record.id
      let field = relatieVeldVoor(record.custom_fields, target.entity_type)
      let addTaskId = target.clickup_task_id
      if (!field) {
        field = relatieVeldVoor(target.custom_fields, record.entity_type)
        patchId = target.id
        addTaskId = record.clickup_task_id
      }
      if (!field) throw new Error('Geen koppelveld beschikbaar voor dit type')
      const res = await fetch(`/api/integrations/clickup/records/${patchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_fields: [{ id: field.id, value: { add: [addTaskId], rem: [] } }] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Koppelen mislukt')
      onLinked()
    } catch (e: any) {
      setError(e.message || 'Koppelen mislukt')
    } finally {
      setLinkingId(null)
    }
  }

  return (
    <div className="mt-2 mb-3 p-3 rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap gap-1 mb-2">
        {LINKABLE_KINDS.map((k) => (
          <button
            key={k.entity}
            onClick={() => setKind(k.entity)}
            className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${kind === k.entity ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="relative mb-2">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek record..."
          className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:border-indigo-300"
        />
      </div>
      {error && <p className="text-[11px] text-red-500 mb-1">{error}</p>}
      <div className="max-h-48 overflow-y-auto -mx-1">
        {loading ? (
          <p className="text-xs text-gray-400 px-1 py-1">Laden...</p>
        ) : results.filter((r) => r.id !== record.id).length === 0 ? (
          <p className="text-xs text-gray-400 px-1 py-1">Geen records gevonden</p>
        ) : (
          results
            .filter((r) => r.id !== record.id)
            .map((r) => (
              <button
                key={r.id}
                onClick={() => link(r)}
                disabled={linkingId !== null}
                className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-left text-xs hover:bg-indigo-50/60 disabled:opacity-50"
              >
                <StatusIcon status={r.status || null} size={10} />
                <span className="truncate flex-1">{r.name}</span>
                {linkingId === r.id
                  ? <span className="text-[10px] text-gray-400">koppelen...</span>
                  : <Plus size={12} className="text-indigo-400 shrink-0" />}
              </button>
            ))
        )}
      </div>
    </div>
  )
}

function RelationsPanel({ record }: { record: CrmRecord }) {
  const [data, setData] = useState<RelationsData | null>(null)
  const [state, setState] = useState<'loading' | 'error' | 'done'>('loading')
  const [picking, setPicking] = useState(false)

  const load = () => {
    setState('loading')
    fetch(`/api/crm/relations?id=${record.id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Relaties laden mislukt')
        return r.json()
      })
      .then((d) => { setData(d); setState('done') })
      .catch(() => setState('error'))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [record.id])

  const unlink = async (item: RelatedItem) => {
    const edges = item.edges || []
    if (!edges.length) return
    // Een koppeling kan op dit record of op het andere record staan; verwijder elke edge.
    await Promise.all(
      edges.map((ed) =>
        fetch(`/api/integrations/clickup/records/${ed.recordId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom_fields: [{ id: ed.fieldId, value: { add: [], rem: [ed.taskId] } }] }),
        })
      )
    )
    load()
  }

  const groups: Array<{ label: string; icon: React.ReactNode; items: RelatedItem[] }> = data
    ? [
        { label: 'Bedrijf', icon: <Building2 size={10} className="opacity-60" />, items: data.bedrijven },
        { label: 'Contacten', icon: <User size={10} className="opacity-60" />, items: data.contacten },
        { label: 'Leads', icon: <BadgeDollarSign size={10} className="opacity-60" />, items: data.leads },
        { label: 'Opdrachten', icon: <BriefcaseBusiness size={10} className="opacity-60" />, items: data.opdrachten },
        { label: 'Facturen', icon: <BadgeDollarSign size={10} className="opacity-60" />, items: data.facturen },
      ].filter((g) => g.items?.length)
    : []

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Relaties</p>
        <button
          onClick={() => setPicking((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
        >
          {picking ? <X size={12} /> : <Plus size={12} />} {picking ? 'Sluiten' : 'Koppel record'}
        </button>
      </div>

      {picking && <RecordLinker record={record} onLinked={load} />}

      {state === 'loading' && <p className="text-xs text-gray-400">Laden...</p>}
      {state === 'error' && (
        <div>
          <p className="text-xs text-red-500 mb-1">Relaties laden mislukt.</p>
          <button onClick={load} className="text-xs text-indigo-600 hover:underline">Opnieuw proberen</button>
        </div>
      )}
      {state === 'done' && groups.length === 0 && !picking && (
        <p className="text-xs text-gray-400 italic">Geen gekoppelde records</p>
      )}
      {state === 'done' && groups.length > 0 && (
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {groups.map((g) => (
            <div key={g.label} className="min-w-[140px]">
              <p className="text-[11px] text-gray-400 mb-1 flex items-center gap-1">{g.icon} {g.label} ({g.items.length})</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {g.items.map((item) => <RelationLink key={item.id} item={item} onUnlink={unlink} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Activiteitenfeed (rechterkolom detailkaart) ─────────────────────

interface Activiteit {
  id: string
  soort: string
  omschrijving: string
  oude_waarde: string | null
  nieuwe_waarde: string | null
  created_at: string
}

function activiteitIcoon(soort: string) {
  if (soort === 'aangemaakt') return <Plus size={11} className="text-emerald-500" />
  if (soort === 'status') return <RefreshCw size={11} className="text-indigo-500" />
  if (soort === 'promotie') return <ArrowRight size={11} className="text-emerald-500" />
  if (soort === 'notitie') return <FileText size={11} className="text-amber-500" />
  if (soort === 'deadline') return <CalendarDays size={11} className="text-rose-400" />
  return <PencilLine size={11} className="text-gray-400" />
}

function fmtActiviteitTijd(iso: string): string {
  const d = new Date(iso)
  const nu = new Date()
  const minuten = Math.floor((nu.getTime() - d.getTime()) / 60000)
  if (minuten < 1) return 'zojuist'
  if (minuten < 60) return `${minuten} min geleden`
  const uren = Math.floor(minuten / 60)
  if (uren < 24 && d.toDateString() === nu.toDateString()) return `${uren} uur geleden`
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: d.getFullYear() !== nu.getFullYear() ? '2-digit' : undefined })
    + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

function ActivityFeed({ record }: { record: CrmRecord }) {
  const [items, setItems] = useState<Activiteit[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'done'>('loading')

  const load = useCallback(() => {
    setState('loading')
    fetch(`/api/crm/activiteiten?recordId=${record.id}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => { setItems(d); setState('done') })
      .catch(() => setState('error'))
  }, [record.id])

  useEffect(load, [load])

  // Bestaat er geen log-entry voor het aanmaken (records van voor de feed),
  // toon dan de aanmaakdatum als synthetisch eerste item.
  const heeftAanmaak = items.some((i) => i.soort === 'aangemaakt')
  const aanmaakDatum = record.clickup_date_created || record.synced_at

  return (
    <div className="h-full flex flex-col">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 shrink-0">Activiteit</p>
      {state === 'loading' ? (
        <p className="text-xs text-gray-400">Laden...</p>
      ) : state === 'error' ? (
        <div>
          <p className="text-xs text-red-500 mb-1">Activiteit laden mislukt.</p>
          <button onClick={load} className="text-xs text-indigo-600 hover:underline">Opnieuw proberen</button>
        </div>
      ) : (
        <div className="space-y-3 overflow-y-auto pr-1">
          {items.length === 0 && !aanmaakDatum && (
            <p className="text-xs text-gray-400 italic">Nog geen activiteit</p>
          )}
          {items.map((a) => (
            <div key={a.id} className="flex gap-2">
              <div className="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                {activiteitIcoon(a.soort)}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-700 leading-snug">
                  <span className="font-medium">{a.omschrijving}</span>
                  {(a.oude_waarde || a.nieuwe_waarde) && (
                    <span className="text-gray-500">
                      {': '}
                      {a.oude_waarde && <span className="line-through opacity-60">{a.oude_waarde}</span>}
                      {a.oude_waarde && a.nieuwe_waarde && ' '}
                      {a.nieuwe_waarde && <span className="text-gray-700">{a.nieuwe_waarde}</span>}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-gray-400">{fmtActiviteitTijd(a.created_at)}</p>
              </div>
            </div>
          ))}
          {!heeftAanmaak && aanmaakDatum && (
            <div className="flex gap-2">
              <div className="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                {activiteitIcoon('aangemaakt')}
              </div>
              <div>
                <p className="text-xs text-gray-700 font-medium leading-snug">Record aangemaakt</p>
                <p className="text-[11px] text-gray-400">{fmtActiviteitTijd(aanmaakDatum)}</p>
              </div>
            </div>
          )}
        </div>
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
  const [fieldEdits, setFieldEdits] = useState<Record<string, { value: any }>>({})
  const origDueDate = record.due_date ? new Date(record.due_date).toISOString().slice(0, 10) : ''
  const [dueDate, setDueDate] = useState(origDueDate)
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
  const description: string | null = raw.description || null
  const assignees = full?.assignees || record.assignees || []
  const tags = full?.tags || record.tags || []
  const url = full?.url || record.url

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const customFields = Object.entries(fieldEdits).map(([id, v]) => ({ id, value: v.value }))
      const [res] = await Promise.all([
        fetch(`/api/integrations/clickup/records/${record.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            status: currentStatus || undefined,
            notes,
            due_date: dueDate && dueDate !== origDueDate ? `${dueDate}T12:00:00Z` : undefined,
            custom_fields: customFields.length ? customFields : undefined,
          }),
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

        {/* Relaties: prominent bovenaan, direct onder de header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/40 shrink-0">
          <RelationsPanel record={record} />
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

            {/* Velden + planning naast elkaar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
              <EditableFieldsPanel
                src={full ?? record}
                entity={record.entity_type}
                edits={fieldEdits}
                onEdit={(fieldId, value) => setFieldEdits((prev) => ({ ...prev, [fieldId]: { value } }))}
              />
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] text-gray-400 mb-1">Deadline</p>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
                  />
                </div>

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
              </div>
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

            {/* Eigen tags (Notion-stijl, alleen bij bedrijven) */}
            {record.entity_type === 'company' && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Tags</p>
                <InlineTags record={full || record} variant="block" />
              </div>
            )}

            {/* ClickUp-tags (alleen-lezen) */}
            {tags.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">ClickUp-tags</p>
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

          {/* Right sidebar: activiteitenfeed */}
          <div className="w-64 shrink-0 border-l border-gray-100 overflow-y-auto px-5 py-5 bg-gray-50/40">
            <ActivityFeed record={record} />
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
  statusOptions,
  initialStatus,
  onClose,
  onCreated,
}: {
  entity: EntityType
  statusOptions: string[]
  initialStatus?: string
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [status, setStatus] = useState(initialStatus || '')
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
            {statusOptions.length > 0 ? (
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">(standaard)</option>
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input className="input" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="bijv. nieuwe kans" />
            )}
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

// ── Status filter dropdown ──────────────────────────────────────────

function StatusFilterDropdown({
  statuses,
  active,
  onChange,
}: {
  statuses: string[]
  active: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (s: string) => {
    const next = new Set(active)
    if (next.has(s)) next.delete(s)
    else next.add(s)
    onChange(next)
  }

  const hideClosedPreset = () => {
    const next = new Set(statuses.filter((s) => statusGroup(s) !== 'Closed'))
    onChange(next)
    setOpen(false)
  }

  const isFiltering = active.size > 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`btn-secondary text-sm ${isFiltering ? '!border-brand-lavender !text-brand-lavender' : ''}`}
      >
        <FilterIcon size={13} /> Status{isFiltering ? ` (${active.size})` : ''}
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white rounded-lg border border-gray-200 shadow-xl w-64">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <button onClick={() => { onChange(new Set()); setOpen(false) }} className="text-xs text-indigo-600 hover:underline">
              Alles tonen
            </button>
            <button onClick={hideClosedPreset} className="text-xs text-indigo-600 hover:underline">
              Verberg gesloten
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {groupStatuses(statuses).map(({ label, items: groupItems }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold text-gray-400 px-3 pt-2 pb-0.5 uppercase tracking-wider">{label}</p>
                {groupItems.map((s) => (
                  <label key={s} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!isFiltering || active.has(s)}
                      onChange={() => {
                        // Bij "alles" toont een eerste klik alleen die status niet meer
                        if (!isFiltering) onChange(new Set(statuses.filter((x) => x !== s)))
                        else toggle(s)
                      }}
                      className="accent-indigo-500"
                    />
                    <StatusIcon status={s} size={12} />
                    <span className="text-xs text-gray-700 uppercase tracking-wide font-medium">{s}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────

export default function ClickUpCrmRecordsPage({ entity }: { entity: EntityType }) {
  const searchParams = useSearchParams()
  const openParam = searchParams.get('open') // naam van het record om direct te openen

  const [items, setItems] = useState<CrmRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [detailRecord, setDetailRecord] = useState<CrmRecord | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createStatus, setCreateStatus] = useState<string | undefined>(undefined)
  const [klantMap, setKlantMap] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const autoOpenedRef = useRef(false)

  // ── Notion-stijl tags (eigen tagging in de Dash) ───────────────────
  const [tagCatalog, setTagCatalog] = useState<DashTag[]>([])

  useEffect(() => {
    fetch('/api/crm/tags')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setTagCatalog(data) })
      .catch(() => {})
  }, [])

  // Echte ClickUp-statusconfig laden (volgorde + kleuren) zodat de boards exact
  // het ClickUp-bord nabouwen. Statische maps blijven fallback.
  const [statusCfgVersion, setStatusCfgVersion] = useState(0)
  useEffect(() => {
    let active = true
    fetch('/api/crm/statuses')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.byEntity) { applyClickUpStatusConfig(d.byEntity); setStatusCfgVersion((v) => v + 1) }
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const createTag = useCallback(async (naam: string, kleur?: string): Promise<DashTag | null> => {
    // Geen kleur opgegeven? Kies er automatisch een uit het palet (rouleert).
    const autoKleur = kleur ?? DASH_TAG_KLEURNAMEN[tagCatalog.length % DASH_TAG_KLEURNAMEN.length]
    try {
      const res = await fetch('/api/crm/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam, kleur: autoKleur }),
      })
      if (!res.ok) return null
      const tag: DashTag = await res.json()
      setTagCatalog((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]))
      return tag
    } catch { return null }
  }, [tagCatalog.length])

  const setRecordTags = useCallback((recordId: string, tagIds: string[]) => {
    setItems((prev) => prev.map((it) => (it.id === recordId ? { ...it, dash_tags: tagIds } : it)))
    fetch(`/api/integrations/clickup/records/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dash_tags: tagIds }),
    }).catch(() => {})
  }, [])

  const updateTag = useCallback((id: string, patch: { naam?: string; kleur?: string }) => {
    setTagCatalog((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    fetch(`/api/crm/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {})
  }, [])

  const deleteTag = useCallback((id: string) => {
    setTagCatalog((prev) => prev.filter((t) => t.id !== id))
    setItems((prev) => prev.map((it) =>
      it.dash_tags?.includes(id) ? { ...it, dash_tags: it.dash_tags.filter((x) => x !== id) } : it))
    fetch(`/api/crm/tags/${id}`, { method: 'DELETE' }).catch(() => {})
  }, [])

  const allStatuses = useMemo(() => {
    // Echte ClickUp-volgorde (incl. lege statussen) plus wat in de data voorkomt
    const present = items.map((i) => i.status).filter(Boolean) as string[]
    return statusOrderFor(entity, present)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, entity, statusCfgVersion])

  const handleStatusChange = (id: string, status: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)))
  }

  const visibleItems = useMemo(() => {
    let result = items
    if (statusFilter.size > 0) {
      result = result.filter((item) => statusFilter.has(item.status || ''))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((item) =>
        item.name.toLowerCase().includes(q) ||
        (item.status || '').toLowerCase().includes(q) ||
        (item.custom_fields || []).some((f: any) => {
          const v = normalizeCustomFieldValue(f)
          return v && (`${f?.name} ${v}`).toLowerCase().includes(q)
        })
      )
    }
    return result
  }, [items, search, statusFilter])

  // ── Selectie & bulk-acties ─────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroup = (ids: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (select) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const bulkSetStatus = async (status: string) => {
    if (!status || selected.size === 0) return
    setBulkBusy(true)
    setMessage('')
    const ids = Array.from(selected)
    for (const id of ids) handleStatusChange(id, status)
    try {
      const results = await Promise.allSettled(ids.map((id) =>
        fetch(`/api/integrations/clickup/records/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }).then((r) => { if (!r.ok) throw new Error() })
      ))
      const failed = results.filter((r) => r.status === 'rejected').length
      setMessage(failed
        ? `Status gewijzigd voor ${ids.length - failed} records, ${failed} mislukt`
        : `Status gewijzigd voor ${ids.length} records`)
      setSelected(new Set())
      await load()
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`${selected.size} records verwijderen? Dit verwijdert ze ook in ClickUp.`)) return
    setBulkBusy(true)
    setMessage('')
    const ids = Array.from(selected)
    try {
      const results = await Promise.allSettled(ids.map((id) =>
        fetch(`/api/integrations/clickup/records/${id}`, { method: 'DELETE' })
          .then((r) => { if (!r.ok) throw new Error() })
      ))
      const failed = results.filter((r) => r.status === 'rejected').length
      setMessage(failed
        ? `${ids.length - failed} records verwijderd, ${failed} mislukt`
        : `${ids.length} records verwijderd`)
      setSelected(new Set())
      await load()
    } finally {
      setBulkBusy(false)
    }
  }

  const load = async () => {
    setLoading(true)
    setMessage('')
    setLoadError(false)
    try {
      const res = await fetch(`/api/integrations/clickup/records?entity=${entity}&limit=500`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kon records niet laden')
      setItems(Array.isArray(json.items) ? json.items : [])
      setSelected(new Set())
    } catch (e: any) {
      setMessage(e.message || 'Kon records niet laden')
      setLoadError(true)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity])

  // Nieuwe ?open=naam (bijv. klik op relatielink) mag opnieuw auto-openen
  useEffect(() => { autoOpenedRef.current = false }, [openParam])

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
    <FieldOptionsProvider>
    <DashTagsProvider value={{ catalog: tagCatalog, createTag, setRecordTags, updateTag, deleteTag }}>
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">{titleFor(entity)}</h1>
          <p className="text-sm text-brand-text-secondary mt-0.5">{items.length} records</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="btn-secondary text-sm" disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Ververs
          </button>
          <button onClick={() => { setCreateStatus(undefined); setShowCreate(true) }} className="btn-primary text-sm">
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
        <StatusFilterDropdown
          statuses={allStatuses}
          active={statusFilter}
          onChange={setStatusFilter}
        />
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
        {message && <p className={`text-xs ${loadError ? 'text-red-500' : 'text-brand-text-secondary'}`}>{message}</p>}
      </div>

      {/* Bulk-actiebalk */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-brand-text-primary text-white rounded-brand px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium">{selected.size} geselecteerd</span>
          <select
            className="text-sm text-gray-800 rounded-lg px-2 py-1.5 bg-white border-0 focus:outline-none"
            value=""
            disabled={bulkBusy}
            onChange={(e) => { if (e.target.value) bulkSetStatus(e.target.value) }}
          >
            <option value="">Status wijzigen…</option>
            {allStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={bulkDelete}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1.5 text-sm text-red-300 hover:text-red-200 disabled:opacity-50"
          >
            <Trash2 size={13} /> Verwijderen
          </button>
          <button
            onClick={() => setSelected(new Set())}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white ml-auto disabled:opacity-50"
          >
            <X size={13} /> Selectie wissen
          </button>
          {bulkBusy && <RefreshCw size={13} className="animate-spin" />}
        </div>
      )}

      {/* Content */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-brand-text-secondary text-sm">
            <RefreshCw size={16} className="animate-spin inline mr-2" /> Laden…
          </div>
        ) : loadError ? (
          <div className="text-center py-16">
            <p className="text-sm text-red-500 mb-3">Records laden mislukt.</p>
            <button onClick={load} className="btn-secondary text-sm">
              <RefreshCw size={13} /> Opnieuw proberen
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-brand-text-secondary mb-3">Nog geen records.</p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => { setCreateStatus(undefined); setShowCreate(true) }} className="btn-primary text-sm">
                <Plus size={13} /> Nieuw record
              </button>
            </div>
          </div>
        ) : viewMode === 'list' ? (
          <GroupedListView
            items={visibleItems}
            allStatuses={allStatuses}
            onStatusChange={handleStatusChange}
            onRowClick={setDetailRecord}
            entity={entity}
            klantMap={klantMap}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleGroup={toggleGroup}
            onAddTask={(status) => { setCreateStatus(status); setShowCreate(true) }}
          />
        ) : (
          <div className="p-5">
            <BoardView
              items={visibleItems}
              entity={entity}
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
          statusOptions={allStatuses}
          initialStatus={createStatus}
          onClose={() => { setShowCreate(false); setCreateStatus(undefined) }}
          onCreated={load}
        />
      )}
    </div>
    </DashTagsProvider>
    </FieldOptionsProvider>
  )
}
