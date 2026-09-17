/**
 * Wachtrij voor het opzoeken van contactgegevens bij prospects.
 *
 * Precies dezelfde reden als bij de kwalificatiewachtrij: elke zoekactie start
 * een eigen claude-proces dat een paar minuten kan duren. Tien leads tegelijk
 * betekent tien processen en een gat in je limiet. Twee tegelijk houdt het
 * vlot zonder de Mac of het abonnement te belasten.
 *
 * Bewust een eigen rij naast de kwalificatie, zodat een reeks contactzoekopdrachten
 * de beoordeling van nieuwe leads niet blokkeert.
 */
import { zoekContactgegevens } from './zoek-contactgegevens'
import { createServiceClient } from '@/lib/supabase/service'

const MAX_TEGELIJK = Number(process.env.LEAD_CONTACT_CONCURRENCY || 2)

interface Wachtrij {
  wachtend: string[]
  bezig: Set<string>
}

// Next.js herlaadt modules bij elke wijziging in dev. Zonder globalThis zou de
// wachtrij dan leeglopen en zouden dubbele runs kunnen ontstaan.
const g = globalThis as unknown as { __leadContactWachtrij?: Wachtrij }
const rij: Wachtrij = (g.__leadContactWachtrij ??= { wachtend: [], bezig: new Set() })

/**
 * Zet een prospect in de rij. Keert direct terug: de aanroeper hoeft niet te
 * wachten tot de zoekactie klaar is, de uitslag druppelt in de ruwe_-kolommen.
 */
export function planContactZoektocht(recordId: string): void {
  if (process.env.LEAD_AI_UIT === '1') return
  if (rij.bezig.has(recordId) || rij.wachtend.includes(recordId)) return

  rij.wachtend.push(recordId)

  // Meteen op wachtend zetten, anders ziet het scherm pas iets gebeuren zodra
  // het proces daadwerkelijk start en lijkt de knop niets te doen.
  void createServiceClient()
    .from('clickup_crm_records')
    .update({ ruwe_contact_status: 'wachtend', ruwe_contact_fout: null })
    .eq('id', recordId)
    .then(
      () => undefined,
      () => undefined
    )

  void pomp()
}

async function pomp(): Promise<void> {
  while (rij.bezig.size < MAX_TEGELIJK && rij.wachtend.length > 0) {
    const recordId = rij.wachtend.shift()!
    rij.bezig.add(recordId)

    void zoekContactgegevens(recordId)
      .catch(() => undefined) // de fout staat al in ruwe_contact_fout op het record
      .finally(() => {
        rij.bezig.delete(recordId)
        void pomp()
      })
  }
}

export function contactWachtrijStand() {
  return { wachtend: rij.wachtend.length, bezig: rij.bezig.size }
}
