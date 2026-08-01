/**
 * Clientkant van de bestandssync. Leest de NDJSON-stream van /api/admin/sync.
 *
 * Staat apart omdat zowel de knop als de automatische achtergrondsync op de
 * facturenpagina de uitkomst moeten kennen. Vooral `ontbrekend` mag nergens
 * meer weggegooid worden: dat is de enige plek waar je ziet dat er een PDF
 * onder een factuur vandaan is gehaald.
 */

export interface OntbrekendDoc {
  type: 'factuur' | 'offerte'
  number: string
  /** Pad waar het bestand alsnog gevonden is, of null als het echt weg is. */
  gevondenOp: string | null
}

export interface SyncSamenvatting {
  imported: number
  skipped: number
  failed: number
  ontbrekend: OntbrekendDoc[]
}

type SyncBericht =
  | { type: 'scan'; total: number; scanned: number; ontbrekend?: OntbrekendDoc[] }
  | { type: 'progress'; current: number; total: number }
  | { type: 'done'; imported: number; skipped: number; failed: number; ontbrekend?: OntbrekendDoc[] }
  | { type: 'error'; message: string }

const LEEG: SyncSamenvatting = { imported: 0, skipped: 0, failed: 0, ontbrekend: [] }

export async function runSync(onBericht?: (msg: SyncBericht) => void): Promise<SyncSamenvatting> {
  const res = await fetch('/api/admin/sync', { method: 'POST' })
  if (!res.ok || !res.body) return { ...LEEG }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let samenvatting: SyncSamenvatting = { ...LEEG }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const regels = buffer.split('\n')
    buffer = regels.pop() ?? ''

    for (const regel of regels) {
      if (!regel.trim()) continue
      let msg: SyncBericht
      try {
        msg = JSON.parse(regel) as SyncBericht
      } catch {
        continue
      }
      onBericht?.(msg)
      if (msg.type === 'scan' && msg.ontbrekend) {
        samenvatting = { ...samenvatting, ontbrekend: msg.ontbrekend }
      } else if (msg.type === 'done') {
        samenvatting = {
          imported: msg.imported ?? 0,
          skipped: msg.skipped ?? 0,
          failed: msg.failed ?? 0,
          ontbrekend: msg.ontbrekend ?? samenvatting.ontbrekend,
        }
      }
    }
  }

  return samenvatting
}
