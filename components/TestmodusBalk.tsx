'use client'

import { FlaskConical } from 'lucide-react'
import { IS_TEST } from '@/lib/dashModus'
import { wisselVersieUrl } from '@/lib/dashModusClient'

/**
 * Laat in de testversie altijd zien dat je in test zit, zodat je nooit denkt
 * dat een factuur of klant echt is. Een oranje streep over de volle breedte,
 * plus op desktop een label in de werkbalk en op telefoon een label linksonder.
 * Neemt geen hoogte in, dus de vaste paginamaten blijven kloppen.
 */
export function TestmodusStreep() {
  if (!IS_TEST) return null
  return (
    <>
      <div className="fixed top-0 inset-x-0 h-1 bg-brand-status-orange z-[70] pointer-events-none" />
      <a
        href="#"
        onClick={e => { e.preventDefault(); window.location.href = wisselVersieUrl(false) }}
        className="md:hidden fixed bottom-4 left-4 z-[60] pill bg-brand-status-orange text-white shadow-md flex items-center gap-1"
      >
        <FlaskConical size={12} /> Test
      </a>
    </>
  )
}

/** Label in de werkbalk bovenaan (vanaf md). */
export function TestmodusLabel() {
  if (!IS_TEST) return null
  return (
    <div className="flex items-center gap-3">
      <span className="pill bg-brand-status-orange/15 text-brand-status-orange flex items-center gap-1.5">
        <FlaskConical size={12} /> Testversie, dit is nepdata
      </span>
      <button
        onClick={() => { window.location.href = wisselVersieUrl(false) }}
        className="text-caption text-brand-text-secondary hover:text-brand-text-primary underline underline-offset-2"
      >
        Naar je echte Dash
      </button>
    </div>
  )
}
