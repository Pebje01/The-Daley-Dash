import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const ALLOWED_BASES = [
  process.env.ADMIN_FACTUREN_PATH,
  process.env.ADMIN_OFFERTES_PATH,
].filter(Boolean) as string[]

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) return NextResponse.json({ error: 'Geen pad opgegeven' }, { status: 400 })

  const resolved = path.resolve(filePath)

  // Veiligheidscheck: alleen bestanden binnen de geconfigureerde mappen
  const isAllowed = ALLOWED_BASES.some(base => resolved.startsWith(path.resolve(base)))
  if (!isAllowed) return NextResponse.json({ error: 'Toegang geweigerd' }, { status: 403 })

  if (!fs.existsSync(resolved)) return NextResponse.json({ error: 'Bestand niet gevonden' }, { status: 404 })

  const ext = path.extname(resolved).toLowerCase()
  const contentType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream'

  const buffer = fs.readFileSync(resolved)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${path.basename(resolved)}"`,
    },
  })
}
