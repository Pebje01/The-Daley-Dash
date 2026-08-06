/**
 * Wachtrij voor lead-kwalificaties.
 *
 * Elke kwalificatie start een eigen claude-proces dat een minuut kan duren.
 * Zonder rem zou het importeren van dertig leads dertig processen tegelijk
 * starten en je abonnementslimiet in een klap opsouperen. Twee tegelijk is
 * genoeg om het vlot te houden zonder de Mac of je limiet te belasten.
 */
import { kwalificeerLead } from './kwalificeer-lead'

const MAX_TEGELIJK = Number(process.env.LEAD_AI_CONCURRENCY || 2)

interface Wachtrij {
  wachtend: string[]
  bezig: Set<string>
}

// Next.js herlaadt modules bij elke wijziging in dev. Zonder globalThis zou de
// wachtrij dan leeglopen en zouden dubbele runs kunnen ontstaan.
const g = globalThis as unknown as { __leadAiWachtrij?: Wachtrij }
const rij: Wachtrij = (g.__leadAiWachtrij ??= { wachtend: [], bezig: new Set() })

/**
 * Zet een lead in de rij. Keert direct terug: de aanroeper hoeft niet te
 * wachten tot de AI klaar is.
 */
export function planKwalificatie(leadId: string): void {
  if (process.env.LEAD_AI_UIT === '1') return
  if (rij.bezig.has(leadId) || rij.wachtend.includes(leadId)) return
  rij.wachtend.push(leadId)
  void pomp()
}

async function pomp(): Promise<void> {
  while (rij.bezig.size < MAX_TEGELIJK && rij.wachtend.length > 0) {
    const leadId = rij.wachtend.shift()!
    rij.bezig.add(leadId)

    void kwalificeerLead(leadId)
      .catch(() => undefined) // de fout staat al in ai_fout op het record
      .finally(() => {
        rij.bezig.delete(leadId)
        void pomp()
      })
  }
}

export function wachtrijStand() {
  return { wachtend: rij.wachtend.length, bezig: rij.bezig.size }
}
