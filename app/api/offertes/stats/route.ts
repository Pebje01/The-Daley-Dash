import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOfferteStats } from '@/lib/supabase/offertes'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stats = await getOfferteStats()
  return NextResponse.json(stats)
}
