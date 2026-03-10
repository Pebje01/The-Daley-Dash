import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFactuurStats } from '@/lib/supabase/facturen'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Auth tijdelijk uitgeschakeld

  const stats = await getFactuurStats()
  return NextResponse.json(stats)
}
