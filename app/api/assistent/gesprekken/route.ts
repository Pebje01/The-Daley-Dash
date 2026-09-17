import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** De recente gesprekken met de assistent, nieuwste eerst. */
export async function GET() {
  const { data, error } = await createClient()
    .from('assistent_gesprekken')
    .select('id, titel, pagina, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
