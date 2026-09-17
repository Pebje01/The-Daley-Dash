import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { supabaseDataConfig } from '@/lib/dashModus'

/**
 * LET OP: deze client gebruikt de service-role key en omzeilt daarmee RLS op
 * ALLE tabellen. Dat is verantwoord omdat `lib/supabase/middleware.ts` sinds
 * 8 september 2026 elke route afschermt (login verplicht, korte allowlist).
 * De middleware is dus de enige toegangscontrole: haal die nooit weg of
 * versoepel de allowlist niet zonder deze client ook sessiegebonden te maken.
 */
export function createClient() {
  // In de testversie komt de data uit het testproject, zie lib/dashModus.ts
  const { url, key } = supabaseDataConfig()

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
