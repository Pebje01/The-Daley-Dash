'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { X } from 'lucide-react'

interface SlideOverPanelProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export default function SlideOverPanel({ open, onClose, title, children }: SlideOverPanelProps) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Open: toon panel
  useEffect(() => {
    if (open) {
      setVisible(true)
      setClosing(false)
      // Body scroll lock
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Sluit met animatie
  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setVisible(false)
      setClosing(false)
      document.body.style.overflow = ''
      onClose()
    }, 200) // match exit animatie duur
  }, [onClose])

  // Escape key
  useEffect(() => {
    if (!visible) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [visible, handleClose])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        ref={overlayRef}
        className={`absolute inset-0 bg-black/30 backdrop-blur-sm ${closing ? 'overlay-exit' : 'overlay-enter'}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`absolute top-0 right-0 h-full w-full md:w-auto md:max-w-3xl bg-brand-card-bg border-l border-brand-card-border shadow-2xl flex flex-col ${closing ? 'drawer-exit' : 'drawer-enter'}`}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-card-border/20 bg-brand-card-bg sticky top-0 z-10">
          <h2 className="font-uxum text-lg text-brand-text-primary truncate">
            {title || ''}
          </h2>
          <button
            onClick={handleClose}
            className="text-brand-text-secondary hover:text-brand-text-primary transition-colors p-1 -mr-1"
            aria-label="Sluiten"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollbare content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
