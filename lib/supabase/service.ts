import { createClient } from '@supabase/supabase-js'
import { supabaseDataConfig } from '@/lib/dashModus'

export function createServiceClient() {
  // In de testversie komt de data uit het testproject, zie lib/dashModus.ts
  const { url, key } = supabaseDataConfig()

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // Zelfde reden als in server.ts: Next's Data Cache mag database-reads
    // nooit cachen, anders krijgen API-routes verouderde data terug.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}

