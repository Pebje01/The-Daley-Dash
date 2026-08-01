'use client'
import { useState } from 'react'
import { RefreshCw, Check, AlertTriangle } from 'lucide-react'
import { dataChanged } from '@/lib/events'
import { runSync, type OntbrekendDoc, type SyncSamenvatting } from '@/lib/admin/syncClient'

type SyncState = 'idle' | 'scanning' | 'importing' | 'done' | 'error'

interface SyncAllesKnopProps {
  onRefresh?: () => void
  /** Documenten waarvan de PDF niet meer op zijn plek ligt. De sync verwijdert die nooit zelf. */
  onOntbrekend?: (docs: OntbrekendDoc[]) => void
}

export default function SyncAllesKnop({ onRefresh, onOntbrekend }: SyncAllesKnopProps) {
  const [state, setState] = useState<SyncState>('idle')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState<SyncSamenvatting | null>(null)

  const handleSync = async () => {
    setState('scanning')
    setResult(null)
    setProgress({ current: 0, total: 0 })

    // Altijd de localFileMap verversen + Supabase data herladen
    onRefresh?.()

    try {
      const samenvatting = await runSync(msg => {
        if (msg.type === 'scan') {
          setState('importing')
          setProgress({ current: 0, total: msg.total })
        } else if (msg.type === 'progress') {
          setProgress({ current: msg.current, total: msg.total })
        }
      })

      setResult(samenvatting)
      onOntbrekend?.(samenvatting.ontbrekend)
      if (samenvatting.imported > 0) {
        dataChanged('facturen')
        dataChanged('offertes')
      }
      setState('done')
    } catch {
      // Bij netwerk- of systeemfout toch "done" tonen (niet blokkeren)
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
    const ontbreekt = result?.ontbrekend.length ?? 0
    // Ontbrekende PDF's wegen zwaarder dan een geslaagde import: dat is het
    // signaal dat er iets uit de administratie verdwenen is.
    if (ontbreekt > 0) {
      return (
        <button
          onClick={reset}
          className="btn-secondary px-3 flex items-center gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
          title={`${ontbreekt} document${ontbreekt === 1 ? '' : 'en'} zonder PDF op de vaste plek. Er is niets verwijderd.`}
        >
          <AlertTriangle size={14} />
          <span className="text-caption">{ontbreekt} zonder PDF</span>
        </button>
      )
    }
    const label = result && result.imported > 0 ? `${result.imported} nieuw` : 'Actueel'
    const tooltip = result
      ? [
          `${result.imported} geïmporteerd`,
          `${result.skipped} al aanwezig`,
          result.failed > 0 ? `${result.failed} mislukt` : null,
          // Nooit stil overslaan: anders lees je "actueel" terwijl er tientallen
          // PDF's bewust buiten de import blijven.
          result.overgeslagenOud > 0 ? `${result.overgeslagenOud} uit de oude nummerreeks overgeslagen` : null,
        ].filter(Boolean).join(', ')
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
      title="Sync bestanden: herlaad lokale bestanden en importeer nieuwe PDF's"
    >
      <RefreshCw size={14} />
      <span className="text-caption">Sync bestanden</span>
    </button>
  )
}
