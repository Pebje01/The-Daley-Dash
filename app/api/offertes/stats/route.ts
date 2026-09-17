import { NextRequest, NextResponse } from 'next/server'
import { getOfferteStats } from '@/lib/supabase/offertes'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('company') ?? 'alle'
  const stats = await getOfferteStats(companyId as any)
  return NextResponse.json(stats)
}
