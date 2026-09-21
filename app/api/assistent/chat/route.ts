import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { draaiAssistent, type AssistentEvent } from '@/lib/assistent/claude'
import { bouwInstructies } from '@/lib/assistent/instructies'

export const dynamic = 'force-dynamic'
// Een antwoord met een paar acties duurt al snel een halve minuut of meer
export const maxDuration = 300

/** Eén run per gesprek tegelijk: twee claude-processen op dezelfde sessie lopen door elkaar. */
const lopend = new Set<string>()

const STATUS_TEKST: Record<string, string> = {
  uitgevoerd: 'uitgevoerd',
  geannuleerd: 'geannuleerd',
  mislukt: 'mislukt',
}

/**
 * Stuurt een bericht naar de assistent en streamt het antwoord terug als
 * NDJSON: { type: 'gesprek' | 'tekst' | 'actie' | 'voorstel' | 'klaar' | 'fout', ... }
 */
export async function POST(request: NextRequest) {
  const { gesprekId: bestaandId, bericht, pagina, bedrijf, profiel } = await request.json().catch(() => ({}))
  if (typeof bericht !== 'string' || !bericht.trim()) {
    return Response.json({ error: 'Leeg bericht' }, { status: 400 })
  }

  const supabase = createClient()

  let gesprek: { id: string; claude_sessie_id: string | null } | null = null
  if (bestaandId) {
    const { data } = await supabase.from('assistent_gesprekken').select('id, claude_sessie_id').eq('id', bestaandId).maybeSingle()
    gesprek = data
  }
  if (!gesprek) {
    const { data, error } = await supabase
      .from('assistent_gesprekken')
      .insert({ titel: bericht.trim().slice(0, 80), pagina: pagina ?? null })
      .select('id, claude_sessie_id')
      .single()
    if (error) {
      const melding = /assistent_gesprekken/.test(error.message)
        ? 'De assistent kan nog niet: draai eerst de migratie 20260918_assistent.sql in Supabase.'
        : error.message
      return Response.json({ error: melding }, { status: 500 })
    }
    gesprek = data
  }
  const gesprekId = gesprek!.id

  if (lopend.has(gesprekId)) {
    return Response.json({ error: 'De assistent is nog bezig met je vorige bericht' }, { status: 409 })
  }
  lopend.add(gesprekId)

  // Wat Daley sinds het vorige bericht met de voorstellen deed. Zonder dit
  // denkt de assistent dat een factuur nog klaarstaat die allang gemaakt is.
  const { data: nieuws } = await supabase
    .from('assistent_voorstellen')
    .select('id, type, status, resultaat')
    .eq('gesprek_id', gesprekId)
    .eq('gemeld', false)
    .in('status', ['uitgevoerd', 'geannuleerd', 'mislukt'])
  const updates = (nieuws ?? []).map(v => {
    const r = (v.resultaat ?? {}) as Record<string, unknown>
    const extra = v.status === 'uitgevoerd' && r.factuurnummer ? ` (factuur ${r.factuurnummer})` : v.status === 'mislukt' && r.fout ? ` (fout: ${r.fout})` : ''
    return `- Voorstel ${v.id} (${v.type}) is door Daley ${STATUS_TEKST[v.status]}${extra}.`
  })
  if (nieuws?.length) {
    await supabase.from('assistent_voorstellen').update({ gemeld: true }).in('id', nieuws.map(v => v.id))
  }
  const prompt = updates.length
    ? `[Sinds je vorige antwoord]\n${updates.join('\n')}\n\n[Bericht van Daley]\n${bericht.trim()}`
    : bericht.trim()

  await supabase.from('assistent_berichten').insert({ gesprek_id: gesprekId, rol: 'gebruiker', inhoud: { tekst: bericht.trim() } })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const stuur = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')) } catch { /* verbinding dicht */ }
      }
      stuur({ type: 'gesprek', gesprekId })

      try {
        const resultaat = await draaiAssistent({
          bericht: prompt,
          instructies: bouwInstructies({ pagina, bedrijf, profiel }),
          gesprekId,
          sessieId: gesprek!.claude_sessie_id,
          signal: request.signal,
          onEvent: (e: AssistentEvent) => stuur(e),
        })

        // Bewaren in dezelfde volgorde als het op het scherm stond
        const rijen = resultaat.segmenten
          .filter(s => s.soort === 'voorstel' || s.tekst.trim())
          .map(s => s.soort === 'tekst'
            ? { gesprek_id: gesprekId, rol: 'assistent', inhoud: { tekst: s.tekst.trim() } }
            : { gesprek_id: gesprekId, rol: 'voorstel', inhoud: { voorstelId: s.voorstelId } })
        if (resultaat.fout) rijen.push({ gesprek_id: gesprekId, rol: 'systeem', inhoud: { tekst: resultaat.fout } as never })
        // Oplopende tijden: in één insert krijgen ze anders dezelfde created_at en valt de volgorde weg
        const basis = Date.now()
        if (rijen.length) {
          await supabase.from('assistent_berichten').insert(
            rijen.map((r, i) => ({ ...r, created_at: new Date(basis + i).toISOString() }))
          )
        }
        await supabase
          .from('assistent_gesprekken')
          .update({ claude_sessie_id: resultaat.sessieId, updated_at: new Date().toISOString() })
          .eq('id', gesprekId)

        if (resultaat.fout) stuur({ type: 'fout', bericht: resultaat.fout })
        stuur({ type: 'klaar' })
      } catch (e) {
        stuur({ type: 'fout', bericht: e instanceof Error ? e.message : String(e) })
      } finally {
        lopend.delete(gesprekId)
        try { controller.close() } catch { /* al dicht */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
