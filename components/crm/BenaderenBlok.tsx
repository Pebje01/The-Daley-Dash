'use client'

/**
 * Een lead benaderen vanuit de detailkaart.
 *
 * De AI schrijft een eerste mail, Daley past hem hier aan en opent hem als nieuw
 * bericht in Spark. Versturen doet ze daar zelf. Zodra de mail in de verzonden
 * mail van Spark staat, logt de Dash het contactmoment en schuift de lead door naar Benaderd.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Mail, RefreshCw, Send, Sparkles, Trash2, X } from 'lucide-react'
import { VELD_INPUT } from '@/lib/crm/stijl'

type ConceptStatus = 'concept' | 'in_spark' | 'verstuurd' | 'geannuleerd'

interface MailConcept {
  id: string
  account: string | null
  aan: string | null
  onderwerp: string
  tekst: string
  status: ConceptStatus
  in_spark_op: string | null
  verstuurd_op: string | null
  laatst_gecontroleerd_op: string | null
}

interface Props {
  recordId: string
  /** Knop "Benaderen" in de kop is ingedrukt: schrijf meteen een concept als er nog geen is */
  gevraagd: boolean
  onSluit: () => void
  /** De mail is verstuurd en gelogd: kop en bord bijwerken */
  onVerstuurd: () => void
}

function tijd(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function BenaderenBlok({ recordId, gevraagd, onSluit, onVerstuurd }: Props) {
  const [concept, setConcept] = useState<MailConcept | null>(null)
  const [accounts, setAccounts] = useState<{ email: string; naam: string }[]>([])
  const [geladen, setGeladen] = useState(false)
  const [bezig, setBezig] = useState<null | 'schrijven' | 'spark' | 'controleren' | 'annuleren'>(null)
  const [fout, setFout] = useState('')
  const [sparkFout, setSparkFout] = useState('')
  const [melding, setMelding] = useState('')
  // Net verstuurd terwijl de kaart openstond: dat laten we nog even zien
  const [netVerstuurd, setNetVerstuurd] = useState(false)
  // Lokale kopie van de velden; opslaan gebeurt bij wegklikken
  const [velden, setVelden] = useState({ account: '', aan: '', onderwerp: '', tekst: '' })
  const gewijzigd = useRef(false)
  const vorigeStatus = useRef<ConceptStatus | null>(null)

  const neemOver = useCallback((c: MailConcept | null) => {
    setConcept(c)
    if (c) {
      setVelden({ account: c.account || '', aan: c.aan || '', onderwerp: c.onderwerp, tekst: c.tekst })
      gewijzigd.current = false
      if (vorigeStatus.current === 'in_spark' && c.status === 'verstuurd') {
        setNetVerstuurd(true)
        onVerstuurd()
      }
      vorigeStatus.current = c.status
    }
  }, [onVerstuurd])

  const laad = useCallback(async (controleer: boolean) => {
    try {
      const res = await fetch(`/api/crm/records/${recordId}/benaderen?accounts=1${controleer ? '&controleer=1' : ''}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Laden mislukt')
      neemOver(json.concept)
      if (json.accounts?.length) setAccounts(json.accounts)
      setSparkFout(json.sparkFout || '')
    } catch (e: any) {
      setFout(e.message)
    } finally {
      setGeladen(true)
    }
  }, [recordId, neemOver])

  useEffect(() => { laad(true) }, [laad])

  async function actie(soort: 'schrijf' | 'naar_spark' | 'controleer' | 'annuleer' | 'open', label: typeof bezig) {
    setBezig(label)
    setFout('')
    setMelding('')
    try {
      const res = await fetch(`/api/crm/records/${recordId}/benaderen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actie: soort, conceptId: concept?.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Mislukt')
      return json as { concept: MailConcept | null; geopend?: boolean; mailto?: string }
    } catch (e: any) {
      setFout(e.message)
      return null
    } finally {
      setBezig(null)
    }
  }

  // Knop in de kop ingedrukt en nog niets om aan te werken: meteen laten schrijven
  const automatischGestart = useRef(false)
  useEffect(() => {
    if (!gevraagd) automatischGestart.current = false
    if (!gevraagd || !geladen || automatischGestart.current) return
    if (concept && concept.status !== 'verstuurd') return
    automatischGestart.current = true
    actie('schrijf', 'schrijven').then((uit) => uit && neemOver(uit.concept))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gevraagd, geladen, concept])

  // Staat hij klaar in Spark, kijk dan als je terugkomt in de Dash of hij al weg is
  useEffect(() => {
    if (concept?.status !== 'in_spark') return
    let laatste = 0
    const opFocus = () => {
      if (Date.now() - laatste < 20_000) return
      laatste = Date.now()
      laad(true)
    }
    window.addEventListener('focus', opFocus)
    return () => window.removeEventListener('focus', opFocus)
  }, [concept?.status, laad])

  async function bewaar(): Promise<boolean> {
    if (!concept || concept.status !== 'concept' || !gewijzigd.current) return true
    const res = await fetch(`/api/crm/records/${recordId}/benaderen`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptId: concept.id, ...velden }),
    }).catch(() => null)
    const json = await res?.json().catch(() => ({}))
    if (!res?.ok) {
      setFout(json?.error || 'Opslaan mislukt')
      return false
    }
    gewijzigd.current = false
    setConcept(json.concept)
    return true
  }

  function zet(veld: keyof typeof velden, waarde: string) {
    gewijzigd.current = true
    setVelden((v) => ({ ...v, [veld]: waarde }))
  }

  async function naarSpark(soort: 'naar_spark' | 'open' = 'naar_spark') {
    if (!(await bewaar())) return
    const uit = await actie(soort, 'spark')
    if (!uit) return
    neemOver(uit.concept)
    // Op de Mac opent de server hem in Spark; elders opent de browser de maillink
    if (!uit.geopend && uit.mailto) window.location.href = uit.mailto
    setMelding(uit.geopend
      ? 'Geopend in Spark. Check de afzender en verstuur hem daar, de Dash ziet het vanzelf.'
      : 'Geopend in je mailapp. Verstuur hem daar, de Dash ziet het vanzelf zodra Spark op de Mac hem binnen heeft.')
  }

  async function opnieuw() {
    if (concept?.status === 'concept' && !confirm('Het huidige concept wordt overschreven. Doorgaan?')) return
    const uit = await actie('schrijf', 'schrijven')
    if (uit) neemOver(uit.concept)
  }

  async function weggooien() {
    const inSpark = concept?.status === 'in_spark'
    if (!confirm(inSpark
      ? 'Weghalen uit de Dash? Staat het bericht nog open in Spark, gooi het daar zelf weg.'
      : 'Dit concept weggooien?')) return
    const uit = await actie('annuleer', 'annuleren')
    if (!uit) return
    setConcept(null)
    onSluit()
  }

  async function controleer() {
    const uit = await actie('controleer', 'controleren')
    if (!uit?.concept) return
    neemOver(uit.concept)
    if (uit.concept.status === 'in_spark') setMelding('Nog niet gevonden in de verzonden mail.')
  }

  // Niets gevraagd en niets lopend: het blok blijft weg
  if (!geladen) return null
  const actief = concept && (concept.status === 'concept' || concept.status === 'in_spark')
  if (!gevraagd && !actief && !netVerstuurd) return null

  return (
    <section className="rounded-brand-btn border border-brand-lav-accent/40 bg-brand-lavender-light/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-caption font-semibold uppercase tracking-wide text-brand-text-secondary flex items-center gap-1.5">
          <Mail size={13} /> Benaderen
        </h3>
        {/* Een lopend concept sluit je niet weg maar gooi je weg, anders raak je het kwijt */}
        {!actief && bezig !== 'schrijven' && (
          <button onClick={onSluit} aria-label="Sluiten" className="p-1 text-brand-text-secondary hover:text-brand-text-primary">
            <X size={14} />
          </button>
        )}
      </div>

      {bezig === 'schrijven' && (
        <p className="text-body text-brand-text-secondary flex items-center gap-2">
          <Sparkles size={14} className="animate-pulse text-brand-lav-accent" />
          Je eerste mail wordt geschreven. Dit duurt ongeveer een minuut.
        </p>
      )}

      {concept?.status === 'concept' && bezig !== 'schrijven' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-caption text-brand-text-secondary">Versturen vanaf</span>
              {accounts.length ? (
                <select
                  value={velden.account}
                  onChange={(e) => zet('account', e.target.value)}
                  onBlur={bewaar}
                  className={VELD_INPUT}
                >
                  {!accounts.some((a) => a.email === velden.account) && <option value={velden.account}>{velden.account || 'Kies een account'}</option>}
                  {accounts.map((a) => <option key={a.email} value={a.email}>{a.email}</option>)}
                </select>
              ) : (
                <input value={velden.account} onChange={(e) => zet('account', e.target.value)} onBlur={bewaar} className={VELD_INPUT} />
              )}
            </label>
            <label className="block">
              <span className="text-caption text-brand-text-secondary">Aan</span>
              <input
                type="email"
                value={velden.aan}
                onChange={(e) => zet('aan', e.target.value)}
                onBlur={bewaar}
                placeholder="naam@bedrijf.nl"
                className={VELD_INPUT}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-caption text-brand-text-secondary">Onderwerp</span>
            <input value={velden.onderwerp} onChange={(e) => zet('onderwerp', e.target.value)} onBlur={bewaar} className={VELD_INPUT} />
          </label>
          <label className="block">
            <span className="text-caption text-brand-text-secondary">Tekst</span>
            <textarea
              value={velden.tekst}
              onChange={(e) => zet('tekst', e.target.value)}
              onBlur={bewaar}
              rows={10}
              className={`${VELD_INPUT} resize-y leading-relaxed`}
            />
          </label>
          <p className="text-caption text-brand-text-secondary">
            Spark opent hem met je standaardaccount. Staat daar een ander adres dan {velden.account || 'het account hierboven'}, kies dan in het berichtvenster de juiste afzender; dan komt ook de goede handtekening eronder.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => naarSpark()}
              disabled={!!bezig || !velden.aan.trim()}
              className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
            >
              {bezig === 'spark' ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              Openen in Spark
            </button>
            <button onClick={opnieuw} disabled={!!bezig} className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
              <Sparkles size={14} /> Opnieuw schrijven
            </button>
            <button onClick={weggooien} disabled={!!bezig} className="text-sm px-2 py-1.5 text-brand-text-secondary hover:text-brand-status-red flex items-center gap-1.5 disabled:opacity-50">
              <Trash2 size={14} /> Weggooien
            </button>
          </div>
          {!velden.aan.trim() && (
            <p className="text-caption text-brand-status-orange">Er is geen mailadres bekend. Vul het bij Aan in.</p>
          )}
        </>
      )}

      {concept?.status === 'in_spark' && (
        <>
          <div className="text-body text-brand-text-primary space-y-1">
            <p className="font-medium">{concept.onderwerp}</p>
            <p className="text-caption text-brand-text-secondary">
              Aan {concept.aan}, versturen vanaf {concept.account}. Geopend in Spark op {tijd(concept.in_spark_op)}.
            </p>
            <p className="text-caption text-brand-text-secondary">
              Verstuur hem in Spark. Zodra hij in je verzonden mail staat, logt de Dash het contact en zet de lead op Benaderd.
              {concept.laatst_gecontroleerd_op && ` Laatst gekeken ${tijd(concept.laatst_gecontroleerd_op)}.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => naarSpark('open')}
              disabled={!!bezig}
              title="Per ongeluk gesloten? Dit opent een nieuw bericht met dezelfde tekst."
              className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
            >
              <ExternalLink size={14} /> Nog een keer openen
            </button>
            <button onClick={controleer} disabled={!!bezig} className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={14} className={bezig === 'controleren' ? 'animate-spin' : ''} /> Is hij verstuurd?
            </button>
            <button onClick={weggooien} disabled={!!bezig} className="text-sm px-2 py-1.5 text-brand-text-secondary hover:text-brand-status-red flex items-center gap-1.5 disabled:opacity-50">
              <Trash2 size={14} /> Weghalen
            </button>
          </div>
        </>
      )}

      {concept?.status === 'verstuurd' && bezig !== 'schrijven' && (
        <p className="text-body text-brand-status-green flex items-center gap-2">
          <Check size={14} /> Verstuurd op {tijd(concept.verstuurd_op)}: {concept.onderwerp}
        </p>
      )}

      {melding && <p className="text-caption text-brand-text-secondary">{melding}</p>}
      {sparkFout && concept?.status === 'in_spark' && <p className="text-caption text-brand-status-orange">{sparkFout}</p>}
      {fout && <p className="text-caption text-brand-status-red">{fout}</p>}
    </section>
  )
}
