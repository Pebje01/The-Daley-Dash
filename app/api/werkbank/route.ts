import { NextRequest, NextResponse } from 'next/server'
import { getWerkbankSecties, createWerkbankSectie } from '@/lib/supabase/werkbank'

export const dynamic = 'force-dynamic'

export async function GET() {
  const secties = await getWerkbankSecties()
  return NextResponse.json(secties)
}

export async function POST(request: NextRequest) {
  const { titel, inhoud, status, volgorde } = await request.json()
  if (!titel?.trim()) return NextResponse.json({ error: 'Titel is verplicht' }, { status: 400 })
  const sectie = await createWerkbankSectie({ titel: titel.trim(), inhoud, status, volgorde })
  return NextResponse.json(sectie, { status: 201 })
}
