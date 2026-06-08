import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_facturatie')
    .select('*, bedrijf:crm_bedrijven(id, naam), contactpersoon:crm_contacten(id, naam, email)')
    .order('factuurdatum', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
