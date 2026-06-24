import fs from 'fs'
import path from 'path'

export interface AdminSyncState {
  facturen: string[]
  offertes: string[]
  updatedAt?: string
}

const EMPTY_STATE: AdminSyncState = { facturen: [], offertes: [] }

function statePath(): string {
  return path.join(process.cwd(), '.next', 'admin-sync-state.json')
}

function normalize(numbers: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(numbers).map(n => n.toUpperCase()).filter(Boolean))).sort()
}

export function readAdminSyncState(): AdminSyncState {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AdminSyncState>
    return {
      facturen: normalize(parsed.facturen ?? []),
      offertes: normalize(parsed.offertes ?? []),
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return EMPTY_STATE
  }
}

export function mergeAdminSyncSeen(seen: { facturen?: Iterable<string>; offertes?: Iterable<string> }) {
  const current = readAdminSyncState()
  const next: AdminSyncState = {
    facturen: normalize([...(current.facturen ?? []), ...Array.from(seen.facturen ?? [])]),
    offertes: normalize([...(current.offertes ?? []), ...Array.from(seen.offertes ?? [])]),
    updatedAt: new Date().toISOString(),
  }
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true })
    fs.writeFileSync(statePath(), JSON.stringify(next, null, 2))
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
    fs.mkdirSync(path.dirname(statePath()), { recursive: true })
    fs.writeFileSync(statePath(), JSON.stringify(next, null, 2))
  } catch {
    // Lokale sync-state is een cache; opruimen uit DB is al uitgevoerd.
  }
}
