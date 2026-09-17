import { NextRequest, NextResponse } from 'next/server'
import { updateWerkbankSectie, deleteWerkbankSectie } from '@/lib/supabase/werkbank'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json()
  if (body.titel !== undefined && !body.titel?.trim()) {
    return NextResponse.json({ error: 'Titel mag niet leeg zijn' }, { status: 400 })
  }
  const sectie = await updateWerkbankSectie(params.id, body)
  return NextResponse.json(sectie)
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  await deleteWerkbankSectie(params.id)
  return NextResponse.json({ ok: true })
}
