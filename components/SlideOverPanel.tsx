'use client'

import { useEffect, useState, useCallback } from 'react'
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

  useEffect(() => {
    if (open) {
      setVisible(true)
      setClosing(false)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setVisible(false)
      setClosing(false)
      document.body.style.overflow = ''
      onClose()
    }, 150)
  }, [onClose])

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
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'overlay-exit' : 'overlay-enter'}`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] bg-brand-card-bg border border-brand-card-border rounded-2xl shadow-2xl flex flex-col ${closing ? 'modal-exit' : 'modal-enter'}`}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-card-border/20 shrink-0 rounded-t-2xl">
          <h2 className="font-uxum text-lg text-brand-text-primary truncate">
            {title || ''}
          </h2>
          <button
            onClick={handleClose}
            className="text-brand-text-secondary hover:text-brand-text-primary transition-colors p-1 -mr-1 rounded"
            aria-label="Sluiten"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollbare content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </div>
    </div>
  )
}
