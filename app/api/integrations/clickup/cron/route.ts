import { NextRequest, NextResponse } from 'next/server'
import { syncClickUpCrm } from '@/lib/clickup/sync'

function isAuthorizedCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncClickUpCrm({
      source: 'cron',
      triggerMeta: { scheduler: 'vercel-cron' },
    })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Cron sync failed' }, { status: 500 })
  }
}

