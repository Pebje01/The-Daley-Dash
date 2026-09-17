import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { controleerVoorstel, type VoorstelType } from '@/lib/assistent/voorstellen'

export const dynamic = 'force-dynamic'

const TYPES: VoorstelType[] = ['factuur_nieuw', 'factuur_wijzigen', 'factuur_pdf', 'factuur_koppelen']

/**
 * Een voorstel van de assistent vastleggen en nakijken. Wordt aangeroepen door
 * de MCP-server (scripts/dash-mcp.mjs), niet door de browser. Er wordt hier
 * niets uitgevoerd: dat gebeurt pas via /uitvoeren, na een klik.
 */
export async function POST(request: NextRequest) {
  const { gesprekId, type, payload } = await request.json().catch(() => ({}))
  if (!TYPES.includes(type) || !payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Ongeldig voorstel' }, { status: 400 })
  }

  let controle
  try {
    controle = await controleerVoorstel(type, payload)
  } catch (e) {
    controle = { fouten: [`Nakijken mislukt: ${e instanceof Error ? e.message : String(e)}`], waarschuwingen: [] }
  }

  const { data, error } = await createClient()
    .from('assistent_voorstellen')
    .insert({ gesprek_id: gesprekId || null, type, payload, controle })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
