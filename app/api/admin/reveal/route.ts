import { NextRequest, NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import path from 'path'
import { isAllowedAdminDocumentPath } from '@/lib/admin/documentPaths'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { absolutePath, action = 'open' } = await req.json()
  if (!absolutePath) return NextResponse.json({ error: 'Geen pad' }, { status: 400 })

  const resolved = path.resolve(absolutePath)
  // Zelfde reden als in /api/files: vergelijken op mapgrens, niet op tekst.
  if (!isAllowedAdminDocumentPath(resolved)) {
    return NextResponse.json({ error: 'Toegang geweigerd' }, { status: 403 })
  }

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
