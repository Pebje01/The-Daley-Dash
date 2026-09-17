'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ListTodo, Plus } from 'lucide-react'
import { Taak } from '@/lib/types'
import { prioriteitInfo, sorteerTaken, vandaagLokaal } from '@/lib/taken'

// De kolom rechts op het dashboard. Alles voor vandaag staat erin; de backlog
// vult aan tot dit aantal, de rest staat op /taken.
const MAX_BACKLOG = 6

export default function TodoWidget({ className = '' }: { className?: string }) {
  const [taken, setTaken] = useState<Taak[] | null>(null)
  const [nieuw, setNieuw] = useState('')
  const [bezig, setBezig] = useState(false)
  // Net afgevinkt: blijft even doorgestreept staan, zodat je ziet wat er gebeurde
  const [afgevinkt, setAfgevinkt] = useState<Set<string>>(new Set())
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const laad = useCallback(async () => {
    try {
      const res = await fetch('/api/taken')
      if (res.ok) setTaken(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    laad()
    // De lijst wijzigt meestal op /taken, dus bij terugkomen opnieuw ophalen
    const onFocus = () => laad()
    window.addEventListener('focus', onFocus)
    const lopend = timers.current
    return () => {
      window.removeEventListener('focus', onFocus)
      lopend.forEach(clearTimeout)
    }
  }, [laad])

  if (taken === null) return null

  const vandaag = vandaagLokaal()
  const open = taken.filter(t => !t.done || afgevinkt.has(t.id))
  const voorVandaag = sorteerTaken(open.filter(t => t.scheduledDate && t.scheduledDate <= vandaag))
  const backlog = sorteerTaken(open.filter(t => !t.scheduledDate))
  const uitBacklog = backlog.slice(0, MAX_BACKLOG)
  const rest = backlog.length - uitBacklog.length

  async function vinkAf(taak: Taak) {
    setAfgevinkt(prev => new Set(prev).add(taak.id))
    setTaken(prev => prev?.map(t => t.id === taak.id ? { ...t, done: true, scheduledDate: t.scheduledDate ?? vandaag } : t) ?? prev)
    // Een afgevinkte backlogtaak krijgt de datum van vandaag, anders staat hij
    // op /taken niet onder "Afgerond vandaag" maar doorgestreept in de backlog.
    await fetch(`/api/taken/${taak.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taak.scheduledDate ? { done: true } : { done: true, scheduledDate: vandaag }),
    }).catch(() => {})
    timers.current.push(setTimeout(() => {
      setAfgevinkt(prev => {
        const volgende = new Set(prev)
        volgende.delete(taak.id)
        return volgende
      })
    }, 1200))
  }

  async function voegToe(e: React.FormEvent) {
    e.preventDefault()
    const titel = nieuw.trim()
    if (!titel) return
    setBezig(true)
    try {
      // Vanaf het dashboard toegevoegd = voor vandaag, anders zie je hem hier niet terug
      const res = await fetch('/api/taken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titel, scheduledDate: vandaag }),
      })
      if (res.ok) {
        const taak: Taak = await res.json()
        setTaken(prev => [taak, ...(prev ?? [])])
        setNieuw('')
      }
    } finally {
      setBezig(false)
    }
  }

  const rij = (taak: Taak) => {
    const klaar = afgevinkt.has(taak.id)
    const prio = prioriteitInfo(taak.prioriteit)
    return (
      <li key={taak.id} className="flex items-start gap-2.5 py-2 border-b border-brand-page-medium last:border-0">
        <button
          onClick={() => !klaar && vinkAf(taak)}
          aria-label={`${taak.title} afvinken`}
          className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
            klaar ? 'bg-brand-lavender border-brand-lavender' : 'border-gray-300 hover:border-brand-lavender'
          }`}
        >
          {klaar && <Check size={9} className="text-white" strokeWidth={3} />}
        </button>
        <span className={`flex-1 min-w-0 text-body break-words ${klaar ? 'line-through text-brand-text-secondary' : 'text-brand-text-primary'}`}>
          {taak.title}
        </span>
        {prio && (
          <span title={prio.label} className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${prio.stip}`} />
        )}
      </li>
    )
  }

  return (
    <div className={`card flex flex-col min-h-0 xl:p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <div className="w-7 h-7 rounded-brand-sm bg-brand-lavender-accent flex items-center justify-center">
          <ListTodo size={15} className="text-brand-lav-accent" />
        </div>
        <h2 className="font-semibold text-body text-brand-text-primary flex-1">To-do list</h2>
        <Link href="/taken" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
          Alles <ArrowRight size={12} />
        </Link>
      </div>

      {/* Vanaf xl vult de lijst de kolom en scrolt hij zelf, de invoer blijft onderaan staan */}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        <p className="text-caption text-brand-text-secondary mt-1">
          Vandaag{voorVandaag.length > 0 && ` · ${voorVandaag.length}`}
        </p>
        {voorVandaag.length === 0 ? (
          <p className="text-caption text-brand-text-secondary/70 py-2">Niets gepland voor vandaag</p>
        ) : (
          <ul>{voorVandaag.map(rij)}</ul>
        )}

        {uitBacklog.length > 0 && (
          <>
            <p className="text-caption text-brand-text-secondary mt-3">Uit de backlog</p>
            <ul>{uitBacklog.map(rij)}</ul>
            {rest > 0 && (
              <Link href="/taken" className="text-caption text-brand-text-secondary hover:text-brand-text-primary inline-flex items-center gap-1 mt-1">
                Nog {rest} in de backlog <ArrowRight size={12} />
              </Link>
            )}
          </>
        )}
      </div>

      <form onSubmit={voegToe} className="flex gap-2 shrink-0 pt-3 mt-2 border-t border-brand-page-medium">
        <input
          value={nieuw}
          onChange={e => setNieuw(e.target.value)}
          placeholder="Taak voor vandaag..."
          className="flex-1 min-w-0 text-sm text-brand-text-primary bg-white dark:bg-brand-card-bg border border-brand-card-border/15 rounded-brand-btn px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-lavender-dark/60"
        />
        <button
          type="submit"
          disabled={bezig || !nieuw.trim()}
          aria-label="Toevoegen aan de to-do list"
          className="btn-primary px-2.5 py-1.5 disabled:opacity-50"
        >
          <Plus size={14} />
        </button>
      </form>
    </div>
  )
}
