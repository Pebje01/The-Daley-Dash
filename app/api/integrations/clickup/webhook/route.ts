import { NextRequest, NextResponse } from 'next/server'
import {
  logClickUpWebhookEvent,
  markWebhookProcessed,
  syncClickUpCrm,
  verifyClickUpWebhookSignature,
} from '@/lib/clickup/sync'

export async function GET() {
  return NextResponse.json({ ok: true, route: 'clickup-webhook' })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  if (!verifyClickUpWebhookSignature(rawBody, request.headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: any = {}
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let eventId = ''
  try {
    eventId = await logClickUpWebhookEvent(payload, request.headers)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Webhook log failed' }, { status: 500 })
  }

  // Fase 1: bij elk event een sync-run triggeren (hybride met cron als vangnet)
  try {
    const result = await syncClickUpCrm({
      source: 'webhook',
      triggerMeta: { event: payload?.event || payload?.type || 'unknown' },
    })
    if (eventId) await markWebhookProcessed(eventId)
    return NextResponse.json({ ok: true, synced: true, result })
  } catch (e: any) {
    // Webhook wel accepteren, cron vangt dit later op
    return NextResponse.json({
      ok: true,
      synced: false,
      warning: e?.message || 'Webhook ontvangen, sync mislukt',
    })
  }
}
