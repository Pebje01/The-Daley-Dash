import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ClickUp-sync is uitgeschakeld: Supabase is de source of truth voor het CRM.
// Een sync zou lokale wijzigingen overschrijven met verouderde ClickUp-data.
export async function GET() {
  return NextResponse.json(
    { error: 'ClickUp-sync is uitgeschakeld. Het CRM draait volledig op Supabase.' },
    { status: 410 }
  )
}
