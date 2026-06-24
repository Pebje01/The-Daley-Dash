import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { createClient } from '@/lib/supabase/server'
import type { ExtractedDoc } from '../extract/route'
import { isAllowedAdminDocumentPath } from '@/lib/admin/documentPaths'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { absolutePath, doc, filenameNumber } = body as {
    absolutePath: string
    doc: ExtractedDoc
    filenameNumber: string | null
  }

  if (!absolutePath || !doc) {
    return NextResponse.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
  }

  const resolved = path.resolve(absolutePath)
  if (!isAllowedAdminDocumentPath(resolved)) {
    return NextResponse.json({ error: 'Toegang geweigerd' }, { status: 403 })
  }

  // Gebruik het nummer uit de PDF (Gemini), val terug op het bestandsnummer
  const rawNumber = doc.number ?? filenameNumber
  if (!rawNumber) {
    return NextResponse.json({ error: 'Geen documentnummer gevonden in PDF of bestandsnaam' }, { status: 422 })
  }
  const numberUpper = rawNumber.toUpperCase()
  const slug = rawNumber.toLowerCase()

  const supabase = createClient()
  const table = doc.type === 'factuur' ? 'facturen' : 'offertes'

  // Deduplicatie: check of het nummer al bestaat
  const { data: existing } = await supabase
    .from(table)
    .select('id, number')
    .ilike('number', numberUpper)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `Al aanwezig in de Dash: ${(existing as { id: string; number: string }).number}`, alreadyExists: true },
      { status: 409 }
    )
  }

  const now = new Date().toISOString()
  const companyId = doc.companyId ?? 'daleyphotography'
  const btwPercentage = doc.btwPercentage ?? 21
  const subtotal = doc.subtotal ?? 0
  const btwAmount = doc.btwAmount ?? Math.round(subtotal * (btwPercentage / 100) * 100) / 100
  const total = doc.total ?? Math.round((subtotal + btwAmount) * 100) / 100

  if (doc.type === 'factuur') {
    const status = doc.status === 'betaald' || doc.paidAt ? 'betaald' : 'verzonden'
    const date = doc.date ?? now.split('T')[0]
    const dueDate = doc.dueDate ?? date
    const paidAt = status === 'betaald'
      ? (doc.paidAt ?? `${date}T12:00:00+01:00`)
      : null

    const { data: row, error } = await supabase
      .from('facturen')
      .insert({
        number: numberUpper,
        slug,
        company_id: companyId,
        client_name: doc.clientName ?? 'Onbekend',
        client_contact_person: doc.clientContactPerson ?? null,
        client_address: doc.clientAddress ?? null,
        date,
        due_date: dueDate,
        status,
        paid_at: paidAt,
        subtotal,
        btw_percentage: btwPercentage,
        btw_amount: btwAmount,
        total,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const lineItems = doc.lineItems ?? []
    if (lineItems.length > 0) {
      await supabase.from('factuur_line_items').insert(
        lineItems.map((item, idx) => ({
          factuur_id: (row as { id: string }).id,
          sort_order: idx,
          description: item.description,
          details: item.details ?? null,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          section_title: null,
        }))
      )
    }

    return NextResponse.json({ success: true, id: (row as { id: string }).id, number: numberUpper })
  } else {
    const validOfferteStatuses = new Set(['concept', 'opgeslagen', 'verstuurd', 'akkoord', 'afgewezen', 'verlopen', 'on-hold'])
    const status = doc.status && validOfferteStatuses.has(doc.status) ? doc.status : 'verstuurd'
    const date = doc.date ?? now.split('T')[0]
    const validUntil = doc.validUntil ?? date

    const { data: row, error } = await supabase
      .from('offertes')
      .insert({
        number: numberUpper,
        slug,
        company_id: companyId,
        client_name: doc.clientName ?? 'Onbekend',
        client_contact_person: doc.clientContactPerson ?? null,
        client_address: doc.clientAddress ?? null,
        date,
        valid_until: validUntil,
        status,
        subtotal,
        btw_percentage: btwPercentage,
        btw_amount: btwAmount,
        total,
        is_public: false,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const lineItems = doc.lineItems ?? []
    if (lineItems.length > 0) {
      await supabase.from('line_items').insert(
        lineItems.map((item, idx) => ({
          offerte_id: (row as { id: string }).id,
          sort_order: idx,
          description: item.description,
          details: item.details ?? null,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          section_title: null,
        }))
      )
    }

    return NextResponse.json({ success: true, id: (row as { id: string }).id, number: numberUpper })
  }
}
