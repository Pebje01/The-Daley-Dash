import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { getAdminFacturenPaths, getAdminOffertesPaths } from '@/lib/admin/documentPaths'
import { forgetAdminSyncNumbers, mergeAdminSyncSeen, readAdminSyncState } from '@/lib/admin/syncState'

export const dynamic = 'force-dynamic'

// ── Types ──────────────────────────────────────────────────────────────────

interface RawFile { absolutePath: string; filename: string }

interface ScannedFile extends RawFile {
  type: 'factuur' | 'offerte'
  number: string | null
}

interface LineItem {
  description: string
  details?: string | null
  quantity: number
  unitPrice: number
}

interface ExtractedDoc {
  type: 'factuur' | 'offerte'
  number: string | null
  clientName: string | null
  clientContactPerson: string | null
  clientAddress: string | null
  date: string | null
  dueDate: string | null
  validUntil: string | null
  subtotal: number | null
  btwAmount: number | null
  total: number | null
  btwPercentage: number | null
  companyId: string | null
  status: string | null
  paidAt: string | null
  lineItems: LineItem[]
}

// ── File scanning ──────────────────────────────────────────────────────────

function scanDir(dir: string, out: RawFile[]) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) scanDir(full, out)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
      out.push({ absolutePath: full, filename: entry.name })
  }
}

function extractNumber(filename: string): { number: string | null; type: 'factuur' | 'offerte' } {
  const base = path.basename(filename, path.extname(filename))
  const ofNew = base.match(/(OF-\d{6}-\d{2})/i)
  if (ofNew) return { number: ofNew[1].toUpperCase(), type: 'offerte' }
  const ofOld = base.match(/(OF-\d{6})/i)
  if (ofOld) return { number: ofOld[1].toUpperCase(), type: 'offerte' }
  const fNew = base.match(/(F-\d{6}-\d{2})/i)
  if (fNew) return { number: fNew[1].toUpperCase(), type: 'factuur' }
  const fOldLong = base.match(/(\d{4}F-\d{4}-\d{2})/i)
  if (fOldLong) return { number: fOldLong[1].toUpperCase(), type: 'factuur' }
  const fOldShort = base.match(/(\d{4}F-\d{4})/i)
  if (fOldShort) return { number: fOldShort[1].toUpperCase(), type: 'factuur' }
  return { number: null, type: 'factuur' }
}

// ── Text extraction ────────────────────────────────────────────────────────

function parseNlDate(s: string): string | null {
  const m = s.match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function parseAmount(s: string): number | null {
  const clean = s.replace(/[€\s.]/g, '').replace(',', '.')
  const n = parseFloat(clean)
  return isNaN(n) ? null : n
}

function asPaidAt(date: string | null): string | null {
  return date ? `${date}T12:00:00+01:00` : null
}

function detectPaidAt(text: string, filename: string, fallbackDate: string | null): string | null {
  const source = `${filename}\n${text}`
  if (!/(betaling\s+voldaan|voldaan\s+op|betaald\s+op|\bvoldaan\b|\bpaid\b)/i.test(source)) return null

  const explicit =
    source.match(/(?:betaling\s+voldaan|voldaan\s+op|betaald\s+op|paid\s+on)[^\d]*(\d{1,2}-\d{1,2}-\d{4})/i) ||
    source.match(/(\d{1,2}-\d{1,2}-\d{4})[^\n]{0,40}(?:betaling\s+voldaan|voldaan|betaald|paid)/i)

  return asPaidAt(explicit ? parseNlDate(explicit[1]) : fallbackDate)
}

function detectCompany(text: string): string | null {
  if (/We Grow Brands|WGB|wegrowbrands/i.test(text)) return 'wgb'
  if (/Daley Photography|daleyphotography/i.test(text)) return 'daleyphotography'
  if (/Daley Content|thedaleye|The Daley Edit/i.test(text)) return 'tde'
  return null
}

function parseText(text: string, filename: string): ExtractedDoc {
  const isOfferte = /offerte/i.test(text) || /\bOF-/i.test(filename)
  const type: 'factuur' | 'offerte' = isOfferte ? 'offerte' : 'factuur'

  const numMatch =
    text.match(/\b(OF-\d{6}-\d{2})\b/i) ||
    text.match(/\b(OF-\d{6})\b/i) ||
    text.match(/\b(F-\d{6}-\d{2})\b/i) ||
    text.match(/Factuurnummer[:\s]+(\S+)/i) ||
    text.match(/Offertenummer[:\s]+(\S+)/i) ||
    text.match(/\b(\d{4}F-\d{4}-\d{2})\b/) ||
    text.match(/\b(\d{4}F-\d{4})\b/)
  const number = numMatch ? numMatch[1].trim() : null

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const skipPatterns = /^(FACTUUR|OFFERTE|Datum|Vervaldatum|Factuurnummer|Offertenummer|Klantnummer|Product|Prijs|Subtotaal|TOTAAL|Bedankt|Klik|Bedrijf|Naam|Adres|KvK|Bank|IBAN|Tel|E-mail|Website|Daley|t\.a\.v\.|BTW|21%|Geldig)/i
  let clientName: string | null = null
  let clientAddress: string | null = null
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i]
    if (!skipPatterns.test(line) && line.length > 1 && line.length < 80) {
      if (!clientName) { clientName = line; continue }
      if (/^t\.a\.v\./i.test(line)) continue
      if (!clientAddress && /\d{4}\s*[A-Z]{2}/.test(line)) { clientAddress = line; break }
    }
  }

  const dateMatches: string[] = []
  let dm: RegExpExecArray | null
  const dateRe = /(\d{2}-\d{2}-\d{4})/g
  while ((dm = dateRe.exec(text)) !== null) dateMatches.push(dm[1])
  const date = dateMatches[0] ? parseNlDate(dateMatches[0]) : null
  const secondDate = dateMatches[1] ? parseNlDate(dateMatches[1]) : null
  const paidAt = !isOfferte ? detectPaidAt(text, filename, date) : null

  const subtotalMatch = text.match(/TOTAAL EXCL\. BTW\s*€?\s*([\d.,]+)/i)
  const btwMatch = text.match(/21%\s*BTW\s*€?\s*([\d.,]+)/i) || text.match(/BTW\s*€?\s*([\d.,]+)/i)
  const totalMatch = text.match(/TOTAAL INCL\. BTW\s*€?\s*([\d.,]+)/i) || text.match(/TOTAAL\s*€?\s*([\d.,]+)/i)

  const subtotal = subtotalMatch ? parseAmount(subtotalMatch[1]) : null
  const btwAmount = btwMatch ? parseAmount(btwMatch[1]) : null
  const total = totalMatch ? parseAmount(totalMatch[1]) : null
  const btwPercentage = btwAmount && subtotal && subtotal > 0
    ? Math.round((btwAmount / subtotal) * 100)
    : 21

  return {
    type, number, clientName, clientContactPerson: null, clientAddress,
    date, dueDate: isOfferte ? null : secondDate, validUntil: isOfferte ? secondDate : null,
    subtotal, btwAmount, total, btwPercentage,
    companyId: detectCompany(text), status: paidAt ? 'betaald' : null, paidAt, lineItems: [],
  }
}

async function extractWithGemini(absolutePath: string, filename: string): Promise<ExtractedDoc> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })

  const pdfBytes = fs.readFileSync(absolutePath)
  const base64Data = pdfBytes.toString('base64')

  const prompt = `Je bent een documentanalyse-assistent. Analyseer dit factuur of offerte PDF en extraheer alle relevante gegevens nauwkeurig.

Geef de response UITSLUITEND als geldig JSON object met dit exacte formaat:
{
  "type": "factuur" of "offerte",
  "number": "documentnummer (bijv. F-260407-01, OF-260330-01, 2022F-0001, 2026F-0306-01)",
  "clientName": "naam van de klant/opdrachtgever",
  "clientContactPerson": "contactpersoon naam of null",
  "clientAddress": "volledig adres van de klant inclusief postcode en stad of null",
  "companyId": "tde", "wgb" of "daleyphotography",
  "date": "JJJJ-MM-DD",
  "dueDate": "JJJJ-MM-DD (alleen facturen: vervaldatum, of null)",
  "validUntil": "JJJJ-MM-DD (alleen offertes: geldig-tot datum, of null)",
  "status": "betaald" als betaling voldaan is, anders "verzonden" of "verstuurd",
  "paidAt": "ISO timestamp als betaling voldaan is, bijvoorbeeld 2026-02-12T12:00:00+01:00, anders null",
  "btwPercentage": 21,
  "subtotal": 100.00,
  "btwAmount": 21.00,
  "total": 121.00,
  "lineItems": [{"description": "...", "details": null, "quantity": 1, "unitPrice": 100.00}]
}

CompanyId: "We Grow Brands/WGB" -> "wgb", "Daley Photography" -> "daleyphotography", "The Daley Edit/TDE" -> "tde"`

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: 'application/pdf', data: base64Data } },
  ])

  const parsed = JSON.parse(result.response.text())
  const lineItems: LineItem[] = Array.isArray(parsed.lineItems)
    ? parsed.lineItems.map((item: Record<string, unknown>) => ({
        description: String(item.description ?? 'Werkzaamheden'),
        details: (item.details as string | null) ?? null,
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : 0,
      }))
    : []

  return {
    type: parsed.type === 'offerte' ? 'offerte' : 'factuur',
    number: parsed.number ?? null,
    clientName: parsed.clientName ?? null,
    clientContactPerson: parsed.clientContactPerson ?? null,
    clientAddress: parsed.clientAddress ?? null,
    date: parsed.date ?? null,
    dueDate: parsed.dueDate ?? null,
    validUntil: parsed.validUntil ?? null,
    subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : null,
    btwAmount: typeof parsed.btwAmount === 'number' ? parsed.btwAmount : null,
    total: typeof parsed.total === 'number' ? parsed.total : null,
    btwPercentage: typeof parsed.btwPercentage === 'number' ? parsed.btwPercentage : null,
    companyId: parsed.companyId ?? null,
    status: parsed.status ?? null,
    paidAt: parsed.paidAt ?? null,
    lineItems,
  }
}

async function extractDoc(absolutePath: string, filename: string): Promise<ExtractedDoc | null> {
  if (process.env.GEMINI_API_KEY) {
    try {
      return await extractWithGemini(absolutePath, filename)
    } catch {
      // fall through to pdftotext
    }
  }
  try {
    const text = execSync(`pdftotext "${absolutePath}" -`, { encoding: 'utf8', timeout: 15000 })
    return parseText(text, filename)
  } catch {
    return null
  }
}

// ── Import logic ───────────────────────────────────────────────────────────

type ImportResult = 'imported' | 'skipped' | 'failed'
interface ExistingDocRow { id: string; number: string | null }

async function importDoc(
  doc: ExtractedDoc,
  filenameNumber: string | null,
): Promise<ImportResult> {
  const rawNumber = doc.number ?? filenameNumber
  if (!rawNumber) return 'failed'

  const numberUpper = rawNumber.toUpperCase()
  const slug = rawNumber.toLowerCase()
  const supabase = createClient()
  const table = doc.type === 'factuur' ? 'facturen' : 'offertes'

  const { data: existing } = await supabase
    .from(table).select('id').ilike('number', numberUpper).maybeSingle()
  if (existing) return 'skipped'

  const now = new Date().toISOString()
  const companyId = doc.companyId ?? 'daleyphotography'
  const btwPercentage = doc.btwPercentage ?? 21
  const subtotal = doc.subtotal ?? 0
  const btwAmount = doc.btwAmount ?? Math.round(subtotal * (btwPercentage / 100) * 100) / 100
  const total = doc.total ?? Math.round((subtotal + btwAmount) * 100) / 100

  if (doc.type === 'factuur') {
    const date = doc.date ?? now.split('T')[0]
    const status = doc.status === 'betaald' || doc.paidAt ? 'betaald' : 'verzonden'
    const paidAt = status === 'betaald'
      ? (doc.paidAt ?? `${date}T12:00:00+01:00`)
      : null
    const { data: row, error } = await supabase.from('facturen').insert({
      number: numberUpper, slug, company_id: companyId,
      client_name: doc.clientName ?? 'Onbekend',
      client_contact_person: doc.clientContactPerson ?? null,
      client_address: doc.clientAddress ?? null,
      date, due_date: doc.dueDate ?? date,
      status,
      paid_at: paidAt,
      subtotal, btw_percentage: btwPercentage, btw_amount: btwAmount, total,
      created_at: now, updated_at: now,
    }).select('id').single()
    if (error) return 'failed'
    if (doc.lineItems.length > 0) {
      await supabase.from('factuur_line_items').insert(
        doc.lineItems.map((item, idx) => ({
          factuur_id: (row as { id: string }).id,
          sort_order: idx, description: item.description,
          details: item.details ?? null, quantity: item.quantity,
          unit_price: item.unitPrice, section_title: null,
        }))
      )
    }
  } else {
    const date = doc.date ?? now.split('T')[0]
    const validOfferteStatuses = new Set(['concept', 'opgeslagen', 'verstuurd', 'akkoord', 'afgewezen', 'verlopen', 'on-hold'])
    const status = doc.status && validOfferteStatuses.has(doc.status) ? doc.status : 'verstuurd'
    const { data: row, error } = await supabase.from('offertes').insert({
      number: numberUpper, slug, company_id: companyId,
      client_name: doc.clientName ?? 'Onbekend',
      client_contact_person: doc.clientContactPerson ?? null,
      client_address: doc.clientAddress ?? null,
      date, valid_until: doc.validUntil ?? date,
      status,
      subtotal, btw_percentage: btwPercentage, btw_amount: btwAmount, total,
      is_public: false, created_at: now, updated_at: now,
    }).select('id').single()
    if (error) return 'failed'
    if (doc.lineItems.length > 0) {
      await supabase.from('line_items').insert(
        doc.lineItems.map((item, idx) => ({
          offerte_id: (row as { id: string }).id,
          sort_order: idx, description: item.description,
          details: item.details ?? null, quantity: item.quantity,
          unit_price: item.unitPrice, section_title: null,
        }))
      )
    }
  }

  return 'imported'
}

async function pruneMissingDocs(
  supabase: ReturnType<typeof createClient>,
  existingFacturen: ExistingDocRow[],
  existingOffertes: ExistingDocRow[],
  currentFactuurNumbers: Set<string>,
  currentOfferteNumbers: Set<string>,
): Promise<{ facturen: number; offertes: number; failed: number }> {
  const state = readAdminSyncState()
  const missingFacturen = new Set(state.facturen.filter(n => !currentFactuurNumbers.has(n)))
  const missingOffertes = new Set(state.offertes.filter(n => !currentOfferteNumbers.has(n)))
  const removedFacturen: string[] = []
  const removedOffertes: string[] = []
  let failed = 0

  const factuurRows = existingFacturen.filter(row => row.number && missingFacturen.has(row.number.toUpperCase()))
  if (factuurRows.length > 0) {
    const ids = factuurRows.map(row => row.id)
    await supabase.from('factuur_line_items').delete().in('factuur_id', ids)
    const { error } = await supabase.from('facturen').delete().in('id', ids)
    if (error) failed += factuurRows.length
    else removedFacturen.push(...factuurRows.map(row => row.number!.toUpperCase()))
  }

  const offerteRows = existingOffertes.filter(row => row.number && missingOffertes.has(row.number.toUpperCase()))
  if (offerteRows.length > 0) {
    const ids = offerteRows.map(row => row.id)
    await supabase.from('line_items').delete().in('offerte_id', ids)
    await supabase.from('facturen').update({ offerte_id: null }).in('offerte_id', ids)
    const { error } = await supabase.from('offertes').delete().in('id', ids)
    if (error) failed += offerteRows.length
    else removedOffertes.push(...offerteRows.map(row => row.number!.toUpperCase()))
  }

  if (removedFacturen.length > 0 || removedOffertes.length > 0) {
    forgetAdminSyncNumbers({ facturen: removedFacturen, offertes: removedOffertes })
  }

  return { facturen: removedFacturen.length, offertes: removedOffertes.length, failed }
}

// ── Concurrency helper ─────────────────────────────────────────────────────

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onEach?: (result: R) => void,
): Promise<R[]> {
  const results: R[] = []
  let idx = 0

  async function worker() {
    while (idx < items.length) {
      const i = idx++
      const r = await fn(items[i])
      results[i] = r
      onEach?.(r)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST() {
  const facturenBases = getAdminFacturenPaths()
  const offertesBases = getAdminOffertesPaths()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      }

      try {
        send({ type: 'status', message: 'Scannen...' })

        const rawFiles: RawFile[] = []
        facturenBases.forEach(base => scanDir(base, rawFiles))
        offertesBases.forEach(base => scanDir(base, rawFiles))
        const scannedFiles: ScannedFile[] = rawFiles.map(f => ({ ...f, ...extractNumber(f.filename) }))
        const currentFactuurNumbers = new Set(
          scannedFiles.filter(f => f.type === 'factuur' && f.number).map(f => f.number!)
        )
        const currentOfferteNumbers = new Set(
          scannedFiles.filter(f => f.type === 'offerte' && f.number).map(f => f.number!)
        )

        const supabase = createClient()
        const [{ data: facturen }, { data: offertes }] = await Promise.all([
          supabase.from('facturen').select('id, number'),
          supabase.from('offertes').select('id, number'),
        ])

        const existingFacturen = (facturen ?? []) as ExistingDocRow[]
        const existingOffertes = (offertes ?? []) as ExistingDocRow[]
        const removed = await pruneMissingDocs(
          supabase,
          existingFacturen,
          existingOffertes,
          currentFactuurNumbers,
          currentOfferteNumbers,
        )

        const factuurSet = new Set(existingFacturen.filter(f => f.number).map(f => f.number!.toUpperCase()))
        const offerteSet = new Set(existingOffertes.filter(o => o.number).map(o => o.number!.toUpperCase()))

        const toProcess: ScannedFile[] = scannedFiles
          .filter(f => {
            if (!f.number) return false
            const set = f.type === 'factuur' ? factuurSet : offerteSet
            return !set.has(f.number)
          })

        mergeAdminSyncSeen({
          facturen: currentFactuurNumbers,
          offertes: currentOfferteNumbers,
        })

        send({ type: 'scan', total: toProcess.length, scanned: rawFiles.length, removed })

        if (toProcess.length === 0) {
          send({ type: 'done', imported: 0, skipped: 0, failed: removed.failed, removed })
          controller.close()
          return
        }

        let imported = 0, skipped = 0, failed = 0, processed = 0

        await withConcurrency(toProcess, 5, async (f) => {
          const doc = await extractDoc(f.absolutePath, f.filename)
          if (!doc) return 'failed' as ImportResult
          return importDoc(doc, f.number)
        }, (result) => {
          if (result === 'imported') imported++
          else if (result === 'skipped') skipped++
          else failed++
          processed++
          send({ type: 'progress', current: processed, total: toProcess.length, imported, skipped, failed })
        })

        send({ type: 'done', imported, skipped, failed: failed + removed.failed, removed })
      } catch (err) {
        send({ type: 'error', message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
