'use client'
import { useState } from 'react'
import { RefreshCw, Check } from 'lucide-react'
import { dataChanged } from '@/lib/events'

type SyncState = 'idle' | 'scanning' | 'importing' | 'done' | 'error'

interface SyncResult {
  imported: number
  skipped: number
  failed: number
  removedFacturen: number
  removedOffertes: number
}

interface SyncAllesKnopProps {
  onRefresh?: () => void
}

export default function SyncAllesKnop({ onRefresh }: SyncAllesKnopProps) {
  const [state, setState] = useState<SyncState>('idle')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState<SyncResult | null>(null)

  const handleSync = async () => {
    setState('scanning')
    setResult(null)
    setProgress({ current: 0, total: 0 })

    // Altijd de localFileMap verversen + Supabase data herladen
    onRefresh?.()

    try {
      const res = await fetch('/api/admin/sync', { method: 'POST' })
      if (!res.ok || !res.body) {
        setState('done')
        setResult({ imported: 0, skipped: 0, failed: 0, removedFacturen: 0, removedOffertes: 0 })
        onRefresh?.()
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            if (msg.type === 'scan') {
              setState('importing')
              setProgress({ current: 0, total: msg.total })
              if (msg.total === 0) {
                setResult({
                  imported: 0,
                  skipped: 0,
                  failed: msg.removed?.failed ?? 0,
                  removedFacturen: msg.removed?.facturen ?? 0,
                  removedOffertes: msg.removed?.offertes ?? 0,
                })
                setState('done')
              }
            } else if (msg.type === 'progress') {
              setProgress({ current: msg.current, total: msg.total })
            } else if (msg.type === 'done') {
              const r = {
                imported: msg.imported ?? 0,
                skipped: msg.skipped ?? 0,
                failed: msg.failed ?? 0,
                removedFacturen: msg.removed?.facturen ?? 0,
                removedOffertes: msg.removed?.offertes ?? 0,
              }
              setResult(r)
              if (r.imported > 0 || r.removedFacturen > 0) {
                dataChanged('facturen')
              }
              if (r.imported > 0 || r.removedOffertes > 0) {
                dataChanged('offertes')
              }
              setState('done')
            } else if (msg.type === 'error') {
              setState('done')
            }
          } catch {
            // parse error, skip line
          }
        }
      }
    } catch {
      // Bij netwerk/systeemfout toch "done" tonen (niet blokkeren)
      setState('done')
    } finally {
      onRefresh?.()
    }
  }

  const reset = () => {
    setState('idle')
    setResult(null)
  }

  if (state === 'scanning') {
    return (
      <button disabled className="btn-secondary px-3 flex items-center gap-1.5 opacity-75">
        <RefreshCw size={14} className="animate-spin" />
        <span className="text-caption">Scannen...</span>
      </button>
    )
  }

  if (state === 'importing') {
    return (
      <button disabled className="btn-secondary px-3 flex items-center gap-1.5 opacity-75">
        <RefreshCw size={14} className="animate-spin" />
        <span className="text-caption">
          {progress.total > 0 ? `${progress.current} / ${progress.total}` : 'Verwerken...'}
        </span>
      </button>
    )
  }

  if (state === 'done') {
    const removedTotal = result ? result.removedFacturen + result.removedOffertes : 0
    const label = result && result.imported > 0
      ? `${result.imported} nieuw`
      : removedTotal > 0
        ? `${removedTotal} weg`
        : 'Actueel'
    const tooltip = result
      ? `${result.imported} geïmporteerd, ${result.skipped} al aanwezig, ${removedTotal} verwijderd${result.failed > 0 ? `, ${result.failed} mislukt` : ''}`
      : ''
    return (
      <button
        onClick={reset}
        className="btn-secondary px-3 flex items-center gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
        title={tooltip}
      >
        <Check size={14} />
        <span className="text-caption">{label}</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleSync}
      className="btn-secondary px-3 flex items-center gap-1.5"
      title="Sync bestanden — herlaad lokale bestanden en importeer nieuwe PDFs"
    >
      <RefreshCw size={14} />
      <span className="text-caption">Sync bestanden</span>
    </button>
  )
}
