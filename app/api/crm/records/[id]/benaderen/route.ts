import { NextRequest, NextResponse } from 'next/server'
import {
  annuleerConcept, controleerVerstuurd, huidigConcept, openInSpark, schrijfConcept, wijzigConcept,
} from '@/lib/crm/benaderen'
import { openInSpark as openLinkInSpark, sparkAccounts } from '@/lib/mail/spark'

export const dynamic = 'force-dynamic'
// De AI doet er gauw een minuut over
export const maxDuration = 300

type Ctx = { params: Promise<{ id: string }> }

/** Wordt de Dash op de Mac zelf bekeken? Dan kan hij Spark daar naar voren halen. */
function opDeMac(request: NextRequest): boolean {
  const host = (request.headers.get('host') || '').split(':')[0]
  return host === 'localhost' || host === '127.0.0.1'
}

function fout(e: any, status = 400) {
  return NextResponse.json({ error: e?.message || 'Er ging iets mis' }, { status })
}

/**
 * GET /api/crm/records/[id]/benaderen
 *   ?controleer=1  staat het concept in Spark, kijk dan meteen of hij verstuurd is
 *   ?accounts=1    geef ook de Spark-accounts mee voor de keuzelijst "Van"
 *
 * Een dichte Spark is geen fout van de pagina: het concept komt gewoon terug,
 * met `sparkFout` erbij.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const zoek = new URL(request.url).searchParams
  try {
    let concept = await huidigConcept(id)
    let sparkFout: string | null = null

    if (concept?.status === 'in_spark' && zoek.get('controleer') === '1') {
      try {
        concept = await controleerVerstuurd(concept.id)
      } catch (e: any) {
        sparkFout = e?.message || 'Spark niet bereikbaar'
      }
    }

    let accounts: { email: string; naam: string }[] = []
    if (zoek.get('accounts') === '1') {
      try {
        accounts = (await sparkAccounts()).map(({ email, naam }) => ({ email, naam }))
      } catch (e: any) {
        sparkFout = sparkFout || e?.message || 'Spark niet bereikbaar'
      }
    }

    return NextResponse.json({ concept, accounts, sparkFout })
  } catch (e) {
    return fout(e, 500)
  }
}

/**
 * POST /api/crm/records/[id]/benaderen
 *   { actie: 'schrijf' }                        AI schrijft (opnieuw) een concept
 *   { actie: 'naar_spark', conceptId }          opent een ingevuld nieuw bericht in Spark
 *   { actie: 'open', conceptId }                opent hem nog een keer (bijvoorbeeld per ongeluk gesloten)
 *   { actie: 'controleer', conceptId }          kijk of hij verstuurd is
 *   { actie: 'annuleer', conceptId }            weggooien
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  try {
    switch (body.actie) {
      case 'schrijf':
        return NextResponse.json({ concept: await schrijfConcept(id) })
      case 'naar_spark':
      case 'open': {
        // Op de Mac opent de Dash hem zelf in Spark (ook als Outlook de standaard
        // mailapp is); op de telefoon opent de browser de maillink
        const { concept, mailto } = await openInSpark(String(body.conceptId))
        const geopend = opDeMac(request)
        if (geopend) openLinkInSpark(mailto)
        return NextResponse.json({ concept, mailto, geopend })
      }
      case 'controleer':
        return NextResponse.json({ concept: await controleerVerstuurd(String(body.conceptId)) })
      case 'annuleer':
        return NextResponse.json({ concept: await annuleerConcept(String(body.conceptId)) })
      default:
        return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 })
    }
  } catch (e) {
    return fout(e)
  }
}

/** PATCH { conceptId, aan?, account?, onderwerp?, tekst? } */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  if (!body.conceptId) return NextResponse.json({ error: 'conceptId ontbreekt' }, { status: 400 })
  try {
    const concept = await wijzigConcept(String(body.conceptId), {
      aan: body.aan,
      account: body.account,
      onderwerp: body.onderwerp,
      tekst: body.tekst,
    })
    return NextResponse.json({ concept })
  } catch (e) {
    return fout(e)
  }
}
