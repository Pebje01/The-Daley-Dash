import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export function createClient() {
  // Auth tijdelijk uitgeschakeld — gebruik service role key om RLS te bypassen
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)')
  }

  return createSupabaseClient(
    url,
    key,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // Next.js cachet fetch-responses in route handlers (Data Cache), waardoor
      // routes verouderde Supabase-data teruggeven. Database-reads mogen nooit
      // gecachet worden — Supabase is de source of truth.
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  )
}
