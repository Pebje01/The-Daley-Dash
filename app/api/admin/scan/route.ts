import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export interface ScannedFile {
  type: 'factuur' | 'offerte'
  filename: string
  absolutePath: string
  number: string | null
  matched: boolean
  matchedId: string | null
}

function extractNumber(filename: string): { number: string | null; type: 'factuur' | 'offerte' } {
  const base = path.basename(filename, path.extname(filename))

  // Offerte patterns (meest specifiek eerst)
  const ofNew = base.match(/(OF-\d{6}-\d{2})/i)
  if (ofNew) return { number: ofNew[1].toUpperCase(), type: 'offerte' }

  const ofOld = base.match(/(OF-\d{6})/i)
  if (ofOld) return { number: ofOld[1].toUpperCase(), type: 'offerte' }

  // Factuur patterns: F-260512-01, 2026F-0306-01, 2022F-0001, 2020F-0010
  const fNew = base.match(/(F-\d{6}-\d{2})/i)
  if (fNew) return { number: fNew[1].toUpperCase(), type: 'factuur' }

  const fOldLong = base.match(/(\d{4}F-\d{4}-\d{2})/i)
  if (fOldLong) return { number: fOldLong[1].toUpperCase(), type: 'factuur' }

  const fOldShort = base.match(/(\d{4}F-\d{4})/i)
  if (fOldShort) return { number: fOldShort[1].toUpperCase(), type: 'factuur' }

  return { number: null, type: 'factuur' }
}

function scanDir(dir: string, results: { absolutePath: string; filename: string }[]) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      scanDir(full, results)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      results.push({ absolutePath: full, filename: entry.name })
    }
  }
}

export async function GET() {
  const facturenBase = process.env.ADMIN_FACTUREN_PATH
  const offertesBase = process.env.ADMIN_OFFERTES_PATH

  if (!facturenBase || !offertesBase) {
    return NextResponse.json({ error: 'Mappaden niet geconfigureerd in .env.local' }, { status: 500 })
  }

  // Verzamel alle PDFs
  const rawFiles: { absolutePath: string; filename: string }[] = []
  scanDir(facturenBase, rawFiles)
  scanDir(offertesBase, rawFiles)

  // Haal bestaande nummers op uit Supabase
  const supabase = createClient()
  const [{ data: facturen }, { data: offertes }] = await Promise.all([
    supabase.from('facturen').select('id, number'),
    supabase.from('offertes').select('id, number'),
  ])

  const factuurMap = new Map((facturen ?? []).map((f: any) => [f.number.toUpperCase(), f.id]))
  const offerteMap = new Map((offertes ?? []).map((o: any) => [o.number.toUpperCase(), o.id]))

  const scanned: ScannedFile[] = rawFiles.map(({ absolutePath, filename }) => {
    const { number, type } = extractNumber(filename)
    const map = type === 'factuur' ? factuurMap : offerteMap
    const matchedId = number ? (map.get(number) ?? null) : null
    return {
      type,
      filename,
      absolutePath,
      number,
      matched: matchedId !== null,
      matchedId,
    }
  })

  return NextResponse.json(scanned)
}
