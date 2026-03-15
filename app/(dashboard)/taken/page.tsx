'use client'

import { useEffect, useState, useRef } from 'react'
import { Plus, Trash2, GripVertical, Check } from 'lucide-react'
import { Taak } from '@/lib/types'

function today() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function TakenPage() {
  const [taken, setTaken] = useState<Taak[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<'backlog' | 'vandaag' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const todayStr = today()

  const vandaag = taken.filter(t => !t.done && t.scheduledDate && t.scheduledDate <= todayStr)
  const afgerond = taken.filter(t => t.done && t.scheduledDate && t.scheduledDate <= todayStr)
  const backlog = taken.filter(t => !t.scheduledDate)

  async function load() {
    const res = await fetch('/api/taken')
    const data = await res.json()
    setTaken(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addTaak(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setSaving(true)
    const res = await fetch('/api/taken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    })
    const taak = await res.json()
    setTaken(prev => [taak, ...prev])
    setNewTitle('')
    setSaving(false)
    inputRef.current?.focus()
  }

  async function toggleDone(taak: Taak) {
    setTaken(prev => prev.map(t => t.id === taak.id ? { ...t, done: !t.done } : t))
    await fetch(`/api/taken/${taak.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !taak.done }),
    })
  }

  async function deleteTaak(id: string) {
    setTaken(prev => prev.filter(t => t.id !== id))
    await fetch(`/api/taken/${id}`, { method: 'DELETE' })
  }

  async function scheduleToday(id: string) {
    setTaken(prev => prev.map(t => t.id === id ? { ...t, scheduledDate: todayStr } : t))
    await fetch(`/api/taken/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledDate: todayStr }),
    })
  }

  async function moveToBacklog(id: string) {
    setTaken(prev => prev.map(t => t.id === id ? { ...t, scheduledDate: undefined, done: false } : t))
    await fetch(`/api/taken/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledDate: null, done: false }),
    })
  }

  function onDragStart(id: string) {
    setDraggingId(id)
  }

  function onDrop(target: 'backlog' | 'vandaag') {
    if (!draggingId) return
    if (target === 'vandaag') scheduleToday(draggingId)
    else moveToBacklog(draggingId)
    setDraggingId(null)
    setDragOver(null)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-brand-lavender border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-uxum text-headline text-brand-text-primary">Taken</h1>
        <p className="text-body text-brand-text-secondary mt-1">{formatDate(todayStr)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backlog */}
        <div
          className={`flex flex-col gap-3 transition-all ${dragOver === 'backlog' ? 'opacity-80' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver('backlog') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => onDrop('backlog')}
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-brand-text-primary">Backlog</h2>
            <span className="pill bg-gray-100 text-brand-text-secondary">{backlog.length}</span>
          </div>

          {/* Nieuw toevoegen */}
          <form onSubmit={addTaak} className="card p-3 flex gap-2">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Nieuwe taak toevoegen..."
              className="input flex-1 text-sm"
            />
            <button
              type="submit"
              disabled={saving || !newTitle.trim()}
              className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <Plus size={16} />
            </button>
          </form>

          {/* Backlog taken */}
          <div className={`card p-0 overflow-hidden min-h-[120px] transition-all ${dragOver === 'backlog' ? 'ring-2 ring-brand-lavender' : ''}`}>
            {backlog.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-brand-text-secondary text-sm">
                Geen taken in backlog
              </div>
            ) : (
              backlog.map(taak => (
                <TaakRij
                  key={taak.id}
                  taak={taak}
                  onToggle={() => toggleDone(taak)}
                  onDelete={() => deleteTaak(taak.id)}
                  onDragStart={() => onDragStart(taak.id)}
                  dragging={draggingId === taak.id}
                />
              ))
            )}
          </div>
        </div>

        {/* Vandaag */}
        <div
          className={`flex flex-col gap-3 transition-all ${dragOver === 'vandaag' ? 'opacity-80' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver('vandaag') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => onDrop('vandaag')}
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-brand-text-primary">Vandaag</h2>
            <span className="pill bg-brand-lavender/20 text-brand-text-primary">{vandaag.length} open</span>
          </div>

          <div className={`card p-0 overflow-hidden min-h-[120px] transition-all ${dragOver === 'vandaag' ? 'ring-2 ring-brand-lavender' : ''}`}>
            {vandaag.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-brand-text-secondary text-sm">
                Sleep taken hierheen
              </div>
            ) : (
              vandaag.map(taak => (
                <TaakRij
                  key={taak.id}
                  taak={taak}
                  onToggle={() => toggleDone(taak)}
                  onDelete={() => deleteTaak(taak.id)}
                  onDragStart={() => onDragStart(taak.id)}
                  dragging={draggingId === taak.id}
                />
              ))
            )}
          </div>

          {/* Afgerond vandaag */}
          {afgerond.length > 0 && (
            <details className="mt-2">
              <summary className="text-sm text-brand-text-secondary cursor-pointer select-none px-1">
                Afgerond vandaag ({afgerond.length})
              </summary>
              <div className="card p-0 overflow-hidden mt-2">
                {afgerond.map(taak => (
                  <TaakRij
                    key={taak.id}
                    taak={taak}
                    onToggle={() => toggleDone(taak)}
                    onDelete={() => deleteTaak(taak.id)}
                    onDragStart={() => onDragStart(taak.id)}
                    dragging={draggingId === taak.id}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

function TaakRij({ taak, onToggle, onDelete, onDragStart, dragging }: {
  taak: Taak
  onToggle: () => void
  onDelete: () => void
  onDragStart: () => void
  dragging: boolean
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`group flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 transition-all cursor-grab active:cursor-grabbing ${dragging ? 'opacity-40' : 'hover:bg-gray-50'}`}
    >
      <GripVertical size={14} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0" />

      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          taak.done
            ? 'bg-brand-lavender border-brand-lavender'
            : 'border-gray-300 hover:border-brand-lavender'
        }`}
      >
        {taak.done && <Check size={11} className="text-white" strokeWidth={3} />}
      </button>

      <span className={`flex-1 text-sm ${taak.done ? 'line-through text-brand-text-secondary' : 'text-brand-text-primary'}`}>
        {taak.title}
      </span>

      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
