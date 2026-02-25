import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Auth tijdelijk uitgeschakeld — alle routes doorlaten
  return NextResponse.next({ request })
}
