import { NextResponse } from 'next/server'
import { getOfferteStats } from '@/lib/supabase/offertes'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Auth tijdelijk uitgeschakeld

  const stats = await getOfferteStats()
  return NextResponse.json(stats)
}
