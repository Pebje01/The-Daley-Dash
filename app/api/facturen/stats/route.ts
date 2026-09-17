import { NextRequest, NextResponse } from 'next/server'
import { getFactuurStats } from '@/lib/supabase/facturen'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('company') ?? 'alle'
  const stats = await getFactuurStats(companyId as any)
  return NextResponse.json(stats)
}
