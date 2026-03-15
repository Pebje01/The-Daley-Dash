import { NextRequest, NextResponse } from 'next/server'
import { getTaken, createTaak } from '@/lib/supabase/taken'

export const dynamic = 'force-dynamic'

export async function GET() {
  const taken = await getTaken()
  return NextResponse.json(taken)
}

export async function POST(request: NextRequest) {
  const { title, description, scheduledDate } = await request.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Titel is verplicht' }, { status: 400 })
  const taak = await createTaak({ title: title.trim(), description, scheduledDate })
  return NextResponse.json(taak, { status: 201 })
}
