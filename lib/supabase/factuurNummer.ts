/**
 * Nummeruitgifte voor facturen en concepten, op één plek.
 *
 * We tellen op het datumdeel in het nummer zelf, niet op de kolom `date`. Die
 * twee liepen uiteen zodra je een factuurdatum in de toekomst koos: het nummer
 * stond dan op vandaag terwijl de teller op die toekomstige dag keek en nul
 * terugkreeg. Zo kregen twee facturen hetzelfde nummer.
 */
import { factuurNummerStam } from '@/lib/factuur-utils'
import { createClient } from '@/lib/supabase/server'

export async function volgendNummer(prefix: string, factuurdatum: string): Promise<string> {
  const supabase = createClient()
  const stam = factuurNummerStam(prefix, new Date(`${factuurdatum}T12:00:00`))
  const { data } = await supabase
    .from('facturen')
    .select('number')
    .ilike('number', `${stam}-%`)
    .order('number', { ascending: false })
    .limit(1)

  const hoogste = (data as { number: string }[] | null)?.[0]?.number
  const laatsteSeq = hoogste ? parseInt(hoogste.slice(stam.length + 1), 10) : 0
  const volgende = (Number.isFinite(laatsteSeq) ? laatsteSeq : 0) + 1
  return `${stam}-${String(volgende).padStart(2, '0')}`
}
