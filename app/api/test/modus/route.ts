import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { homedir } from 'os'
import { join } from 'path'
import { IS_TEST, TEST_POORT } from '@/lib/dashModus'

const uitvoeren = promisify(execFile)

export const dynamic = 'force-dynamic'

const LABEL = 'com.daley.daleydash-test'
const STOPSCRIPT = join(homedir(), 'Developer', 'the-daley-dash', 'scripts', 'stop-dash-test.sh')

/**
 * De testversie aan- en uitzetten vanuit de live Dash.
 *
 * Bestaat alleen in de live versie. De testversie kan zichzelf niet afsluiten:
 * dan zou het antwoord nooit aankomen, want de server die het moet sturen is
 * juist degene die wordt afgesloten. Het schuifje in de testversie stuurt je
 * daarom eerst naar 3003, en die doet het hier.
 */

/** Antwoordt poort 3004? Meer hoeft de schakelaar niet te weten. */
async function testDraait(): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${TEST_POORT}/login`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    })
    return true
  } catch {
    // Ook een time-out telt als "nog niet klaar": bij een koude start is Next
    // nog aan het bouwen en dan komt er nog geen antwoord uit.
    return false
  }
}

export async function GET() {
  if (IS_TEST) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json({ draait: await testDraait() })
}

export async function POST(request: NextRequest) {
  if (IS_TEST) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  const { aan } = await request.json().catch(() => ({ aan: undefined }))
  if (typeof aan !== 'boolean') {
    return NextResponse.json({ error: 'Geef aan: true of false mee' }, { status: 400 })
  }

  try {
    if (aan) {
      if (await testDraait()) return NextResponse.json({ ok: true, draait: true })
      // kickstart start de LaunchAgent eenmalig. Die haalt zelf Colima en de
      // lokale Supabase op als die nog uit staan, dus een koude start duurt even.
      await uitvoeren('/bin/launchctl', ['kickstart', `gui/${process.getuid?.() ?? 0}/${LABEL}`])
      return NextResponse.json({ ok: true, draait: false, bezig: true })
    }

    // Afsluiten duurt ongeveer een halve minuut: dev server, Supabase-containers
    // en dan pas de VM, want die houdt het geheugen vast.
    await uitvoeren('/bin/bash', [STOPSCRIPT], { timeout: 90_000 })
    return NextResponse.json({ ok: true, draait: false })
  } catch (e) {
    const bericht = e instanceof Error ? e.message : 'Onbekende fout'
    return NextResponse.json({ error: `Testversie ${aan ? 'starten' : 'stoppen'} mislukt: ${bericht}` }, { status: 500 })
  }
}
