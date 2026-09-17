'use client'

/**
 * Melding bovenin de leadkaart als een lead heeft teruggemaild.
 *
 * De Dash ziet de reactie in Spark en zet de lead op vandaag. Wat je ermee doet
 * kies je hier: de reactie lezen (uit Spark, ook op de telefoon), Spark naar voren
 * halen om te antwoorden, de lead op In gesprek zetten, of de reactie afvinken.
 * Mail je zelf terug, dan verdwijnt de melding vanzelf.
 */
import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, ExternalLink, MailOpen, MessagesSquare, RefreshCw } from 'lucide-react'

interface Reactie {
  id: string
  van: string | null
  onderwerp: string
  verstuurd_op: string | null
}

interface Props {
  recordId: string
  fase: string
  /** Zet de lead op In gesprek, via dezelfde weg als de statuskiezer in de kop */
  onInGesprek: () => void
}

/** Fases waarin "In gesprek" een logische volgende stap is */
const VOOR_GESPREK = ['nieuwe kans', 'benaderd', 'later opvolgen', 'on hold']

function tijd(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ReactieMelding({ recordId, fase, onInGesprek }: Props) {
  const [reacties, setReacties] = useState<Reactie[]>([])
  const [bezig, setBezig] = useState<string | null>(null)
  // Uitgeklapte reactie met zijn tekst uit Spark
  const [gelezen, setGelezen] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [fout, setFout] = useState('')

  const laad = useCallback(async () => {
    const res = await fetch(`/api/crm/records/${recordId}/reacties`).catch(() => null)
    const json = await res?.json().catch(() => null)
    // Zonder migratie of met Spark dicht: gewoon geen melding, de kaart werkt verder
    if (res?.ok) setReacties(json?.reacties || [])
  }, [recordId])

  useEffect(() => { laad() }, [laad])

  async function post(actie: 'gezien' | 'lees' | 'spark', reactieId?: string) {
    setBezig(`${actie}:${reactieId || ''}`)
    setFout('')
    try {
      const res = await fetch(`/api/crm/records/${recordId}/reacties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actie, reactieId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Mislukt')
      return json as { bericht?: { tekst: string }; geopend?: boolean }
    } catch (e: any) {
      setFout(e.message)
      return null
    } finally {
      setBezig(null)
    }
  }

  async function gezien(id: string) {
    if (await post('gezien', id)) setReacties((r) => r.filter((x) => x.id !== id))
  }

  async function lees(id: string) {
    if (open === id) return setOpen(null)
    setOpen(id)
    if (gelezen[id] !== undefined) return
    const uit = await post('lees', id)
    if (uit?.bericht) setGelezen((g) => ({ ...g, [id]: uit.bericht!.tekst || '(lege mail)' }))
    else setOpen(null)
  }

  async function naarSpark() {
    const uit = await post('spark')
    if (uit && !uit.geopend) setFout('Spark naar voren halen kan alleen op de Mac zelf. Het gesprek staat bovenaan in je inbox.')
  }

  async function inGesprek(id: string) {
    onInGesprek()
    await gezien(id)
  }

  if (!reacties.length) return null

  return (
    <div className="mt-3 space-y-2">
      {reacties.map((r) => (
        <div key={r.id} className="rounded-brand-btn border border-brand-status-green/30 bg-brand-status-green/10 px-3 py-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <MailOpen size={15} className="text-brand-status-green shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-body font-medium text-brand-text-primary truncate">Heeft gereageerd: {r.onderwerp}</p>
              <p className="text-caption text-brand-text-secondary truncate">
                {r.van ? `${r.van}, ` : ''}{tijd(r.verstuurd_op)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              onClick={() => lees(r.id)}
              disabled={!!bezig}
              aria-expanded={open === r.id}
              className="inline-flex items-center gap-1 text-caption font-medium rounded-full px-2.5 py-1 bg-white border border-brand-card-border/15 text-brand-text-primary hover:border-brand-lav-accent disabled:opacity-50"
            >
              {bezig === `lees:${r.id}`
                ? <RefreshCw size={12} className="animate-spin" />
                : <ChevronDown size={12} className={`transition-transform ${open === r.id ? 'rotate-180' : ''}`} />}
              Lezen
            </button>
            <button
              onClick={naarSpark}
              disabled={!!bezig}
              title="Spark naar voren halen om te antwoorden"
              className="inline-flex items-center gap-1 text-caption font-medium rounded-full px-2.5 py-1 bg-white border border-brand-card-border/15 text-brand-text-primary hover:border-brand-lav-accent disabled:opacity-50"
            >
              <ExternalLink size={12} /> Naar Spark
            </button>
            {VOOR_GESPREK.includes(fase.toLowerCase()) && (
              <button
                onClick={() => inGesprek(r.id)}
                disabled={!!bezig}
                className="inline-flex items-center gap-1 text-caption font-medium rounded-full px-2.5 py-1 bg-white border border-brand-card-border/15 text-brand-text-primary hover:border-brand-lav-accent disabled:opacity-50"
              >
                <MessagesSquare size={12} /> Zet op In gesprek
              </button>
            )}
            <button
              onClick={() => gezien(r.id)}
              disabled={!!bezig}
              title="Afhandelen zonder de fase te veranderen"
              className="inline-flex items-center gap-1 text-caption font-medium rounded-full px-2.5 py-1 text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-50"
            >
              <Check size={12} /> Gezien
            </button>
          </div>
        </div>
        {open === r.id && gelezen[r.id] !== undefined && (
          <div className="mt-2 max-h-60 overflow-y-auto rounded-brand-btn bg-white border border-brand-card-border/15 px-3 py-2 text-body text-brand-text-primary whitespace-pre-wrap">
            {gelezen[r.id]}
          </div>
        )}
        </div>
      ))}
      {fout && <p className="text-caption text-brand-status-red">{fout}</p>}
    </div>
  )
}
