'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface SyncOverview {
  state: any
  recentRuns: any[]
  recordCounts: Record<string, number>
  error?: string
}

function fmt(dt?: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('nl-NL')
}

export default function CrmSyncPage() {
  const [data, setData] = useState<SyncOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/integrations/clickup/sync', { cache: 'no-store' })
      const json = await res.json()
      setData(json)
      if (!res.ok) setMessage(json.error || 'Kon sync-status niet laden')
    } catch {
      setMessage('Kon sync-status niet laden')
    } finally {
      setLoading(false)
    }
  }

  const runManualSync = async () => {
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
  }, [])

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">CRM Sync (ClickUp)</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            Webhooks + Vercel cron (15 min) voor leads, bedrijven en contacten.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Ververs
          </button>
          <button onClick={runManualSync} className="btn-primary" disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncen…' : 'Nu syncen'}
          </button>
        </div>
      </div>

      {message && (
        <div className="card">
          <p className="text-body">{message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Daley Jansen's List</p>
          <p className="font-uxum text-stat text-brand-text-primary">{data?.recordCounts?.daley_list ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Leads (gesynct)</p>
          <p className="font-uxum text-stat text-brand-text-primary">{data?.recordCounts?.lead ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Bedrijven (gesynct)</p>
          <p className="font-uxum text-stat text-brand-text-primary">{data?.recordCounts?.company ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Contacten (gesynct)</p>
          <p className="font-uxum text-stat text-brand-text-primary">{data?.recordCounts?.contact ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Opdrachten (ClickUp)</p>
          <p className="font-uxum text-stat text-brand-text-primary">{data?.recordCounts?.assignment ?? 0}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Facturen (ClickUp)</p>
          <p className="font-uxum text-stat text-brand-text-primary">{data?.recordCounts?.clickup_invoice ?? 0}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-body mb-4">Sync status</h2>
        <dl className="space-y-2 text-body">
          <div className="flex justify-between gap-6">
            <dt className="text-brand-text-secondary">Laatste succesvolle sync</dt>
            <dd>{fmt(data?.state?.last_successful_sync_at)}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-brand-text-secondary">Laatste volledige sync</dt>
            <dd>{fmt(data?.state?.last_full_sync_at)}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-brand-text-secondary">Laatste webhook</dt>
            <dd>{fmt(data?.state?.last_webhook_at)}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-brand-text-secondary">Laatste fout</dt>
            <dd className="text-right max-w-[60%] break-words">{data?.state?.last_error || '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-brand-page-medium">
          <h2 className="font-semibold text-body">Recente sync runs</h2>
        </div>
        <table className="w-full text-body">
          <thead className="bg-brand-page-light border-b border-brand-page-medium">
            <tr>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Bron</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Status</th>
              <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Records</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Start</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Einde</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-page-medium">
            {!data?.recentRuns?.length ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-brand-text-secondary">
                  Nog geen sync runs zichtbaar
                </td>
              </tr>
            ) : data.recentRuns.map((run) => (
              <tr key={run.id}>
                <td className="px-5 py-3.5 font-semibold">{run.source}</td>
                <td className="px-5 py-3.5">{run.status}</td>
                <td className="px-5 py-3.5 text-right">{run?.counts?.tasksUpserted ?? 0}</td>
                <td className="px-5 py-3.5 text-brand-text-secondary">{fmt(run.started_at)}</td>
                <td className="px-5 py-3.5 text-brand-text-secondary">{fmt(run.ended_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="font-semibold text-body mb-2">Vereiste instellingen (Vercel)</h2>
        <ul className="text-body text-brand-text-secondary space-y-1">
          <li><code>CLICKUP_API_KEY</code></li>
          <li><code>SUPABASE_SERVICE_ROLE_KEY</code></li>
          <li><code>CLICKUP_DALEY_LIST_ID</code></li>
          <li><code>CLICKUP_LEADS_LIST_ID</code></li>
          <li><code>CLICKUP_COMPANIES_LIST_ID</code></li>
          <li><code>CLICKUP_CONTACTS_LIST_ID</code></li>
          <li><code>CLICKUP_ASSIGNMENTS_LIST_ID</code></li>
          <li><code>CLICKUP_INVOICES_LIST_ID</code></li>
          <li><code>CRON_SECRET</code> (aanrader)</li>
          <li><code>CLICKUP_WEBHOOK_SECRET</code> (aanrader)</li>
        </ul>
      </div>
    </div>
  )
}
