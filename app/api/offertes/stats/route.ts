import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOfferteStats } from '@/lib/supabase/offertes'

export async function GET() {
  // Auth tijdelijk uitgeschakeld

  const stats = await getOfferteStats()
  return NextResponse.json(stats)
}
