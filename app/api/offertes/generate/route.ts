import { NextRequest, NextResponse } from 'next/server'
import { generateOfferteWithAI } from '@/lib/ai/generate-offerte'
import { CompanyId } from '@/lib/types'

const RATE_LIMIT_MS = 30_000
const lastRequestPerUser = new Map<string, number>()

export async function POST(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld
  const userId = 'local'

  // Rate limit: max 1 request per 30 seconds
  const now = Date.now()
  const lastRequest = lastRequestPerUser.get(userId) ?? 0
  const waitMs = RATE_LIMIT_MS - (now - lastRequest)
  if (waitMs > 0) {
    const waitSec = Math.ceil(waitMs / 1000)
    return NextResponse.json(
      { error: `Wacht nog ${waitSec} seconden voor de volgende generatie` },
      { status: 429 }
    )
  }
  lastRequestPerUser.set(userId, now)

  const body = await request.json()
  const { companyId, clientName, contactPerson, prompt } = body

  if (!companyId || !prompt) {
    return NextResponse.json({ error: 'companyId en prompt zijn verplicht' }, { status: 400 })
  }

  const validCompanies: CompanyId[] = ['tde', 'wgb', 'daleyphotography', 'bleijenberg', 'montung']
  if (!validCompanies.includes(companyId)) {
    return NextResponse.json({ error: 'Ongeldig bedrijf' }, { status: 400 })
  }

  try {
    const result = await generateOfferteWithAI({
      companyId,
      clientName,
      contactPerson,
      prompt,
    })

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('AI offerte generation failed:', e)
    return NextResponse.json(
      { error: e.message || 'AI generatie mislukt' },
      { status: 500 }
    )
  }
}
