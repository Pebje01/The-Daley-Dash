'use client'

/**
 * Het mailadres van een lead, in de detailkaart.
 *
 * Bewust een eigen keuze en geen gok: de Dash pakt nooit zelf het adres van een
 * gekoppeld contact. Dat ging mis bij een lead waar een contact van Montung aan
 * hing. Adressen van gekoppelde records staan hier wel als suggestie.
 *
 * Dit adres is waar Benaderen de mail heen stuurt, en waarop de Dash verzonden
 * mail en reacties herkent.
 */
import { useCallback, useEffect, useState } from 'react'
import { Check, Mail, Search, X } from 'lucide-react'
import { VELD_INPUT } from '@/lib/crm/stijl'

interface Suggestie {
  email: string
  bron: string
}

export default function MailAdresKiezer({ recordId }: { recordId: string }) {
  const [gekozen, setGekozen] = useState<string | null>(null)
  const [suggesties, setSuggesties] = useState<Suggestie[]>([])
  const [invoer, setInvoer] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [bewaard, setBewaard] = useState(false)
  const [zoekt, setZoekt] = useState(false)

  const laad = useCallback(async () => {
    const res = await fetch(`/api/crm/records/${recordId}/mailadres`).catch(() => null)
    const json = await res?.json().catch(() => null)
    if (!res?.ok || !json) return
    setGekozen(json.gekozen || null)
    setInvoer(json.gekozen || '')
    setSuggesties(json.suggesties || [])
  }, [recordId])

  useEffect(() => { laad() }, [laad])

  async function bewaar(email: string | null) {
    setBezig(true)
    setFout('')
    try {
      const res = await fetch(`/api/crm/records/${recordId}/mailadres`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Opslaan mislukt')
      setGekozen(json.gekozen)
      setInvoer(json.gekozen || '')
      setBewaard(true)
      setTimeout(() => setBewaard(false), 1500)
    } catch (e: any) {
      setFout(e.message)
    } finally {
      setBezig(false)
    }
  }

  /**
   * Laat de AI het adres opzoeken bij deze ene lead, met dezelfde zoeker als bij
   * prospects: hij leest de site en rekent elk gevonden adres daar tegen na.
   * Duurt ongeveer een minuut, dus we kijken een tijdje of er iets binnenkomt.
   */
  async function zoekAdres() {
    setZoekt(true)
    setFout('')
    try {
      const res = await fetch('/api/crm/leads/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Opzoeken kon niet worden gestart')

      for (let poging = 0; poging < 20; poging++) {
        await new Promise((r) => setTimeout(r, 6000))
        const stand = await fetch(`/api/crm/records/${recordId}/mailadres`).then((r) => r.json()).catch(() => null)
        if (stand?.gekozen) {
          setGekozen(stand.gekozen)
          setInvoer(stand.gekozen)
          setSuggesties(stand.suggesties || [])
          return
        }
      }
      setFout('Nog geen adres gevonden. Kijk zo nog eens, of vul hem zelf in.')
    } catch (e: any) {
      setFout(e.message)
    } finally {
      setZoekt(false)
    }
  }

  const gewijzigd = (invoer.trim() || null) !== (gekozen || null)
  const ongebruikt = suggesties.filter((s) => s.email !== gekozen)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          onBlur={() => gewijzigd && bewaar(invoer.trim() || null)}
          onKeyDown={(e) => { if (e.key === 'Enter') bewaar(invoer.trim() || null) }}
          placeholder="naam@bedrijf.nl"
          disabled={bezig}
          className={VELD_INPUT}
        />
        {gekozen && !gewijzigd && (
          <button
            onClick={() => bewaar(null)}
            disabled={bezig}
            aria-label="Mailadres weghalen"
            title="Mailadres weghalen"
            className="p-1 text-brand-text-secondary hover:text-brand-status-red shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {!gekozen && (
        <button
          onClick={zoekAdres}
          disabled={zoekt || bezig}
          className="w-full flex items-center justify-center gap-1.5 text-caption font-medium rounded-brand-btn border border-brand-card-border/15 bg-white px-2 py-1.5 hover:border-brand-lav-accent disabled:opacity-50"
        >
          <Search size={12} className={zoekt ? 'animate-pulse' : ''} />
          {zoekt ? 'Aan het zoeken, dit duurt ongeveer een minuut...' : 'Laat de AI het adres opzoeken'}
        </button>
      )}

      {bewaard && (
        <p className="text-caption text-brand-status-green flex items-center gap-1"><Check size={11} /> Opgeslagen</p>
      )}

      {ongebruikt.length > 0 && (
        <div className="space-y-1">
          <p className="text-caption text-brand-text-secondary">Gekoppeld aan deze lead:</p>
          {ongebruikt.map((s) => (
            <button
              key={s.email}
              onClick={() => bewaar(s.email)}
              disabled={bezig}
              title={`${s.email} gebruiken`}
              className="w-full flex items-center gap-1.5 text-left text-caption rounded-brand-btn border border-brand-card-border/15 bg-white px-2 py-1 hover:border-brand-lav-accent disabled:opacity-50"
            >
              <Mail size={11} className="text-brand-text-secondary shrink-0" />
              <span className="truncate text-brand-text-primary">{s.email}</span>
              <span className="truncate text-brand-text-secondary">{s.bron}</span>
            </button>
          ))}
        </div>
      )}

      <p className="text-caption text-brand-text-secondary">
        Hier gaat Benaderen naartoe, en hierop herkent de Dash verzonden mail en reacties. Een adres van een gekoppeld contact wordt nooit vanzelf gebruikt.
      </p>
      {fout && <p className="text-caption text-brand-status-red">{fout}</p>}
    </div>
  )
}
