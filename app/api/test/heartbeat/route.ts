import { NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { IS_TEST } from '@/lib/dashModus'
import { ACTIVITEIT_STEMPEL } from '@/lib/testActiviteit'

export const dynamic = 'force-dynamic'

/**
 * Zegt "ik ben er nog". Bestaat alleen in de testversie: in de live Dash 404.
 * Valt dit stil, dan zet de wachtdienst de testversie na 15 minuten uit.
 */
export async function POST() {
  if (!IS_TEST) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  try {
    await mkdir(dirname(ACTIVITEIT_STEMPEL), { recursive: true })
    await writeFile(ACTIVITEIT_STEMPEL, String(Math.floor(Date.now() / 1000)), 'utf8')
  } catch (e) {
    // Een mislukte stempel mag de pagina niet omgooien. Het ergste gevolg is dat
    // de testversie iets eerder afsluit dan bedoeld.
    return NextResponse.json({ ok: false, fout: e instanceof Error ? e.message : 'onbekend' })
  }
  return NextResponse.json({ ok: true })
}
