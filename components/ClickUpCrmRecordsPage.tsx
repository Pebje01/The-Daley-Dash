'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, RefreshCw, Search } from 'lucide-react'

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
  assignees?: Array<{ id?: string | number; username?: string; email?: string }>
  tags?: Array<{ name?: string; tag_fg?: string; tag_bg?: string }>
  custom_fields?: Array<any>
  due_date?: string | null
  clickup_date_updated?: string | null
  synced_at?: string | null
}

function fmtDate(input?: string | null) {
  if (!input) return '—'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('nl-NL')
}

function normalizeCustomFieldValue(field: any): string | null {
  const value = field?.value
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nee'
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ')

  // ClickUp dropdown-ish values often store IDs, so fall back to label if present.
  if (typeof value === 'object') {
    if (value.name) return String(value.name)
    if (value.label) return String(value.label)
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

function fieldPreview(fields?: any[]) {
  if (!Array.isArray(fields) || fields.length === 0) return []
  return fields
    .map((f) => {
      const label = f?.name || f?.type || 'Veld'
      const value = normalizeCustomFieldValue(f)
      if (!value) return null
      return { label, value }
    })
    .filter(Boolean)
    .slice(0, 3) as Array<{ label: string; value: string }>
}

function titleFor(entity: EntityType) {
  if (entity === 'daley_list') return "Daley Jansen's List (ClickUp)"
  if (entity === 'lead') return 'Leads'
  if (entity === 'company') return 'Bedrijven'
  if (entity === 'assignment') return 'Opdrachten (ClickUp)'
  if (entity === 'clickup_invoice') return 'Facturatie (ClickUp)'
  return 'Contacten'
}

function descriptionFor(entity: EntityType) {
  if (entity === 'daley_list') return "Gesynchroniseerde records uit 'Daley Jansen's List' in read-only weergave."
  if (entity === 'lead') return 'Gesynchroniseerde ClickUp leads (kansen) in read-only weergave.'
  if (entity === 'company') return 'Gesynchroniseerde ClickUp bedrijven in read-only weergave.'
  if (entity === 'assignment') return 'Gesynchroniseerde ClickUp opdrachten in read-only weergave.'
  if (entity === 'clickup_invoice') return 'Gesynchroniseerde ClickUp facturatie in read-only weergave (los van je interne facturenmodule).'
  return 'Gesynchroniseerde ClickUp contacten in read-only weergave.'
}

export default function ClickUpCrmRecordsPage({ entity }: { entity: EntityType }) {
  const [items, setItems] = useState<CrmRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  const visibleItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      (item.status || '').toLowerCase().includes(q) ||
      fieldPreview(item.custom_fields).some((f) =>
        `${f.label} ${f.value}`.toLowerCase().includes(q)
      )
    )
  }, [items, search])

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch(`/api/integrations/clickup/records?entity=${entity}`, { cache: 'no-store' })
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

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">{titleFor(entity)}</h1>
          <p className="text-body text-brand-text-secondary mt-1">{descriptionFor(entity)}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/crm-sync" className="btn-secondary">
            CRM Sync
          </Link>
          <button onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Ververs
          </button>
          <button onClick={runSync} className="btn-primary" disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncen…' : 'Nu syncen'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Records</p>
          <p className="font-uxum text-stat text-brand-text-primary">{items.length}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Actief</p>
          <p className="font-uxum text-stat text-brand-text-primary">{items.filter((i) => i.active !== false && !i.archived).length}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Gearchiveerd</p>
          <p className="font-uxum text-stat text-brand-text-primary">{items.filter((i) => i.archived).length}</p>
        </div>
      </div>

      <div className="card">
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary" />
          <input
            className="input pl-8"
            placeholder={`Zoek in ${titleFor(entity).toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {message && <p className="text-caption text-brand-text-secondary mt-3">{message}</p>}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-body">
          <thead className="bg-brand-page-light border-b border-brand-page-medium">
            <tr>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Naam</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Status</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Gegevens</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Tags</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Assignee</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Laatst gewijzigd</th>
              <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-page-medium">
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-brand-text-secondary">
                  <RefreshCw size={16} className="animate-spin inline mr-2" /> Laden…
                </td>
              </tr>
            ) : visibleItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-brand-text-secondary">
                  Nog geen records gevonden. Controleer je ClickUp list IDs en voer een sync uit.
                </td>
              </tr>
            ) : visibleItems.map((item) => {
              const previews = fieldPreview(item.custom_fields)
              const assignee = item.assignees?.[0]
              return (
                <tr key={item.id} className="hover:bg-brand-page-light transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-brand-text-primary">{item.name}</div>
                    <div className="text-caption text-brand-text-secondary">
                      {item.clickup_task_id}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="pill bg-brand-lavender-accent">{item.status || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {previews.length === 0 ? (
                      <span className="text-brand-text-secondary">—</span>
                    ) : (
                      <div className="space-y-1">
                        {previews.map((p) => (
                          <div key={`${item.id}-${p.label}`} className="text-caption">
                            <span className="text-brand-text-secondary">{p.label}: </span>
                            <span className="text-brand-text-primary">{p.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {item.tags?.length ? (
                      <div className="flex gap-1 flex-wrap">
                        {item.tags.slice(0, 3).map((tag, idx) => (
                          <span key={`${item.id}-tag-${idx}`} className="text-pill px-2 py-0.5 rounded font-semibold border border-brand-card-border/20">
                            {tag.name || 'tag'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-brand-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-brand-text-secondary">
                    {assignee?.username || assignee?.email || '—'}
                  </td>
                  <td className="px-5 py-3.5 text-brand-text-secondary">
                    {fmtDate(item.clickup_date_updated || item.synced_at)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener"
                        className="btn-secondary py-1.5 px-2.5 inline-flex"
                        title="Open in ClickUp"
                      >
                        <ExternalLink size={13} />
                      </a>
                    ) : (
                      <span className="text-brand-text-secondary">—</span>
                    )}
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
