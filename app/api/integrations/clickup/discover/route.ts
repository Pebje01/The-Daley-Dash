import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTeams } from '@/lib/clickup/client'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const teams = await getTeams()
    return NextResponse.json(teams)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Kon ClickUp teams niet laden' }, { status: 500 })
  }
}

