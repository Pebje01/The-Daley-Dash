import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOfferte, updateOfferte } from '@/lib/supabase/offertes'
import { sendOfferteToClient } from '@/lib/email'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const offerte = await getOfferte(params.id)
  if (!offerte) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!offerte.client.email) {
    return NextResponse.json({ error: 'Client has no email address' }, { status: 400 })
  }

  await updateOfferte(params.id, {
    isPublic: true,
    status: 'verzonden',
  })

  const baseUrl = new URL(request.url).origin

  // Re-fetch with updated data
  const updated = await getOfferte(params.id)
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await sendOfferteToClient(updated, baseUrl)

  return NextResponse.json({
    ok: true,
    slug: updated.slug,
    publicUrl: `${baseUrl}/offerte/${updated.slug}`,
  })
}
