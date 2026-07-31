/**
 * Leadpipeline: fases, opvolging en contactmomenten.
 *
 * De fase (kolom op het bord) zegt WAAR een lead staat. De opvolging
 * (volgende_actie + laatste_contact) zegt WANNEER je er weer iets mee moet.
 * Dat zijn bewust twee losse assen: een lead die je drie keer hebt nagebeld
 * blijft gewoon "Benaderd", alleen de datum en de teller lopen op.
 *
 * Dit bestand is de bron van waarheid voor de statussen van leads. ClickUp is
 * losgekoppeld en levert die config niet meer.
 */

export interface FaseDef {
  /** Opgeslagen waarde in clickup_crm_records.status (lowercase). */
  status: string
  label: string
  kleur: string
  groep: 'Not started' | 'Active' | 'Done' | 'Closed'
  /** Standaard zichtbaar als kolom op het leadbord. */
  opBord: boolean
  /** Standaard aantal dagen tot de volgende actie, null = geen opvolging. */
  opvolgDagen: number | null
  /** Korte uitleg, getoond als tooltip op de kolomkop. */
  uitleg?: string
}

export const LEAD_FASES: FaseDef[] = [
  {
    status: 'nieuwe kans', label: 'Nieuwe kans', kleur: '#06b6d4', groep: 'Not started',
    opBord: true, opvolgDagen: 2,
    uitleg: 'Binnengekomen, nog niks mee gedaan.',
  },
  {
    status: 'benaderd', label: 'Benaderd', kleur: '#a855f7', groep: 'Active',
    opBord: true, opvolgDagen: 7,
    uitleg: 'Jij hebt contact gezocht, wacht op reactie.',
  },
  {
    status: 'in gesprek', label: 'In gesprek', kleur: '#6366f1', groep: 'Active',
    opBord: true, opvolgDagen: 3,
    uitleg: 'Er is tweerichtingsverkeer.',
  },
  {
    status: 'offerte uit', label: 'Offerte uit', kleur: '#0ea5e9', groep: 'Active',
    opBord: true, opvolgDagen: 5,
    uitleg: 'Offerte verstuurd, wacht op een beslissing.',
  },
  {
    status: 'later opvolgen', label: 'Later opvolgen', kleur: '#f59e0b', groep: 'Active',
    opBord: true, opvolgDagen: 30,
    uitleg: 'Interesse, maar niet nu. Komt terug op de ingestelde datum.',
  },
  {
    status: 'gewonnen', label: 'Gewonnen', kleur: '#22c55e', groep: 'Done',
    opBord: true, opvolgDagen: null,
  },
  {
    status: 'niets uitgekomen', label: 'Niets uitgekomen', kleur: '#fb923c', groep: 'Closed',
    opBord: true, opvolgDagen: null,
    uitleg: 'Doodgelopen, je hoort niets meer. Geen actie gepland, geen blokkade.',
  },
  {
    status: 'verloren', label: 'Verloren', kleur: '#f43f5e', groep: 'Closed',
    opBord: true, opvolgDagen: null,
    uitleg: 'Bewust afgevallen, bijvoorbeeld nee gekregen of naar een ander gegaan.',
  },
  // Onderstaande statussen bestaan nog in de data, maar krijgen geen eigen kolom.
  // Ze zijn zichtbaar via "Toon afgesloten" en in de lijstweergave.
  { status: 'on hold', label: 'On hold', kleur: '#f59e0b', groep: 'Active', opBord: false, opvolgDagen: null },
  { status: 'klant on hold', label: 'Klant on hold', kleur: '#f59e0b', groep: 'Active', opBord: false, opvolgDagen: null },
  { status: 'blacklist', label: 'Blacklist', kleur: '#4b5563', groep: 'Closed', opBord: false, opvolgDagen: null },
  { status: 'archief', label: 'Archief', kleur: '#9ca3af', groep: 'Closed', opBord: false, opvolgDagen: null },
]

const FASE_BY_STATUS: Record<string, FaseDef> = Object.fromEntries(
  LEAD_FASES.map((f) => [f.status, f])
)

export function faseDef(status?: string | null): FaseDef | null {
  return FASE_BY_STATUS[(status || '').toLowerCase().trim()] ?? null
}

/** Statussen in bordvolgorde. Afgesloten fases alleen op verzoek. */
export function leadBordFases(toonAfgesloten = false): FaseDef[] {
  return LEAD_FASES.filter((f) => f.opBord || toonAfgesloten)
}

/** Alle leadstatussen in vaste volgorde, voor pickers en filters. */
export const LEAD_STATUS_VOLGORDE = LEAD_FASES.map((f) => f.status)

// ── Opvolging ───────────────────────────────────────────────────────

/** Lokale datum als yyyy-mm-dd, zodat er geen dag verschuift door UTC. */
export function datumISO(d: Date = new Date()): string {
  const jaar = d.getFullYear()
  const maand = String(d.getMonth() + 1).padStart(2, '0')
  const dag = String(d.getDate()).padStart(2, '0')
  return `${jaar}-${maand}-${dag}`
}

export function datumPlusDagen(dagen: number, vanaf: Date = new Date()): string {
  const d = new Date(vanaf)
  d.setDate(d.getDate() + dagen)
  return datumISO(d)
}

/** Standaard opvolgdatum voor een fase, of null als die fase geen opvolging kent. */
export function standaardOpvolgdatum(status?: string | null, vanaf: Date = new Date()): string | null {
  const dagen = faseDef(status)?.opvolgDagen
  return dagen == null ? null : datumPlusDagen(dagen, vanaf)
}

/** Snelkeuzes in de datumkiezer. De standaardwaarde per fase komt daar bovenop. */
export const OPVOLG_PRESETS: Array<{ label: string; dagen: number }> = [
  { label: 'Morgen', dagen: 1 },
  { label: 'Over 3 dagen', dagen: 3 },
  { label: 'Over een week', dagen: 7 },
  { label: 'Over 2 weken', dagen: 14 },
  { label: 'Over een maand', dagen: 30 },
  { label: 'Over 3 maanden', dagen: 90 },
]

export type OpvolgStand = 'geen' | 'gepland' | 'vandaag' | 'te laat'

export function opvolgStand(volgendeActie?: string | null, vandaag: string = datumISO()): OpvolgStand {
  if (!volgendeActie) return 'geen'
  const datum = String(volgendeActie).slice(0, 10)
  if (datum < vandaag) return 'te laat'
  if (datum === vandaag) return 'vandaag'
  return 'gepland'
}

/** Staat deze lead vandaag op de lijst? Geblokkeerd of nog in pauze nooit. */
export function moetVandaagOpgepakt(record: ContactStatusRecord & {
  volgende_actie?: string | null
  status?: string | null
}): boolean {
  const contact = contactStand(record)
  if (contact === 'blokkade' || contact === 'pauze') return false
  const groep = faseDef(record.status)?.groep
  if (groep === 'Done' || groep === 'Closed') return false
  const stand = opvolgStand(record.volgende_actie)
  return stand === 'vandaag' || stand === 'te laat'
}

/** Leesbare weergave: "vandaag", "3 dagen te laat", "over 5 dagen". */
export function opvolgLabel(volgendeActie?: string | null): string | null {
  if (!volgendeActie) return null
  const datum = String(volgendeActie).slice(0, 10)
  const vandaag = datumISO()
  if (datum === vandaag) return 'vandaag'
  const verschil = Math.round(
    (new Date(`${datum}T12:00:00`).getTime() - new Date(`${vandaag}T12:00:00`).getTime()) / 86400000
  )
  if (verschil < 0) {
    const dagen = Math.abs(verschil)
    return dagen === 1 ? '1 dag te laat' : `${dagen} dagen te laat`
  }
  if (verschil === 1) return 'morgen'
  if (verschil < 14) return `over ${verschil} dagen`
  if (verschil < 60) return `over ${Math.round(verschil / 7)} weken`
  return new Date(`${datum}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ── Contactstatus: mag ik deze relatie benaderen ────────────────────
// Los van de fase. Een lead in "Niets uitgekomen" is niet geblokkeerd, en een
// geblokkeerde relatie kan in elke fase staan.

export type ContactStatus = 'open' | 'pauze' | 'blokkade'

export interface ContactStatusRecord {
  contact_status?: string | null
  contact_status_tot?: string | null
  contact_status_reden?: string | null
}

export const CONTACT_STATUSSEN: Array<{
  status: ContactStatus
  label: string
  korteUitleg: string
  kleur: string
}> = [
  { status: 'open', label: 'Gewoon benaderbaar', korteUitleg: 'Geen beperking.', kleur: '#22c55e' },
  { status: 'pauze', label: 'Voorlopig even niet', korteUitleg: 'Zachte stop, komt na de einddatum vanzelf terug.', kleur: '#f59e0b' },
  { status: 'blokkade', label: 'Nooit meer benaderen', korteUitleg: 'Harde stop, blijft staan tot je hem zelf opheft.', kleur: '#1f2937' },
]

/** Snelkeuzes voor de duur van een pauze. */
export const PAUZE_PRESETS: Array<{ label: string; dagen: number | null }> = [
  { label: '1 maand', dagen: 30 },
  { label: '3 maanden', dagen: 90 },
  { label: '6 maanden', dagen: 180 },
  { label: 'Zonder einddatum', dagen: null },
]

/**
 * Werkelijke stand: een pauze waarvan de einddatum voorbij is, telt weer als
 * open. De opgeslagen waarde blijft staan tot je zelf iets doet.
 */
export function contactStand(record: ContactStatusRecord): ContactStatus {
  const opgeslagen = (record.contact_status || 'open') as ContactStatus
  if (opgeslagen !== 'pauze') return opgeslagen
  const tot = record.contact_status_tot?.slice(0, 10)
  if (tot && tot <= datumISO()) return 'open'
  return 'pauze'
}

export function isGeblokkeerd(record: ContactStatusRecord): boolean {
  return contactStand(record) === 'blokkade'
}

/** Pauze die is afgelopen: de relatie mag weer, maar je hebt nog niks gedaan. */
export function pauzeAfgelopen(record: ContactStatusRecord): boolean {
  return (record.contact_status || 'open') === 'pauze' && contactStand(record) === 'open'
}

export function contactStatusLabel(record: ContactStatusRecord): string | null {
  const stand = contactStand(record)
  if (stand === 'blokkade') return 'Niet benaderen'
  if (stand === 'pauze') {
    const tot = record.contact_status_tot?.slice(0, 10)
    if (!tot) return 'Pauze'
    return `Pauze tot ${new Date(`${tot}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`
  }
  if (pauzeAfgelopen(record)) return 'Pauze afgelopen'
  return null
}

// ── Contactmomenten ─────────────────────────────────────────────────

export type ContactSoort = 'mail' | 'telefoon' | 'whatsapp' | 'meeting' | 'notitie'

export const CONTACT_SOORTEN: Array<{ soort: ContactSoort; label: string; werkwoord: string }> = [
  { soort: 'mail', label: 'Mail', werkwoord: 'Gemaild' },
  { soort: 'telefoon', label: 'Telefoon', werkwoord: 'Gebeld' },
  { soort: 'whatsapp', label: 'WhatsApp', werkwoord: 'Geappt' },
  { soort: 'meeting', label: 'Meeting', werkwoord: 'Gesproken' },
  { soort: 'notitie', label: 'Notitie', werkwoord: 'Notitie' },
]

/**
 * Waar een lead heen schuift zodra je contact logt. Alleen de eerste stap is
 * automatisch: van "Nieuwe kans" naar "Benaderd". Daarna bepaal jij de fase,
 * want een tweede belletje maakt een lead niet automatisch verder.
 */
export function faseNaContact(status?: string | null): string | null {
  const huidig = (status || '').toLowerCase().trim()
  if (huidig === 'nieuwe kans' || huidig === '' || huidig === 'open') return 'benaderd'
  return null
}
