import { NextRequest, NextResponse } from 'next/server'
import { promoteRecord } from '@/lib/clickup/sync'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const record = await promoteRecord(id)
    return NextResponse.json({ item: record })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Promote mislukt' }, { status: 500 })
  }
}
