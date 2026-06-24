import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ClickUp-sync is uitgeschakeld: Supabase is de source of truth voor het CRM.
// Een sync zou lokale wijzigingen overschrijven met verouderde ClickUp-data.
function uitgeschakeld() {
  return NextResponse.json(
    { error: 'ClickUp-sync is uitgeschakeld. Het CRM draait volledig op Supabase.' },
    { status: 410 }
  )
}

export async function GET() {
  return uitgeschakeld()
}

export async function POST() {
  return uitgeschakeld()
}
