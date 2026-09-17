import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { IS_TEST, supabaseDataConfig } from '@/lib/dashModus'
import { vulTestdata } from '@/lib/testdata/vulTestdata.mjs'
import sjablonen from '@/testversie/crm-veldsjablonen.json'

export const dynamic = 'force-dynamic'

/**
 * Maakt de testdatabase leeg en vult hem opnieuw met nepdata.
 * Bestaat alleen in de testversie: in de live Dash geeft hij 404.
 */
export async function POST() {
  if (!IS_TEST) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  // Dubbele vangrail: supabaseDataConfig weigert al het live project, en
  // leeggooien mag daarnaast alleen op een lokale database.
  const { url } = supabaseDataConfig()
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    return NextResponse.json({ error: 'Resetten kan alleen op de lokale testdatabase' }, { status: 403 })
  }

  try {
    const resultaat = await vulTestdata(createServiceClient(), { sjablonen })
    return NextResponse.json({ ok: true, ...resultaat })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Vullen mislukt' }, { status: 500 })
  }
}
