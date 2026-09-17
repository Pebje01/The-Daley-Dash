import { LIVE_POORT, TEST_POORT } from './dashModus'

/**
 * Zelfde pagina in de andere versie. Houdt de host aan, zodat het ook op de
 * telefoon via het wifi-netwerk werkt (192.168.x.x:3003 <-> :3004).
 *
 * Met `merk` hang je er een parameter aan waarmee de andere versie weet wat er
 * moet gebeuren zodra hij geladen is, bijvoorbeeld testUit=1.
 */
export function wisselVersieUrl(naarTest: boolean, merk?: 'testUit' | 'testAan') {
  const { protocol, hostname, pathname, search } = window.location
  const params = new URLSearchParams(search)
  params.delete('testUit')
  params.delete('testAan')
  if (merk) params.set(merk, '1')
  const query = params.toString()
  return `${protocol}//${hostname}:${naarTest ? TEST_POORT : LIVE_POORT}${pathname}${query ? `?${query}` : ''}`
}

/**
 * Zet de testversie aan. Geeft meteen antwoord: launchd start de boel op de
 * achtergrond, en of hij er al is vraag je daarna met wachtTotTestversieDraait.
 */
export async function zetTestversieAan(): Promise<void> {
  const r = await fetch('/api/test/modus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aan: true }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Testversie starten mislukt')
}

/** Zet de testversie uit. Duurt ongeveer een halve minuut, dus netjes afwachten. */
export async function zetTestversieUit(): Promise<void> {
  const r = await fetch('/api/test/modus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aan: false }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Testversie stoppen mislukt')
}

/**
 * Wacht tot poort 3004 antwoordt. Een koude start moet eerst Colima en de
 * lokale Supabase ophalen, dus drie minuten geduld is niet overdreven.
 */
export async function wachtTotTestversieDraait(maxSeconden = 180): Promise<void> {
  const eind = Date.now() + maxSeconden * 1000
  while (Date.now() < eind) {
    try {
      const r = await fetch('/api/test/modus', { cache: 'no-store' })
      if (r.ok && (await r.json()).draait) return
    } catch {
      // netwerkhikje, gewoon opnieuw proberen
    }
    await new Promise(res => setTimeout(res, 2000))
  }
  throw new Error('De testversie kwam niet op gang. Kijk in /tmp/daley-dash-test.log wat er misging.')
}
