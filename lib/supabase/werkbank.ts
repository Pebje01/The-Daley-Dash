import { createClient } from './server'
import { WerkbankSectie, WerkbankStatus } from '../types'

interface DbWerkbankSectie {
  id: string
  titel: string
  inhoud: string
  status: WerkbankStatus
  gecontroleerd_op: string | null
  volgorde: number
  bijgewerkt_op: string
}

function mapDbToSectie(row: DbWerkbankSectie): WerkbankSectie {
  return {
    id: row.id,
    titel: row.titel,
    inhoud: row.inhoud,
    status: row.status,
    gecontroleerdOp: row.gecontroleerd_op ?? undefined,
    volgorde: row.volgorde,
    bijgewerktOp: row.bijgewerkt_op,
  }
}

export async function getWerkbankSecties(): Promise<WerkbankSectie[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('werkbank_secties')
    .select('*')
    .order('volgorde', { ascending: true })
    .order('titel', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapDbToSectie)
}

export async function createWerkbankSectie(data: {
  titel: string
  inhoud?: string
  status?: WerkbankStatus
  volgorde?: number
}): Promise<WerkbankSectie> {
  const supabase = createClient()

  // Nieuwe secties komen onderaan. Zonder dit zou een nieuwe sectie met
  // volgorde 0 bovenaan het document belanden, en dat is zelden de bedoeling.
  let volgorde = data.volgorde
  if (volgorde === undefined) {
    const { data: laatste } = await supabase
      .from('werkbank_secties')
      .select('volgorde')
      .order('volgorde', { ascending: false })
      .limit(1)
      .maybeSingle()
    volgorde = ((laatste?.volgorde as number | undefined) ?? 0) + 10
  }

  const { data: row, error } = await supabase
    .from('werkbank_secties')
    .insert({
      titel: data.titel,
      inhoud: data.inhoud ?? '',
      status: data.status ?? 'openstaand',
      volgorde,
    })
    .select()
    .single()
  if (error) throw error
  return mapDbToSectie(row)
}

export async function updateWerkbankSectie(
  id: string,
  data: Partial<{
    titel: string
    inhoud: string
    status: WerkbankStatus
    gecontroleerdOp: string | null
    volgorde: number
  }>,
): Promise<WerkbankSectie> {
  const supabase = createClient()
  const update: Record<string, unknown> = { bijgewerkt_op: new Date().toISOString() }
  if (data.titel !== undefined) update.titel = data.titel
  if (data.inhoud !== undefined) update.inhoud = data.inhoud
  if (data.volgorde !== undefined) update.volgorde = data.volgorde
  if ('gecontroleerdOp' in data) update.gecontroleerd_op = data.gecontroleerdOp ?? null

  // Op "nagekeken" zetten betekent: ik heb het zojuist zelf gecontroleerd.
  // Dan hoort de datum daarbij, anders zegt het label niets. Zet de gebruiker
  // zelf een datum mee, dan wint die.
  if (data.status !== undefined) {
    update.status = data.status
    if (data.status === 'nagekeken' && !('gecontroleerdOp' in data)) {
      update.gecontroleerd_op = new Date().toISOString().slice(0, 10)
    }
  }

  const { data: row, error } = await supabase
    .from('werkbank_secties')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return mapDbToSectie(row)
}

export async function deleteWerkbankSectie(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('werkbank_secties').delete().eq('id', id)
  if (error) throw error
}
