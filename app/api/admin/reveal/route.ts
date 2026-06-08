import { NextRequest, NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import path from 'path'

export const dynamic = 'force-dynamic'

const ALLOWED_BASES = [
  process.env.ADMIN_FACTUREN_PATH,
  process.env.ADMIN_OFFERTES_PATH,
].filter(Boolean) as string[]

export async function POST(req: NextRequest) {
  const { absolutePath, action = 'open' } = await req.json()
  if (!absolutePath) return NextResponse.json({ error: 'Geen pad' }, { status: 400 })

  const resolved = path.resolve(absolutePath)
  const isAllowed = ALLOWED_BASES.some(base => resolved.startsWith(path.resolve(base)))
  if (!isAllowed) return NextResponse.json({ error: 'Toegang geweigerd' }, { status: 403 })

  try {
    if (action === 'reveal') {
      execFileSync('open', ['-R', resolved])
    } else {
      execFileSync('open', [resolved])
    }
  } catch {
    return NextResponse.json({ error: 'Bestand openen mislukt' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
