import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ClickUp-webhook is uitgeschakeld: Supabase is de source of truth voor het CRM.
// Binnenkomende events worden genegeerd zodat ClickUp lokale data nooit overschrijft.
export async function GET() {
  return NextResponse.json({ ok: true, route: 'clickup-webhook', status: 'uitgeschakeld' })
}

export async function POST() {
  return NextResponse.json({ ok: true, ignored: true, reason: 'ClickUp-sync is uitgeschakeld' })
}
