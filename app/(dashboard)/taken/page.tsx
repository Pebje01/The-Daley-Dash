'use client'

import { useEffect, useState, useRef, ReactNode } from 'react'
import { Plus, Trash2, GripVertical, Check, Pencil, Flag, X, ArrowUp, ArrowDown, ArrowUpDown, Sun, CornerUpLeft } from 'lucide-react'
import { CompanyId, Taak, TaakPrioriteit, TaakStatus } from '@/lib/types'
import {
  AFGEROND_STATUS, PRIORITEITEN, SORTEER_UITLEG, STATUSSEN, SorteerVeld, Sortering, TAKEN_TABS, TakenTab,
  sorteerOpKolom, prioriteitInfo, sorteerTaken, statusVan, vandaagLokaal,
} from '@/lib/taken'
import { COMPANIES, getCompany } from '@/lib/companies'
import { useMelding } from '@/components/MeldingProvider'

type Kolom = 'backlog' | 'vandaag'

type TaakPatch = Partial<Omit<Taak, 'scheduledDate' | 'prioriteit' | 'status' | 'bedrijf' | 'deadline'>> & {
  scheduledDate?: string | null
  prioriteit?: TaakPrioriteit | null
  status?: TaakStatus | null
  bedrijf?: CompanyId | null
  deadline?: string | null
}

const NULLBARE_VELDEN = ['scheduledDate', 'prioriteit', 'status', 'bedrijf', 'deadline'] as const

// Vaste kolombreedtes, gedeeld door de kop en de rijen
const KOL = {
  prioriteit: 'w-[112px]',
  status: 'w-[116px]',
  bedrijf: 'w-[148px]',
  deadline: 'w-[104px]',
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Zoals "do 18 sep", voor naast de kop Vandaag */
function dagDatum(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

function kortDatum(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export default function TakenPage() {
  const melding = useMelding()
  const [taken, setTaken] = useState<Taak[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TakenTab>('alles')
  const [newTitle, setNewTitle] = useState('')
  const [newPrioriteit, setNewPrioriteit] = useState<TaakPrioriteit | null>(null)
  const [saving, setSaving] = useState(false)
  // Slepen verplaatst alleen tussen de to-do list en Vandaag, nooit de volgorde
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropKolom, setDropKolom] = useState<Kolom | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Sorteren op een kolom; null = standaardvolgorde, nieuwste bovenaan
  const [sortering, setSortering] = useState<Sortering | null>(null)

  const todayStr = vandaagLokaal()

  // Wat je vandaag niet afvinkt, staat morgen gewoon weer in Vandaag: alles met een datum tot en met vandaag.
  // Binnen Vandaag urgent eerst, bij gelijke prioriteit de standaardvolgorde.
  const vandaag = sorteerOpKolom(
    taken.filter(t => !t.done && t.scheduledDate && t.scheduledDate <= todayStr),
    { veld: 'prioriteit', richting: 'op' },
    id => getCompany(id).name,
  )
  const afgerondVandaag = taken.filter(t => t.done && t.scheduledDate === todayStr)
  const openBacklog = sorteerTaken(taken.filter(t => !t.scheduledDate && !t.done))
  const tellers = Object.fromEntries(TAKEN_TABS.map(t => [
    t.waarde,
    t.waarde === 'alles' ? openBacklog.length
    : t.waarde === 'afgerond' ? taken.filter(x => x.done).length
    : openBacklog.filter(x => x.prioriteit === t.waarde).length,
  ])) as Record<TakenTab, number>
  const gefilterd =
    tab === 'afgerond' ? sorteerTaken(taken.filter(t => t.done))
    : tab === 'alles' ? openBacklog
    : openBacklog.filter(t => t.prioriteit === tab)
  const backlog = sortering ? sorteerOpKolom(gefilterd, sortering, id => getCompany(id).name) : gefilterd
  // Afgeronde taken sleep je niet naar Vandaag; die vink je eerst weer open
  const tabelSleepbaar = tab !== 'afgerond'

  // De gekozen sortering onthouden per browser; lukt dat niet, dan gewoon de standaardvolgorde
  useEffect(() => {
    try {
      const opgeslagen = JSON.parse(localStorage.getItem('taken-sortering') || 'null')
      if (opgeslagen?.veld && SORTEER_UITLEG[opgeslagen.veld as SorteerVeld]) setSortering(opgeslagen)
    } catch { /* geen opslag beschikbaar */ }
  }, [])

  /** Klik op een kolomkop: eerst de natuurlijke volgorde, dan andersom, dan terug naar de standaardvolgorde. */
  function sorteer(veld: SorteerVeld) {
    const volgende: Sortering | null =
      sortering?.veld !== veld ? { veld, richting: 'op' }
      : sortering.richting === 'op' ? { veld, richting: 'af' }
      : null
    setSortering(volgende)
    try {
      if (volgende) localStorage.setItem('taken-sortering', JSON.stringify(volgende))
      else localStorage.removeItem('taken-sortering')
    } catch { /* geen opslag beschikbaar */ }
  }

  async function load() {
    const res = await fetch('/api/taken')
    const data = await res.json()
    setTaken(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function kiesTab(nieuw: TakenTab) {
    setTab(nieuw)
    // Een taak die je toevoegt terwijl je op een prioriteit filtert, krijgt die prioriteit,
    // anders verdwijnt hij meteen uit beeld
    if (nieuw !== 'alles' && nieuw !== 'afgerond') setNewPrioriteit(nieuw)
  }

  /** Optimistisch bijwerken; lukt het opslaan niet, dan de lijst opnieuw ophalen en melden waarom. */
  async function patch(id: string, body: TaakPatch) {
    setTaken(prev => prev.map(t => {
      if (t.id !== id) return t
      const nieuw = { ...t, ...body } as Taak
      for (const veld of NULLBARE_VELDEN) {
        if (veld in body) (nieuw as unknown as Record<string, unknown>)[veld] = body[veld] ?? undefined
      }
      return nieuw
    }))
    const res = await fetch(`/api/taken/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}))
      melding.fout(data?.error || 'Opslaan mislukt')
      load()
    }
  }

  async function addTaak(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setSaving(true)
    const res = await fetch('/api/taken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim(), prioriteit: newPrioriteit ?? undefined }),
    })
    if (res.ok) {
      const taak = await res.json()
      setTaken(prev => [taak, ...prev])
      setNewTitle('')
    } else {
      const data = await res.json().catch(() => ({}))
      melding.fout(data.error || 'Toevoegen mislukt')
    }
    setSaving(false)
    inputRef.current?.focus()
  }

  function toggleDone(taak: Taak) {
    // Afvinken vanuit Vandaag zet de datum op vandaag, zodat hij onder "Afgerond vandaag"
    // valt en morgen niet meer, ook als hij al sinds gisteren op de lijst stond
    if (!taak.done && taak.scheduledDate) patch(taak.id, { done: true, scheduledDate: todayStr })
    else patch(taak.id, { done: !taak.done })
  }

  function zetStatus(taak: Taak, waarde: TaakStatus | 'afgerond') {
    if (waarde === 'afgerond') patch(taak.id, { done: true })
    else patch(taak.id, { done: false, status: waarde })
  }

  async function deleteTaak(id: string) {
    setTaken(prev => prev.filter(t => t.id !== id))
    await fetch(`/api/taken/${id}`, { method: 'DELETE' })
  }

  const inVandaag = (taak: Taak) => !!taak.scheduledDate && taak.scheduledDate <= todayStr

  /** Op de lijst van vandaag zetten, of er weer af. Meer doet slepen niet. */
  function verplaats(taak: Taak, naar: Kolom) {
    if (naar === 'vandaag' && !inVandaag(taak)) patch(taak.id, { scheduledDate: todayStr, done: false })
    if (naar === 'backlog' && taak.scheduledDate) patch(taak.id, { scheduledDate: null, done: false })
  }

  const gesleept = taken.find(t => t.id === draggingId)
  /** Alleen een taak uit de andere lijst mag landen; binnen dezelfde lijst gebeurt er niets. */
  const magLanden = (kolom: Kolom) =>
    !!gesleept && (kolom === 'vandaag' ? !inVandaag(gesleept) : !!gesleept.scheduledDate && tabelSleepbaar)

  function onDragOverKolom(e: React.DragEvent, kolom: Kolom) {
    if (!magLanden(kolom)) return
    e.preventDefault()
    if (dropKolom !== kolom) setDropKolom(kolom)
  }

  function onDrop(kolom: Kolom) {
    if (gesleept && magLanden(kolom)) verplaats(gesleept, kolom)
    stopSlepen()
  }

  function stopSlepen() {
    setDraggingId(null)
    setDropKolom(null)
  }

  function rijProps(taak: Taak, kolom: Kolom) {
    return {
      taak,
      todayStr,
      onToggle: () => toggleDone(taak),
      onDelete: () => deleteTaak(taak.id),
      onTitel: (title: string) => patch(taak.id, { title }),
      onPrioriteit: (prioriteit: TaakPrioriteit | null) => patch(taak.id, { prioriteit }),
      onStatus: (waarde: TaakStatus | 'afgerond') => zetStatus(taak, waarde),
      onBedrijf: (bedrijf: CompanyId | null) => patch(taak.id, { bedrijf }),
      onDeadline: (deadline: string | null) => patch(taak.id, { deadline }),
      // Knop naast het slepen, want op een touchscreen kun je niet slepen
      onVerplaats: taak.done ? undefined : () => verplaats(taak, kolom === 'vandaag' ? 'backlog' : 'vandaag'),
      sleepbaar: !taak.done && (kolom === 'vandaag' || tabelSleepbaar),
      onDragStart: () => setDraggingId(taak.id),
      onDragEnd: stopSlepen,
      dragging: draggingId === taak.id,
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-brand-lavender border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const leegTekst =
    tab === 'alles' ? 'Geen open taken'
    : tab === 'afgerond' ? 'Nog niets afgerond'
    : `Geen taken met prioriteit ${prioriteitInfo(tab)?.label.toLowerCase()}`

  return (
    // Vanaf xl (MacBook Pro 14") past het bord in één scherm: de root krijgt de
    // schermhoogte en beide kolommen scrollen elk binnen hun eigen lijstkaart.
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen xl:min-h-0 xl:h-[calc(100dvh-var(--dash-topbar))] xl:overflow-hidden xl:pt-8 xl:pb-4 xl:flex xl:flex-col">
      {/* Header */}
      <div className="mb-8 xl:mb-4 xl:shrink-0">
        <h1 className="font-uxum text-headline text-brand-text-primary">To-do list</h1>
        <p className="text-body text-brand-text-secondary mt-1">{formatDate(todayStr)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 xl:gap-4 xl:flex-1 xl:min-h-0">
        {/* To-do list als tabel, twee derde van de breedte */}
        <div
          className="flex flex-col gap-3 xl:min-h-0 lg:col-span-2 min-w-0"
          onDragOver={e => onDragOverKolom(e, 'backlog')}
          onDrop={() => onDrop('backlog')}
        >
          {/* Nieuw toevoegen; in Afgerond valt er niets toe te voegen */}
          {tab !== 'afgerond' && (
            <form onSubmit={addTaak} className="card p-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex gap-2 flex-1 min-w-0">
                <input
                  ref={inputRef}
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Nieuwe taak toevoegen..."
                  className="input flex-1 min-w-0 text-sm"
                />
                <button
                  type="submit"
                  disabled={saving || !newTitle.trim()}
                  className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50 sm:order-last"
                >
                  <Plus size={16} />
                </button>
              </div>
              {/* Optioneel: nog een keer klikken op de gekozen prioriteit haalt hem weer weg */}
              <div className="flex flex-wrap items-center gap-1">
                {PRIORITEITEN.map(p => {
                  const gekozen = newPrioriteit === p.waarde
                  return (
                    <button
                      key={p.waarde}
                      type="button"
                      aria-pressed={gekozen}
                      onClick={() => setNewPrioriteit(gekozen ? null : p.waarde)}
                      className={`pill transition-all ${gekozen ? `${p.pill} ring-1 ring-current` : 'bg-gray-50 text-brand-text-secondary hover:bg-gray-100'}`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </form>
          )}

          {/* Filter vlak boven de tabel, zoals de weergaven in Notion */}
          <div role="tablist" className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
            {TAKEN_TABS.map(t => {
              const actief = tab === t.waarde
              return (
                <button
                  key={t.waarde}
                  role="tab"
                  aria-selected={actief}
                  onClick={() => kiesTab(t.waarde)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    actief ? 'bg-white font-semibold text-brand-text-primary shadow-sm' : 'text-brand-text-secondary hover:bg-white/60'
                  }`}
                >
                  {prioriteitInfo(t.waarde as TaakPrioriteit) && (
                    <Flag size={13} className={`fill-current ${prioriteitInfo(t.waarde as TaakPrioriteit)!.tekst}`} />
                  )}
                  {t.label}
                  <span className="text-caption text-brand-text-secondary">{tellers[t.waarde]}</span>
                </button>
              )
            })}
          </div>

          {sortering && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 -mt-1 text-caption text-brand-text-secondary">
              <span>
                Gesorteerd op {{ titel: 'taak', prioriteit: 'prioriteit', status: 'status', bedrijf: 'bedrijf', deadline: 'deadline' }[sortering.veld]}, {SORTEER_UITLEG[sortering.veld][sortering.richting]}.
              </span>
              <button onClick={() => { setSortering(null); try { localStorage.removeItem('taken-sortering') } catch { /* geen opslag */ } }} className="underline underline-offset-2 hover:text-brand-text-primary">
                Sortering uit
              </button>
            </div>
          )}

          {/* De tabel: vanaf xl vult de kaart de kolom en scrolt hij erin, op smalle schermen zijwaarts */}
          <div className={`card p-0 overflow-auto min-h-[120px] xl:min-h-0 xl:flex-1 transition-all ${dropKolom === 'backlog' ? 'ring-2 ring-brand-lavender' : ''}`}>
            <div className="min-w-[760px]">
              <div className="sticky top-0 z-10 flex items-stretch bg-brand-card-bg border-b border-gray-200 text-caption font-medium text-brand-text-secondary">
                <div className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-3">
                  <span className="w-3.5" />
                  <span className="w-5" />
                  <SorteerKop veld="titel" label="Taak" sortering={sortering} onSorteer={sorteer} />
                </div>
                <SorteerKop veld="prioriteit" label="Prioriteit" icoon={<Flag size={12} />} sortering={sortering} onSorteer={sorteer} className={`${KOL.prioriteit} px-2 border-l border-gray-100`} />
                <SorteerKop veld="status" label="Status" sortering={sortering} onSorteer={sorteer} className={`${KOL.status} px-2 border-l border-gray-100`} />
                <SorteerKop veld="bedrijf" label="Bedrijf" sortering={sortering} onSorteer={sorteer} className={`${KOL.bedrijf} px-2 border-l border-gray-100`} />
                <SorteerKop veld="deadline" label="Deadline" sortering={sortering} onSorteer={sorteer} className={`${KOL.deadline} px-2 border-l border-gray-100`} />
                <div className="w-12 border-l border-gray-100" />
              </div>
              {backlog.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-brand-text-secondary text-sm">
                  {leegTekst}
                </div>
              ) : backlog.map(taak => <TabelRij key={taak.id} {...rijProps(taak, 'backlog')} />)}
            </div>
          </div>
        </div>

        {/* Vandaag, een derde van de breedte */}
        <div
          className="flex flex-col gap-3 xl:min-h-0 min-w-0"
          onDragOver={e => onDragOverKolom(e, 'vandaag')}
          onDrop={() => onDrop('vandaag')}
        >
          <div className="flex items-center justify-between gap-2 py-1.5">
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="font-semibold text-brand-text-primary">Vandaag</h2>
              {/* De datum erbij, zodat je ziet van wanneer deze lijst is */}
              <span className="text-caption text-brand-text-secondary truncate">{dagDatum(todayStr)}</span>
            </div>
            <span className="pill bg-brand-lavender/20 text-brand-text-primary shrink-0">{vandaag.length} open</span>
          </div>

          {/* Vandaag: vanaf xl vult de kaart de kolom en scrolt de lijst erin */}
          <div className={`card p-0 overflow-hidden min-h-[120px] xl:min-h-0 xl:flex-1 xl:overflow-y-auto transition-all ${dropKolom === 'vandaag' ? 'ring-2 ring-brand-lavender' : ''}`}>
            {vandaag.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-brand-text-secondary text-sm">
                Sleep taken hierheen
              </div>
            ) : vandaag.map(taak => <VandaagRij key={taak.id} {...rijProps(taak, 'vandaag')} />)}
          </div>

          {/* Afgerond vandaag. Vanaf xl hooguit een derde van het scherm, anders drukt
              een lange afgeronde lijst de open taken weg. */}
          {afgerondVandaag.length > 0 && (
            <details className="mt-2 xl:mt-0 xl:shrink-0 xl:max-h-[35vh] xl:overflow-y-auto">
              <summary className="text-sm text-brand-text-secondary cursor-pointer select-none px-1">
                Afgerond vandaag ({afgerondVandaag.length})
              </summary>
              <div className="card p-0 overflow-hidden mt-2">
                {afgerondVandaag.map(taak => (
                  <VandaagRij key={taak.id} {...rijProps(taak, 'vandaag')} />
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

/** Klikbare kolomkop. De pijl laat zien of en welke kant op er gesorteerd wordt. */
function SorteerKop({ veld, label, icoon, sortering, onSorteer, className = '' }: {
  veld: SorteerVeld
  label: string
  icoon?: ReactNode
  sortering: Sortering | null
  onSorteer: (veld: SorteerVeld) => void
  className?: string
}) {
  const actief = sortering?.veld === veld
  const Pijl = !actief ? ArrowUpDown : sortering.richting === 'op' ? ArrowUp : ArrowDown
  return (
    <button
      onClick={() => onSorteer(veld)}
      title={actief ? `Gesorteerd: ${SORTEER_UITLEG[veld][sortering.richting]}. Klik om te wisselen.` : `Sorteren op ${label.toLowerCase()}`}
      className={`group/kop flex items-center gap-1.5 py-2 text-left transition-colors hover:text-brand-text-primary ${actief ? 'text-brand-text-primary' : ''} ${className}`}
    >
      {icoon}
      {label}
      <Pijl size={11} className={actief ? '' : 'opacity-0 group-hover/kop:opacity-60'} />
    </button>
  )
}

type RijProps = {
  taak: Taak
  todayStr: string
  onToggle: () => void
  onDelete: () => void
  onTitel: (title: string) => void
  onPrioriteit: (prioriteit: TaakPrioriteit | null) => void
  onStatus: (waarde: TaakStatus | 'afgerond') => void
  onBedrijf: (bedrijf: CompanyId | null) => void
  onDeadline: (deadline: string | null) => void
  /** Naar Vandaag, of vanuit Vandaag terug naar de to-do list */
  onVerplaats?: () => void
  sleepbaar: boolean
  onDragStart: () => void
  onDragEnd: () => void
  dragging: boolean
}

// Op telefoon bestaat hover niet, dus daar staan de knoppen altijd zichtbaar
const HOVER_KNOP = 'md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 text-gray-300 transition-all flex-shrink-0'

/** Titel die je aanpast door erop te klikken. Enter of wegklikken slaat op, Escape annuleert. */
function useTitelBewerken(taak: Taak, onTitel: (t: string) => void) {
  const [bewerken, setBewerken] = useState(false)
  const [titel, setTitel] = useState(taak.title)

  function start() {
    setTitel(taak.title)
    setBewerken(true)
  }

  function opslaan() {
    const nieuw = titel.trim()
    setBewerken(false)
    if (nieuw && nieuw !== taak.title) onTitel(nieuw)
  }

  const veld = bewerken ? (
    <input
      autoFocus
      value={titel}
      onChange={e => setTitel(e.target.value)}
      onBlur={opslaan}
      onKeyDown={e => {
        if (e.key === 'Enter') opslaan()
        if (e.key === 'Escape') setBewerken(false)
      }}
      className="flex-1 min-w-0 text-sm bg-transparent border-b border-brand-lavender outline-none py-0.5 text-brand-text-primary"
    />
  ) : (
    <span
      onClick={start}
      title="Klik om aan te passen"
      className={`flex-1 min-w-0 text-sm cursor-text break-words ${taak.done ? 'line-through text-brand-text-secondary' : 'text-brand-text-primary'}`}
    >
      {taak.title}
    </span>
  )

  return { bewerken, start, veld }
}

function AfvinkKnop({ taak, onToggle }: { taak: Taak; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={taak.done ? 'Weer openzetten' : 'Afvinken'}
      className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
        taak.done
          ? 'bg-brand-lavender border-brand-lavender'
          : 'border-gray-300 hover:border-brand-lavender'
      }`}
    >
      {taak.done && <Check size={11} className="text-white" strokeWidth={3} />}
    </button>
  )
}

function sleepAttributen(p: RijProps, bewerken: boolean) {
  const kan = p.sleepbaar && !bewerken
  return {
    // Tijdens het bewerken niet sleepbaar, anders kun je geen tekst selecteren in het veld
    draggable: kan,
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.taak.id); p.onDragStart() },
    onDragEnd: p.onDragEnd,
    cursor: kan ? 'cursor-grab active:cursor-grabbing' : '',
  }
}

/** Rij in de to-do list: taak plus de kolommen Prioriteit, Status, Bedrijf en Deadline */
function TabelRij(p: RijProps) {
  const { taak } = p
  const titel = useTitelBewerken(taak, p.onTitel)
  const { cursor, ...sleep } = sleepAttributen(p, titel.bewerken)
  const prio = prioriteitInfo(taak.prioriteit)
  const status = statusVan(taak)
  const bedrijf = taak.bedrijf ? getCompany(taak.bedrijf) : null
  const verlopen = !!taak.deadline && !taak.done && taak.deadline < p.todayStr
  const cel = 'border-l border-gray-100 px-2 py-1.5 flex items-center'

  return (
    <div
      {...sleep}
      className={`group flex items-stretch border-b border-gray-100 last:border-0 transition-all ${cursor} ${p.dragging ? 'opacity-40' : 'hover:bg-gray-50'}`}
    >
      <div className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-3 py-2">
        <GripVertical size={14} className={`text-gray-300 group-hover:text-gray-400 flex-shrink-0 hidden md:block ${p.sleepbaar ? '' : 'invisible'}`} aria-label="Sleep naar Vandaag" />
        <AfvinkKnop taak={taak} onToggle={p.onToggle} />
        {titel.veld}
        {!titel.bewerken && (
          <button onClick={titel.start} title="Aanpassen" aria-label="Aanpassen" className={`${HOVER_KNOP} hover:text-brand-text-primary`}>
            <Pencil size={13} />
          </button>
        )}
        {p.onVerplaats && (
          <button onClick={p.onVerplaats} title="Op de lijst van vandaag zetten" aria-label="Op de lijst van vandaag zetten" className={`${HOVER_KNOP} hover:text-brand-status-orange`}>
            <Sun size={14} />
          </button>
        )}
      </div>

      <div className={`${KOL.prioriteit} ${cel}`}>
        <Keuzelijst
          opties={PRIORITEITEN.map(o => ({ waarde: o.waarde, label: o.label, voor: <Flag size={13} className={`fill-current ${o.tekst}`} /> }))}
          waarde={taak.prioriteit}
          onKies={p.onPrioriteit}
          geenLabel="Geen prioriteit"
          title="Prioriteit"
        >
          {prio
            ? <span className={`pill ${prio.pill} inline-flex items-center gap-1`}><Flag size={11} className="fill-current" />{prio.label}</span>
            : <LegeCel />}
        </Keuzelijst>
      </div>

      <div className={`${KOL.status} ${cel}`}>
        <Keuzelijst
          opties={[...STATUSSEN, AFGEROND_STATUS].map(o => ({ waarde: o.waarde, label: o.label, voor: <span className={`w-2 h-2 rounded-full ${o.stip}`} /> }))}
          waarde={status.waarde}
          onKies={w => w && p.onStatus(w)}
          title="Status"
        >
          <span className={`pill ${status.pill} inline-flex items-center gap-1.5 whitespace-nowrap`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.stip}`} />
            {status.label}
          </span>
        </Keuzelijst>
      </div>

      <div className={`${KOL.bedrijf} ${cel}`}>
        <Keuzelijst
          opties={COMPANIES.map(c => ({ waarde: c.id, label: c.name }))}
          waarde={taak.bedrijf}
          onKies={p.onBedrijf}
          geenLabel="Geen bedrijf"
          title="Bedrijf"
        >
          {bedrijf
            // Zelfde bedrijfskleuren als op offertes, facturen en klanten
            ? <span className="pill truncate max-w-full" style={{ backgroundColor: bedrijf.bgColor, color: bedrijf.color }}>{bedrijf.name}</span>
            : <LegeCel />}
        </Keuzelijst>
      </div>

      <div className={`${KOL.deadline} ${cel}`}>
        <DeadlineCel waarde={taak.deadline} verlopen={verlopen} onKies={p.onDeadline} />
      </div>

      <div className="w-12 border-l border-gray-100 flex items-center justify-center">
        <button onClick={p.onDelete} title="Verwijderen" aria-label="Verwijderen" className={`${HOVER_KNOP} hover:text-red-400`}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

/** Rij in de smalle kolom Vandaag: prioriteit als gekleurd vlaggetje, deadline alleen als hij er is */
function VandaagRij(p: RijProps) {
  const { taak } = p
  const titel = useTitelBewerken(taak, p.onTitel)
  const { cursor, ...sleep } = sleepAttributen(p, titel.bewerken)
  const prio = prioriteitInfo(taak.prioriteit)
  const verlopen = !!taak.deadline && !taak.done && taak.deadline < p.todayStr

  return (
    <div
      {...sleep}
      className={`group flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 transition-all ${cursor} ${p.dragging ? 'opacity-40' : 'hover:bg-gray-50'}`}
    >
      <GripVertical size={14} className="text-gray-300 group-hover:text-gray-400 flex-shrink-0 hidden md:block" />
      <AfvinkKnop taak={taak} onToggle={p.onToggle} />
      {titel.veld}

      {/* Blijven staan van een eerdere dag: laten zien hoe lang al */}
      {!taak.done && taak.scheduledDate && taak.scheduledDate < p.todayStr && (
        <span className="text-caption whitespace-nowrap flex-shrink-0 text-brand-text-secondary" title="Niet afgevinkt, doorgeschoven naar vandaag">
          sinds {kortDatum(taak.scheduledDate)}
        </span>
      )}

      {taak.deadline && (
        <span className={`text-caption whitespace-nowrap flex-shrink-0 ${verlopen ? 'text-brand-status-red font-medium' : 'text-brand-text-secondary'}`}>
          {kortDatum(taak.deadline)}
        </span>
      )}

      <Keuzelijst
        opties={PRIORITEITEN.map(o => ({ waarde: o.waarde, label: o.label, voor: <Flag size={13} className={`fill-current ${o.tekst}`} /> }))}
        waarde={taak.prioriteit}
        onKies={p.onPrioriteit}
        geenLabel="Geen prioriteit"
        title={prio ? `Prioriteit: ${prio.label}` : 'Prioriteit geven'}
        compact
        altijdZichtbaar={!!prio}
      >
        <Flag size={14} className={prio ? `fill-current ${prio.tekst}` : 'text-gray-300 hover:text-brand-text-primary'} />
      </Keuzelijst>

      {p.onVerplaats && (
        <button onClick={p.onVerplaats} title="Terug naar de to-do list" aria-label="Terug naar de to-do list" className={`${HOVER_KNOP} hover:text-brand-text-primary`}>
          <CornerUpLeft size={14} />
        </button>
      )}

      <button onClick={p.onDelete} title="Verwijderen" aria-label="Verwijderen" className={`${HOVER_KNOP} hover:text-red-400`}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function LegeCel() {
  return <span className="text-caption text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">Kies</span>
}

/**
 * Cel die bij een klik een keuzelijst opent, zoals een select-kolom in Notion.
 * De lijst staat `fixed`, anders knipt de scrollende tabelkaart hem af bij de onderste rijen.
 */
function Keuzelijst<T extends string>({ opties, waarde, onKies, geenLabel, title, compact, altijdZichtbaar, children }: {
  opties: { waarde: T; label: string; voor?: ReactNode }[]
  waarde?: T
  onKies: (w: T | null) => void
  geenLabel?: string
  title: string
  compact?: boolean
  altijdZichtbaar?: boolean
  children: ReactNode
}) {
  const [plek, setPlek] = useState<{ top: number; left: number } | null>(null)
  const knopRef = useRef<HTMLButtonElement>(null)
  const lijstRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!plek) return
    function sluit(e: Event) {
      if (e.type === 'mousedown' && (lijstRef.current?.contains(e.target as Node) || knopRef.current?.contains(e.target as Node))) return
      setPlek(null)
    }
    function toets(e: KeyboardEvent) { if (e.key === 'Escape') setPlek(null) }
    document.addEventListener('mousedown', sluit)
    window.addEventListener('scroll', sluit, true)
    window.addEventListener('resize', sluit)
    document.addEventListener('keydown', toets)
    return () => {
      document.removeEventListener('mousedown', sluit)
      window.removeEventListener('scroll', sluit, true)
      window.removeEventListener('resize', sluit)
      document.removeEventListener('keydown', toets)
    }
  }, [plek])

  function open() {
    if (plek) return setPlek(null)
    const r = knopRef.current?.getBoundingClientRect()
    if (!r) return
    const breedte = 184
    const hoogte = (opties.length + (geenLabel ? 1 : 0)) * 34 + 20
    const top = r.bottom + hoogte + 8 > window.innerHeight ? Math.max(8, r.top - hoogte - 4) : r.bottom + 4
    setPlek({ top, left: Math.max(8, Math.min(compact ? r.right - breedte : r.left, window.innerWidth - breedte - 8)) })
  }

  function kies(w: T | null) {
    onKies(w)
    setPlek(null)
  }

  return (
    <>
      <button
        ref={knopRef}
        onClick={open}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={!!plek}
        className={compact
          ? `flex-shrink-0 p-1 rounded transition-all ${altijdZichtbaar || plek ? '' : HOVER_KNOP}`
          : 'w-full min-w-0 h-full flex items-center rounded-md px-1 -mx-1 hover:bg-gray-100/70 transition-colors'}
      >
        {children}
      </button>

      {plek && (
        <div
          ref={lijstRef}
          role="menu"
          style={{ top: plek.top, left: plek.left }}
          className="fixed z-50 w-[184px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
        >
          {opties.map(o => (
            <button
              key={o.waarde}
              role="menuitem"
              onClick={() => kies(o.waarde)}
              className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-gray-50 ${waarde === o.waarde ? 'bg-gray-50 font-medium' : ''}`}
            >
              {o.voor}
              <span className="flex-1 truncate text-brand-text-primary">{o.label}</span>
              {waarde === o.waarde && <Check size={13} className="text-brand-text-secondary" />}
            </button>
          ))}
          {geenLabel && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                role="menuitem"
                onClick={() => kies(null)}
                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left text-brand-text-secondary hover:bg-gray-50"
              >
                <X size={13} />
                {geenLabel}
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}

/** Deadline: klik opent de datumkiezer van de browser, het kruisje haalt hem weg. Verlopen = rood. */
function DeadlineCel({ waarde, verlopen, onKies }: { waarde?: string; verlopen: boolean; onKies: (d: string | null) => void }) {
  const invoerRef = useRef<HTMLInputElement>(null)

  function open() {
    const el = invoerRef.current
    if (!el) return
    try { el.showPicker() } catch { el.focus() }
  }

  return (
    <div className="relative w-full flex items-center gap-1">
      <button
        onClick={open}
        title="Deadline kiezen"
        className="flex-1 min-w-0 text-left rounded-md px-1 -mx-1 py-0.5 hover:bg-gray-100/70 transition-colors"
      >
        {waarde
          ? <span className={`text-caption whitespace-nowrap ${verlopen ? 'text-brand-status-red font-medium' : 'text-brand-text-primary'}`}>{kortDatum(waarde)}</span>
          : <LegeCel />}
      </button>
      {waarde && (
        <button onClick={() => onKies(null)} aria-label="Deadline weghalen" className={`${HOVER_KNOP} hover:text-brand-text-primary`}>
          <X size={12} />
        </button>
      )}
      {/* Onzichtbaar veld, alleen voor de datumkiezer */}
      <input
        ref={invoerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={waarde ?? ''}
        onChange={e => onKies(e.target.value || null)}
        className="absolute left-0 bottom-0 w-0 h-0 opacity-0 pointer-events-none"
      />
    </div>
  )
}
