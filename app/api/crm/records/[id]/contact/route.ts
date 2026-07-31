import { NextRequest, NextResponse } from 'next/server'
import { logContactMoment, type ContactMomentData } from '@/lib/crm/store'

export const dynamic = 'force-dynamic'

const SOORTEN = new Set(['mail', 'telefoon', 'whatsapp', 'meeting', 'notitie'])

/**
 * POST /api/crm/records/[id]/contact
 *
 * Legt een contactmoment vast: activiteit in de tijdlijn, laatste contact op nu,
 * teller omhoog, en in dezelfde beweging de volgende actie en eventueel de fase.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await request.json()
    const soort = String(body.soort || '').toLowerCase()

    if (!SOORTEN.has(soort)) {
      return NextResponse.json({ error: 'Onbekende contactsoort' }, { status: 400 })
    }

    const payload: ContactMomentData = {
      soort: soort as ContactMomentData['soort'],
      notitie: body.notitie ?? null,
      status: body.status ?? null,
    }
    if (body.volgende_actie !== undefined) payload.volgende_actie = body.volgende_actie
    if (body.volgende_actie_notitie !== undefined) payload.volgende_actie_notitie = body.volgende_actie_notitie

    const record = await logContactMoment(id, payload)
    return NextResponse.json({ item: record })
  } catch (e: any) {
    const melding = e?.message || 'Contactmoment opslaan mislukt'
    // Blokkeerlijst is een regel, geen storing
    const status = melding.includes('blokkeerlijst') ? 409 : 500
    return NextResponse.json({ error: melding }, { status })
  }
}
