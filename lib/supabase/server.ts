import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * LET OP: deze client gebruikt de service-role key en omzeilt daarmee RLS op
 * ALLE tabellen. Dat hoort bij de keuze om auth uit te laten, zie de toelichting
 * in `lib/supabase/middleware.ts`. Het werkt alleen veilig zolang de Dash puur
 * lokaal draait en op 127.0.0.1 luistert.
 *
 * Gaat de Dash ooit de deur uit, dan moet deze client terug naar een
 * sessiegebonden client, samen met de middleware. Alleen de middleware
 * terugzetten laat dit gat open.
 */
export function createClient() {
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
