'use client'
import { useEffect, useState, useCallback } from 'react'
import { AlertCircle, Clock, XCircle, CheckCircle2, X, Send } from 'lucide-react'
import { Actie } from '@/lib/types'
import { getCompany } from '@/lib/companies'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function ActieRij({ actie, onUpdate }: { actie: Actie; onUpdate: () => void }) {
  const [bezig, setBezig] = useState(false)

  const handleUpdate = async (status: 'goedgekeurd' | 'afgewezen') => {
    setBezig(true)
    await fetch(`/api/acties/${actie.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => {})
    onUpdate()
    setBezig(false)
  }

  const handleStuur = async () => {
    setBezig(true)
    const res = await fetch(`/api/acties/${actie.id}/stuur`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Verzenden mislukt')
      setBezig(false)
      return
    }
    onUpdate()
    setBezig(false)
  }

  const co = actie.metadata.companyId ? getCompany(actie.metadata.companyId as any) : null

  const icon =
    actie.type === 'factuur-herinnering' ? <AlertCircle size={16} className="text-brand-status-red shrink-0 mt-0.5" /> :
    actie.type === 'offerte-follow-up' ? <Clock size={16} className="text-brand-status-orange shrink-0 mt-0.5" /> :
    <XCircle size={16} className="text-brand-text-secondary shrink-0 mt-0.5" />

  const omschrijving =
    actie.type === 'factuur-herinnering'
      ? `Factuur ${actie.metadata.factuurNumber} voor ${actie.metadata.clientName} staat ${actie.metadata.dagsTeLaat} dag${(actie.metadata.dagsTeLaat ?? 0) > 1 ? 'en' : ''} te laat`
      : actie.type === 'offerte-follow-up'
      ? `Offerte ${actie.metadata.offerteNumber} voor ${actie.metadata.clientName} wacht al ${actie.metadata.dagenSindsVersturen} dagen op reactie`
      : `Offerte ${actie.metadata.offerteNumber} voor ${actie.metadata.clientName} is verlopen`

  return (
    <div className="flex items-start gap-3 py-3 border-b border-brand-card-border last:border-0">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-body text-brand-text-primary">{omschrijving}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {actie.metadata.amount && (
            <span className="text-caption text-brand-text-secondary font-semibold">{euro(actie.metadata.amount)}</span>
          )}
          {co && (
            <span className="text-pill px-1.5 py-0.5 rounded font-semibold text-[10px]" style={{ backgroundColor: co.bgColor, color: co.color }}>
              {co.shortName}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {actie.type === 'factuur-herinnering' && (
          <button
            onClick={handleStuur}
            disabled={bezig}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-brand-btn text-caption font-semibold bg-brand-purple text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Send size={11} /> {bezig ? 'Bezig...' : 'Stuur herinnering'}
          </button>
        )}
        {actie.type !== 'factuur-herinnering' && (
          <button
            onClick={() => handleUpdate('goedgekeurd')}
            disabled={bezig}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-brand-btn text-caption font-semibold bg-brand-purple text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <CheckCircle2 size={11} /> Gezien
          </button>
        )}
        <button
          onClick={() => handleUpdate('afgewezen')}
          disabled={bezig}
          className="p-1.5 rounded-brand-btn text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-page-medium transition-colors disabled:opacity-50"
          title="Negeer deze actie"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export default function ActiesWidget() {
  const [acties, setActies] = useState<Actie[]>([])
  const [loading, setLoading] = useState(true)

  const fetchActies = useCallback(async () => {
    try {
      const res = await fetch('/api/acties')
      if (res.ok) setActies(await res.json())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchActies() }, [fetchActies])

  if (loading || acties.length === 0) return null

  const herinneringen = acties.filter(a => a.type === 'factuur-herinnering')
  const overig = acties.filter(a => a.type !== 'factuur-herinnering')

  return (
    <div className="mb-6 rounded-brand border border-brand-status-orange/30 bg-brand-status-orange/5 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-brand-status-orange/20 bg-brand-status-orange/10">
        <AlertCircle size={15} className="text-brand-status-orange" />
        <span className="font-semibold text-body text-brand-text-primary">
          {acties.length} actie{acties.length > 1 ? 's' : ''} vereist jouw goedkeuring
        </span>
        {herinneringen.length > 0 && (
          <span className="text-caption text-brand-text-secondary ml-1">
            ({herinneringen.length} betaalherinnering{herinneringen.length > 1 ? 'en' : ''})
          </span>
        )}
      </div>
      <div className="px-5">
        {acties.map(a => (
          <ActieRij key={a.id} actie={a} onUpdate={fetchActies} />
        ))}
      </div>
    </div>
  )
}
