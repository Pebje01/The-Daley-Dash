import { NextRequest, NextResponse } from 'next/server'
import { getOfferteBySlug } from '@/lib/supabase/offertes'

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const offerte = await getOfferteBySlug(params.slug)

  if (!offerte) {
    return NextResponse.json({ error: 'Offerte not found' }, { status: 404 })
  }

  if (!offerte.isPublic) {
    return NextResponse.json({ error: 'Offerte is not public' }, { status: 403 })
  }

  // Strip sensitive fields
  const { passwordHash: _hash, ...safeOfferte } = offerte

  return NextResponse.json(safeOfferte)
}
