import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { isAllowedAdminDocumentPath } from '@/lib/admin/documentPaths'

export const dynamic = 'force-dynamic'

export interface ExtractedLineItem {
  description: string
  details?: string | null
  quantity: number
  unitPrice: number
}

export interface ExtractedDoc {
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
  lineItems: ExtractedLineItem[]
}

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
    type,
    number,
    clientName,
    clientContactPerson: null,
    clientAddress,
    date,
    dueDate: isOfferte ? null : secondDate,
    validUntil: isOfferte ? secondDate : null,
    subtotal,
    btwAmount,
    total,
    btwPercentage,
    companyId: detectCompany(text),
    status: paidAt ? 'betaald' : null,
    paidAt,
    lineItems: [],
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
  "clientName": "naam van de klant/opdrachtgever (bedrijfsnaam of persoonsn naam)",
  "clientContactPerson": "contactpersoon naam (of null)",
  "clientAddress": "volledig adres van de klant inclusief postcode en stad (of null)",
  "companyId": "tde", "wgb" of "daleyphotography",
  "date": "JJJJ-MM-DD",
  "dueDate": "JJJJ-MM-DD (alleen facturen: vervaldatum, of null)",
  "validUntil": "JJJJ-MM-DD (alleen offertes: geldig-tot datum, of null)",
  "status": "betaald" als op het document staat dat betaling voldaan is, anders "verzonden" voor openstaande facturen of "verstuurd" voor offertes,
  "paidAt": "ISO timestamp als betaling voldaan is, bijvoorbeeld 2026-02-12T12:00:00+01:00, anders null",
  "btwPercentage": 21,
  "subtotal": 100.00,
  "btwAmount": 21.00,
  "total": 121.00,
  "lineItems": [
    {"description": "Omschrijving product of dienst", "details": null, "quantity": 1, "unitPrice": 100.00}
  ]
}

CompanyId detectie op basis van de afzender (niet de ontvanger):
- "We Grow Brands" of "WGB" of "wegrowbrands" -> "wgb"
- "Daley Photography" of "daleyphotography" -> "daleyphotography"
- "The Daley Edit" of "TDE" of "thedaleye" -> "tde"

Gebruik null voor ontbrekende waarden. Datums altijd als JJJJ-MM-DD. Bedragen als decimaal getal (geen strings).`

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: 'application/pdf', data: base64Data } },
  ])

  const parsed = JSON.parse(result.response.text())

  const lineItems: ExtractedLineItem[] = Array.isArray(parsed.lineItems)
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

export async function POST(req: NextRequest) {
  const { absolutePath } = await req.json()
  if (!absolutePath) return NextResponse.json({ error: 'Geen pad' }, { status: 400 })

  const resolved = path.resolve(absolutePath)
  if (!isAllowedAdminDocumentPath(resolved)) return NextResponse.json({ error: 'Toegang geweigerd' }, { status: 403 })

  if (process.env.GEMINI_API_KEY) {
    try {
      return NextResponse.json(await extractWithGemini(resolved, path.basename(resolved)))
    } catch {
      // Gemini mislukt, terugvallen op pdftotext
    }
  }

  let text: string
  try {
    text = execSync(`pdftotext "${resolved}" -`, { encoding: 'utf8', timeout: 10000 })
  } catch {
    return NextResponse.json({ error: 'Tekst extractie mislukt' }, { status: 422 })
  }

  return NextResponse.json(parseText(text, path.basename(resolved)))
}
