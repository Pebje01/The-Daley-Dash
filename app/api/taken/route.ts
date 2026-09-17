import { NextRequest, NextResponse } from 'next/server'
import { getTaken, createTaak } from '@/lib/supabase/taken'
import { prioriteitInfo } from '@/lib/taken'

export const dynamic = 'force-dynamic'

export async function GET() {
  const taken = await getTaken()
  return NextResponse.json(taken)
}

export async function POST(request: NextRequest) {
  const { title, description, scheduledDate, prioriteit } = await request.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Titel is verplicht' }, { status: 400 })
  if (prioriteit && !prioriteitInfo(prioriteit)) return NextResponse.json({ error: 'Onbekende prioriteit' }, { status: 400 })
  try {
    const taak = await createTaak({ title: title.trim(), description, scheduledDate, prioriteit })
    return NextResponse.json(taak, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Toevoegen mislukt' }, { status: 500 })
  }
}
