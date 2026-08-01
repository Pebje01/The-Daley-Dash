import fs from 'fs'
import os from 'os'
import path from 'path'

export interface AdminSyncState {
  facturen: string[]
  offertes: string[]
  updatedAt?: string
}

const EMPTY_STATE: AdminSyncState = { facturen: [], offertes: [] }

/**
 * Deze state onthoudt welke nummers de sync ooit op schijf heeft gezien, en
 * bepaalt daarmee wanneer een ontbrekende PDF gemeld wordt.
 *
 * Stond eerst in `.next/`, dus in de buildmap. Bij elke schone build was hij weg
 * en gedroeg de sync zich stilzwijgend anders. Nu op een vaste plek buiten de
 * build, met eenmalige overname van het oude bestand zodat er niets verloren
 * gaat bij het overstappen.
 */
function statePath(): string {
  const basis = process.env.DALEY_DASH_STATE_DIR
    ?? path.join(os.homedir(), 'Library', 'Application Support', 'daley-dash')
  return path.join(basis, 'admin-sync-state.json')
}

function oudeStatePath(): string {
  return path.join(process.cwd(), '.next', 'admin-sync-state.json')
}

function schrijfState(next: AdminSyncState) {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true })
  fs.writeFileSync(statePath(), JSON.stringify(next, null, 2))
}

function normalize(numbers: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(numbers).map(n => n.toUpperCase()).filter(Boolean))).sort()
}

export function readAdminSyncState(): AdminSyncState {
  for (const pad of [statePath(), oudeStatePath()]) {
    try {
      const raw = fs.readFileSync(pad, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AdminSyncState>
      return {
        facturen: normalize(parsed.facturen ?? []),
        offertes: normalize(parsed.offertes ?? []),
        updatedAt: parsed.updatedAt,
      }
    } catch {
      // Volgende locatie proberen; de oude plek in .next is de terugvaloptie.
    }
  }
  return EMPTY_STATE
}

export function mergeAdminSyncSeen(seen: { facturen?: Iterable<string>; offertes?: Iterable<string> }) {
  const current = readAdminSyncState()
  const next: AdminSyncState = {
    facturen: normalize([...(current.facturen ?? []), ...Array.from(seen.facturen ?? [])]),
    offertes: normalize([...(current.offertes ?? []), ...Array.from(seen.offertes ?? [])]),
    updatedAt: new Date().toISOString(),
  }
  try {
    schrijfState(next)
  } catch {
    // Lokale sync-state is een cache; scannen mag niet falen als schrijven niet kan.
  }
}

export function forgetAdminSyncNumbers(removed: { facturen?: Iterable<string>; offertes?: Iterable<string> }) {
  const current = readAdminSyncState()
  const removedFacturen = new Set(normalize(removed.facturen ?? []))
  const removedOffertes = new Set(normalize(removed.offertes ?? []))
  const next: AdminSyncState = {
    facturen: current.facturen.filter(n => !removedFacturen.has(n)),
    offertes: current.offertes.filter(n => !removedOffertes.has(n)),
    updatedAt: new Date().toISOString(),
  }
  try {
    schrijfState(next)
  } catch {
    // Lokale sync-state is een cache; opruimen uit DB is al uitgevoerd.
  }
}
