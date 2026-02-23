import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClickUpSyncOverview, syncClickUpCrm } from '@/lib/clickup/sync'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const overview = await getClickUpSyncOverview()
    return NextResponse.json(overview)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Kon ClickUp sync status niet laden' }, { status: 500 })
  }
}

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await syncClickUpCrm({
      source: 'manual',
      triggerMeta: { initiatedBy: user.email || user.id },
    })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'ClickUp sync mislukt' }, { status: 500 })
  }
}

