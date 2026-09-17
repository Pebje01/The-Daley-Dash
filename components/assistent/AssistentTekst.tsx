'use client'

import { Fragment, type ReactNode } from 'react'

/**
 * Lichte opmaak voor antwoorden van de assistent: alinea's, lijstjes met - of •,
 * **vet** en `code`. Bewust geen markdown-pakket: meer dan dit schrijft hij niet,
 * en zo kan er ook geen HTML uit een antwoord in de pagina belanden.
 */
function inline(tekst: string): ReactNode[] {
  return tekst.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((deel, i) => {
    if (deel.startsWith('**') && deel.endsWith('**')) return <strong key={i} className="font-semibold">{deel.slice(2, -2)}</strong>
    if (deel.startsWith('`') && deel.endsWith('`')) return <code key={i} className="font-mono text-[0.9em] bg-brand-page-medium/60 rounded px-1">{deel.slice(1, -1)}</code>
    return <Fragment key={i}>{deel}</Fragment>
  })
}

export default function AssistentTekst({ tekst }: { tekst: string }) {
  const blokken = tekst.trim().split(/\n{2,}/)
  return (
    <div className="space-y-2">
      {blokken.map((blok, i) => {
        const regels = blok.split('\n')
        if (regels.every(r => /^\s*([-•*]|\d+\.)\s+/.test(r))) {
          return (
            <ul key={i} className="space-y-1">
              {regels.map((r, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-brand-text-secondary shrink-0">•</span>
                  <span>{inline(r.replace(/^\s*([-•*]|\d+\.)\s+/, ''))}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i}>
            {regels.map((r, j) => (
              <Fragment key={j}>{j > 0 && <br />}{inline(r)}</Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
