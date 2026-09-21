'use client'

/**
 * Meldingen en bevestigingen in de huisstijl.
 *
 * De Dash gebruikte hiervoor `alert()` en `confirm()` van de browser: die
 * blokkeren de pagina, zijn niet te stylen en tonen "localhost:3003 zegt".
 * Voor een dashboard waarin je met facturen en klantgegevens werkt is dat
 * onnodig ruw, en bij een bevestiging voor het verwijderen van een verstuurde
 * factuur wil je juist een rustig scherm dat toont waar het over gaat.
 *
 * Gebruik:
 *   const melding = useMelding()
 *   melding.fout('PDF opslaan mislukt')
 *   melding.gelukt('Factuur opgeslagen')
 *   if (await melding.bevestig({ titel: '...', tekst: '...' })) { ... }
 *   const reden = await melding.vraagTekst({ titel: 'Waarom?', suggesties: [...] })
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

type Soort = 'fout' | 'gelukt' | 'info'

interface Toast {
  id: string
  soort: Soort
  tekst: string
}

interface BevestigOpties {
  titel: string
  tekst?: string
  bevestigLabel?: string
  annuleerLabel?: string
  /** Rode knop voor onomkeerbare acties zoals verwijderen. */
  gevaarlijk?: boolean
}

/** Zelfde venster als een bevestiging, met een invoerveld erbij. */
interface TekstOpties extends BevestigOpties {
  placeholder?: string
  /** Klikbare voorzetjes, bijvoorbeeld veelgebruikte redenen. */
  suggesties?: string[]
  /** Leeg laten mag: dan komt er een lege string terug in plaats van null. */
  leegMag?: boolean
}

interface MeldingApi {
  fout: (tekst: string) => void
  gelukt: (tekst: string) => void
  info: (tekst: string) => void
  bevestig: (opties: BevestigOpties) => Promise<boolean>
  /** Geeft de ingevulde tekst terug, of null als je annuleert. */
  vraagTekst: (opties: TekstOpties) => Promise<string | null>
}

const MeldingContext = createContext<MeldingApi | null>(null)

const TOON_DUUR_MS = 5000

export function useMelding(): MeldingApi {
  const api = useContext(MeldingContext)
  if (!api) throw new Error('useMelding moet binnen MeldingProvider gebruikt worden')
  return api
}

const STIJL: Record<Soort, { rand: string; achtergrond: string; kleur: string; Icoon: typeof Info }> = {
  fout: { rand: 'border-brand-pink-accent', achtergrond: 'bg-brand-card-bg', kleur: 'text-brand-pink-accent', Icoon: AlertTriangle },
  gelukt: { rand: 'border-brand-lime-accent', achtergrond: 'bg-brand-card-bg', kleur: 'text-brand-lime-accent', Icoon: CheckCircle2 },
  info: { rand: 'border-brand-card-border', achtergrond: 'bg-brand-card-bg', kleur: 'text-brand-lav-accent', Icoon: Info },
}

export default function MeldingProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [vraag, setVraag] = useState<(BevestigOpties & { tekstVraag?: TekstOpties }) | null>(null)
  const [invoer, setInvoer] = useState('')
  // Het antwoord van de bevestiging komt uit een klik, dus de promise wordt
  // hier vastgehouden tot de gebruiker kiest.
  const antwoordRef = useRef<((akkoord: boolean) => void) | null>(null)
  const tekstRef = useRef<((tekst: string | null) => void) | null>(null)

  const sluit = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toon = useCallback((soort: Soort, tekst: string) => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, soort, tekst }])
    // Fouten blijven staan tot je ze wegklikt: die wil je niet missen.
    if (soort !== 'fout') setTimeout(() => sluit(id), TOON_DUUR_MS)
  }, [sluit])

  const beantwoord = useCallback((akkoord: boolean, tekst = '') => {
    antwoordRef.current?.(akkoord)
    antwoordRef.current = null
    tekstRef.current?.(akkoord ? tekst : null)
    tekstRef.current = null
    setVraag(null)
    setInvoer('')
  }, [])

  // Escape sluit de bevestiging, net als klikken naast het venster. Zonder dit
  // kon je alleen nog met de muis weg, wat bij een verwijdervraag onprettig is.
  useEffect(() => {
    if (!vraag) return
    const opToets = (e: KeyboardEvent) => { if (e.key === 'Escape') beantwoord(false) }
    document.addEventListener('keydown', opToets)
    return () => document.removeEventListener('keydown', opToets)
  }, [vraag, beantwoord])

  const api = useMemo<MeldingApi>(() => ({
    fout: (tekst) => toon('fout', tekst),
    gelukt: (tekst) => toon('gelukt', tekst),
    info: (tekst) => toon('info', tekst),
    bevestig: (opties) => new Promise<boolean>(resolve => {
      antwoordRef.current = resolve
      setVraag(opties)
    }),
    vraagTekst: (opties) => new Promise<string | null>(resolve => {
      tekstRef.current = resolve
      setInvoer('')
      setVraag({ ...opties, tekstVraag: opties })
    }),
  }), [toon])

  return (
    <MeldingContext.Provider value={api}>
      {children}

      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 w-[min(24rem,calc(100vw-2.5rem))]">
        {toasts.map(t => {
          const { rand, achtergrond, kleur, Icoon } = STIJL[t.soort]
          return (
            <div
              key={t.id}
              role="status"
              className={`${achtergrond} ${rand} border rounded-brand-md shadow-lg px-4 py-3 flex items-start gap-2.5`}
            >
              <Icoon size={16} className={`${kleur} mt-0.5 shrink-0`} />
              <p className="text-caption text-brand-text-primary flex-1 min-w-0">{t.tekst}</p>
              <button
                onClick={() => sluit(t.id)}
                className="text-brand-text-secondary hover:text-brand-text-primary shrink-0"
                aria-label="Melding sluiten"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {vraag && (
        <div
          className="fixed inset-0 z-[110] bg-brand-text-primary/30 flex items-center justify-center p-5"
          role="dialog"
          aria-modal="true"
          onClick={() => beantwoord(false)}
        >
          <div className="card max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="font-uxum text-title text-brand-text-primary">{vraag.titel}</h2>
            {vraag.tekst && (
              <p className="text-body text-brand-text-secondary mt-2 whitespace-pre-line">{vraag.tekst}</p>
            )}
            {vraag.tekstVraag && (
              <div className="mt-4 space-y-2">
                <textarea
                  autoFocus
                  value={invoer}
                  onChange={e => setInvoer(e.target.value)}
                  onKeyDown={e => {
                    // Enter bevestigt, shift+enter is een nieuwe regel
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (invoer.trim() || vraag.tekstVraag?.leegMag) beantwoord(true, invoer.trim())
                    }
                  }}
                  rows={3}
                  placeholder={vraag.tekstVraag.placeholder}
                  className="input w-full text-sm resize-y"
                />
                {!!vraag.tekstVraag.suggesties?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {vraag.tekstVraag.suggesties.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setInvoer(s)}
                        className="pill bg-brand-page-medium text-brand-text-secondary hover:text-brand-text-primary"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => beantwoord(false)} className="btn-secondary">
                {vraag.annuleerLabel ?? 'Annuleren'}
              </button>
              <button
                onClick={() => beantwoord(true, invoer.trim())}
                autoFocus={!vraag.tekstVraag}
                disabled={!!vraag.tekstVraag && !vraag.tekstVraag.leegMag && !invoer.trim()}
                className={vraag.gevaarlijk
                  ? 'btn-primary !bg-brand-pink-accent !border-brand-pink-accent disabled:opacity-50'
                  : 'btn-primary disabled:opacity-50'}
              >
                {vraag.bevestigLabel ?? 'Doorgaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MeldingContext.Provider>
  )
}
