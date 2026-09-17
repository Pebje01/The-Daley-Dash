'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowUp, History, Loader2, MessageSquarePlus, Sparkles, X } from 'lucide-react'
import { useActiveCompany } from '@/components/CompanyContext'
import AssistentTekst from '@/components/assistent/AssistentTekst'
import VoorstelKaart from '@/components/assistent/VoorstelKaart'
import type { VoorstelRij } from '@/lib/assistent/voorstellen'

type Bericht =
  | { id: string; rol: 'gebruiker' | 'assistent' | 'systeem'; tekst: string }
  | { id: string; rol: 'voorstel'; voorstelId: string; startWaarde?: VoorstelRij }

interface GesprekKort { id: string; titel: string | null; updated_at: string }

const OPSLAG_SLEUTEL = 'dash-assistent-gesprek'

const VOORBEELDEN = [
  'Maak een factuur voor de open uren van een klant',
  'Welke facturen staan nog open?',
  'Zet de PDF van mijn laatste factuur opnieuw in de map',
]

function leesOpslag(): string | null {
  try { return localStorage.getItem(OPSLAG_SLEUTEL) } catch { return null }
}
function schrijfOpslag(id: string | null) {
  try { id ? localStorage.setItem(OPSLAG_SLEUTEL, id) : localStorage.removeItem(OPSLAG_SLEUTEL) } catch { /* privémodus */ }
}

let teller = 0
const nieuwId = () => `lokaal-${Date.now()}-${teller++}`

/**
 * De assistent: een knop rechtsonder op elke pagina die een chat opent.
 * Het denkwerk gebeurt server-side via de claude CLI (lib/assistent/claude.ts);
 * hier staan alleen het gesprek en de voorstelkaarten.
 */
export default function AssistentKnop() {
  const pathname = usePathname()
  const { scope } = useActiveCompany()
  const [open, setOpen] = useState(false)
  const [gesprekId, setGesprekId] = useState<string | null>(null)
  const [berichten, setBerichten] = useState<Bericht[]>([])
  const [invoer, setInvoer] = useState('')
  const [bezig, setBezig] = useState(false)
  const [actie, setActie] = useState<string | null>(null)
  const [geschiedenisOpen, setGeschiedenisOpen] = useState(false)
  const [gesprekken, setGesprekken] = useState<GesprekKort[]>([])
  const [laden, setLaden] = useState(false)
  const lijstRef = useRef<HTMLDivElement>(null)
  const invoerRef = useRef<HTMLTextAreaElement>(null)
  const afbreken = useRef<AbortController | null>(null)

  const laadGesprek = useCallback(async (id: string) => {
    setLaden(true)
    try {
      const res = await fetch(`/api/assistent/gesprekken/${id}`)
      if (!res.ok) {
        schrijfOpslag(null)
        setGesprekId(null)
        setBerichten([])
        return
      }
      const data = await res.json()
      const voorstellen = new Map<string, VoorstelRij>((data.voorstellen as VoorstelRij[]).map(v => [v.id, v]))
      setGesprekId(id)
      schrijfOpslag(id)
      setBerichten((data.berichten as { id: string; rol: string; inhoud: { tekst?: string; voorstelId?: string } }[]).map(b =>
        b.rol === 'voorstel'
          ? { id: b.id, rol: 'voorstel', voorstelId: b.inhoud.voorstelId!, startWaarde: voorstellen.get(b.inhoud.voorstelId!) }
          : { id: b.id, rol: b.rol as 'gebruiker' | 'assistent' | 'systeem', tekst: b.inhoud.tekst ?? '' }
      ))
    } finally {
      setLaden(false)
    }
  }, [])

  // Bij de eerste keer openen het laatste gesprek terughalen
  useEffect(() => {
    if (!open || gesprekId || berichten.length) return
    const opgeslagen = leesOpslag()
    if (opgeslagen) laadGesprek(opgeslagen)
  }, [open, gesprekId, berichten.length, laadGesprek])

  useEffect(() => {
    if (open) setTimeout(() => invoerRef.current?.focus(), 50)
  }, [open])

  // Meescrollen met het antwoord
  useEffect(() => {
    lijstRef.current?.scrollTo({ top: lijstRef.current.scrollHeight })
  }, [berichten, actie])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !geschiedenisOpen) setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, geschiedenisOpen])

  async function openGeschiedenis() {
    setGeschiedenisOpen(o => !o)
    const res = await fetch('/api/assistent/gesprekken').catch(() => null)
    if (res?.ok) setGesprekken(await res.json())
  }

  function nieuwGesprek() {
    if (bezig) return
    setGesprekId(null)
    setBerichten([])
    schrijfOpslag(null)
    setGeschiedenisOpen(false)
    invoerRef.current?.focus()
  }

  async function verstuur(tekst = invoer) {
    const bericht = tekst.trim()
    if (!bericht || bezig) return
    setInvoer('')
    setBezig(true)
    setActie(null)
    setBerichten(b => [...b, { id: nieuwId(), rol: 'gebruiker', tekst: bericht }])

    const controller = new AbortController()
    afbreken.current = controller

    // Tekst komt binnen in stukjes; na een voorstelkaart begint een nieuwe tekstballon
    let huidigeTekstId: string | null = null
    const voegTekstToe = (delta: string) => {
      // Het id buiten de state-updater bepalen: React mag updaters dubbel draaien
      if (!huidigeTekstId) {
        if (!delta.trim()) return
        const id = nieuwId()
        huidigeTekstId = id
        setBerichten(b => [...b, { id, rol: 'assistent', tekst: delta.trimStart() }])
      } else {
        const id = huidigeTekstId
        setBerichten(b => b.map(x => x.id === id && x.rol === 'assistent' ? { ...x, tekst: x.tekst + delta } : x))
      }
    }

    try {
      const res = await fetch('/api/assistent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gesprekId, bericht, pagina: pathname, bedrijf: scope }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'De assistent reageert niet')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let i: number
        while ((i = buffer.indexOf('\n')) >= 0) {
          const regel = buffer.slice(0, i).trim()
          buffer = buffer.slice(i + 1)
          if (!regel) continue
          const e = JSON.parse(regel)
          if (e.type === 'gesprek') {
            setGesprekId(e.gesprekId)
            schrijfOpslag(e.gesprekId)
          } else if (e.type === 'tekst') {
            setActie(null)
            voegTekstToe(e.delta)
          } else if (e.type === 'actie') {
            setActie(e.label)
          } else if (e.type === 'voorstel') {
            setActie(null)
            huidigeTekstId = null
            setBerichten(b => [...b, { id: nieuwId(), rol: 'voorstel', voorstelId: e.voorstelId }])
          } else if (e.type === 'fout') {
            setBerichten(b => [...b, { id: nieuwId(), rol: 'systeem', tekst: e.bericht }])
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setBerichten(b => [...b, { id: nieuwId(), rol: 'systeem', tekst: err instanceof Error ? err.message : 'Er ging iets mis' }])
      }
    } finally {
      setBezig(false)
      setActie(null)
      afbreken.current = null
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Assistent openen"
          className="group fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full shadow-lg hover:scale-105 transition-transform bg-gradient-to-br from-brand-lav-accent via-brand-purple to-brand-pink-accent text-white"
        >
          {/* Zachte gloed die rondgaat, in dezelfde lila en oudroze als de huisstijl */}
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-full opacity-60 blur-md motion-reduce:animate-none"
            style={{
              background: 'conic-gradient(from 0deg, rgb(var(--color-brand-lav-accent) / 0.75), rgb(var(--color-brand-pink-accent) / 0.65), rgb(var(--color-brand-lavender-dark) / 0.7), rgb(var(--color-brand-lav-accent) / 0.75))',
              animation: 'assistent-gloed 8s linear infinite',
            }}
          />
          <span className="relative flex items-center justify-center w-full h-full">
            <Sparkles size={20} />
            {/* Twee kleine sterretjes eromheen, net uit de pas zodat het leeft */}
            <Sparkles
              aria-hidden
              size={9}
              className="absolute -top-0.5 right-1 text-white motion-reduce:animate-none"
              style={{ animation: 'assistent-twinkel 2.6s ease-in-out infinite' }}
            />
            <Sparkles
              aria-hidden
              size={7}
              className="absolute bottom-1 left-1 text-white motion-reduce:animate-none"
              style={{ animation: 'assistent-twinkel 2.6s ease-in-out infinite 1.1s' }}
            />
          </span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Assistent"
          className="fixed z-[65] inset-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[420px] sm:h-[min(680px,calc(100dvh-2rem))] bg-brand-card-bg sm:rounded-brand border-brand border-brand-card-border shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Kop */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-brand-card-border/30 shrink-0">
            <Sparkles size={16} className="text-brand-lav-accent" />
            <h2 className="font-uxum text-lg text-brand-text-primary flex-1">Assistent</h2>
            <button onClick={openGeschiedenis} aria-label="Eerdere gesprekken" title="Eerdere gesprekken" className={`p-1.5 rounded-brand-sm hover:bg-brand-page-light ${geschiedenisOpen ? 'text-brand-text-primary bg-brand-page-light' : 'text-brand-text-secondary'}`}>
              <History size={16} />
            </button>
            <button onClick={nieuwGesprek} disabled={bezig} aria-label="Nieuw gesprek" title="Nieuw gesprek" className="p-1.5 rounded-brand-sm text-brand-text-secondary hover:bg-brand-page-light disabled:opacity-40">
              <MessageSquarePlus size={16} />
            </button>
            <button onClick={() => setOpen(false)} aria-label="Sluiten" className="p-1.5 rounded-brand-sm text-brand-text-secondary hover:bg-brand-page-light">
              <X size={16} />
            </button>
          </div>

          <div className="relative flex-1 min-h-0">
            {/* Eerdere gesprekken */}
            {geschiedenisOpen && (
              <div className="absolute inset-0 z-10 bg-brand-card-bg overflow-y-auto p-2">
                {gesprekken.length === 0 ? (
                  <p className="text-caption text-brand-text-secondary p-3">Nog geen eerdere gesprekken</p>
                ) : gesprekken.map(g => (
                  <button
                    key={g.id}
                    onClick={() => { setGeschiedenisOpen(false); laadGesprek(g.id) }}
                    disabled={bezig}
                    className={`w-full text-left px-3 py-2 rounded-brand-sm hover:bg-brand-page-light ${g.id === gesprekId ? 'bg-brand-page-light' : ''}`}
                  >
                    <p className="text-body text-brand-text-primary truncate">{g.titel || 'Gesprek'}</p>
                    <p className="text-caption text-brand-text-secondary">
                      {new Date(g.updated_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* Gesprek */}
            <div ref={lijstRef} className="h-full overflow-y-auto px-4 py-4 space-y-3">
              {laden && (
                <p className="text-caption text-brand-text-secondary flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Gesprek laden</p>
              )}

              {!laden && berichten.length === 0 && (
                <div className="pt-6 space-y-4">
                  <p className="text-body text-brand-text-secondary">
                    Zeg wat je nodig hebt, bijvoorbeeld een factuur voor een klant. Ik zoek de gegevens op en zet alles klaar. Er gebeurt pas iets als jij op de knop klikt.
                  </p>
                  <div className="space-y-2">
                    {VOORBEELDEN.map(v => (
                      <button key={v} onClick={() => verstuur(v)} className="block w-full text-left text-caption px-3 py-2 rounded-brand-sm border border-brand-card-border/40 text-brand-text-primary hover:bg-brand-page-light">
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {berichten.map(b => {
                if (b.rol === 'voorstel') return <VoorstelKaart key={b.id} voorstelId={b.voorstelId} startWaarde={b.startWaarde} />
                if (b.rol === 'gebruiker') {
                  return (
                    <div key={b.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-brand-sm bg-brand-lavender-accent px-3 py-2 text-body text-brand-text-primary whitespace-pre-wrap">{b.tekst}</div>
                    </div>
                  )
                }
                if (b.rol === 'systeem') {
                  return <p key={b.id} className="text-caption text-brand-status-red">{b.tekst}</p>
                }
                return (
                  <div key={b.id} className="text-body text-brand-text-primary">
                    <AssistentTekst tekst={b.tekst} />
                  </div>
                )
              })}

              {bezig && (
                <p className="text-caption text-brand-text-secondary flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin" /> {actie ?? 'Denkt na'}
                </p>
              )}
            </div>
          </div>

          {/* Invoer */}
          <form
            onSubmit={e => { e.preventDefault(); verstuur() }}
            className="shrink-0 border-t border-brand-card-border/30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-end gap-2"
          >
            <textarea
              ref={invoerRef}
              value={invoer}
              onChange={e => setInvoer(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  verstuur()
                }
              }}
              rows={1}
              placeholder="Vraag iets over je facturen..."
              className="input flex-1 resize-none max-h-32 text-body"
            />
            {bezig ? (
              <button type="button" onClick={() => afbreken.current?.abort()} aria-label="Stoppen" className="btn-secondary px-2.5 py-2">
                <X size={16} />
              </button>
            ) : (
              <button type="submit" disabled={!invoer.trim()} aria-label="Versturen" className="btn-primary px-2.5 py-2 disabled:opacity-40">
                <ArrowUp size={16} />
              </button>
            )}
          </form>
        </div>
      )}
    </>
  )
}
