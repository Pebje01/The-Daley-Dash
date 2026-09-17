/**
 * Koppeling met Spark, het mailprogramma op de Mac, via de `spark` CLI.
 *
 * De CLI praat met de draaiende Spark-app; hij heeft zelf geen wachtwoorden of
 * netwerk. Dat maakt hem gratis en veilig, maar het werkt dus alleen op de Mac
 * waar Spark openstaat, net als de AI-kwalificatie met de lokale claude CLI.
 *
 * De Dash gebruikt Spark alleen lezend: de koppeling op schrijven zetten kost
 * bij Spark extra. Wat hij doet:
 *  1. een nieuw bericht openen in Spark met ontvanger, onderwerp en tekst al
 *     ingevuld (een gewone maillink, geopend in Spark; versturen doet Daley zelf)
 *  2. in de verzonden mail kijken wat er naar een lead is gegaan
 *  3. zien of een lead heeft teruggemaild
 *
 * Een maillink kan de afzender niet meegeven, Spark neemt zijn standaardaccount.
 * Het juiste account kiest Daley in het berichtvenster; de Dash zegt welk.
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'

export class SparkFout extends Error {}

/** De LaunchAgent erft een kale PATH, dus het binary zelf opzoeken. */
function zoekSpark(): string {
  if (process.env.SPARK_CLI_PATH) return process.env.SPARK_CLI_PATH
  for (const pad of ['/usr/local/bin/spark', '/opt/homebrew/bin/spark']) {
    if (existsSync(pad)) return pad
  }
  return 'spark'
}

function draaiSpark(args: string[], timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proces = spawn(zoekSpark(), args)
    let stdout = ''
    let stderr = ''
    const klok = setTimeout(() => proces.kill('SIGKILL'), timeoutMs)

    proces.stdout.on('data', (d) => { stdout += d })
    proces.stderr.on('data', (d) => { stderr += d })

    proces.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(klok)
      reject(new SparkFout(
        err.code === 'ENOENT'
          ? 'De Spark CLI is niet gevonden op deze Mac. Zet SPARK_CLI_PATH in .env.local als hij ergens anders staat.'
          : `Spark starten mislukt: ${err.message}`
      ))
    })

    proces.on('close', (code, signaal) => {
      clearTimeout(klok)
      if (signaal === 'SIGKILL') return reject(new SparkFout('Spark gaf geen antwoord. Staat Spark open op de Mac?'))
      if (code !== 0) return reject(new SparkFout(vertaalFout(stderr || stdout)))
      resolve(stdout)
    })
  })
}

/** Spark-meldingen die we vaak zien omzetten naar iets waar Daley wat mee kan. */
function vertaalFout(uitvoer: string): string {
  const tekst = uitvoer.replace(/^Error:\s*/i, '').trim()
  if (/connect|not running|no running|launch/i.test(tekst)) {
    return 'Spark staat niet open op de Mac. Open Spark en probeer het opnieuw.'
  }
  return tekst.slice(0, 300) || 'Spark gaf een onbekende fout.'
}

// ── Accounts ──────────────────────────────────────────────────────────

export interface SparkAccount {
  email: string
  naam: string
  toegang: string
}

export async function sparkAccounts(): Promise<SparkAccount[]> {
  const uit = await draaiSpark(['accounts'])
  const accounts: SparkAccount[] = []
  for (const regel of uit.split('\n')) {
    const m = regel.match(/^Email Account:\s+(\S+@\S+)\s+"(.*?)"\s+\(Access:\s*([^)]+)\)/)
    if (m) accounts.push({ email: m[1].toLowerCase(), naam: m[2], toegang: m[3].trim() })
  }
  return accounts
}

/**
 * Het Spark-account dat bij een bedrijfsadres hoort: precies dat adres, anders
 * een account op hetzelfde domein. WGB staat in de Dash als hello@, in Spark als daley@.
 */
export function kiesAccount(accounts: SparkAccount[], bedrijfsEmail: string | null | undefined): SparkAccount | null {
  const adres = bedrijfsEmail?.toLowerCase().trim()
  if (!adres) return null
  const exact = accounts.find((a) => a.email === adres)
  if (exact) return exact
  const domein = adres.split('@')[1]
  return accounts.find((a) => a.email.endsWith(`@${domein}`)) ?? null
}

// ── Nieuw bericht openen ──────────────────────────────────────────────

/** mailto-link met ontvanger, onderwerp en tekst. Spaties als %20, niet als +. */
export function mailtoLink(invoer: { aan: string; onderwerp: string; tekst: string }): string {
  return `mailto:${encodeURIComponent(invoer.aan)}?subject=${encodeURIComponent(invoer.onderwerp)}&body=${encodeURIComponent(invoer.tekst)}`
}

// ── Verzonden mail terugvinden ────────────────────────────────────────

export interface SparkMail {
  id: string
  account: string
  van: string
  datum: string // 'yyyy-mm-dd hh:mm', lokale tijd
  onderwerp: string
}

/**
 * Leest de tabel die `spark search` zonder onderwerp teruggeeft. De kolommen
 * zijn vaste breedte en kort Spark af met …, dus we ankeren op de datum.
 */
export function leesMailTabel(uit: string): SparkMail[] {
  const mails: SparkMail[] = []
  for (const regel of uit.split('\n')) {
    const m = regel.match(/^\s*(\d+)\s{2,}(\S+)\s{2,}(.*?)\s{2,}(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s{2,}(.*?)\s*$/)
    if (!m) continue
    // De laatste kolom (Flags) staat na twee of meer spaties achter het onderwerp
    const [onderwerp] = m[5].split(/\s{2,}/)
    mails.push({ id: m[1], account: m[2].toLowerCase(), van: m[3], datum: m[4], onderwerp: onderwerp.trim() })
  }
  return mails
}

/** Onderwerpen vergelijken zonder Re:, hoofdletters, witruimte en de afkapping van Spark. */
function kernOnderwerp(s: string): string {
  return s
    .replace(/…$/, '')
    .replace(/^\s*((re|fw|fwd|antw|doorst)\s*:\s*)+/i, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Alle mails aan dit adres uit de map Sent van je accounts, van de afgelopen `dagen`.
 *
 * Eerst één zoekopdracht over alle mappen om te zien welke accounts eraan gemaild
 * hebben, daarna alleen hun map Sent. Alleen Sent telt: een concept aan hetzelfde
 * adres staat in Drafts en is nog niet verstuurd.
 */
export async function zoekVerzondenMails(aan: string, dagen: number): Promise<SparkMail[]> {
  const filter = `to:${aan} newer_than:${Math.max(1, Math.ceil(dagen))}d`
  const overal = leesMailTabel(await draaiSpark(['search', '--filter', filter, '--page-size', '50']))
  const accounts = Array.from(new Set(overal.map((m) => m.account)))

  const gevonden = new Map<string, SparkMail>()
  for (const account of accounts) {
    const uit = await draaiSpark(['search', '--in', `${account}:Sent`, '--filter', filter, '--page-size', '50'])
    for (const mail of leesMailTabel(uit)) gevonden.set(mail.id, mail)
  }
  return Array.from(gevonden.values()).sort((x, y) => x.datum.localeCompare(y.datum))
}

/** Spark geeft lokale tijd zonder zone; de Dash draait op dezelfde Mac. */
export function mailTijd(mail: SparkMail): Date {
  return new Date(mail.datum.replace(' ', 'T'))
}

/**
 * De mail die bij een concept hoort: aan dit adres, zelfde onderwerp, verstuurd
 * na `vanaf`. Vanaf welk account maakt niet uit.
 */
export async function zoekVerzondenMail(invoer: {
  aan: string
  onderwerp: string
  vanaf: Date
}): Promise<SparkMail | null> {
  const dagen = (Date.now() - invoer.vanaf.getTime()) / 86_400_000 + 1
  const gezocht = kernOnderwerp(invoer.onderwerp)
  // Vijf minuten speling: de klok van Spark en de Dash lopen niet op de seconde gelijk
  const grens = invoer.vanaf.getTime() - 5 * 60_000

  return (await zoekVerzondenMails(invoer.aan, dagen)).find((mail) => {
    const tijd = mailTijd(mail).getTime()
    if (Number.isFinite(tijd) && tijd < grens) return false
    const gevonden = kernOnderwerp(mail.onderwerp)
    // Spark kapt lange onderwerpen af, dus een begin dat overeenkomt telt ook
    return gevonden === gezocht || (gevonden.length >= 20 && gezocht.startsWith(gevonden))
  }) ?? null
}

// ── Reacties ──────────────────────────────────────────────────────────

/**
 * Bij deze domeinen zegt het domein niets over het bedrijf: iedereen heeft er
 * een adres. Daar zoeken we dus alleen op het exacte adres.
 */
const GRATIS_DOMEINEN = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.nl', 'outlook.com', 'outlook.nl',
  'live.com', 'live.nl', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'yahoo.com',
  'ziggo.nl', 'kpnmail.nl', 'kpnplanet.nl', 'planet.nl', 'home.nl', 'xs4all.nl',
  'telfort.nl', 'upcmail.nl', 'casema.nl', 'hetnet.nl', 'proton.me', 'protonmail.com',
])

/**
 * Wie telt als afzender van een lead: iedereen op hetzelfde bedrijfsdomein,
 * want een reactie komt vaak van een collega. Bij een gratis mailadres alleen dat adres.
 */
export function afzenderSleutel(email: string): string {
  const domein = email.split('@')[1]?.toLowerCase()
  return domein && !GRATIS_DOMEINEN.has(domein) ? domein : email.toLowerCase()
}

/** Mails van deze afzender (adres of domein) in alle mappen, van de afgelopen `dagen`. */
export async function zoekOntvangenMails(sleutel: string, dagen: number): Promise<SparkMail[]> {
  const filter = `from:${sleutel} newer_than:${Math.max(1, Math.ceil(dagen))}d`
  return leesMailTabel(await draaiSpark(['search', '--filter', filter, '--page-size', '50']))
}

export interface ThreadBericht {
  id: string
  van: string // volledig adres; de zoektabel kapt adressen af
  datum: string
  tekst: string
}

/**
 * Leest een gesprek uit Spark: per bericht de afzender, datum en tekst.
 *
 * Een deeplink naar het gesprek hebben we bewust niet: Spark opent die links
 * niet als je ze van buitenaf aanbiedt (getest). Lezen doe je daarom in de Dash.
 */
export async function leesThread(berichtId: string): Promise<ThreadBericht[]> {
  if (!/^\d+$/.test(berichtId)) throw new SparkFout('Ongeldig bericht-id')
  const uit = await draaiSpark(['thread', berichtId])
  const berichten: ThreadBericht[] = []

  // Berichten staan tussen lijnen van streepjes (box drawing)
  for (const blok of uit.split(/^\s*\u2500{10,}\s*$/m)) {
    const id = blok.match(/^\s*ID:\s*(\d+)\s*$/m)?.[1]
    if (!id) continue
    const vanRegel = blok.match(/^\s*From:\s*(.*)$/m)?.[1] ?? ''
    const van = (vanRegel.match(/<([^>]+)>/)?.[1] ?? vanRegel).trim().toLowerCase()
    const datum = blok.match(/^\s*Date:\s*(.*)$/m)?.[1]?.trim() ?? ''

    // Na de kopregels een lege regel, dan de tekst, eventueel gevolgd door de bijlagen
    const regels = blok.split('\n')
    const start = regels.findIndex((r, i) => i > 0 && r.trim() === '' && /^\s*(Flags|Type|Date):/.test(regels[i - 1]))
    const eind = regels.findIndex((r) => /^\s*Attachments:\s*$/.test(r))
    const tekst = regels
      .slice(start >= 0 ? start + 1 : 0, eind >= 0 ? eind : undefined)
      .map((r) => r.replace(/^ {2}/, ''))
      .join('\n')
      .trim()

    berichten.push({ id, van, datum, tekst })
  }
  return berichten
}

/** Haalt Spark naar voren op de Mac. */
export function haalSparkNaarVoren(): void {
  const proces = spawn('/usr/bin/open', ['-a', 'Spark Desktop'], { stdio: 'ignore', detached: true })
  proces.on('error', () => { /* gemak, geen voorwaarde */ })
  proces.unref()
}

/** Automatische afzenders: die schrijven nooit echt terug. */
export function isAutomatischeAfzender(adres: string): boolean {
  const lokaal = adres.split('@')[0] || ''
  return /(^|[._-])(no-?reply|do-?not-?reply|mailer(-daemon)?|postmaster|bounce[s]?|newsletter|nieuwsbrief|notifications?|notificaties|marketing|news|updates?|automated)([._-]|$)/i.test(lokaal)
}

/**
 * Opent een link in Spark op de Mac, ook als een ander programma (Outlook) de
 * standaard is voor maillinks. Alleen zinvol als de Dash op die Mac bekeken wordt.
 */
export function openInSpark(link: string): void {
  const proces = spawn('/usr/bin/open', ['-a', 'Spark Desktop', link], { stdio: 'ignore', detached: true })
  proces.on('error', () => { /* Spark openen is een gemak, geen voorwaarde */ })
  proces.unref()
}
