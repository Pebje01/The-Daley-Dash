import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Auth staat AAN sinds 8 september 2026, omdat de dev-server sinds die dag weer
 * op 0.0.0.0 luistert zodat de Dash ook op de telefoon (zelfde wifi) te openen
 * is. Zonder login zou dan iedereen op dat netwerk de hele administratie zien.
 *
 * Werking: alles is dicht, behalve een korte allowlist. Een verzoek zonder
 * geldige Supabase-sessie krijgt op een pagina een redirect naar /login en op
 * een API-route een 401. Op de Mac zelf log je één keer in; Supabase ververst
 * de sessie daarna zelf, dus in de praktijk blijf je ingelogd.
 *
 * Waarom geen uitzondering voor localhost: de middleware ziet het IP-adres van
 * de verbinding niet, alleen de Host-header, en die kan iedereen zelf zetten.
 * Een uitzondering op "localhost" is dus geen beveiliging.
 *
 * Scripts die buiten de browser om de API aanroepen (de LaunchAgent voor de
 * AI-kwalificatie, `scripts/kwalificeer-leads.mjs`) sturen de header
 * `x-dash-secret` mee met de waarde van `CRON_SECRET` uit `.env.local`.
 *
 * `lib/supabase/server.ts` gebruikt nog steeds de service-role key (RLS wordt
 * omzeild). Dat is verantwoord zolang DEZE middleware de enige ingang is en de
 * matcher in `middleware.ts` alle routes dekt. Voeg dus nooit iets aan de
 * allowlist toe dat bedrijfsdata teruggeeft.
 *
 * Er is één gebruiker in Supabase: hello@thedaleyedit.nl.
 */

/** Paden die zonder login bereikbaar zijn (prefix-match). */
const PUBLIEKE_PREFIXES = [
  '/login',
  '/offerte/',          // publieke offertepagina's voor klanten
  '/o/',                // korte offerte-url (slug) die doorstuurt naar /offerte/[id]
  '/api/offerte-public/', // data + akkoord voor die publieke pagina's
  '/api/cron/',         // beschermt zichzelf met CRON_SECRET (Authorization-header)
  '/manifest.json',
  '/sw.js',
  '/logos/',
]

const PUBLIEKE_BESTANDEN = ['/manifest.json', '/sw.js', '/logo.png', '/icon-192.svg', '/icon-512.svg', '/robots.txt']

function isPubliek(pad: string): boolean {
  if (PUBLIEKE_BESTANDEN.includes(pad)) return true
  return PUBLIEKE_PREFIXES.some((p) => pad === p.replace(/\/$/, '') || pad.startsWith(p))
}

/** Scripts en LaunchAgents: geldig geheim in de header telt als ingelogd. */
function heeftScriptGeheim(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 8) return false
  return request.headers.get('x-dash-secret') === secret
}

export async function updateSession(request: NextRequest) {
  const pad = request.nextUrl.pathname

  if (heeftScriptGeheim(request)) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    // Zonder Supabase-config kan er niemand inloggen. Liever hard falen dan
    // stilletjes alles openzetten.
    if (pad.startsWith('/api/')) {
      return NextResponse.json({ error: 'Auth niet geconfigureerd (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY ontbreekt)' }, { status: 500 })
    }
    return new NextResponse('Auth niet geconfigureerd: NEXT_PUBLIC_SUPABASE_URL of NEXT_PUBLIC_SUPABASE_ANON_KEY ontbreekt in .env.local', { status: 500 })
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // getUser() valideert de sessie bij Supabase zelf; getSession() vertrouwt
  // blind op de cookie en is daarom niet geschikt als toegangscontrole.
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Al ingelogd en toch op /login: door naar het dashboard.
    if (pad === '/login') {
      const doel = request.nextUrl.clone()
      doel.pathname = request.nextUrl.searchParams.get('next') || '/'
      doel.search = ''
      return NextResponse.redirect(doel)
    }
    return response
  }

  if (isPubliek(pad)) return response

  if (pad.startsWith('/api/')) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const login = request.nextUrl.clone()
  login.pathname = '/login'
  login.search = ''
  // Na het inloggen terug naar waar je heen wilde (alleen interne paden).
  if (pad !== '/' && pad.startsWith('/') && !pad.startsWith('//')) {
    login.searchParams.set('next', pad + request.nextUrl.search)
  }
  return NextResponse.redirect(login)
}
