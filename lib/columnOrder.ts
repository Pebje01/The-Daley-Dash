'use client'

// Herbruikbare logica voor verschuifbare (drag-and-drop) tabelkolommen,
// met volgorde en breedte die per lijst onthouden worden in localStorage.

import { useCallback, useEffect, useState } from 'react'
import type React from 'react'

const PREFIX = 'dash:colorder:'
const WIDTH_PREFIX = 'dash:colwidths:'

/** Verplaats dragKey naar de positie van overKey en geef de nieuwe volgorde terug. */
export function reorderKeys(order: string[], dragKey: string, overKey: string): string[] {
  if (dragKey === overKey) return order
  const next = order.filter((k) => k !== dragKey)
  const idx = next.indexOf(overKey)
  if (idx === -1) return order
  next.splice(idx, 0, dragKey)
  return next
}

/**
 * Houdt de kolomvolgorde bij voor één lijst.
 * Nieuwe kolommen (niet in de opgeslagen volgorde) worden achteraan toegevoegd,
 * zodat een later toegevoegde kolom altijd zichtbaar blijft.
 */
export function useColumnOrder(storageKey: string, defaultKeys: string[]) {
  const sig = defaultKeys.join('|')
  const [order, setOrder] = useState<string[]>(defaultKeys)

  useEffect(() => {
    let merged = defaultKeys
    try {
      const raw = localStorage.getItem(PREFIX + storageKey)
      if (raw) {
        const saved = JSON.parse(raw)
        if (Array.isArray(saved)) {
          merged = [
            ...saved.filter((k: string) => defaultKeys.includes(k)),
            ...defaultKeys.filter((k) => !saved.includes(k)),
          ]
        }
      }
    } catch { /* val terug op default */ }
    setOrder(merged)
  }, [storageKey, sig]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = useCallback((dragKey: string, overKey: string) => {
    setOrder((prev) => {
      const next = reorderKeys(prev, dragKey, overKey)
      try { localStorage.setItem(PREFIX + storageKey, JSON.stringify(next)) } catch { /* */ }
      return next
    })
  }, [storageKey])

  const reset = useCallback(() => {
    try { localStorage.removeItem(PREFIX + storageKey) } catch { /* */ }
    setOrder(defaultKeys)
  }, [storageKey, sig]) // eslint-disable-line react-hooks/exhaustive-deps

  return { order, move, reset }
}

/**
 * Geeft drag-and-drop handlers voor kolomkoppen. Spreid `headerProps(key)` op
 * de <th> of de header-div. `isOver`/`isDragging` voor visuele feedback.
 */
export function useColumnDnD(onMove: (dragKey: string, overKey: string) => void) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  const headerProps = useCallback((key: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragKey(key)
      e.dataTransfer.effectAllowed = 'move'
      try {
        e.dataTransfer.setData('text/plain', key)
        // Laat het sleepbeeld de kop zelf zijn, precies onder de cursor — voelt soepeler.
        const el = e.currentTarget as HTMLElement
        const r = el.getBoundingClientRect()
        e.dataTransfer.setDragImage(el, e.clientX - r.left, e.clientY - r.top)
      } catch { /* */ }
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setOverKey((prev) => (prev === key ? prev : key))
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      let dk = dragKey
      if (!dk) { try { dk = e.dataTransfer.getData('text/plain') } catch { dk = null } }
      if (dk && dk !== key) onMove(dk, key)
      setDragKey(null)
      setOverKey(null)
    },
    onDragEnd: () => { setDragKey(null); setOverKey(null) },
  }), [dragKey, onMove])

  return {
    dragKey,
    overKey,
    headerProps,
    isDragging: (key: string) => dragKey === key,
    isOver: (key: string) => overKey === key && dragKey !== null && dragKey !== key,
  }
}

/**
 * Houdt kolombreedtes bij voor één lijst.
 * Standaardbreedtes uit `defaults` worden overschreven door opgeslagen waarden.
 */
export function useColumnWidths(storageKey: string, defaults: Record<string, number>) {
  const [widths, setWidthsState] = useState<Record<string, number>>(defaults)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WIDTH_PREFIX + storageKey)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved && typeof saved === 'object') {
          setWidthsState((prev) => ({ ...prev, ...saved }))
        }
      }
    } catch { /* val terug op default */ }
  }, [storageKey])

  const setWidth = useCallback((key: string, width: number) => {
    setWidthsState((prev) => {
      const next = { ...prev, [key]: width }
      try { localStorage.setItem(WIDTH_PREFIX + storageKey, JSON.stringify(next)) } catch { /* */ }
      return next
    })
  }, [storageKey])

  const resetWidths = useCallback(() => {
    try { localStorage.removeItem(WIDTH_PREFIX + storageKey) } catch { /* */ }
    setWidthsState(defaults)
  }, [storageKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { widths, setWidth, resetWidths }
}
