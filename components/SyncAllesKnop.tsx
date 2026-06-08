'use client'
import { useState } from 'react'
import { RefreshCw, Check, AlertCircle } from 'lucide-react'
import { dataChanged } from '@/lib/events'

type SyncState = 'idle' | 'scanning' | 'importing' | 'done' | 'error'

interface SyncResult {
  imported: number
  skipped: number
  failed: number
}

export default function SyncAllesKnop() {
  const [state, setState] = useState<SyncState>('idle')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState<SyncResult | null>(null)

  const handleSync = async () => {
    setState('scanning')
    setResult(null)
    setProgress({ current: 0, total: 0 })

    try {
      const res = await fetch('/api/admin/sync', { method: 'POST' })
      if (!res.ok || !res.body) { setState('error'); return }

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
                setResult({ imported: 0, skipped: 0, failed: 0 })
                setState('done')
              }
            } else if (msg.type === 'progress') {
              setProgress({ current: msg.current, total: msg.total })
            } else if (msg.type === 'done') {
              setResult({ imported: msg.imported, skipped: msg.skipped, failed: msg.failed })
              if (msg.imported > 0) {
                dataChanged('facturen')
                dataChanged('offertes')
              }
              setState(msg.failed > 0 && msg.imported === 0 ? 'error' : 'done')
            } else if (msg.type === 'error') {
              setState('error')
            }
          } catch {
            // parse error, skip line
          }
        }
      }
    } catch {
      setState('error')
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
    return (
      <button
        onClick={reset}
        className="btn-secondary px-3 flex items-center gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
        title={result ? `${result.imported} geïmporteerd, ${result.skipped} al aanwezig, ${result.failed} mislukt` : ''}
      >
        <Check size={14} />
        <span className="text-caption">
          {result?.imported === 0 ? 'Actueel' : `${result?.imported} geïmporteerd`}
        </span>
      </button>
    )
  }

  if (state === 'error') {
    return (
      <button
        onClick={reset}
        className="btn-secondary px-3 flex items-center gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
        title="Klik om opnieuw te proberen"
      >
        <AlertCircle size={14} />
        <span className="text-caption">Mislukt</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleSync}
      className="btn-secondary px-3 flex items-center gap-1.5"
      title="Sync bestanden met map"
    >
      <RefreshCw size={14} />
      <span className="text-caption">Sync bestanden</span>
    </button>
  )
}
