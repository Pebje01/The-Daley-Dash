import { NextResponse } from 'next/server'
import { controleerMail } from '@/lib/crm/benaderen'

export const dynamic = 'force-dynamic'

/**
 * POST /api/crm/benaderen/controleer
 *
 * Loopt de concepten na die in Spark geopend zijn, legt daarna elke andere mail
 * vast die Daley zelf aan een lead stuurde, en kijkt als laatste of leads hebben
 * teruggemaild. Aangeroepen door het vangnet `scripts/kwalificeer-leads.mjs --watch`,
 * zodat een mail ook geregistreerd wordt als de detailkaart niet openstaat.
 */
export async function POST() {
  try {
    return NextResponse.json(await controleerMail())
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Controleren mislukt' }, { status: 500 })
  }
}
