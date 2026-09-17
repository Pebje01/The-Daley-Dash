import { createClient } from './server'
import { CompanyId, Taak, TaakPrioriteit, TaakStatus } from '../types'

interface DbTaak {
  id: string
  title: string
  description: string | null
  done: boolean
  scheduled_date: string | null
  positie?: number | null
  prioriteit?: TaakPrioriteit | null
  status?: TaakStatus | null
  bedrijf?: CompanyId | null
  deadline?: string | null
  created_at: string
}

function mapDbToTaak(row: DbTaak): Taak {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    done: row.done,
    scheduledDate: row.scheduled_date ?? undefined,
    positie: row.positie ?? undefined,
    prioriteit: row.prioriteit ?? undefined,
    status: row.status ?? undefined,
    bedrijf: row.bedrijf ?? undefined,
    deadline: row.deadline ?? undefined,
    createdAt: row.created_at,
  }
}

/** True als de fout komt doordat een van de nieuwere kolommen nog niet in de tabel staat. */
function ontbrekendeKolom(error: any) {
  return error?.code === '42703' || /positie|prioriteit|status|bedrijf|deadline/.test(error?.message || '')
}

function kolomFout() {
  return new Error(
    'Dit veld kan nog niet worden opgeslagen: draai eerst de migraties 20260917_taken_volgorde_prioriteit.sql en 20260918_taken_status_bedrijf_deadline.sql in Supabase.'
  )
}

export async function getTaken(): Promise<Taak[]> {
  const supabase = createClient()
  let { data, error } = await supabase
    .from('taken')
    .select('*')
    .order('positie', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
  // Zonder migratie de oude volgorde, zodat de lijst gewoon blijft werken
  if (error && ontbrekendeKolom(error)) {
    ;({ data, error } = await supabase
      .from('taken')
      .select('*')
      .order('created_at', { ascending: false }))
  }
  if (error) throw error
  return (data ?? []).map(mapDbToTaak)
}

export async function createTaak(data: { title: string; description?: string; scheduledDate?: string; prioriteit?: TaakPrioriteit }): Promise<Taak> {
  const supabase = createClient()
  const basis = { title: data.title, description: data.description ?? null, scheduled_date: data.scheduledDate ?? null }

  // Een nieuwe taak komt bovenaan: net boven de huidige bovenste
  const { data: bovenste, error: leesFout } = await supabase
    .from('taken')
    .select('positie')
    .not('positie', 'is', null)
    .order('positie', { ascending: true })
    .limit(1)

  if (leesFout && ontbrekendeKolom(leesFout)) {
    if (data.prioriteit) throw kolomFout()
    const { data: row, error } = await supabase.from('taken').insert(basis).select().single()
    if (error) throw error
    return mapDbToTaak(row)
  }
  if (leesFout) throw leesFout

  const positie = (bovenste?.[0]?.positie ?? 1) - 1
  const { data: row, error } = await supabase
    .from('taken')
    .insert({ ...basis, positie, prioriteit: data.prioriteit ?? null })
    .select()
    .single()
  if (error) throw error
  return mapDbToTaak(row)
}

export async function updateTaak(id: string, data: Partial<{ title: string; description: string; done: boolean; scheduledDate: string | null; positie: number; prioriteit: TaakPrioriteit | null; status: TaakStatus | null; bedrijf: CompanyId | null; deadline: string | null }>): Promise<Taak> {
  const supabase = createClient()
  const update: Record<string, unknown> = {}
  if (data.title !== undefined) update.title = data.title
  if (data.description !== undefined) update.description = data.description
  if (data.done !== undefined) update.done = data.done
  if ('scheduledDate' in data) update.scheduled_date = data.scheduledDate ?? null
  if (data.positie !== undefined) update.positie = data.positie
  if ('prioriteit' in data) update.prioriteit = data.prioriteit ?? null
  if ('status' in data) update.status = data.status ?? null
  if ('bedrijf' in data) update.bedrijf = data.bedrijf ?? null
  if ('deadline' in data) update.deadline = data.deadline || null
  const { data: row, error } = await supabase
    .from('taken')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  // Een volgorde of prioriteit die stilletjes niet opgeslagen wordt, springt na
  // verversen terug. Liever een duidelijke fout.
  if (error && ontbrekendeKolom(error)) throw kolomFout()
  if (error) throw error
  return mapDbToTaak(row)
}

export async function deleteTaak(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('taken').delete().eq('id', id)
  if (error) throw error
}
