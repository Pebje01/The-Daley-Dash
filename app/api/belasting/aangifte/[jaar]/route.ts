import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { jaar: string } }
) {
  const jaar = parseInt(params.jaar)
  if (isNaN(jaar) || jaar < 2020 || jaar > 2030) {
    return NextResponse.json({ error: 'Ongeldig jaar' }, { status: 400 })
  }

  const supabase = createClient()

  // Haal of maak aangifte-record
  let { data: aangifte, error: aanErr } = await supabase
    .from('belasting_aangifte')
    .select('*')
    .eq('jaar', jaar)
    .maybeSingle()

  if (aanErr) return NextResponse.json({ error: aanErr.message }, { status: 500 })

  if (!aangifte) {
    const { data: nieuw, error: insErr } = await supabase
      .from('belasting_aangifte')
      .insert({ jaar })
      .select()
      .single()
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    aangifte = nieuw
  }

  // Haal facturen op voor dit jaar (alle, ook betaalde — voor overzicht)
  const jaarStart = `${jaar}-01-01`
  const jaarEind = `${jaar}-12-31`
  const { data: facturen, error: facErr } = await supabase
    .from('facturen')
    .select('id, number, client_name, date, due_date, subtotal, total, status, paid_at')
    .gte('date', jaarStart)
    .lte('date', jaarEind)
    .order('date', { ascending: true })

  if (facErr) return NextResponse.json({ error: facErr.message }, { status: 500 })

  // Haal debiteur-statussen op
  const { data: debiteurStatussen } = await supabase
    .from('belasting_debiteur_status')
    .select('factuur_id, status, notitie, oninbaar_per')
    .eq('aangifte_id', aangifte.id)

  const statusMap = new Map(
    (debiteurStatussen ?? []).map(d => [d.factuur_id, d])
  )

  const facturenMet = (facturen ?? []).map(f => ({
    ...f,
    debiteur_status: statusMap.get(f.id)?.status ?? null,
    debiteur_notitie: statusMap.get(f.id)?.notitie ?? null,
    debiteur_oninbaar_per: statusMap.get(f.id)?.oninbaar_per ?? null,
  }))

  // Haal kosten op
  const { data: kosten, error: kosErr } = await supabase
    .from('belasting_kosten_regel')
    .select('*')
    .eq('aangifte_id', aangifte.id)
    .order('created_at', { ascending: true })

  if (kosErr) return NextResponse.json({ error: kosErr.message }, { status: 500 })

  // Haal investeringen op
  const { data: investeringen, error: invErr } = await supabase
    .from('belasting_investering')
    .select('*')
    .eq('aangifte_id', aangifte.id)
    .order('created_at', { ascending: true })

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  return NextResponse.json({
    aangifte,
    facturen: facturenMet,
    kosten: kosten ?? [],
    investeringen: investeringen ?? [],
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: { jaar: string } }
) {
  const jaar = parseInt(params.jaar)
  if (isNaN(jaar)) return NextResponse.json({ error: 'Ongeldig jaar' }, { status: 400 })

  const supabase = createClient()
  const body = await req.json()

  const { data, error } = await supabase
    .from('belasting_aangifte')
    .update({ ...body, laatst_bijgewerkt: new Date().toISOString() })
    .eq('jaar', jaar)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
