'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ChevronDown, ChevronRight, Check, ExternalLink,
  RefreshCw, Search, Plus, X, Save, Trash2, LayoutList, Columns3, ArrowRight,
  Building2, User, BadgeDollarSign, BriefcaseBusiness,
  ArrowUp, ArrowDown, Filter as FilterIcon, FileText, CalendarDays, PencilLine,
  Bell, Ban, Mail, GripVertical, Send, Undo2, Link2, MessageSquare,
} from 'lucide-react'
import {
  LEAD_STATUS_VOLGORDE, faseDef, leadBordFases, contactStand,
  standaardOpvolgdatum, opvolgStand, moetVandaagOpgepakt,
  contactVeldenBijFase, FASE_BLOCKLIST,
} from '@/lib/crm/pipeline'
import {
  OpvolgBadge, OpvolgPicker, ContactKnop, ContactSamenvatting, ContactStatusBlok,
} from '@/components/crm/OpvolgControls'
import { AiScoreBadge, AiScoreGetal, AiKwalificatieBlok } from '@/components/crm/AiKwalificatie'
import BenaderenBlok from '@/components/crm/BenaderenBlok'
import ReactieMelding from '@/components/crm/ReactieMelding'
import MailAdresKiezer from '@/components/crm/MailAdresKiezer'
import UrenKlantBlok from '@/components/crm/UrenKlantBlok'
import { useMelding } from '@/components/MeldingProvider'
import { DashTagsProvider, InlineTags, type DashTag, DASH_TAG_KLEURNAMEN } from '@/components/CrmTagPicker'
import { useColumnOrder, useColumnDnD, useColumnWidths } from '@/lib/columnOrder'
import { ColumnGrip } from '@/components/ColumnGrip'
import { useActiveCompany } from '@/components/CompanyContext'
import { COMPANIES } from '@/lib/companies'
import { VELD_INPUT } from '@/lib/crm/stijl'

// Zelfde union als lib/crm/types.ts. 'daley_list' is eruit: dat onderdeel is in
// juli 2026 opgegaan in de taken-tabel en er staan geen records meer van in de
// database, dus de dode waarde sleepte alleen nog labels en routes mee.
type EntityType = 'lead' | 'company' | 'contact' | 'assignment' | 'clickup_invoice'

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
  /** raw.description, meegeleverd door de lijstroute voor de kolom Beschrijving */
  beschrijving?: string | null
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
  /** Voor welk eigen bedrijf deze lead is. Leeg = nog niet toegewezen. */
  company_id?: string | null
  // Opvolging (zie lib/crm/pipeline.ts)
  volgende_actie?: string | null
  volgende_actie_notitie?: string | null
  laatste_contact?: string | null
  contact_pogingen?: number | null
  contact_status?: string | null
  contact_status_tot?: string | null
  contact_status_reden?: string | null
  ruwe_contact_email?: string | null
  ruwe_telefoon?: string | null
  ruwe_contact_status?: string | null
  afsluit_reden?: string | null
  // AI-kwalificatie (zie lib/ai/kwalificeer-lead.ts). Advies, geen automaat:
  // deze velden sturen nooit de fase of de opvolging aan.
  ai_status?: string | null
  ai_score?: number | null
  ai_prioriteit?: string | null
  ai_branche?: string | null
  ai_website?: string | null
  ai_samenvatting?: string | null
  ai_signalen?: { plus?: string[]; min?: string[] } | null
  ai_volgende_stap?: string | null
  ai_beoordeeld_op?: string | null
  ai_model?: string | null
  ai_fout?: string | null
}

// ── Status visual config ────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  'nieuwe kans':             'bg-cyan-500 text-white',
  'open':                    'bg-cyan-500 text-white',
  'nieuwe opdracht':         'bg-cyan-500 text-white',
  'on hold':                 'bg-amber-500 text-white',
  'klant on hold':           'bg-amber-500 text-white',
  'benaderd':                'bg-purple-500 text-white',
  'in gesprek':              'bg-indigo-500 text-white',
  'in uitvoering':           'bg-indigo-500 text-white',
  'offerte uit':             'bg-sky-500 text-white',
  'later opvolgen':          'bg-amber-500 text-white',
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
  'omgezet':                 'bg-green-500 text-white',
  'gefactureerd':            'bg-emerald-600 text-white',
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
  'in uitvoering':           '#6366f1',
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
  'omgezet':                 '#22c55e',
  'gefactureerd':            '#059669',
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
  'benaderd':                'Active',
  'in gesprek':              'Active',
  'in uitvoering':           'Active',
  'offerte uit':             'Active',
  'later opvolgen':          'Active',
  'eigen bedrijf':           'Active',
  'factuur open':            'Active',
  'gewonnen':                'Done',
  'afgerond':                'Done',
  'gefactureerd':            'Done',
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

// ── Entity-specific status order ────────────────────────────────────
// Leads komen uit lib/crm/pipeline.ts, dat is de bron van waarheid voor de
// fases. De overige entiteiten houden hun vaste volgorde hier.

const ENTITY_STATUS_ORDER: Partial<Record<EntityType, string[]>> = {
  lead: LEAD_STATUS_VOLGORDE,
  assignment: [
    'nieuwe opdracht',
    'in uitvoering',
    'on hold',
    'afgerond',
    'gefactureerd',
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
function statusHex(s?: string | null) { const k = normalizeStatus(s); return faseDef(k)?.kleur ?? STATUS_HEX[k] ?? '#9ca3af' }
function statusGroup(s?: string | null) { const k = normalizeStatus(s); return faseDef(k)?.groep ?? STATUS_GROUP_MAP[k] ?? 'Active' }
function statusBadge(s?: string | null) { return STATUS_BADGE[normalizeStatus(s)] ?? 'bg-gray-400 text-white' }

/**
 * Statusvolgorde voor een entity: eerst de vaste volgorde, daarna wat verder
 * nog in de data voorkomt (oude statussen blijven zo zichtbaar).
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
  for (const s of (ENTITY_STATUS_ORDER[entity] ?? [])) push(s)
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

// ── Status icon (SVG) ──────────────────────────────────────────────

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

/** Rendert een dropdown-veld als gekleurde pill (kleur uit type_config van het veld). */
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
  // De AI-score vooraan: daarop weeg je de lijst. Klik op de kop sorteert erop.
  { key: 'score',           label: 'Score',           width: 64,  render: (r) => (r.ai_score != null || r.ai_status === 'bezig' || r.ai_status === 'wachtend' ? <AiScoreGetal record={r} /> : DASH), sortValue: (r) => r.ai_score ?? null },
  { key: 'bedrijf',         label: 'Bedrijf',         width: 140, render: (r) => cfRelationLinks(r, 'Bedrijf', 'company'), sortValue: (r) => cfValue(r, 'Bedrijf') },
  { key: 'contact',         label: 'Contactpersoon',   width: 130, render: (r) => cfRelationLinks(r, 'Contactpersoon', 'contact'), sortValue: (r) => cfValue(r, 'Contactpersoon') },
  { key: 'details',         label: 'Beschrijving', width: 160, render: (r) => textCell(r.beschrijving || cfValue(r, 'Details opdracht')) },
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
  { key: 'details',      label: 'Beschrijving', width: 160, render: (r) => textCell(r.beschrijving || cfValue(r, 'Details opdracht') || cfValue(r, 'Details')) },
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
        // Eén plek voor het klantnummer: de uren- en factuurgegevens van het
        // bedrijf (uren_klanten). Het oude CRM-veld Klantnummer telt niet meer.
        const nr = klantMap.get(`id:${r.id}`) ?? klantMap.get(r.name.toLowerCase().trim())
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

/**
 * Sommige fases willen eerst iets weten.
 *
 *  - Archief: waarom is er niets uit gekomen? Die reden blijft op de kaart staan,
 *    zodat je er over een jaar nog iets aan hebt.
 *  - Blocklist: waarom, en gaat het contact of bedrijf erachter ook mee? Dat
 *    laatste is een aparte vraag, want een lead blokkeren is iets anders dan
 *    iemand nooit meer benaderen.
 *
 * Geeft de extra velden terug voor de PATCH, of null als je annuleert.
 */
async function vraagFaseVelden(
  melding: ReturnType<typeof useMelding>,
  recordId: string,
  naam: string,
  status: string,
  entity?: EntityType
): Promise<Record<string, unknown> | null> {
  const fase = (status || '').toLowerCase()

  // Een opdracht afronden kan van alles betekenen: opgeleverd, of halverwege
  // gestopt. Daarom dezelfde vraag als bij Archief.
  if (entity === 'assignment' && fase === 'afgerond') {
    const reden = await melding.vraagTekst({
      titel: `"${naam}" afronden`,
      tekst: 'Hoe is het geëindigd? Dat blijft op de kaart staan.',
      placeholder: 'Bijvoorbeeld: opgeleverd en akkoord',
      suggesties: ['Opgeleverd', 'Opgeleverd, wacht op akkoord', 'Klant is gestopt', 'Niet doorgegaan', 'Ingetrokken'],
      bevestigLabel: 'Afronden',
    })
    return reden === null ? null : { afsluit_reden: reden }
  }

  if (fase === 'archief') {
    const reden = await melding.vraagTekst({
      titel: `Waarom is er niets uit "${naam}" gekomen?`,
      tekst: 'De reden komt op de kaart te staan.',
      placeholder: 'Bijvoorbeeld: nooit meer iets van gehoord',
      suggesties: ['Geen reactie', 'Te duur', 'Naar een ander gegaan', 'Geen budget', 'Timing klopte niet', 'Geen match'],
      bevestigLabel: 'Naar archief',
    })
    return reden === null ? null : { afsluit_reden: reden }
  }

  if (fase === FASE_BLOCKLIST) {
    const reden = await melding.vraagTekst({
      titel: `"${naam}" op de blocklist?`,
      tekst: 'Waarom wil je hier niet meer mee verder?',
      placeholder: 'Bijvoorbeeld: wil niet benaderd worden',
      suggesties: ['Wil niet benaderd worden', 'Slechte ervaring', 'Betaalt niet', 'Concurrent', 'Niet serieus'],
      bevestigLabel: 'Blokkeren',
      gevaarlijk: true,
    })
    if (reden === null) return null

    // De lead is het werk, de mensen erachter zijn de relatie. Die vraag hoort los.
    try {
      const res = await fetch(`/api/crm/relations?id=${recordId}`)
      const json = await res.json()
      const mensen = [...(json?.contacten || []), ...(json?.bedrijven || [])]
        .filter((r: any) => r?.id && r?.naam)
      if (mensen.length) {
        const ook = await melding.bevestig({
          titel: 'Contact op blocklist zetten?',
          tekst: `Hieraan gekoppeld: ${mensen.map((m: any) => m.naam).join(', ')}.\n\nOok blokkeren? Dan benader je ze nergens meer, ook niet vanuit een andere lead.`,
          bevestigLabel: 'Ja, ook blokkeren',
          annuleerLabel: 'Nee, alleen deze lead',
        })
        if (ook) {
          await Promise.allSettled(mensen.map((m: any) =>
            fetch(`/api/crm/records/${m.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contact_status: 'blokkade', contact_status_reden: reden }),
            })
          ))
        }
      }
    } catch {
      // De koppelingen niet kunnen ophalen mag het blokkeren niet tegenhouden
    }
    return { contact_status_reden: reden }
  }

  return {}
}

function StatusPicker({
  recordId,
  recordNaam,
  recordEntity,
  currentStatus,
  allStatuses,
  onStatusChange,
  iconOnly = false,
}: {
  recordId: string
  recordNaam?: string
  recordEntity?: EntityType
  currentStatus: string | null
  allStatuses: string[]
  onStatusChange: (id: string, status: string) => void
  iconOnly?: boolean
}) {
  const melding = useMelding()
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

    // Archief wil een reden, Blocklist een reden plus de vraag over het contact
    const extra = await vraagFaseVelden(melding, recordId, recordNaam || 'dit record', status, recordEntity)
    if (extra === null) return

    setSaving(true)
    onStatusChange(recordId, status)
    try {
      await fetch(`/api/crm/records/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...extra }),
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
            : 'inline-flex items-center justify-center h-[21px] px-2.5 rounded text-[11px] leading-none font-bold uppercase tracking-wide text-center transition-opacity hover:opacity-80 text-white'
        }
        style={iconOnly ? undefined : { background: statusHex(currentStatus) }}
        title={iconOnly ? (currentStatus || 'Status') : undefined}
      >
        {iconOnly ? (
          saving
            ? <RefreshCw size={13} className="animate-spin text-gray-400" />
            : <StatusIcon status={currentStatus} size={16} />
        ) : (
          // Geen icoon in het label: dat staat in de statuskleur op dezelfde kleur,
          // is dus onzichtbaar en gaf alleen een lege ruimte voor de tekst
          currentStatus || '–'
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

// ── Gegroepeerde lijstweergave ───────────────────────────────────

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
  onDelete,
  deletingId,
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
  /** Verwijderen rechtstreeks op de regel, zonder eerst de detailkaart te openen. */
  onDelete: (r: CrmRecord) => void
  /** Id van het record dat nu verwijderd wordt (prullenbak toont een spinner). */
  deletingId: string | null
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
    // allStatuses verandert als er nieuwe statussen in de data opduiken -> herbereken volgorde
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
  // 2 x 36 vooraan (checkbox, status), 1 x 36 achteraan (verwijderen)
  const minWidth = 36 + 36 + nameWidth + colTotalWidth + 36
  const anySelected = selected.size > 0

  return (
    <div className="overflow-x-auto lg:overflow-visible">
      <div style={{ minWidth }}>
        {/* Column header row */}
        <div className="sticky top-0 z-20 flex items-center border-b border-gray-200 bg-gray-50">
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
                  className="inline-flex items-center justify-center h-[21px] px-2.5 rounded text-[11px] leading-none font-bold uppercase tracking-wider text-center text-white"
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
                      recordNaam={item.name}
                      recordEntity={item.entity_type}
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

                  {/* Verwijderen op de regel */}
                  <div
                    className="w-9 shrink-0 flex items-center justify-center py-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      disabled={deletingId === item.id}
                      className={`text-gray-300 hover:text-red-500 transition-colors disabled:opacity-60 ${deletingId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                      title="Record verwijderen"
                      aria-label={`${item.name} verwijderen`}
                    >
                      {deletingId === item.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
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

/** Terugzetten kan bij een opdracht (terug naar de lead) en een factuur (terug naar de opdracht). */
function kanTerugzetten(record: CrmRecord) {
  return record.entity_type === 'assignment' || record.entity_type === 'clickup_invoice'
}

/**
 * Per ongeluk een opdracht of factuur aangemaakt: die gaat weg en de lead of
 * opdracht waar hij uit voortkwam gaat terug naar de fase van daarvoor.
 * Gedeeld door de detailkaart en de kaart op het bord, zodat de vraag en de
 * melding overal gelijk zijn. Geeft false als Daley annuleert, gooit bij een fout.
 */
async function terugzettenApi(id: string): Promise<{ bron: { id: string; name: string; status: string } | null }> {
  const res = await fetch(`/api/crm/records/${id}/terugzetten`, { method: 'POST' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Terugzetten mislukt')
  return json
}

async function zetPromotieTerug(record: CrmRecord, melding: ReturnType<typeof useMelding>): Promise<boolean> {
  const soort = record.entity_type === 'assignment' ? 'opdracht' : 'factuur'
  const akkoord = await melding.bevestig({
    titel: `"${record.name}" terugzetten?`,
    tekst: `Deze ${soort} wordt verwijderd, en ${soort === 'opdracht' ? 'de lead' : 'de opdracht'} gaat terug naar de fase van daarvoor.\n\nDit kan niet ongedaan worden gemaakt.`,
    bevestigLabel: 'Terugzetten',
    gevaarlijk: true,
  })
  if (!akkoord) return false
  const json = await terugzettenApi(record.id)
  melding.gelukt(json.bron
    ? `Teruggezet: "${json.bron.name}" staat weer op ${json.bron.status}.`
    : `${soort === 'opdracht' ? 'Opdracht' : 'Factuur'} verwijderd. Er was geen gekoppelde lead gevonden.`)
  return true
}

function BoardCard({
  item,
  allStatuses,
  onStatusChange,
  onClick,
  toonOpvolging = false,
  onOpvolgPatch,
  onDragStart,
  onTerugzetten,
}: {
  item: CrmRecord
  allStatuses: string[]
  onStatusChange: (id: string, status: string) => void
  onClick: () => void
  toonOpvolging?: boolean
  onOpvolgPatch?: (id: string, patch: Partial<CrmRecord>) => void
  onDragStart?: (id: string) => void
  onTerugzetten?: (record: CrmRecord) => void
}) {
  const assignee = item.assignees?.[0]
  const fields = (item.custom_fields || [])
    .map((f) => ({ label: f?.name, value: normalizeCustomFieldValue(f) }))
    .filter((f) => f.label && f.value)
    .slice(0, 2)

  const patch = (p: Partial<CrmRecord>) => onOpvolgPatch?.(item.id, p)
  const stand = opvolgStand(item.volgende_actie)
  const contact = contactStand(item)
  const randKleur = contact !== 'open'
    ? 'border-gray-300'
    : stand === 'te laat' ? 'border-red-200'
    : stand === 'vandaag' ? 'border-amber-200'
    : 'border-brand-card-border'

  return (
    <div
      onClick={onClick}
      draggable={!!onDragStart}
      onDragStart={(e) => {
        if (!onDragStart) return
        e.dataTransfer.setData('text/plain', item.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(item.id)
      }}
      className={`w-full text-left bg-white rounded-brand border ${randKleur} hover:border-brand-lavender hover:shadow-md transition-all p-3 space-y-2 cursor-pointer ${contact !== 'open' ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-brand-text-primary leading-snug flex-1">{item.name}</p>
        <StatusPicker
          recordId={item.id}
          recordNaam={item.name}
          recordEntity={item.entity_type}
          currentStatus={item.status ?? null}
          allStatuses={allStatuses}
          onStatusChange={onStatusChange}
        />
      </div>
      {/* Pauze en blokkade blijven ook zichtbaar op borden zonder opvolging */}
      {(toonOpvolging || contact !== 'open') && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <OpvolgBadge record={item} />
          {toonOpvolging && <ContactSamenvatting record={item} />}
        </div>
      )}
      {item.entity_type === 'lead' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <AiScoreBadge record={item} />
        </div>
      )}
      {/* Waarom hij geblokkeerd of gepauzeerd staat hoort op de kaart zelf: de
          blocklist gaat over bedrijven en contacten, niet over losse leads. */}
      {item.afsluit_reden && (
        <p className="text-xs text-brand-text-secondary line-clamp-2">
          <span className="opacity-70">Reden:</span> {item.afsluit_reden}
        </p>
      )}
      {contact !== 'open' && item.contact_status_reden && (
        <p className="text-xs text-brand-text-secondary line-clamp-2">
          <span className="opacity-70">Reden:</span> {item.contact_status_reden}
        </p>
      )}
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
          {onTerugzetten && kanTerugzetten(item) && (
            <button
              onClick={(e) => { e.stopPropagation(); onTerugzetten(item) }}
              title="Terugzetten: per ongeluk aangemaakt? Verwijdert dit record en zet de vorige stap terug."
              aria-label="Terugzetten"
              className="p-1 rounded-brand-btn text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-page-medium transition-colors"
            >
              <Undo2 size={13} />
            </button>
          )}
          {toonOpvolging && (
            <>
              <ContactKnop record={item} onSaved={patch} variant="icoon" />
              <OpvolgPicker record={item} onSaved={patch} variant="icoon" />
            </>
          )}
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
    </div>
  )
}

// ── Board view ──────────────────────────────────────────────────────

function BoardView({
  items,
  entity,
  allStatuses,
  onStatusChange,
  onCardClick,
  onOpvolgPatch,
  onFaseChange,
  onTerugzetten,
}: {
  items: CrmRecord[]
  entity: EntityType
  allStatuses: string[]
  onStatusChange: (id: string, status: string) => void
  onCardClick: (r: CrmRecord) => void
  onOpvolgPatch?: (id: string, patch: Partial<CrmRecord>) => void
  onFaseChange?: (id: string, status: string) => void
  onTerugzetten?: (record: CrmRecord) => void
}) {
  const isLead = entity === 'lead'
  const [toonAfgesloten, setToonAfgesloten] = useState(false)
  const [sleepDoel, setSleepDoel] = useState<string | null>(null)

  // Contacten en bedrijven verdwijnen bij een blokkade van hun bord en staan op
  // de blocklist. Leads blijven staan, in hun eigen kolom Blocklist.
  const geblokkeerd = useMemo(
    () => (isLead ? 0 : items.filter((i) => contactStand(i) === 'blokkade').length),
    [items, isLead]
  )

  const { columns, verborgen } = useMemo(() => {
    const groups: Record<string, CrmRecord[]> = {}
    for (const item of items) {
      if (!isLead && contactStand(item) === 'blokkade') continue
      const s = item.status || '(geen status)'
      if (!groups[s]) groups[s] = []
      groups[s].push(item)
    }
    const present = Object.keys(groups)

    // Leads: alleen de actieve fases als kolom, de rest achter de schakelaar.
    const namen = isLead
      ? leadBordFases(toonAfgesloten).map((f) => f.status)
      : statusOrderFor(entity, present)
    const zichtbaar = new Set(namen.map((n) => n.toLowerCase()))

    const kolommen = namen.map((name): [string, CrmRecord[]] => {
      const actual = present.find((p) => p.toLowerCase() === name.toLowerCase())
      const cards = actual ? [...groups[actual]] : []
      // Binnen een kolom: wie het langst wacht staat bovenaan.
      cards.sort((a, b) => {
        const va = a.volgende_actie || '9999-12-31'
        const vb = b.volgende_actie || '9999-12-31'
        return va === vb ? a.name.localeCompare(b.name) : va < vb ? -1 : 1
      })
      return [actual || name, cards]
    })

    const verborgenAantal = present
      .filter((p) => !zichtbaar.has(p.toLowerCase()))
      .reduce((som, p) => som + groups[p].length, 0)

    return { columns: kolommen, verborgen: verborgenAantal }
  }, [items, entity, isLead, toonAfgesloten])

  return (
    <div className="space-y-3">
      {!isLead && geblokkeerd > 0 && (
        <Link
          href="/crm/blocklist"
          className="text-xs text-brand-text-secondary hover:text-brand-text-primary inline-flex items-center gap-1.5"
          title="Zij willen niet meer benaderd worden"
        >
          <Ban size={13} /> {geblokkeerd} op de blocklist
        </Link>
      )}
      {isLead && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setToonAfgesloten((v) => !v)}
            className="text-xs text-brand-text-secondary hover:text-brand-text-primary inline-flex items-center gap-1.5"
          >
            {toonAfgesloten ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {toonAfgesloten ? 'Verberg afgesloten fases' : 'Toon afgesloten fases'}
            {!toonAfgesloten && verborgen > 0 && (
              <span className="text-brand-text-secondary opacity-70">({verborgen})</span>
            )}
          </button>
          {/* De blocklist gaat over bedrijven en contacten; geblokkeerde leads
              blijven op het bord staan, in hun eigen kolom met de reden erbij. */}
          <Link
            href="/crm/blocklist"
            className="text-xs text-brand-text-secondary hover:text-brand-text-primary inline-flex items-center gap-1.5"
            title="Bedrijven en contacten die je niet meer benadert"
          >
            <Ban size={13} /> Blocklist
          </Link>
          {onFaseChange && (
            <span className="text-xs text-brand-text-secondary opacity-70 inline-flex items-center gap-1">
              <GripVertical size={12} /> Sleep een kaart naar een andere fase
            </span>
          )}
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-2 min-h-[300px]">
        {columns.map(([status, cards]) => {
          const fase = faseDef(status)
          const isDoel = sleepDoel === status
          return (
            <div
              key={status}
              className="flex-shrink-0 w-64"
              onDragOver={(e) => { if (onFaseChange) { e.preventDefault(); setSleepDoel(status) } }}
              onDragLeave={() => setSleepDoel((d) => (d === status ? null : d))}
              onDrop={(e) => {
                if (!onFaseChange) return
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain')
                setSleepDoel(null)
                if (id) onFaseChange(id, status)
              }}
            >
              <div className="flex items-center gap-2 mb-3 px-0.5" title={fase?.uitleg}>
                <StatusIcon status={status} size={14} />
                {isLead && status === FASE_BLOCKLIST ? (
                  <Link
                    href="/crm/blocklist"
                    className="text-sm font-semibold text-brand-text-primary hover:text-brand-lavender flex-1 truncate"
                    title="Geblokkeerde leads staan hier. Bedrijven en contacten staan op de blocklist."
                  >
                    {fase?.label || status}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-brand-text-primary flex-1 truncate">
                    {fase?.label || status}
                  </span>
                )}
                <span className="text-xs text-brand-text-secondary bg-brand-page-medium rounded-full px-2 py-0.5 shrink-0">
                  {cards.length}
                </span>
              </div>
              <div className={`space-y-2 rounded-brand transition-colors min-h-[60px] ${isDoel ? 'bg-brand-lavender/10 ring-2 ring-brand-lavender/40 p-1' : ''}`}>
                {cards.map((card) => (
                  <BoardCard
                    key={card.id}
                    item={card}
                    allStatuses={allStatuses}
                    onStatusChange={onStatusChange}
                    onClick={() => onCardClick(card)}
                    toonOpvolging={isLead}
                    onOpvolgPatch={onOpvolgPatch}
                    onDragStart={onFaseChange ? () => {} : undefined}
                    onTerugzetten={onTerugzetten}
                  />
                ))}
              </div>
            </div>
          )
        })}
        {columns.length === 0 && (
          <p className="text-brand-text-secondary text-sm py-10 px-4">Geen records gevonden.</p>
        )}
      </div>
    </div>
  )
}

// ── Vandaag oppakken ────────────────────────────────────────────────
// De follow-up leeft hier, niet in een kolom: alles wat vandaag of eerder
// aan de beurt is, dwars door alle fases heen.

function VandaagBlok({
  items,
  onOpvolgPatch,
  onCardClick,
}: {
  items: CrmRecord[]
  onOpvolgPatch: (id: string, patch: Partial<CrmRecord>) => void
  onCardClick: (r: CrmRecord) => void
}) {
  const [ingeklapt, setIngeklapt] = useState(false)

  const openstaand = useMemo(() => {
    return items
      .filter((i) => moetVandaagOpgepakt(i))
      .sort((a, b) => (a.volgende_actie || '').localeCompare(b.volgende_actie || ''))
  }, [items])

  const teLaat = openstaand.filter((i) => opvolgStand(i.volgende_actie) === 'te laat').length

  if (openstaand.length === 0) return null

  return (
    <div className="card p-4 shrink-0">
      <button
        onClick={() => setIngeklapt((v) => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
        <Bell size={15} className={teLaat > 0 ? 'text-red-500' : 'text-amber-500'} />
        <span className="text-sm font-semibold text-brand-text-primary">Vandaag oppakken</span>
        <span className="text-xs text-brand-text-secondary bg-brand-page-medium rounded-full px-2 py-0.5">
          {openstaand.length}
        </span>
        {teLaat > 0 && (
          <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
            {teLaat} te laat
          </span>
        )}
        {ingeklapt ? <ChevronRight size={14} className="ml-auto text-gray-400" /> : <ChevronDown size={14} className="ml-auto text-gray-400" />}
      </button>

      {!ingeklapt && (
        <div className="mt-3 space-y-1.5">
          {openstaand.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-brand-page-light transition-colors"
            >
              <button onClick={() => onCardClick(item)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                <StatusIcon status={item.status ?? null} size={12} />
                <span className="text-sm text-brand-text-primary truncate">{item.name}</span>
                <span className="text-xs text-brand-text-secondary truncate hidden sm:inline">
                  {faseDef(item.status)?.label || item.status}
                </span>
                {item.volgende_actie_notitie && (
                  <span className="text-xs text-brand-text-secondary opacity-70 truncate hidden md:inline">
                    {item.volgende_actie_notitie}
                  </span>
                )}
              </button>
              <OpvolgBadge record={item} />
              <ContactKnop record={item} onSaved={(p) => onOpvolgPatch(item.id, p)} variant="icoon" />
              <OpvolgPicker record={item} onSaved={(p) => onOpvolgPatch(item.id, p)} variant="icoon" />
            </div>
          ))}
        </div>
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

// Kleurkeuzes voor nieuwe opties (zelfde sfeer als de bestaande optiekleuren).
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

/** Eén bewerkbaar custom field. `edited` is de nog-niet-opgeslagen waarde (opgeslagen veldformaat). */
/** Invoerveld in de detailkaart: licht, zodat een lange rij velden rustig blijft. */

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
  const inputCls = VELD_INPUT

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
      (f: any) => f?.id && f?.name && !HIDDEN_FIELD_TYPES.has(f?.type) &&
        // Het klantnummer van een bedrijf staat in "Urenregistratie en facturatie";
        // het oude importveld zou een tweede, afwijkend nummer tonen
        !(entity === 'company' && String(f.name).toLowerCase() === 'klantnummer') &&
        // Details opdracht is opgegaan in Beschrijving (september 2026): één veld
        // voor "waar gaat dit over", niet twee die uit elkaar lopen. Staat er
        // nog tekst in (nog niet samengevoegd), dan blijft hij zichtbaar tot
        // scripts/details-naar-beschrijving.mjs hem heeft overgezet.
        !(String(f.name).toLowerCase() === 'details opdracht' && !String(f.value ?? '').trim())
    )
    // Dedupliceer op naam (de oude import heeft soms dubbele velden); hou het veld met waarde
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
      <h3 className="text-caption font-semibold uppercase tracking-wide text-brand-text-secondary">Velden</h3>
      {fields.map((f: any) => (
        <div key={f.id}>
          <p className="text-caption text-brand-text-secondary mb-1">{f.name}</p>
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
}

/** Zoekt op een veldenlijst het relatieveld (tasks/list_relationship) dat naar `targetEntity` wijst. */
function relatieVeldVoor(customFields: any[] | undefined, targetEntity: string): any | null {
  const kws = RELATIE_VELD_TREFWOORDEN[targetEntity] || []
  const rel = (customFields || []).filter((f) => f?.type === 'tasks' || f?.type === 'list_relationship')
  return rel.find((f) => kws.some((k) => (f?.name || '').toLowerCase().includes(k))) || null
}

/**
 * Legt de koppeling tussen twee records vast.
 *
 * De koppeling wordt bij voorkeur op het bronrecord geschreven, en anders op
 * het doelrecord: welke van de twee een relatieveld heeft dat naar het andere
 * type wijst. `/api/crm/relations` leidt relaties in beide richtingen af, dus
 * welke kant de waarde draagt maakt voor de weergave niet uit.
 */
async function koppelRecords(
  bron: { id: string; entity_type: string; clickup_task_id: string; custom_fields?: any[] },
  doel: { id: string; entity_type: string; clickup_task_id: string; custom_fields?: any[] }
) {
  let patchId = bron.id
  let field = relatieVeldVoor(bron.custom_fields, doel.entity_type)
  let addTaskId = doel.clickup_task_id
  if (!field) {
    field = relatieVeldVoor(doel.custom_fields, bron.entity_type)
    patchId = doel.id
    addTaskId = bron.clickup_task_id
  }
  if (!field) throw new Error('Geen koppelveld beschikbaar voor dit type')

  const res = await fetch(`/api/crm/records/${patchId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ custom_fields: [{ id: field.id, value: { add: [addTaskId], rem: [] } }] }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Koppelen mislukt')
}

/**
 * Status waarmee een record uit de koppel-zoeker binnenkomt.
 *
 * Een lead moet als "nieuwe kans" beginnen, anders valt hij buiten alle
 * bordkolommen en zie je hem nergens meer terug.
 */
function standaardStatusVoor(entity: EntityType): string | undefined {
  if (entity === 'lead') return 'nieuwe kans'
  return undefined
}

/** Standaard-tabblad in de zoeker: waar je vanuit dit type meestal naartoe koppelt. */
function standaardKoppelType(entity: EntityType): EntityType {
  if (entity === 'company') return 'lead'
  if (entity === 'contact') return 'company'
  if (entity === 'assignment') return 'company'
  if (entity === 'clickup_invoice') return 'company'
  return 'company'
}

/**
 * Zoek-en-kies een record. Weet zelf niets van koppelen: de gebruiker klikt een
 * record aan en de aanroeper bepaalt wat er dan gebeurt.
 */
function RecordZoeker({
  standaardType,
  negeerId,
  bezigId,
  gekozenIds,
  autoFocus,
  standaardNaam,
  onKies,
}: {
  standaardType: EntityType
  negeerId?: string
  bezigId?: string | null
  gekozenIds?: string[]
  autoFocus?: boolean
  /** Naam waarmee een nieuw record wordt voorgesteld als je niets intypt. */
  standaardNaam?: string
  onKies: (record: CrmRecord) => void
}) {
  const [kind, setKind] = useState<EntityType>(standaardType)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CrmRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [maken, setMaken] = useState(false)
  const [netGemaakt, setNetGemaakt] = useState<string[]>([])
  const [maakFout, setMaakFout] = useState('')
  const [botsing, setBotsing] = useState<{ melding: string; overrulebaar: boolean } | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    const t = setTimeout(() => {
      const q = query.trim()
      fetch(`/api/crm/records?entity=${kind}&limit=20${q ? `&search=${encodeURIComponent(q)}` : ''}`)
        .then((r) => r.json())
        .then((d) => { if (active) { setResults(Array.isArray(d.items) ? d.items : []); setLoading(false) } })
        .catch(() => { if (active) { setResults([]); setLoading(false) } })
    }, 220)
    return () => { active = false; clearTimeout(t) }
  }, [kind, query])

  // Een melding over de vorige poging hoort niet bij een nieuwe zoekterm.
  useEffect(() => { setBotsing(null); setMaakFout('') }, [kind, query])

  const zichtbaar = results.filter((r) => r.id !== negeerId)
  const nieuweNaam = query.trim() || standaardNaam?.trim() || ''
  const kindLabel = (LINKABLE_KINDS.find((k) => k.entity === kind)?.label || 'record').toLowerCase()
  // Bestaat de naam al precies zo, dan koppel je die: geen tweede record ernaast.
  // `netGemaakt` vangt de records die net hier zijn aangemaakt en dus nog niet
  // in de zoekresultaten staan, zodat je niet twee keer hetzelfde aanmaakt.
  const alAanwezig =
    zichtbaar.some((r) => r.name.trim().toLowerCase() === nieuweNaam.toLowerCase()) ||
    netGemaakt.includes(`${kind}:${nieuweNaam.toLowerCase()}`)

  /**
   * Maakt het ontbrekende record ter plekke aan en geeft het door alsof je het
   * uit de lijst had gekozen.
   *
   * De dubbelcheck van de server mag zijn werk doen: pas als die meldt dat het
   * record al bestaat, krijg je "Toch aanmaken" te zien. Een blokkade is niet
   * te overrulen, dus daar bieden we die knop niet bij aan.
   */
  const maakAan = async (negeerDubbel: boolean) => {
    if (!nieuweNaam || maken) return
    setMaken(true)
    setMaakFout('')
    setBotsing(null)
    try {
      const res = await fetch('/api/crm/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: kind,
          name: nieuweNaam,
          status: standaardStatusVoor(kind),
          negeerDubbel: negeerDubbel || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setBotsing({
          melding: json.error || 'Dit record bestaat al.',
          overrulebaar: json.botsing?.soort !== 'blokkade',
        })
        return
      }
      if (!res.ok) throw new Error(json.error || 'Aanmaken mislukt')
      setNetGemaakt((prev) => [...prev, `${kind}:${nieuweNaam.toLowerCase()}`])
      setQuery('')
      onKies(json.item)
    } catch (e: any) {
      setMaakFout(e.message || 'Aanmaken mislukt')
    } finally {
      setMaken(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {LINKABLE_KINDS.map((k) => (
          <button
            key={k.entity}
            type="button"
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
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek record..."
          className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:border-indigo-300"
        />
      </div>
      {/* Bestaat het nog niet, maak het dan hier: anders moet je halverwege
          weg om ergens anders een lead aan te maken en opnieuw te beginnen. */}
      {nieuweNaam && !alAanwezig && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => maakAan(false)}
            disabled={maken || bezigId != null}
            className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-left text-xs text-indigo-600 hover:bg-indigo-50/60 disabled:opacity-50"
          >
            <Plus size={12} className="shrink-0" />
            <span className="truncate">
              {maken ? 'Aanmaken...' : <>Nieuwe {kindLabel} &quot;{nieuweNaam}&quot; aanmaken</>}
            </span>
          </button>
          {botsing && (
            <div className="px-1.5 pb-1">
              <p className="text-[11px] text-amber-600">{botsing.melding}</p>
              {botsing.overrulebaar && (
                <button
                  type="button"
                  onClick={() => maakAan(true)}
                  disabled={maken}
                  className="text-[11px] text-indigo-600 hover:underline disabled:opacity-50"
                >
                  Toch aanmaken
                </button>
              )}
            </div>
          )}
          {maakFout && <p className="text-[11px] text-red-500 px-1.5 pb-1">{maakFout}</p>}
        </div>
      )}

      <div className="max-h-48 overflow-y-auto -mx-1">
        {loading ? (
          <p className="text-xs text-gray-400 px-1 py-1">Laden...</p>
        ) : zichtbaar.length === 0 ? (
          <p className="text-xs text-gray-400 px-1 py-1">Geen records gevonden</p>
        ) : (
          zichtbaar.map((r) => {
            const gekozen = gekozenIds?.includes(r.id)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onKies(r)}
                disabled={bezigId != null || gekozen}
                className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-left text-xs hover:bg-indigo-50/60 disabled:opacity-50"
              >
                <StatusIcon status={r.status || null} size={10} />
                <span className="truncate flex-1">{r.name}</span>
                {bezigId === r.id
                  ? <span className="text-[10px] text-gray-400">koppelen...</span>
                  : gekozen
                    ? <span className="text-[10px] text-indigo-500">gekozen</span>
                    : <Plus size={12} className="text-indigo-400 shrink-0" />}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function RecordLinker({ record, onLinked }: { record: CrmRecord; onLinked: () => void }) {
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const link = async (target: CrmRecord) => {
    setError('')
    setLinkingId(target.id)
    try {
      await koppelRecords(record, target)
      onLinked()
    } catch (e: any) {
      setError(e.message || 'Koppelen mislukt')
    } finally {
      setLinkingId(null)
    }
  }

  return (
    <div className="mt-2 mb-3 p-3 rounded-lg border border-gray-200 bg-white">
      {error && <p className="text-[11px] text-red-500 mb-1">{error}</p>}
      <RecordZoeker
        standaardType={standaardKoppelType(record.entity_type as EntityType)}
        negeerId={record.id}
        bezigId={linkingId}
        autoFocus
        standaardNaam={record.name}
        onKies={link}
      />
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
        fetch(`/api/crm/records/${ed.recordId}`, {
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

  const alle = groups.flatMap((g) => g.items.map((item) => ({ item, icon: g.icon, soort: g.label })))

  // Koppelingen staan in de kop van de kaart, onder de titel: altijd in beeld,
  // ook als de middelste kolom naar de velden gescrold is. Daar stonden ze eerst,
  // en dan zag je niet dat een lead al aan een bedrijf en contact hing.
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {state === 'loading' && <span className="text-caption text-brand-text-secondary">Koppelingen laden...</span>}
        {state === 'error' && (
          <button onClick={load} className="text-caption text-brand-status-red hover:underline">Koppelingen laden mislukt, opnieuw proberen</button>
        )}
        {state === 'done' && alle.length === 0 && !picking && (
          <span className="text-caption text-brand-text-secondary italic">Nog nergens aan gekoppeld</span>
        )}
        {state === 'done' && alle.map(({ item, icon, soort }) => (
          <span
            key={`${soort}-${item.id}`}
            title={soort}
            className="inline-flex items-center gap-1 max-w-[260px] rounded-full border border-brand-card-border/15 bg-white dark:bg-brand-card-bg pl-2 pr-1.5 py-0.5"
          >
            <span className="text-brand-text-secondary shrink-0">{icon}</span>
            <RelationLink item={item} onUnlink={unlink} />
          </span>
        ))}
        <button
          onClick={() => setPicking((v) => !v)}
          className="inline-flex items-center gap-1 text-caption font-medium rounded-full px-2.5 py-0.5 border border-dashed border-brand-lav-accent/50 text-brand-lav-accent hover:bg-brand-lavender-light/40 transition-colors"
        >
          {picking ? <X size={12} /> : <Link2 size={12} />} {picking ? 'Sluiten' : 'Koppelen'}
        </button>
      </div>
      {picking && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-brand-sm border border-brand-card-border/15 bg-white dark:bg-brand-card-bg p-3">
          <RecordLinker record={record} onLinked={load} />
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
  if (soort === 'contact') return <Mail size={11} className="text-purple-500" />
  if (soort === 'opvolging') return <Bell size={11} className="text-amber-500" />
  if (soort === 'blokkade') return <Ban size={11} className="text-gray-700" />
  if (soort === 'opmerking') return <MessageSquare size={11} className="text-brand-lav-accent" />
  if (soort === 'beschrijving') return <FileText size={11} className="text-amber-500" />
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

/**
 * Activiteit plus opmerkingen. Een opmerking is een losse, gedateerde notitie
 * (soort 'opmerking' in crm_activiteiten) en verving het grote Notities-veld:
 * wat je weet hoort bij een moment, tussen je contactmomenten en fasewissels,
 * zodat je later terugziet wanneer je wat wist.
 */
function ActivityFeed({ record }: { record: CrmRecord }) {
  const melding = useMelding()
  const [items, setItems] = useState<Activiteit[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'done'>('loading')
  const [nieuw, setNieuw] = useState('')
  const [bezig, setBezig] = useState(false)
  const [alleenOpmerkingen, setAlleenOpmerkingen] = useState(false)
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [bewerkTekst, setBewerkTekst] = useState('')

  const load = useCallback(() => {
    setState('loading')
    fetch(`/api/crm/activiteiten?recordId=${record.id}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => { setItems(d); setState('done') })
      .catch(() => setState('error'))
  }, [record.id])

  useEffect(load, [load])

  const plaats = async () => {
    const tekst = nieuw.trim()
    if (!tekst || bezig) return
    setBezig(true)
    try {
      const res = await fetch('/api/crm/activiteiten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: record.id, tekst }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Opmerking plaatsen mislukt')
      setItems((prev) => [json, ...prev])
      setNieuw('')
    } catch (e: any) {
      melding.fout(e.message)
    } finally {
      setBezig(false)
    }
  }

  const bewaarBewerking = async (id: string) => {
    const tekst = bewerkTekst.trim()
    if (!tekst) return
    const res = await fetch('/api/crm/activiteiten', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tekst }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { melding.fout(json.error || 'Opslaan mislukt'); return }
    setItems((prev) => prev.map((i) => (i.id === id ? json : i)))
    setBewerkId(null)
  }

  const haalWeg = async (id: string) => {
    const ok = await melding.bevestig({ titel: 'Opmerking weghalen?', tekst: 'Deze opmerking verdwijnt uit de kaart.', bevestigLabel: 'Weghalen', gevaarlijk: true })
    if (!ok) return
    const res = await fetch(`/api/crm/activiteiten?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { melding.fout('Weghalen mislukt'); return }
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  // Bestaat er geen log-entry voor het aanmaken (records van voor de feed),
  // toon dan de aanmaakdatum als synthetisch eerste item.
  const heeftAanmaak = items.some((i) => i.soort === 'aangemaakt')
  const aanmaakDatum = record.clickup_date_created || record.synced_at
  const aantalOpmerkingen = items.filter((i) => i.soort === 'opmerking').length
  const zichtbaar = alleenOpmerkingen ? items.filter((i) => i.soort === 'opmerking') : items

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <h3 className="text-caption font-semibold uppercase tracking-wide text-brand-text-secondary">Activiteit</h3>
        {aantalOpmerkingen > 0 && (
          <button
            onClick={() => setAlleenOpmerkingen((v) => !v)}
            className={`text-caption rounded-full px-2 py-0.5 border transition-colors ${alleenOpmerkingen ? 'border-brand-lav-accent/40 bg-brand-lavender-light/50 text-brand-text-primary' : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'}`}
          >
            Alleen opmerkingen ({aantalOpmerkingen})
          </button>
        )}
      </div>

      {/* Nieuwe opmerking: Enter plaatst, shift+Enter is een nieuwe regel */}
      <div className="mb-4 shrink-0">
        <textarea
          value={nieuw}
          onChange={(e) => setNieuw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); plaats() }
          }}
          placeholder="Opmerking toevoegen..."
          rows={2}
          className={`${VELD_INPUT} resize-none leading-relaxed placeholder:text-brand-text-secondary/50`}
        />
        {nieuw.trim() && (
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[11px] text-brand-text-secondary">Enter plaatst, shift+Enter nieuwe regel</span>
            <button onClick={plaats} disabled={bezig} className="btn-primary text-xs py-1 px-2.5 disabled:opacity-50">
              {bezig ? 'Bezig...' : 'Plaatsen'}
            </button>
          </div>
        )}
      </div>

      {state === 'loading' ? (
        <p className="text-xs text-gray-400">Laden...</p>
      ) : state === 'error' ? (
        <div>
          <p className="text-xs text-red-500 mb-1">Activiteit laden mislukt.</p>
          <button onClick={load} className="text-xs text-indigo-600 hover:underline">Opnieuw proberen</button>
        </div>
      ) : (
        <div className="space-y-3 overflow-y-auto pr-1 min-h-0">
          {zichtbaar.length === 0 && (alleenOpmerkingen || !aanmaakDatum) && (
            <p className="text-xs text-gray-400 italic">Nog geen activiteit</p>
          )}
          {zichtbaar.map((a) => a.soort === 'opmerking' ? (
            <div key={a.id} className="group/opm rounded-brand-sm border border-brand-card-border/15 bg-white dark:bg-brand-card-bg p-2.5">
              {bewerkId === a.id ? (
                <>
                  <textarea
                    autoFocus
                    value={bewerkTekst}
                    onChange={(e) => setBewerkTekst(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); bewaarBewerking(a.id) }
                      if (e.key === 'Escape') setBewerkId(null)
                    }}
                    rows={3}
                    className={`${VELD_INPUT} resize-y leading-relaxed`}
                  />
                  <div className="flex justify-end gap-2 mt-1.5">
                    <button onClick={() => setBewerkId(null)} className="text-caption text-brand-text-secondary hover:text-brand-text-primary">Annuleren</button>
                    <button onClick={() => bewaarBewerking(a.id)} className="btn-primary text-xs py-1 px-2.5">Opslaan</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-brand-text-primary leading-relaxed whitespace-pre-wrap break-words">{a.nieuwe_waarde}</p>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className="text-[11px] text-brand-text-secondary flex items-center gap-1">
                      <MessageSquare size={10} className="text-brand-lav-accent" /> {fmtActiviteitTijd(a.created_at)}
                    </p>
                    <span className="flex items-center gap-1 opacity-0 group-hover/opm:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => { setBewerkId(a.id); setBewerkTekst(a.nieuwe_waarde || '') }} title="Aanpassen" className="p-0.5 text-brand-text-secondary hover:text-brand-text-primary">
                        <PencilLine size={12} />
                      </button>
                      <button onClick={() => haalWeg(a.id)} title="Weghalen" className="p-0.5 text-brand-text-secondary hover:text-brand-status-red">
                        <Trash2 size={12} />
                      </button>
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div key={a.id} className="flex gap-2">
              <div className="w-5 h-5 rounded-full bg-brand-card-bg border border-brand-card-border/20 flex items-center justify-center shrink-0 mt-0.5">
                {activiteitIcoon(a.soort)}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-brand-text-primary leading-snug">
                  <span className="font-medium">{a.omschrijving}</span>
                  {(a.oude_waarde || a.nieuwe_waarde) && (
                    <span className="text-brand-text-secondary">
                      {': '}
                      {a.oude_waarde && <span className="line-through opacity-60">{a.oude_waarde}</span>}
                      {a.oude_waarde && a.nieuwe_waarde && ' '}
                      {a.nieuwe_waarde && <span className="text-brand-text-primary">{a.nieuwe_waarde}</span>}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-brand-text-secondary">{fmtActiviteitTijd(a.created_at)}</p>
              </div>
            </div>
          ))}
          {!alleenOpmerkingen && !heeftAanmaak && aanmaakDatum && (
            <div className="flex gap-2">
              <div className="w-5 h-5 rounded-full bg-brand-card-bg border border-brand-card-border/20 flex items-center justify-center shrink-0 mt-0.5">
                {activiteitIcoon('aangemaakt')}
              </div>
              <div>
                <p className="text-xs text-brand-text-primary font-medium leading-snug">Record aangemaakt</p>
                <p className="text-[11px] text-brand-text-secondary">{fmtActiviteitTijd(aanmaakDatum)}</p>
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
  onOpvolgPatch,
}: {
  record: CrmRecord
  allStatuses: string[]
  onStatusChange: (id: string, status: string) => void
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
  onOpvolgPatch?: (id: string, patch: Partial<CrmRecord>) => void
}) {
  const [full, setFull] = useState<CrmRecord | null>(null)
  const [opvolgRec, setOpvolgRec] = useState<CrmRecord>(record)
  const [loadingFull, setLoadingFull] = useState(true)
  const melding = useMelding()
  // Knop "Benaderen" in de kop: opent het mailconcept in de werkkolom
  const [benaderen, setBenaderen] = useState(false)
  const [name, setName] = useState(record.name)
  const [currentStatus, setCurrentStatus] = useState(record.status || '')
  const [notes, setNotes] = useState('')
  // Beschrijving is een gewoon wit tekstvlak dat je zelf bijwerkt. null = nog niet geladen.
  const [beschrijving, setBeschrijving] = useState<string | null>(null)
  // Wat er in de database staat, zodat opslaan bij wegklikken alleen iets doet als het veranderd is
  const [beschrijvingOpgeslagen, setBeschrijvingOpgeslagen] = useState('')
  const [beschrijvingStand, setBeschrijvingStand] = useState<'' | 'bezig' | 'opgeslagen' | 'fout'>('')
  const [fieldEdits, setFieldEdits] = useState<Record<string, { value: any }>>({})
  // Alleen leads horen bij één bedrijf; bedrijven en contacten blijven gedeeld.
  const [companyId, setCompanyId] = useState<string>(record.company_id || '')
  const origDueDate = record.due_date ? new Date(record.due_date).toISOString().slice(0, 10) : ''
  const [dueDate, setDueDate] = useState(origDueDate)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  /** Haalt het volledige record op. Ook gebruikt om de AI-uitslag binnen te halen. */
  const laadFull = useCallback((toonLader = true) => {
    if (toonLader) setLoadingFull(true)
    return fetch(`/api/crm/records/${record.id}`)
      .then((r) => r.json())
      .then((d) => {
        const item = d.item || null
        setFull(item)
        if (item && item.company_id !== undefined) setCompanyId(item.company_id || '')
        if (toonLader && item?.raw?.notes) setNotes(item.raw.notes)
        if (toonLader && item) {
          setBeschrijving(item.raw?.description ?? '')
          setBeschrijvingOpgeslagen(item.raw?.description ?? '')
        }
        // Verse opvolgwaarden uit de database overnemen
        if (item) {
          setOpvolgRec((prev) => ({
            ...prev,
            volgende_actie: item.volgende_actie ?? null,
            volgende_actie_notitie: item.volgende_actie_notitie ?? null,
            laatste_contact: item.laatste_contact ?? null,
            contact_pogingen: item.contact_pogingen ?? 0,
            contact_status: item.contact_status ?? 'open',
            contact_status_tot: item.contact_status_tot ?? null,
            contact_status_reden: item.contact_status_reden ?? null,
          }))
        }
        setLoadingFull(false)
      })
      .catch(() => setLoadingFull(false))
  }, [record.id])

  useEffect(() => {
    laadFull()
  }, [laadFull])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleStatusChange = (id: string, status: string) => {
    setCurrentStatus(status)
    if (record.entity_type === 'lead') {
      setOpvolgRec((prev) => ({ ...prev, status, ...(contactVeldenBijFase(status, prev) || {}) }))
    }
    onStatusChange(id, status)
  }

  /** Opvolging is al opgeslagen door het onderdeel zelf: hier alleen bijwerken. */
  const bewaarOpvolg = (patch: Partial<CrmRecord>) => {
    setOpvolgRec((prev) => ({ ...prev, ...patch }))
    if (patch.status) {
      setCurrentStatus(patch.status)
      onStatusChange(record.id, patch.status)
    }
    onOpvolgPatch?.(record.id, patch)
  }

  /** Reactie ontvangen en de lead gaat op In gesprek: zelfde weg als de statuskiezer. */
  const zetInGesprek = async () => {
    handleStatusChange(record.id, 'in gesprek')
    const res = await fetch(`/api/crm/records/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in gesprek' }),
    }).catch(() => null)
    if (!res?.ok) setError('Fase opslaan mislukt')
    laadFull(false)
  }

  /** Mail verstuurd via Spark: server logde het contact, kop en tijdlijn bijwerken. */
  const naVerstuurdeMail = useCallback(async () => {
    const res = await fetch(`/api/crm/records/${record.id}`).catch(() => null)
    const json = await res?.json().catch(() => null)
    const item = json?.item
    if (item) {
      bewaarOpvolg({
        status: item.status,
        volgende_actie: item.volgende_actie,
        laatste_contact: item.laatste_contact,
        contact_pogingen: item.contact_pogingen,
        contact_status: item.contact_status,
        contact_status_tot: item.contact_status_tot,
      })
    }
    laadFull(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, laadFull])

  const raw = full?.raw || {}
  const tags = full?.tags || record.tags || []

  /** Beschrijving opslaan zodra je uit het veld klikt, net als een opmerking. */
  const bewaarBeschrijving = async () => {
    if (beschrijving === null || beschrijving === beschrijvingOpgeslagen) return
    const tekst = beschrijving
    setBeschrijvingStand('bezig')
    try {
      const res = await fetch(`/api/crm/records/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: tekst }),
      })
      if (!res.ok) throw new Error()
      setBeschrijvingOpgeslagen(tekst)
      setBeschrijvingStand('opgeslagen')
    } catch {
      setBeschrijvingStand('fout')
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const customFields = Object.entries(fieldEdits).map(([id, v]) => ({ id, value: v.value }))
      const res = await fetch(`/api/crm/records/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          status: currentStatus || undefined,
          // Notities worden niet meer bewerkt (opmerkingen in de activiteit vervingen ze).
          // De beschrijving slaat zichzelf op bij wegklikken; hier alleen als vangnet.
          description: beschrijving !== null && beschrijving !== beschrijvingOpgeslagen ? beschrijving : undefined,
          due_date: dueDate && dueDate !== origDueDate ? `${dueDate}T12:00:00Z` : undefined,
          custom_fields: customFields.length ? customFields : undefined,
          company_id: record.entity_type === 'lead' ? companyId || null : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Update mislukt')
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
      const res = await fetch(`/api/crm/records/${record.id}`, { method: 'DELETE' })
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

  /**
   * Per ongeluk een opdracht of factuur aangemaakt: die gaat weg en de lead of
   * opdracht waar hij uit voortkwam gaat terug naar de fase van daarvoor.
   */
  const [terugzetten, setTerugzetten] = useState(false)
  const handleTerugzetten = async () => {
    setError('')
    setTerugzetten(true)
    try {
      if (!(await zetPromotieTerug(record, melding))) return
      onDeleted()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Terugzetten mislukt')
    } finally {
      setTerugzetten(false)
    }
  }

  const promote = promoteInfo(record.entity_type, currentStatus)
  const handlePromote = async () => {
    if (!promote) return
    setPromoting(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch(`/api/crm/records/${record.id}/promote`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Promote mislukt')
      // De server sluit het bronrecord af; hier meteen meenemen zodat de kaart
      // en het bord niet nog even de oude fase laten zien.
      const afsluit = record.entity_type === 'lead' ? 'omgezet'
        : record.entity_type === 'assignment' ? 'gefactureerd'
        : null
      if (afsluit) handleStatusChange(record.id, afsluit)
      setInfo(
        record.entity_type === 'lead'
          ? 'Opdracht aangemaakt en gekoppeld. Deze lead staat nu op "Omgezet naar opdracht" en is van het bord af.'
          : `Nieuwe ${promote.targetLabel} aangemaakt en gekoppeld. Deze opdracht staat nu op "Gefactureerd".`
      )
      onSaved()
    } catch (e: any) {
      setError(e.message || 'Promote mislukt')
    } finally {
      setPromoting(false)
    }
  }

  const toonOpvolging = ['lead', 'contact', 'company'].includes(record.entity_type)
  const aanmaakDatum = fmtDate(record.clickup_date_created || record.synced_at)
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => { if (!saving && !deleting) handleSave() }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm overlay-enter" />
      <div
        className="relative w-full max-w-[1320px] h-[94dvh] sm:h-[90dvh] bg-brand-card-bg border-brand border-brand-card-border rounded-t-brand sm:rounded-brand shadow-2xl flex flex-col overflow-hidden modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Kop: fase, bedrijf, naam en opvolging in één blok */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-4 border-b border-brand-card-border/15 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <StatusPicker
                recordId={record.id}
                recordNaam={record.name}
                recordEntity={record.entity_type}
                currentStatus={currentStatus || null}
                allStatuses={allStatuses}
                onStatusChange={handleStatusChange}
              />
              {record.entity_type === 'lead' && (
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  title="Voor welk bedrijf"
                  className="text-caption text-brand-text-primary bg-white dark:bg-brand-card-bg border border-brand-card-border/15 rounded-full pl-3 pr-2 py-1 cursor-pointer hover:border-brand-lav-accent focus:outline-none focus:ring-2 focus:ring-brand-lavender-dark/60"
                >
                  <option value="">Geen bedrijf</option>
                  {COMPANIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {aanmaakDatum && (
                <span className="text-caption text-brand-text-secondary">Aangemaakt {aanmaakDatum}</span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 -mr-1.5 rounded-brand-sm text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-lavender-light/40 transition-colors shrink-0"
              aria-label="Sluiten"
            >
              <X size={20} />
            </button>
          </div>

          <textarea
            className="w-full mt-2 font-uxum text-headline text-brand-text-primary bg-transparent border-0 outline-none resize-none placeholder:text-brand-text-secondary/40 focus:bg-brand-card-bg rounded-brand-sm px-1.5 -mx-1.5 py-0.5 transition-colors"
            value={name}
            onChange={(e) => setName(e.target.value)}
            rows={1}
            style={{ fieldSizing: 'content' as any, minHeight: 40 }}
          />

          {toonOpvolging && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {record.entity_type === 'lead' && opvolgRec.contact_status !== 'blokkade' && (
                <button
                  onClick={() => setBenaderen(true)}
                  title="Eerste mail laten schrijven en klaarzetten in Spark"
                  className="inline-flex items-center gap-1.5 text-caption font-medium rounded-full px-3 py-1 bg-brand-lav-accent text-white hover:opacity-90 transition-opacity"
                >
                  <Send size={12} /> Benaderen
                </button>
              )}
              <ContactKnop record={opvolgRec} onSaved={bewaarOpvolg} />
              <OpvolgPicker record={opvolgRec} onSaved={bewaarOpvolg} />
              <ContactSamenvatting record={opvolgRec} />
              {opvolgRec.volgende_actie_notitie && (
                <span className="text-caption text-brand-text-secondary truncate">{opvolgRec.volgende_actie_notitie}</span>
              )}
            </div>
          )}

          <RelationsPanel record={record} />

          {record.entity_type === 'lead' && (
            <ReactieMelding recordId={record.id} fase={currentStatus} onInGesprek={zetInGesprek} />
          )}
        </div>

        {/* Body: werk | details | activiteit. Op kleinere schermen één scrollende kolom. */}
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px_280px]">

          {/* Werk: AI-beoordeling, beschrijving en notities */}
          <div className="lg:overflow-y-auto px-4 sm:px-6 py-5 space-y-6 min-w-0">
            {record.entity_type === 'lead' && (
              <BenaderenBlok
                recordId={record.id}
                gevraagd={benaderen}
                onSluit={() => setBenaderen(false)}
                onVerstuurd={naVerstuurdeMail}
              />
            )}

            {/* Wat de AI van deze lead vindt. Advies, verandert niets aan het bord. */}
            {record.entity_type === 'lead' && (
              <AiKwalificatieBlok
                recordId={record.id}
                record={full || record}
                onVernieuwd={() => laadFull(false)}
              />
            )}

            {loadingFull ? (
              <p className="text-caption text-brand-text-secondary flex items-center gap-1.5">
                <RefreshCw size={11} className="animate-spin" /> Laden...
              </p>
            ) : (
              <DetailSectie titel="Beschrijving">
                <textarea
                  className={`${VELD_INPUT} !text-body !p-4 resize-y min-h-[88px] leading-relaxed placeholder:text-brand-text-secondary/50`}
                  placeholder={record.entity_type === 'lead' ? 'Wat weet je van deze lead? Wie, wat zoeken ze, hoe kwam het binnen...' : 'Wat wil je hierover onthouden?'}
                  value={beschrijving ?? ''}
                  onChange={(e) => { setBeschrijving(e.target.value); setBeschrijvingStand('') }}
                  onBlur={bewaarBeschrijving}
                  rows={3}
                  style={{ fieldSizing: 'content' as any }}
                />
                <p className={`text-[11px] mt-1 h-4 ${beschrijvingStand === 'fout' ? 'text-brand-status-red' : 'text-brand-text-secondary'}`}>
                  {beschrijvingStand === 'bezig' && 'Opslaan...'}
                  {beschrijvingStand === 'opgeslagen' && 'Opgeslagen'}
                  {beschrijvingStand === 'fout' && 'Opslaan mislukt, klik Opslaan onderaan om het nog eens te proberen'}
                </p>
              </DetailSectie>
            )}

            {/* Het grote Notities-veld is vervangen door opmerkingen in de kolom
                Activiteit. Staat er bij een oud record nog iets in, dan blijft
                het hier leesbaar. */}
            {notes.trim() && (
              <DetailSectie titel="Oude notities">
                <p className="text-body text-brand-text-secondary whitespace-pre-wrap">{notes}</p>
              </DetailSectie>
            )}
          </div>

          {/* Details: status van contact, relaties, velden en uren */}
          <div className="lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-brand-card-border/15 bg-brand-lavender-light/50 px-4 sm:px-5 py-5 space-y-6">
            {toonOpvolging && (
              // Bij leads kies je pauze en blokkade via de fase; hier alleen de details
              <ContactStatusBlok
                record={{ ...opvolgRec, status: currentStatus }}
                onSaved={bewaarOpvolg}
                volgtFase={record.entity_type === 'lead'}
              />
            )}

            {record.entity_type === 'lead' && (
              <DetailSectie titel="Mailadres">
                <MailAdresKiezer recordId={record.id} />
              </DetailSectie>
            )}

            <DetailSectie titel="Deadline">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={VELD_INPUT}
              />
            </DetailSectie>

            <EditableFieldsPanel
              src={full ?? record}
              entity={record.entity_type}
              edits={fieldEdits}
              onEdit={(fieldId, value) => setFieldEdits((prev) => ({ ...prev, [fieldId]: { value } }))}
            />

            {/* Uren- en factuurkant van het bedrijf. Verving de pagina Klanten. */}
            {record.entity_type === 'company' && (
              <DetailSectie titel="Urenregistratie en facturatie">
                <UrenKlantBlok recordId={record.id} recordNaam={record.name} />
              </DetailSectie>
            )}

            {/* Eigen tags (Notion-stijl, alleen bij bedrijven) */}
            {record.entity_type === 'company' && (
              <DetailSectie titel="Tags">
                <InlineTags record={full || record} variant="block" />
              </DetailSectie>
            )}

            {/* Branchelabels uit de oude import (alleen-lezen) */}
            {tags.length > 0 && (
              <DetailSectie titel="Branche (oud label)">
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag, i) => (
                    <span key={i} className="pill bg-brand-lavender-light/60">{tag.name || 'tag'}</span>
                  ))}
                </div>
              </DetailSectie>
            )}
          </div>

          {/* Activiteit: vanaf xl een eigen kolom, daaronder onderaan de details */}
          <div className="lg:col-span-2 xl:col-span-1 lg:overflow-y-auto border-t xl:border-t-0 xl:border-l border-brand-card-border/15 px-4 sm:px-5 py-5">
            <ActivityFeed record={record} />
          </div>
        </div>

        {/* Voet */}
        <div className="px-4 sm:px-6 py-3 border-t border-brand-card-border/15 flex items-center justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            {error && <p className="text-caption text-brand-status-red truncate">{error}</p>}
            {!error && info && <p className="text-caption text-brand-status-green truncate">{info}</p>}
          </div>
          {promote && (
            <button onClick={handlePromote} disabled={promoting} className="btn-secondary text-sm disabled:opacity-60">
              <ArrowRight size={13} /> {promoting ? 'Bezig...' : promote.label}
            </button>
          )}
          {kanTerugzetten(record) && (
            <button
              onClick={handleTerugzetten}
              disabled={terugzetten}
              title="Per ongeluk aangemaakt? Verwijdert dit record en zet de vorige stap terug."
              className="btn-secondary text-sm disabled:opacity-60"
            >
              <Undo2 size={13} /> {terugzetten ? 'Bezig...' : 'Terugzetten'}
            </button>
          )}
          <button
            onClick={handleDelete}
            className="text-sm font-medium text-brand-status-red px-3 py-2 rounded-brand-btn hover:bg-brand-pink/60 transition-colors flex items-center gap-2 disabled:opacity-60"
            disabled={deleting}
          >
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

/** Kopje plus inhoud in de detailkaart, overal dezelfde opmaak. */
function DetailSectie({ titel, actie, children }: { titel: string; actie?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-caption font-semibold uppercase tracking-wide text-brand-text-secondary">{titel}</h3>
        {actie}
      </div>
      {children}
    </section>
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
  const { scope } = useActiveCompany()
  const [name, setName] = useState('')
  const [status, setStatus] = useState(initialStatus || '')
  const [description, setDescription] = useState('')
  // Binnen WGB of Daley Photography hoort een nieuwe lead vanzelf bij dat
  // bedrijf; onder The Daley Edit kies je het zelf, met TDE als standaard.
  const [companyId, setCompanyId] = useState<string>(scope === 'alle' ? 'tde' : scope)
  const [koppelingen, setKoppelingen] = useState<CrmRecord[]>([])
  const [zoekerOpen, setZoekerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [waarschuwing, setWaarschuwing] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) { setError('Naam is verplicht'); return }
    setSaving(true)
    setError('')
    setWaarschuwing('')
    try {
      const res = await fetch('/api/crm/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entity,
          name: name.trim(),
          status: status || undefined,
          description: description || undefined,
          company_id: entity === 'lead' ? companyId || null : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Aanmaken mislukt')

      // Het record staat er; koppelingen zijn extra. Loopt er eentje mis, dan
      // melden we dat maar gooien we het nieuwe record niet weg.
      const mislukt: string[] = []
      for (const doel of koppelingen) {
        try {
          await koppelRecords(json.item, doel)
        } catch {
          mislukt.push(doel.name)
        }
      }
      if (mislukt.length) {
        setWaarschuwing(`Aangemaakt, maar niet gekoppeld aan: ${mislukt.join(', ')}`)
        onCreated()
        return
      }
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
            <input className={VELD_INPUT} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-brand-text-secondary block mb-1">Status</label>
            {statusOptions.length > 0 ? (
              <select className={VELD_INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">(standaard)</option>
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input className={VELD_INPUT} value={status} onChange={(e) => setStatus(e.target.value)} placeholder="bijv. nieuwe kans" />
            )}
          </div>
          {entity === 'lead' && (
            <div>
              <label className="text-xs text-brand-text-secondary block mb-1">Voor welk bedrijf</label>
              <select className={VELD_INPUT} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">Geen bedrijf</option>
                {COMPANIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-brand-text-secondary block mb-1">Beschrijving</label>
            <textarea className={`${VELD_INPUT} min-h-[80px]`} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* Meteen koppelen: een bedrijf hoort vaak al bij een lead (kans) */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <label className="text-xs text-brand-text-secondary">Koppelen aan</label>
              <button
                type="button"
                onClick={() => setZoekerOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
              >
                {zoekerOpen ? <X size={12} /> : <Plus size={12} />} {zoekerOpen ? 'Sluiten' : 'Record zoeken'}
              </button>
            </div>
            {koppelingen.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {koppelingen.map((k) => (
                  <span key={k.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-700">
                    <StatusIcon status={k.status || null} size={9} />
                    <span className="truncate max-w-[160px]">{k.name}</span>
                    <button
                      type="button"
                      onClick={() => setKoppelingen((prev) => prev.filter((p) => p.id !== k.id))}
                      className="text-indigo-400 hover:text-red-500"
                      title="Weghalen"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {zoekerOpen && (
              <div className="p-3 rounded-lg border border-gray-200 bg-white">
                <RecordZoeker
                  standaardType={standaardKoppelType(entity)}
                  gekozenIds={koppelingen.map((k) => k.id)}
                  standaardNaam={name}
                  onKies={(r) => setKoppelingen((prev) => (prev.some((p) => p.id === r.id) ? prev : [...prev, r]))}
                />
              </div>
            )}
            {koppelingen.length === 0 && !zoekerOpen && (
              <p className="text-[11px] text-brand-text-secondary italic">Nog niets gekoppeld</p>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {waarschuwing && <p className="text-xs text-amber-600">{waarschuwing}</p>}
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

export default function CrmRecordsPage({ entity }: { entity: EntityType }) {
  const { scope, scopeGeladen } = useActiveCompany()
  const searchParams = useSearchParams()
  const openParam = searchParams.get('open') // naam van het record om direct te openen

  const [items, setItems] = useState<CrmRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [adressenBezig, setAdressenBezig] = useState(false)
  const melding = useMelding()
  const [loadError, setLoadError] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [detailRecord, setDetailRecord] = useState<CrmRecord | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createStatus, setCreateStatus] = useState<string | undefined>(undefined)
  const [klantMap, setKlantMap] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  /** Record dat via de prullenbak op de regel verwijderd wordt. */
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const autoOpenedRef = useRef(false)

  // ── Notion-stijl tags (eigen tagging in de Dash) ───────────────────
  const [tagCatalog, setTagCatalog] = useState<DashTag[]>([])

  useEffect(() => {
    fetch('/api/crm/tags')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setTagCatalog(data) })
      .catch(() => {})
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
    fetch(`/api/crm/records/${recordId}`, {
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
    // Vaste volgorde plus wat verder nog in de data voorkomt
    const present = items.map((i) => i.status).filter(Boolean) as string[]
    return statusOrderFor(entity, present)
  }, [items, entity])

  const handleStatusChange = (id: string, status: string) => {
    setItems((prev) => prev.map((item) => {
      if (item.id !== id) return item
      // Leads: On hold en Blocklist nemen de contactstatus mee, net als de server.
      const velden = item.entity_type === 'lead' ? contactVeldenBijFase(status, item) : null
      return { ...item, status, ...(velden || {}) }
    }))
  }

  /** Opvolgvelden bijwerken in de lijst zonder opnieuw te laden. */
  const applyOpvolgPatch = useCallback((id: string, patch: Partial<CrmRecord>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  /** Fase wijzigen vanaf het bord (slepen of snelknop): direct opslaan. */
  const verplaatsNaarFase = useCallback(async (id: string, status: string) => {
    const huidige = items.find((i) => i.id === id)
    if (!huidige || (huidige.status || '') === status) return
    // Slepen naar Archief of Blocklist stelt dezelfde vragen als de statuskiezer
    const extra = await vraagFaseVelden(melding, id, huidige.name, status, huidige.entity_type)
    if (extra === null) return
    // Een lead naar On hold of Blocklist slepen pauzeert of blokkeert hem, en
    // eruit slepen maakt hem weer benaderbaar. Dat bepaalt ook de opvolging.
    const velden = huidige.entity_type === 'lead' ? contactVeldenBijFase(status, huidige) : null
    const naSlepen = { ...huidige, ...(velden || {}) }
    // Nieuwe fase betekent een nieuwe standaard opvolgdatum, tenzij je er zelf
    // al een had. Geblokkeerd of in pauze krijgt nooit een actie.
    const nieuweActie = velden && velden.volgende_actie !== undefined
      ? velden.volgende_actie
      : contactStand(naSlepen) !== 'open'
        ? huidige.volgende_actie ?? null
        : huidige.volgende_actie || standaardOpvolgdatum(status)
    setItems((prev) => prev.map((item) =>
      item.id === id ? { ...naSlepen, ...extra, status, volgende_actie: nieuweActie } : item))
    try {
      await fetch(`/api/crm/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, volgende_actie: nieuweActie, ...extra }),
      })
    } catch {
      setMessage('Fase wijzigen mislukt')
    }
  }, [items, melding])

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
        fetch(`/api/crm/records/${id}`, {
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
      await load({ stil: true })
    } finally {
      setBulkBusy(false)
    }
  }

  // Eén record verwijderen, rechtstreeks vanuit de lijst. Zelfde route als de
  // detailkaart en de bulkactie, alleen zonder eerst een kaart te openen.
  const deleteRecord = async (record: CrmRecord) => {
    if (deletingId) return
    if (!confirm(`"${record.name}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    setDeletingId(record.id)
    setMessage('')
    try {
      const res = await fetch(`/api/crm/records/${record.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Verwijderen mislukt')
      setSelected((prev) => { if (!prev.has(record.id)) return prev; const next = new Set(prev); next.delete(record.id); return next })
      if (detailRecord?.id === record.id) setDetailRecord(null)
      setMessage(`"${record.name}" verwijderd`)
      // Eerst uit de lijst halen, dan pas stil bijwerken: zo blijft de pagina
      // staan waar hij stond in plaats van terug te springen naar boven.
      setItems((prev) => prev.filter((r) => r.id !== record.id))
      await load({ stil: true })
    } catch (e: any) {
      setMessage(`Verwijderen mislukt: ${e?.message || 'onbekende fout'}`)
    } finally {
      setDeletingId(null)
    }
  }

  const terugzettenVanBord = async (record: CrmRecord) => {
    try {
      if (!(await zetPromotieTerug(record, melding))) return
      setItems((prev) => prev.filter((r) => r.id !== record.id))
      await load({ stil: true })
    } catch (e: any) {
      melding.fout(e?.message || 'Terugzetten mislukt')
    }
  }

  // Alleen opdrachten en facturen kunnen terug; de knop telt alleen die mee.
  const selectieTerug = items.filter((r) => selected.has(r.id) && kanTerugzetten(r))

  const bulkTerugzetten = async () => {
    if (selectieTerug.length === 0) return
    const soort = selectieTerug[0].entity_type === 'assignment' ? 'opdracht' : 'factuur'
    const meer = selectieTerug.length === 1 ? `"${selectieTerug[0].name}"` : `${selectieTerug.length} ${soort === 'opdracht' ? 'opdrachten' : 'facturen'}`
    const akkoord = await melding.bevestig({
      titel: `${meer} terugzetten?`,
      tekst: `${selectieTerug.length === 1 ? `Deze ${soort} wordt` : 'Ze worden'} verwijderd, en ${soort === 'opdracht' ? 'de lead' : 'de opdracht'} waar ${selectieTerug.length === 1 ? 'hij' : 'ze'} uit voortkwam${selectieTerug.length === 1 ? '' : 'en'} gaat terug naar de fase van daarvoor.\n\nDit kan niet ongedaan worden gemaakt.`,
      bevestigLabel: 'Terugzetten',
      gevaarlijk: true,
    })
    if (!akkoord) return
    setBulkBusy(true)
    setMessage('')
    // Na elkaar, niet tegelijk: twee opdrachten uit dezelfde lead zouden anders
    // allebei tegelijk de fase van die lead terugzetten.
    const gelukt: string[] = []
    const fouten: string[] = []
    for (const r of selectieTerug) {
      try {
        await terugzettenApi(r.id)
        gelukt.push(r.id)
      } catch (e: any) {
        fouten.push(`${r.name}: ${e?.message || 'mislukt'}`)
      }
    }
    if (fouten.length) melding.fout(`Terugzetten mislukt bij ${fouten.join(', ')}`)
    if (gelukt.length) melding.gelukt(gelukt.length === 1 ? 'Teruggezet' : `${gelukt.length} teruggezet`)
    setSelected(new Set())
    setItems((prev) => prev.filter((r) => !gelukt.includes(r.id)))
    await load({ stil: true })
    setBulkBusy(false)
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`${selected.size} records verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    setBulkBusy(true)
    setMessage('')
    const ids = Array.from(selected)
    try {
      const results = await Promise.allSettled(ids.map((id) =>
        fetch(`/api/crm/records/${id}`, { method: 'DELETE' })
          .then((r) => { if (!r.ok) throw new Error() })
      ))
      const failed = results.filter((r) => r.status === 'rejected').length
      setMessage(failed
        ? `${ids.length - failed} records verwijderd, ${failed} mislukt`
        : `${ids.length} records verwijderd`)
      setSelected(new Set())
      const gelukt = ids.filter((_, i) => results[i].status === 'fulfilled')
      setItems((prev) => prev.filter((r) => !gelukt.includes(r.id)))
      await load({ stil: true })
    } finally {
      setBulkBusy(false)
    }
  }

  // Lopende leads zonder mailadres: die kun je niet mailen en hun mail is niet
  // aan ze te koppelen. Dit getal staat op de knop.
  const zonderAdres = useMemo(() => {
    if (entity !== 'lead') return 0
    const lopend = ['nieuwe kans', 'benaderd', 'in gesprek', 'offerte uit', 'later opvolgen', 'on hold']
    return items.filter((i) =>
      lopend.includes(String(i.status || '').toLowerCase()) &&
      contactStand(i) !== 'blokkade' &&
      !i.ruwe_contact_email
    ).length
  }, [items, entity])

  // Zolang de zoeker draait de lijst stil bijwerken, dan druppelen de adressen binnen
  useEffect(() => {
    const draait = items.some((i) => i.ruwe_contact_status === 'bezig' || i.ruwe_contact_status === 'wachtend')
    if (!draait) return
    const timer = setInterval(() => load({ stil: true }), 8000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  /**
   * Zoekt bij leads zonder mailadres of nummer de contactgegevens op, met
   * dezelfde AI-zoeker als bij prospects. Zonder adres kan de Dash geen mail
   * versturen en geen verzonden mail of reactie bij een lead leggen.
   */
  const zoekAdressen = async () => {
    setAdressenBezig(true)
    setMessage('')
    try {
      const res = await fetch('/api/crm/leads/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alleOnvolledige: true, entity: 'lead', limiet: 10 }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Opzoeken kon niet worden gestart')
      setMessage(json.ingepland
        ? `${json.ingepland} ${json.ingepland === 1 ? 'lead' : 'leads'} in de rij gezet. De gegevens komen er vanzelf bij te staan.`
        : 'Alle lopende leads hebben al een mailadres en een nummer.')
    } catch (e: any) {
      setMessage(e?.message || 'Opzoeken kon niet worden gestart')
    } finally {
      setAdressenBezig(false)
    }
  }

  /**
   * Haalt de records op. `stil` laat het laadscherm achterwege: dan blijft de
   * lijst gewoon staan en houd je je plek op de pagina. Dat gebruiken we na een
   * wijziging of verwijdering, want het laadscherm vervangt de hele lijst en
   * gooide je daarmee terug naar boven.
   */
  const load = async ({ stil = false }: { stil?: boolean } = {}) => {
    if (!stil) setLoading(true)
    if (!stil) setMessage('')
    setLoadError(false)
    try {
      // De API filtert alleen leads en prospects op bedrijf; voor de andere
      // entiteiten wordt de parameter genegeerd.
      const bedrijf = scope === 'alle' ? '' : `&company=${scope}`
      const res = await fetch(`/api/crm/records?entity=${entity}&limit=500${bedrijf}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kon records niet laden')
      setItems(Array.isArray(json.items) ? json.items : [])
      if (!stil) setSelected(new Set())
    } catch (e: any) {
      setMessage(e.message || 'Kon records niet laden')
      setLoadError(true)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Wachten tot het gekozen bedrijf bekend is, anders laad je eerst alles
    if (!scopeGeladen) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, scope, scopeGeladen])

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
    // Met archief: ook een bedrijf dat niet (meer) tussen de urentabs staat
    // heeft een klantnummer
    fetch('/api/uren-klanten?archief=1')
      .then(r => r.json())
      .then((klanten: any[]) => {
        const map = new Map<string, string>()
        for (const k of klanten) {
          if (!k.klantnummer) continue
          if (k.crmRecordId) map.set(`id:${k.crmRecordId}`, k.klantnummer)
          else if (k.naam) map.set(k.naam.toLowerCase().trim(), k.klantnummer)
        }
        setKlantMap(map)
      })
      .catch(() => {})
  }, [])

  return (
    <FieldOptionsProvider>
    <DashTagsProvider value={{ catalog: tagCatalog, createTag, setRecordTags, updateTag, deleteTag }}>
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6 lg:h-[calc(100dvh-var(--dash-topbar))] lg:overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap shrink-0">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">{titleFor(entity)}</h1>
          <p className="text-body text-brand-text-secondary mt-1">{items.length} records</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {entity === 'lead' && (
            <button
              onClick={zoekAdressen}
              disabled={adressenBezig || zonderAdres === 0}
              title="Zoekt website, contactpersoon, mailadres en telefoonnummer op bij lopende leads die die missen."
              className="btn-secondary text-sm disabled:opacity-50"
            >
              <Search size={13} className={adressenBezig ? 'animate-pulse' : ''} />
              {adressenBezig ? 'Bezig...' : `Mailadressen zoeken${zonderAdres ? ` (${zonderAdres})` : ''}`}
            </button>
          )}
          <button onClick={() => load()} className="btn-secondary text-sm" disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Ververs
          </button>
          <button onClick={() => { setCreateStatus(undefined); setShowCreate(true) }} className="btn-primary text-sm">
            <Plus size={13} /> Nieuw
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
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
        <div className="flex items-center gap-3 flex-wrap bg-brand-text-primary text-white rounded-brand px-4 py-2.5 shadow-lg shrink-0">
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
          {selectieTerug.length > 0 && (
            <button
              onClick={bulkTerugzetten}
              disabled={bulkBusy}
              title="Per ongeluk aangemaakt? Verwijdert dit record en zet de vorige stap terug."
              className="inline-flex items-center gap-1.5 text-sm text-white/90 hover:text-white disabled:opacity-50"
            >
              <Undo2 size={13} /> Terugzetten
            </button>
          )}
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

      {/* Opvolging: alles wat vandaag of eerder aan de beurt is */}
      {entity === 'lead' && !loading && !loadError && (
        <VandaagBlok
          items={items}
          onOpvolgPatch={applyOpvolgPatch}
          onCardClick={setDetailRecord}
        />
      )}

      {/* Content */}
      <div className="card p-0 overflow-hidden lg:flex-1 lg:min-h-0 lg:overflow-auto">
        {loading ? (
          <div className="text-center py-16 text-brand-text-secondary text-sm">
            <RefreshCw size={16} className="animate-spin inline mr-2" /> Laden…
          </div>
        ) : loadError ? (
          <div className="text-center py-16">
            <p className="text-sm text-red-500 mb-3">Records laden mislukt.</p>
            <button onClick={() => load()} className="btn-secondary text-sm">
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
            onDelete={deleteRecord}
            deletingId={deletingId}
          />
        ) : (
          <div className="p-5">
            <BoardView
              items={visibleItems}
              entity={entity}
              allStatuses={allStatuses}
              onStatusChange={handleStatusChange}
              onCardClick={setDetailRecord}
              onOpvolgPatch={applyOpvolgPatch}
              onFaseChange={entity === 'lead' ? verplaatsNaarFase : undefined}
              onTerugzetten={terugzettenVanBord}
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
          onDeleted={() => {
            setItems((prev) => prev.filter((r) => r.id !== detailRecord.id))
            setDetailRecord(null)
            load({ stil: true })
          }}
          onOpvolgPatch={applyOpvolgPatch}
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
