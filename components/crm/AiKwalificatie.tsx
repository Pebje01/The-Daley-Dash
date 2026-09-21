'use client'

/**
 * Weergave van de AI-kwalificatie op een lead.
 *
 * Bewust adviserend van toon: de AI geeft een oordeel, jij beslist. Niets in
 * dit component verandert de fase, de volgende actie of de contactstatus.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// Open of dicht blijft per browser onthouden, voor alle leads tegelijk
const OPEN_SLEUTEL = 'crm-ai-kwalificatie-open'

export interface AiVelden {
  ai_status?: string | null
  ai_score?: number | null
  ai_prioriteit?: string | null
  ai_branche?: string | null
  ai_website?: string | null
  ai_samenvatting?: string | null
  ai_signalen?: { plus?: string[]; min?: string[] } | null
  ai_volgende_stap?: string | null
  ai_beoordeeld_op?: string | null
  ai_model?: string | null
  ai_fout?: string | null
}

const SCORE_KLEUR: Record<string, string> = {
  hoog: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  midden: 'bg-amber-100 text-amber-800 border-amber-200',
  laag: 'bg-gray-100 text-gray-600 border-gray-200',
}

/** Compacte badge voor op de bordkaart. */
export function AiScoreBadge({ record }: { record: AiVelden }) {
  if (record.ai_status === 'bezig' || record.ai_status === 'wachtend') {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded border bg-brand-lavender-light/40 border-brand-card-border/15 text-brand-text-secondary animate-pulse">
        AI kijkt...
      </span>
    )
  }
  if (record.ai_score == null) return null

  const kleur = SCORE_KLEUR[record.ai_prioriteit || 'laag'] || SCORE_KLEUR.laag
  return (
    <span className="flex items-center gap-1">
      <span
        className={`text-xs px-1.5 py-0.5 rounded border font-medium ${kleur}`}
        title={record.ai_samenvatting || undefined}
      >
        {record.ai_score}
      </span>
      {record.ai_branche && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-brand-page-light text-brand-text-secondary truncate max-w-[120px]">
          {record.ai_branche}
        </span>
      )}
    </span>
  )
}

/** Volledig blok voor de detailkaart. */
export function AiKwalificatieBlok({
  recordId,
  record,
  onVernieuwd,
}: {
  recordId: string
  record: AiVelden
  onVernieuwd?: () => void
}) {
  const [bezig, setBezig] = useState(
    record.ai_status === 'bezig' || record.ai_status === 'wachtend'
  )
  const [fout, setFout] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Standaard ingeklapt: het advies is naslag, het blok nam de halve werkkolom in
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_SLEUTEL) === '1') } catch { /* privémodus */ }
  }, [])
  const wissel = () => setOpen((o) => {
    try { localStorage.setItem(OPEN_SLEUTEL, o ? '0' : '1') } catch { /* privémodus */ }
    return !o
  })

  // Zolang de AI werkt de kaart elke 8 seconden verversen, zodat de uitslag
  // vanzelf binnenvalt zonder dat je hoeft te herladen.
  useEffect(() => {
    const draait = record.ai_status === 'bezig' || record.ai_status === 'wachtend'
    setBezig(draait)
    if (!draait) {
      if (timer.current) clearInterval(timer.current)
      timer.current = null
      return
    }
    if (timer.current) return
    timer.current = setInterval(() => onVernieuwd?.(), 8000)
    return () => {
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }
  }, [record.ai_status, onVernieuwd])

  const beoordeel = useCallback(async () => {
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch('/api/crm/leads/kwalificeer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: recordId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Inplannen mislukt')
      }
      onVernieuwd?.()
    } catch (e: any) {
      setFout(e?.message || 'Inplannen mislukt')
      setBezig(false)
    }
  }, [recordId, onVernieuwd])

  const plus = record.ai_signalen?.plus || []
  const min = record.ai_signalen?.min || []
  const kleur = SCORE_KLEUR[record.ai_prioriteit || 'laag'] || SCORE_KLEUR.laag
  const beoordeeld = record.ai_score != null

  const beoordeelKnop = (
    <button
      type="button"
      onClick={beoordeel}
      disabled={bezig}
      className="text-xs px-2.5 py-1 rounded border border-brand-card-border/20 bg-white dark:bg-brand-card-bg hover:bg-brand-page-light disabled:opacity-50 text-brand-text-secondary shrink-0"
    >
      {bezig ? 'Bezig...' : beoordeeld ? 'Opnieuw beoordelen' : 'Beoordelen'}
    </button>
  )

  return (
    <div className="rounded-brand border border-brand-card-border/15 bg-brand-lavender-light/40">
      <div className="flex items-center gap-2 px-3 py-2">
        {/* De kop is de uitklapknop, zolang er iets uit te klappen valt */}
        <button
          type="button"
          onClick={beoordeeld ? wissel : undefined}
          disabled={!beoordeeld}
          aria-expanded={beoordeeld ? open : undefined}
          className="flex items-center gap-2 flex-1 min-w-0 text-left disabled:cursor-default"
        >
          {beoordeeld && (open
            ? <ChevronDown size={14} className="text-brand-text-secondary shrink-0" />
            : <ChevronRight size={14} className="text-brand-text-secondary shrink-0" />)}
          <span className="text-sm font-medium text-brand-text-primary shrink-0">AI-kwalificatie</span>
          {beoordeeld && (
            <span className={`text-xs px-2 py-0.5 rounded border font-medium shrink-0 ${kleur}`}>
              {record.ai_score}/100 · {record.ai_prioriteit}
            </span>
          )}
          {record.ai_branche && (
            <span className="text-xs px-2 py-0.5 rounded bg-white dark:bg-brand-card-bg border border-brand-card-border/15 text-brand-text-secondary truncate">
              {record.ai_branche}
            </span>
          )}
          {bezig && <span className="text-xs text-brand-text-secondary animate-pulse truncate">Claude kijkt...</span>}
        </button>
        {(!beoordeeld || open) && beoordeelKnop}
      </div>

      {(fout || bezig || (!beoordeeld && !bezig) || (!bezig && record.ai_status === 'mislukt' && record.ai_fout)) && (
        <div className="px-3 pb-3 space-y-1">
          {bezig && (
            <p className="text-xs text-brand-text-secondary">
              Claude zoekt de website op en leest hem door. Dit duurt ongeveer een minuut.
            </p>
          )}
          {fout && <p className="text-xs text-red-600">{fout}</p>}
          {!bezig && record.ai_status === 'mislukt' && record.ai_fout && (
            <p className="text-xs text-red-600">Laatste poging mislukt: {record.ai_fout}</p>
          )}
          {!bezig && !beoordeeld && record.ai_status !== 'mislukt' && (
            <p className="text-xs text-brand-text-secondary">
              Nog niet beoordeeld. Nieuwe leads gaan hier vanzelf doorheen.
            </p>
          )}
        </div>
      )}

      {beoordeeld && open && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          {record.ai_website && (
            <a
              href={record.ai_website}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand-lav-accent hover:underline break-all inline-block"
            >
              {record.ai_website}
            </a>
          )}

          {record.ai_samenvatting && (
            <p className="text-sm text-brand-text-primary whitespace-pre-line leading-relaxed">
              {record.ai_samenvatting}
            </p>
          )}

          {(plus.length > 0 || min.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {plus.length > 0 && (
                <ul className="space-y-1">
                  {plus.map((p, i) => (
                    <li key={i} className="text-xs text-brand-text-secondary flex gap-1.5">
                      <span className="text-emerald-600 shrink-0">+</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              )}
              {min.length > 0 && (
                <ul className="space-y-1">
                  {min.map((m, i) => (
                    <li key={i} className="text-xs text-brand-text-secondary flex gap-1.5">
                      <span className="text-rose-500 shrink-0">&minus;</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {record.ai_volgende_stap && (
            <div className="rounded border border-brand-card-border/15 bg-white dark:bg-brand-card-bg p-3">
              <p className="text-xs font-medium text-brand-text-primary mb-1">Voorgestelde eerste stap</p>
              <p className="text-sm text-brand-text-secondary leading-relaxed">{record.ai_volgende_stap}</p>
            </div>
          )}

          <p className="text-xs text-brand-text-secondary/70">
            {record.ai_beoordeeld_op
              ? `Beoordeeld op ${new Date(record.ai_beoordeeld_op).toLocaleString('nl-NL', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : ''}
            {record.ai_model ? ` · ${record.ai_model}` : ''} · advies, geen automaat
          </p>
        </div>
      )}
    </div>
  )
}
