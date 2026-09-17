import { CompanyId, Taak, TaakPrioriteit, TaakStatus } from './types'

// Lokale datum, niet toISOString: die rekent in UTC en zou tussen middernacht
// en twee uur 's nachts nog de dag van gisteren geven.
export function vandaagLokaal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const PRIORITEITEN: { waarde: TaakPrioriteit; label: string; pill: string; stip: string; tekst: string }[] = [
  { waarde: 'urgent', label: 'Urgent', pill: 'bg-brand-status-red/10 text-brand-status-red', stip: 'bg-brand-status-red', tekst: 'text-brand-status-red' },
  { waarde: 'hoog', label: 'Hoog', pill: 'bg-brand-status-orange/10 text-brand-status-orange', stip: 'bg-brand-status-orange', tekst: 'text-brand-status-orange' },
  { waarde: 'middel', label: 'Middel', pill: 'bg-brand-light-blue text-brand-blue-accent', stip: 'bg-brand-blue-accent', tekst: 'text-brand-blue-accent' },
  { waarde: 'laag', label: 'Laag', pill: 'bg-gray-100 text-brand-text-secondary', stip: 'bg-gray-300', tekst: 'text-gray-400' },
]

export function prioriteitInfo(p?: TaakPrioriteit) {
  return PRIORITEITEN.find(x => x.waarde === p)
}

/** Open standen van een taak. Afgerond is geen status maar `done`, zie `statusVan`. */
export const STATUSSEN: { waarde: TaakStatus; label: string; pill: string; stip: string }[] = [
  { waarde: 'niet_gestart', label: 'Niet gestart', pill: 'bg-gray-100 text-brand-text-secondary', stip: 'bg-gray-400' },
  { waarde: 'bezig', label: 'Bezig', pill: 'bg-brand-light-blue text-brand-blue-accent', stip: 'bg-brand-blue-accent' },
]
export const AFGEROND_STATUS = { waarde: 'afgerond' as const, label: 'Afgerond', pill: 'bg-brand-status-green/10 text-brand-status-green', stip: 'bg-brand-status-green' }

export function statusVan(taak: Taak) {
  if (taak.done) return AFGEROND_STATUS
  return STATUSSEN.find(s => s.waarde === taak.status) ?? STATUSSEN[0]
}

/** Filter boven de tabel: alles, per prioriteit, of afgerond */
export type TakenTab = 'alles' | TaakPrioriteit | 'afgerond'
export const TAKEN_TABS: { waarde: TakenTab; label: string }[] = [
  { waarde: 'alles', label: 'Alles' },
  ...PRIORITEITEN.map(p => ({ waarde: p.waarde, label: p.label })),
  { waarde: 'afgerond', label: 'Afgerond' },
]

/** Eigen volgorde; taken zonder positie (van vóór de migratie) op aanmaakdatum, nieuwste eerst. */
export function sorteerTaken(taken: Taak[]): Taak[] {
  return [...taken].sort((a, b) => {
    const pa = a.positie ?? -Infinity
    const pb = b.positie ?? -Infinity
    if (pa !== pb) return pa < pb ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/** Kolommen in de to-do list waarop je kunt sorteren */
export type SorteerVeld = 'titel' | 'prioriteit' | 'status' | 'bedrijf' | 'deadline'
export interface Sortering {
  veld: SorteerVeld
  /** op = de natuurlijke volgorde (A tot Z, urgent eerst, vroegste deadline eerst), af = andersom */
  richting: 'op' | 'af'
}

export const SORTEER_UITLEG: Record<SorteerVeld, { op: string; af: string }> = {
  titel: { op: 'A tot Z', af: 'Z tot A' },
  prioriteit: { op: 'urgent eerst', af: 'laag eerst' },
  status: { op: 'niet gestart eerst', af: 'afgerond eerst' },
  bedrijf: { op: 'A tot Z', af: 'Z tot A' },
  deadline: { op: 'vroegste eerst', af: 'laatste eerst' },
}

const PRIORITEIT_RANG: Record<TaakPrioriteit, number> = { urgent: 0, hoog: 1, middel: 2, laag: 3 }
const STATUS_RANG = { niet_gestart: 0, bezig: 1, afgerond: 2 } as const

/**
 * Sorteert op een kolom. Lege waarden (geen prioriteit, bedrijf of deadline)
 * staan altijd onderaan, welke kant je ook op sorteert: die wil je niet eerst
 * zien. Bij gelijke waarden blijft je eigen volgorde staan.
 */
export function sorteerOpKolom(taken: Taak[], sortering: Sortering, bedrijfsnaam: (id: CompanyId) => string): Taak[] {
  const eigen = new Map(sorteerTaken(taken).map((t, i) => [t.id, i]))
  const waarde = (t: Taak): string | number | null => {
    switch (sortering.veld) {
      case 'titel': return t.title.trim().toLowerCase()
      case 'prioriteit': return t.prioriteit ? PRIORITEIT_RANG[t.prioriteit] : null
      case 'status': return STATUS_RANG[statusVan(t).waarde]
      case 'bedrijf': return t.bedrijf ? bedrijfsnaam(t.bedrijf).toLowerCase() : null
      case 'deadline': return t.deadline ?? null
    }
  }
  const teken = sortering.richting === 'op' ? 1 : -1

  return [...taken].sort((a, b) => {
    const va = waarde(a)
    const vb = waarde(b)
    if (va === null && vb !== null) return 1
    if (vb === null && va !== null) return -1
    if (va !== null && vb !== null && va !== vb) {
      const verschil = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'nl')
      if (verschil !== 0) return verschil * teken
    }
    return (eigen.get(a.id) ?? 0) - (eigen.get(b.id) ?? 0)
  })
}
