import { NextResponse, type NextRequest } from 'next/server'

/**
 * LET OP: auth staat bewust UIT. Dit is een keuze, geen vergeten TODO.
 *
 * De Dash draait alleen lokaal op de Mac van Daley, en de dev-server luistert
 * sinds 1 augustus 2026 alleen nog op 127.0.0.1 (zie `dev` en `start` in
 * package.json). Daarmee komt niemand anders erbij, ook niet vanaf hetzelfde
 * wifi-netwerk. Dat was hiervoor wel zo.
 *
 * Zet auth WEL aan zodra een van deze dingen gebeurt:
 *  - de Dash wordt gedeployed (Vercel, Coolify, wat dan ook)
 *  - de server gaat weer op 0.0.0.0 of een ander adres luisteren
 *  - er komt iemand anders bij in de administratie
 *
 * Daarvoor moet je twee dingen terugzetten: deze functie (sessie controleren en
 * doorsturen naar /login) én `lib/supabase/server.ts`, die nu de service-role
 * key gebruikt en daarmee RLS overal omzeilt. Alleen de middleware terugzetten
 * is niet genoeg.
 *
 * Er is één gebruiker in Supabase: hello@thedaleyedit.nl.
 */
export async function updateSession(request: NextRequest) {
  return NextResponse.next({ request })
}
