import { NextRequest, NextResponse } from 'next/server'
import { leesReactie, markeerReactieGezien, openReacties } from '@/lib/crm/benaderen'
import { haalSparkNaarVoren } from '@/lib/mail/spark'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** GET: reacties op deze lead die nog niet afgehandeld zijn. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  try {
    return NextResponse.json({ reacties: await openReacties(id) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Laden mislukt' }, { status: 500 })
  }
}

/**
 * POST { actie: 'gezien', reactieId }  reactie afgehandeld
 * POST { actie: 'lees', reactieId }    tekst van de reactie, uit Spark
 * POST { actie: 'spark' }              Spark naar voren halen (alleen op de Mac zelf)
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  try {
    if (body.actie === 'spark') {
      const host = (request.headers.get('host') || '').split(':')[0]
      const opDeMac = host === 'localhost' || host === '127.0.0.1'
      if (opDeMac) haalSparkNaarVoren()
      return NextResponse.json({ geopend: opDeMac })
    }

    const reactieId = String(body.reactieId || '')
    if (!reactieId) return NextResponse.json({ error: 'reactieId ontbreekt' }, { status: 400 })
    if (body.actie === 'gezien') {
      await markeerReactieGezien(reactieId)
      return NextResponse.json({ ok: true })
    }
    if (body.actie === 'lees') {
      return NextResponse.json({ bericht: await leesReactie(reactieId) })
    }
    return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Mislukt' }, { status: 400 })
  }
}
