import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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

  const supabase = createClient()
  const vandaag = new Date().toISOString().split('T')[0]
  const aangemaakt: string[] = []

  // --- 1. Factuur herinneringen ---
  // Facturen met status 'verzonden' waarvan de vervaldatum verstreken is
  const { data: overdueFacturen } = await supabase
    .from('facturen')
    .select('id, number, due_date, total, client, company_id')
    .eq('status', 'verzonden')
    .lt('due_date', vandaag)

  for (const factuur of overdueFacturen ?? []) {
    // Check: heeft deze factuur al een niet-afgewezen actie?
    const { data: bestaand } = await supabase
      .from('acties')
      .select('id')
      .eq('factuur_id', factuur.id)
      .in('status', ['gepland', 'goedgekeurd', 'verzonden'])
      .limit(1)

    if (bestaand && bestaand.length > 0) continue

    const dueDate = new Date(factuur.due_date)
    const dagsTeLaat = Math.floor((Date.now() - dueDate.getTime()) / 86400000)
    const clientData = typeof factuur.client === 'string' ? JSON.parse(factuur.client) : factuur.client

    const { data: nieuweActie } = await supabase
      .from('acties')
      .insert({
        type: 'factuur-herinnering',
        status: 'gepland',
        factuur_id: factuur.id,
        actie_datum: vandaag,
        metadata: {
          clientName: clientData?.name ?? '(onbekend)',
          factuurNumber: factuur.number,
          amount: factuur.total,
          companyId: factuur.company_id,
          dagsTeLaat,
        },
      })
      .select('id')
      .single()

    if (nieuweActie) aangemaakt.push(`factuur-herinnering:${factuur.number}`)
  }

  // --- 2. Offerte follow-ups (verstuurd > 14 dagen geleden, nog geen reactie) ---
  const veertienDagenGeleden = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]

  const { data: openOffertes } = await supabase
    .from('offertes')
    .select('id, number, sent_at, total, client, company_id')
    .eq('status', 'verstuurd')
    .lt('sent_at', veertienDagenGeleden)

  for (const offerte of openOffertes ?? []) {
    const { data: bestaand } = await supabase
      .from('acties')
      .select('id')
      .eq('offerte_id', offerte.id)
      .eq('type', 'offerte-follow-up')
      .in('status', ['gepland', 'goedgekeurd', 'verzonden'])
      .limit(1)

    if (bestaand && bestaand.length > 0) continue

    const sentAt = new Date(offerte.sent_at)
    const dagenSindsVersturen = Math.floor((Date.now() - sentAt.getTime()) / 86400000)
    const clientData = typeof offerte.client === 'string' ? JSON.parse(offerte.client) : offerte.client

    await supabase.from('acties').insert({
      type: 'offerte-follow-up',
      status: 'gepland',
      offerte_id: offerte.id,
      actie_datum: vandaag,
      metadata: {
        clientName: clientData?.name ?? '(onbekend)',
        offerteNumber: offerte.number,
        amount: offerte.total,
        companyId: offerte.company_id,
        dagenSindsVersturen,
      },
    })

    aangemaakt.push(`offerte-follow-up:${offerte.number}`)
  }

  // --- 3. Verlopen offertes (status nog 'verstuurd' maar valid_until < vandaag) ---
  const { data: verlopenOffertes } = await supabase
    .from('offertes')
    .select('id, number, valid_until, total, client, company_id')
    .eq('status', 'verstuurd')
    .lt('valid_until', vandaag)

  for (const offerte of verlopenOffertes ?? []) {
    const { data: bestaand } = await supabase
      .from('acties')
      .select('id')
      .eq('offerte_id', offerte.id)
      .eq('type', 'offerte-verlopen')
      .in('status', ['gepland', 'goedgekeurd'])
      .limit(1)

    if (bestaand && bestaand.length > 0) continue

    const clientData = typeof offerte.client === 'string' ? JSON.parse(offerte.client) : offerte.client

    await supabase.from('acties').insert({
      type: 'offerte-verlopen',
      status: 'gepland',
      offerte_id: offerte.id,
      actie_datum: vandaag,
      metadata: {
        clientName: clientData?.name ?? '(onbekend)',
        offerteNumber: offerte.number,
        amount: offerte.total,
        companyId: offerte.company_id,
      },
    })

    aangemaakt.push(`offerte-verlopen:${offerte.number}`)
  }

  return NextResponse.json({ aangemaakt, totaal: aangemaakt.length })
}
