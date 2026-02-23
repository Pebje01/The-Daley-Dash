import { NextRequest, NextResponse } from 'next/server'
import { getOfferteBySlug, updateOfferte } from '@/lib/supabase/offertes'
import { createClient } from '@/lib/supabase/server'
import { sendOfferteApprovalNotification } from '@/lib/email'

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const offerte = await getOfferteBySlug(params.slug)

  if (!offerte) {
    return NextResponse.json({ error: 'Offerte not found' }, { status: 404 })
  }

  if (offerte.status === 'geaccepteerd') {
    return NextResponse.json({ error: 'Already approved' }, { status: 400 })
  }

  const { clientName, clientEmail, agreedToTerms } = await request.json()

  if (!clientName || !clientEmail || !agreedToTerms) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Update offerte status
  await updateOfferte(offerte.id, {
    status: 'geaccepteerd',
    approvedAt: now,
    approvedByName: clientName,
    approvedByEmail: clientEmail,
  })

  // Insert approval audit log
  const supabase = createClient()
  await supabase.from('offerte_approvals').insert({
    offerte_id: offerte.id,
    client_name: clientName,
    client_email: clientEmail,
    client_ip: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    user_agent: request.headers.get('user-agent') ?? null,
    agreed_to_terms: true,
    created_at: now,
  })

  // Send notification email to admin
  try {
    const updated = await getOfferteBySlug(params.slug)
    if (updated) {
      await sendOfferteApprovalNotification(updated, clientName, clientEmail)
    }
  } catch (e) {
    console.error('Failed to send approval notification:', e)
  }

  return NextResponse.json({ ok: true })
}
