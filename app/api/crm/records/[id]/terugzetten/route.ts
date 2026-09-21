import { NextRequest, NextResponse } from 'next/server'
import { draaiPromotieTerug } from '@/lib/crm/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/crm/records/[id]/terugzetten
 *
 * Draait een promotie terug: dit record wordt verwijderd en het record waar het
 * uit voortkwam gaat terug naar de fase van daarvoor. Voor als er per ongeluk
 * een opdracht of factuur is aangemaakt.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return NextResponse.json(await draaiPromotieTerug(id))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Terugzetten mislukt' }, { status: 400 })
  }
}
