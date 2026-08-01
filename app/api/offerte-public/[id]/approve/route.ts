import { NextRequest, NextResponse } from 'next/server'
import { getOfferte, updateOfferte } from '@/lib/supabase/offertes'
import { createClient } from '@/lib/supabase/server'
import { sendOfferteApprovalNotification } from '@/lib/email'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const offerte = await getOfferte(params.id)

  if (!offerte) {
    return NextResponse.json({ error: 'Offerte not found' }, { status: 404 })
  }

  // De GET-route controleerde `isPublic` wel, deze niet. Een offerte die niet
  // gedeeld is kon dus wel akkoord gezet worden door wie het id kende.
  if (!offerte.isPublic) {
    return NextResponse.json({ error: 'Offerte is not public' }, { status: 403 })
  }

  if (offerte.status === 'akkoord') {
    return NextResponse.json({ error: 'Already approved' }, { status: 400 })
  }

  // Een verlopen offerte accepteren hoort niet: de prijzen gelden dan niet meer.
  const vandaag = new Date().toISOString().split('T')[0]
  if (offerte.validUntil && offerte.validUntil < vandaag) {
    return NextResponse.json(
      { error: 'Deze offerte is verlopen. Neem even contact op voor een nieuwe.' },
      { status: 410 }
    )
  }

  const { clientName, clientEmail, agreedToTerms } = await request.json()

  if (!clientName || !clientEmail || !agreedToTerms) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Update offerte status
  await updateOfferte(offerte.id, {
    status: 'akkoord',
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
    const updated = await getOfferte(params.id)
    if (updated) {
      await sendOfferteApprovalNotification(updated, clientName, clientEmail)
    }
  } catch (e) {
    console.error('Failed to send approval notification:', e)
  }

  return NextResponse.json({ ok: true })
}
