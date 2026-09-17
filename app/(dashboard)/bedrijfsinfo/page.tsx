'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Pencil, Plus, Trash2, Check, X, AlertCircle } from 'lucide-react'
import type { WerkbankSectie, WerkbankStatus } from '@/lib/types'

// ── Statuslabels ──────────────────────────────────────────────
// Het onderscheid tussen "zelf nagekeken" en "uit oude aantekeningen" is de
// kern van dit document. Zonder dat weet je bij een regel niet of je erop kunt
// bouwen, en dan is een handboek gevaarlijker dan geen handboek.
const STATUS_LABELS: Record<WerkbankStatus, string> = {
  nagekeken: 'Nagekeken',
  notities: 'Uit oude notities',
  openstaand: 'Openstaand',
}

const STATUS_STIJL: Record<WerkbankStatus, string> = {
  nagekeken: 'bg-brand-lime border-brand-card-border',
  notities: 'bg-brand-card-bg border-brand-card-border',
  openstaand: 'bg-brand-page-medium border-dashed border-brand-card-border',
}

function datumNL(iso?: string) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Kleine markdown-weergave ──────────────────────────────────
// Bewust met de hand en zonder extra pakket: de inhoud is van Daley zelf en
// staat achter de login, en de Dash heeft een korte afhankelijkhedenlijst die
// dat waard is. Ondersteund: koppen, lijsten, tabellen, vet en `code`.
// Alles wordt eerst ge-escaped, dus er kan geen HTML uit de tekst lekken.
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(s: string) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code class="bg-brand-page-medium rounded-brand-xs px-1.5 py-0.5 text-[12.5px] font-mono break-all">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>')
}

function renderMarkdown(bron: string): string {
  const regels = bron.split('\n')
  const uit: string[] = []
  let i = 0

  const isTabelScheiding = (r: string) => /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(r) && r.includes('-')

  while (i < regels.length) {
    const regel = regels[i]

    if (!regel.trim()) { i++; continue }

    // Tabel: kopregel, scheidingsregel, dan de rijen
    if (regel.trim().startsWith('|') && i + 1 < regels.length && isTabelScheiding(regels[i + 1])) {
      const cellen = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      const koppen = cellen(regel)
      i += 2
      const rijen: string[][] = []
      while (i < regels.length && regels[i].trim().startsWith('|')) {
        rijen.push(cellen(regels[i]))
        i++
      }
      uit.push(
        `<div class="overflow-x-auto my-4"><table class="w-full text-sm border-collapse">` +
        `<thead><tr>${koppen.map(k => `<th class="text-left font-medium text-brand-text-secondary text-xs uppercase tracking-wide pb-2 pr-4 border-b-2 border-brand-card-border whitespace-nowrap">${inline(k)}</th>`).join('')}</tr></thead>` +
        `<tbody>${rijen.map(r => `<tr>${r.map(c => `<td class="py-2 pr-4 align-top border-b border-brand-card-border/40">${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>` +
        `</table></div>`,
      )
      continue
    }

    // Koppen
    const kop = regel.match(/^(#{2,3})\s+(.*)$/)
    if (kop) {
      const groot = kop[1].length === 2
      uit.push(`<h${groot ? 3 : 4} class="font-semibold ${groot ? 'text-base mt-6' : 'text-sm mt-5'} mb-2">${inline(kop[2])}</h${groot ? 3 : 4}>`)
      i++
      continue
    }

    // Genummerde lijst
    if (/^\s*\d+\.\s+/.test(regel)) {
      const items: string[] = []
      while (i < regels.length && /^\s*\d+\.\s+/.test(regels[i])) {
        items.push(`<li class="mb-1.5">${inline(regels[i].replace(/^\s*\d+\.\s+/, ''))}</li>`)
        i++
      }
      uit.push(`<ol class="list-decimal pl-5 my-3 space-y-0.5">${items.join('')}</ol>`)
      continue
    }

    // Opsomming
    if (/^\s*[-*]\s+/.test(regel)) {
      const items: string[] = []
      while (i < regels.length && /^\s*[-*]\s+/.test(regels[i])) {
        items.push(`<li class="mb-1.5">${inline(regels[i].replace(/^\s*[-*]\s+/, ''))}</li>`)
        i++
      }
      uit.push(`<ul class="list-disc pl-5 my-3 space-y-0.5">${items.join('')}</ul>`)
      continue
    }

    // Alinea: aaneengesloten regels horen bij elkaar
    const alinea: string[] = []
    while (i < regels.length && regels[i].trim() && !/^\s*([-*]|\d+\.)\s+/.test(regels[i]) && !regels[i].trim().startsWith('|') && !/^#{2,3}\s/.test(regels[i])) {
      alinea.push(regels[i])
      i++
    }
    if (alinea.length) uit.push(`<p class="my-3 leading-relaxed">${inline(alinea.join(' '))}</p>`)
  }

  return uit.join('')
}

// ── Het geopende blad ─────────────────────────────────────────
/**
 * Elk blad krijgt zijn eigen pastel uit de huisstijl, op volgorde van de tabs.
 * Het actieve blad draagt de kleur vol en de kaart eronder een vleugje ervan,
 * zodat het tabblad doorloopt in het vel papier. De kleuren komen uit de
 * tokens, dus ze veranderen netjes mee in donkere modus.
 */
const BLAD_KLEUREN = [
  { tab: 'bg-brand-lavender', dof: 'bg-brand-lavender/45', vel: 'bg-brand-lavender/25' },
  { tab: 'bg-brand-pink', dof: 'bg-brand-pink/45', vel: 'bg-brand-pink/30' },
  { tab: 'bg-brand-light-blue', dof: 'bg-brand-light-blue/45', vel: 'bg-brand-light-blue/30' },
  { tab: 'bg-brand-lime/70', dof: 'bg-brand-lime/30', vel: 'bg-brand-lime/15' },
  { tab: 'bg-brand-lavender-accent', dof: 'bg-brand-lavender-accent/45', vel: 'bg-brand-lavender-accent/30' },
]
const bladKleur = (index: number) => BLAD_KLEUREN[index % BLAD_KLEUREN.length]

function Blad({
  sectie,
  kleur,
  onOpslaan,
  onVerwijderen,
}: {
  sectie: WerkbankSectie
  kleur: string
  onOpslaan: (id: string, wijziging: { titel: string; inhoud: string; status: WerkbankStatus }) => Promise<void>
  onVerwijderen: (id: string) => Promise<void>
}) {
  const [bewerken, setBewerken] = useState(false)
  const [titel, setTitel] = useState(sectie.titel)
  const [inhoud, setInhoud] = useState(sectie.inhoud)
  const [status, setStatus] = useState<WerkbankStatus>(sectie.status)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  function beginBewerken() {
    setTitel(sectie.titel)
    setInhoud(sectie.inhoud)
    setStatus(sectie.status)
    setFout(null)
    setBewerken(true)
  }

  async function opslaan() {
    if (!titel.trim()) { setFout('De titel mag niet leeg zijn.'); return }
    setBezig(true)
    setFout(null)
    try {
      await onOpslaan(sectie.id, { titel: titel.trim(), inhoud, status })
      setBewerken(false)
    } catch {
      setFout('Opslaan is niet gelukt. Probeer het opnieuw, je tekst staat er nog.')
    } finally {
      setBezig(false)
    }
  }

  async function verwijder() {
    if (!confirm(`Het blad "${sectie.titel}" verwijderen? Dit kun je niet ongedaan maken.`)) return
    setBezig(true)
    try {
      await onVerwijderen(sectie.id)
    } finally {
      setBezig(false)
    }
  }

  const gecontroleerd = datumNL(sectie.gecontroleerdOp)

  return (
    <div className={`card rounded-tl-none sm:px-8 ${kleur}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {bewerken ? (
          <input
            className="input flex-1 min-w-[200px] font-semibold"
            value={titel}
            onChange={e => setTitel(e.target.value)}
            aria-label="Naam van het blad"
          />
        ) : (
          <h2 className="font-semibold text-body">{sectie.titel}</h2>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {bewerken ? (
            <select
              className="input w-auto py-1 text-xs"
              value={status}
              onChange={e => setStatus(e.target.value as WerkbankStatus)}
              aria-label="Status van dit blad"
            >
              {(Object.keys(STATUS_LABELS) as WerkbankStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          ) : (
            <span className={`pill border-2 text-xs ${STATUS_STIJL[sectie.status]}`}>
              {STATUS_LABELS[sectie.status]}
              {sectie.status === 'nagekeken' && gecontroleerd ? ` ${gecontroleerd}` : ''}
            </span>
          )}

          {/* De opslaanknop bestaat alleen tijdens het bewerken. Buiten het
              bewerken is er niets op te slaan, en een knop die niets doet geeft
              de indruk dat je iets vergeten bent. */}
          {!bewerken && (
            <button
              onClick={beginBewerken}
              className="p-1.5 rounded-brand-sm text-brand-text-secondary hover:bg-brand-page-medium transition-colors"
              aria-label={`${sectie.titel} bewerken`}
              title="Bewerken"
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
      </div>

      {bewerken ? (
        <>
          <textarea
            className="input font-mono text-[13px] leading-relaxed min-h-[380px] mt-3"
            value={inhoud}
            onChange={e => setInhoud(e.target.value)}
            aria-label="Inhoud van dit blad"
            spellCheck={false}
          />
          <p className="text-xs text-brand-text-secondary mt-2">
            Opmaak: <code>## kop</code>, <code>- lijst</code>, <code>1. lijst</code>,
            {' '}<code>**vet**</code>, <code>`code`</code> en tabellen met <code>|</code>.
          </p>

          {fout && (
            <p className="flex items-center gap-2 text-sm text-brand-status-red mt-3">
              <AlertCircle size={15} /> {fout}
            </p>
          )}

          <div className="flex items-center gap-2 mt-4">
            <button onClick={opslaan} disabled={bezig} className="btn-primary disabled:opacity-50">
              <Check size={15} /> {bezig ? 'Bezig...' : 'Opslaan'}
            </button>
            <button onClick={() => { setBewerken(false); setFout(null) }} disabled={bezig} className="btn-secondary disabled:opacity-50">
              <X size={15} /> Annuleren
            </button>
            <button
              onClick={verwijder}
              disabled={bezig}
              className="ml-auto p-2 rounded-brand-sm text-brand-text-secondary hover:text-brand-status-red hover:bg-brand-page-medium transition-colors disabled:opacity-50"
              aria-label="Blad verwijderen"
              title="Blad verwijderen"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className="text-body text-brand-text-primary [&>*:first-child]:mt-0"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(sectie.inhoud) }}
          />
          <p className="text-xs text-brand-text-secondary mt-4 pt-3 border-t border-brand-card-border/40">
            Laatst bijgewerkt {datumNL(sectie.bijgewerktOp)}
          </p>
        </>
      )}
    </div>
  )
}

// ── Pagina ────────────────────────────────────────────────────
export default function BedrijfsinfoPage() {
  const [secties, setSecties] = useState<WerkbankSectie[]>([])
  const [actiefId, setActiefId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fout, setFout] = useState<string | null>(null)
  const [nieuweTitel, setNieuweTitel] = useState('')
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const tabRij = useRef<HTMLDivElement>(null)

  const laden = useCallback(async () => {
    setLoading(true)
    setFout(null)
    try {
      const res = await fetch('/api/werkbank')
      if (!res.ok) throw new Error()
      const data: WerkbankSectie[] = await res.json()
      setSecties(data)
      // Onthoud welk blad open stond, zodat een verversing je niet terugzet
      // naar het eerste blad.
      const bewaard = typeof window !== 'undefined' ? localStorage.getItem('werkbank-blad') : null
      setActiefId(data.some(s => s.id === bewaard) ? bewaard : (data[0]?.id ?? null))
    } catch {
      setFout('De Werkbank kon niet geladen worden. Draait de migratie 20260909_werkbank.sql al?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { laden() }, [laden])

  function kiesBlad(id: string) {
    setActiefId(id)
    try { localStorage.setItem('werkbank-blad', id) } catch { /* privémodus: dan onthouden we het niet */ }
  }

  async function opslaan(id: string, wijziging: { titel: string; inhoud: string; status: WerkbankStatus }) {
    const res = await fetch(`/api/werkbank/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wijziging),
    })
    if (!res.ok) throw new Error()
    const bijgewerkt: WerkbankSectie = await res.json()
    setSecties(s => s.map(x => (x.id === id ? bijgewerkt : x)))
  }

  async function verwijderen(id: string) {
    const res = await fetch(`/api/werkbank/${id}`, { method: 'DELETE' })
    if (!res.ok) return
    const over = secties.filter(x => x.id !== id)
    setSecties(over)
    if (actiefId === id) kiesBlad(over[0]?.id ?? '')
  }

  async function toevoegen() {
    if (!nieuweTitel.trim()) return
    const res = await fetch('/api/werkbank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titel: nieuweTitel.trim() }),
    })
    if (!res.ok) return
    const sectie: WerkbankSectie = await res.json()
    setSecties(s => [...s, sectie])
    kiesBlad(sectie.id)
    setNieuweTitel('')
    setNieuwOpen(false)
    // Een nieuw blad komt achteraan, dus schuif de tabrij mee.
    requestAnimationFrame(() => tabRij.current?.scrollTo({ left: tabRij.current.scrollWidth, behavior: 'smooth' }))
  }

  const actief = secties.find(s => s.id === actiefId) ?? null

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">Werkbank</h1>
          <p className="text-body text-brand-text-secondary mt-1 max-w-2xl">
            Hoe je spullen in elkaar zitten en welke afspraken je met jezelf hebt gemaakt.
            Elk blad is een onderwerp. Klik op het potloodje om er een bij te werken.
          </p>
        </div>
        <button onClick={() => setNieuwOpen(v => !v)} className="btn-primary">
          <Plus size={15} /> Blad
        </button>
      </header>

      {nieuwOpen && (
        <div className="card flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="label" htmlFor="nieuw-blad">Naam van het nieuwe blad</label>
            <input
              id="nieuw-blad"
              className="input"
              value={nieuweTitel}
              onChange={e => setNieuweTitel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') toevoegen() }}
              placeholder="Bijvoorbeeld: Opslag en harde schijven"
              autoFocus
            />
          </div>
          <button onClick={toevoegen} className="btn-primary"><Check size={15} /> Toevoegen</button>
          <button onClick={() => { setNieuwOpen(false); setNieuweTitel('') }} className="btn-secondary">
            <X size={15} /> Annuleren
          </button>
        </div>
      )}

      {loading && <p className="text-brand-text-secondary">Laden...</p>}

      {fout && (
        <div className="card flex items-start gap-2 text-brand-status-red">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <p>{fout}</p>
        </div>
      )}

      {!loading && !fout && secties.length === 0 && (
        <div className="card text-brand-text-secondary">
          <p>Nog geen bladen. Voeg er hierboven een toe.</p>
        </div>
      )}

      {/* Tabrij: de bladen van het handboek, zoals tabbladen onderin Excel.
          Het actieve blad loopt door in de kaart eronder, daarom heeft het geen
          onderrand en de kaart geen ronde hoek linksboven. */}
      {secties.length > 0 && (
        <div>
          <div
            ref={tabRij}
            role="tablist"
            aria-label="Bladen van de Werkbank"
            className="flex items-end gap-1 overflow-x-auto -mb-px pt-1"
          >
            {secties.map((s, i) => {
              const open = s.id === actiefId
              const kleur = bladKleur(i)
              return (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={open}
                  onClick={() => kiesBlad(s.id)}
                  className={`shrink-0 px-4 py-2 text-sm rounded-t-brand-btn border-brand border-b-0 transition-colors whitespace-nowrap ${
                    open
                      ? `${kleur.tab} border-brand-card-border font-medium text-brand-text-primary`
                      : `${kleur.dof} border-brand-card-border/40 text-brand-text-secondary hover:text-brand-text-primary`
                  }`}
                >
                  {s.titel}
                  {s.status === 'openstaand' && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-brand-status-orange ml-2 align-middle"
                      title="Openstaand"
                    />
                  )}
                </button>
              )
            })}
          </div>

          {actief && (
            <Blad
              key={actief.id}
              sectie={actief}
              kleur={bladKleur(secties.findIndex(s => s.id === actief.id)).vel}
              onOpslaan={opslaan}
              onVerwijderen={verwijderen}
            />
          )}
        </div>
      )}
    </div>
  )
}
