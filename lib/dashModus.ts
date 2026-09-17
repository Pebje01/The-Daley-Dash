/**
 * Live of testversie van de Dash.
 *
 * De testversie is een tweede Dash-proces (poort 3004, zie
 * scripts/run-dash-test.sh) met een eigen Supabase-project en een eigen
 * zandbakmap. Inloggen gaat in beide versies via het live project, alleen de
 * data komt uit het testproject. Zo werkt één login voor allebei.
 *
 * NEXT_PUBLIC_ zodat ook de browser weet in welke versie hij zit (testbalk,
 * schakelaar in Instellingen).
 */

export const IS_TEST = process.env.NEXT_PUBLIC_DASH_MODUS === 'test'

export const LIVE_POORT = 3003
export const TEST_POORT = 3004

/** Projectref van de echte administratie. De testversie mag hier nooit naartoe schrijven. */
const LIVE_PROJECT_REF = 'fvywfygsjslojpvqrpxw'

/**
 * URL en sleutel voor de data. Live: de gewone variabelen. Test: uitsluitend
 * SUPABASE_DATA_URL en SUPABASE_DATA_SECRET_KEY, zonder terugval, want een
 * terugval zou hier juist betekenen dat de testversie in je echte data schrijft.
 */
export function supabaseDataConfig(): { url: string; key: string } {
  if (IS_TEST) {
    const url = process.env.SUPABASE_DATA_URL
    const key = process.env.SUPABASE_DATA_SECRET_KEY
    if (!url || !key) {
      throw new Error('Testversie: SUPABASE_DATA_URL en SUPABASE_DATA_SECRET_KEY ontbreken in .env.test.local')
    }
    if (url.includes(LIVE_PROJECT_REF)) {
      throw new Error('Testversie weigert: SUPABASE_DATA_URL wijst naar het live project. Zet daar het testproject in.')
    }
    return { url, key }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)')
  }
  return { url, key }
}
