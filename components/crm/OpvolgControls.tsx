'use client'

/**
 * Opvolging op een CRM-record: volgende actie, contactmomenten en blokkeerlijst.
 * De fase (status) blijft waar hij is, dit gaat puur over wanneer je iets doet.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bell, BellOff, Ban, Check, Mail, Phone, MessageCircle,
  Users, PencilLine, Clock, ChevronDown, PauseCircle, PlayCircle,
} from 'lucide-react'
import {
  CONTACT_SOORTEN, CONTACT_STATUSSEN, OPVOLG_PRESETS, PAUZE_PRESETS,
  contactStand, contactStatusLabel, datumISO, datumPlusDagen,
  faseDef, faseNaContact, isGeblokkeerd, opvolgLabel, opvolgStand,
  pauzeAfgelopen, standaardOpvolgdatum,
  type ContactSoort, type ContactStatus, type OpvolgStand,
} from '@/lib/crm/pipeline'

export interface OpvolgRecord {
  id: string
  status?: string | null
  volgende_actie?: string | null
  volgende_actie_notitie?: string | null
  laatste_contact?: string | null
  contact_pogingen?: number | null
  contact_status?: string | null
  contact_status_tot?: string | null
  contact_status_reden?: string | null
}

export type OpvolgPatch = Partial<OpvolgRecord> & { status?: string | null }

const CONTACT_ICOON: Record<ContactSoort, typeof Mail> = {
  mail: Mail,
  telefoon: Phone,
  whatsapp: MessageCircle,
  meeting: Users,
  notitie: PencilLine,
}

const STAND_STIJL: Record<OpvolgStand, string> = {
  'geen': 'bg-gray-100 text-gray-500 border-gray-200',
  'gepland': 'bg-gray-50 text-gray-600 border-gray-200',
  'vandaag': 'bg-amber-50 text-amber-700 border-amber-300',
  'te laat': 'bg-red-50 text-red-700 border-red-300',
}

async function patchRecord(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/crm/records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || 'Opslaan mislukt')
  return json.item
}

/**
 * Popover buiten de DOM-boom renderen, anders knipt de horizontale scroll van
 * het bord hem af. Positie wordt bij openen berekend uit de knop.
 */
function usePopover(open: boolean, sluit: () => void, hoogte: number, breedte: number) {
  const knopRef = useRef<HTMLDivElement>(null)
  const paneelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) { setPos(null); return }
    const knop = knopRef.current
    if (!knop) return

    const plaats = () => {
      const r = knop.getBoundingClientRect()
      const ruimteOnder = window.innerHeight - r.bottom
      const top = ruimteOnder < hoogte + 16 ? Math.max(8, r.top - hoogte - 4) : r.bottom + 4
      const left = Math.min(Math.max(8, r.right - breedte), window.innerWidth - breedte - 8)
      setPos({ top, left })
    }
    plaats()

    const buitenklik = (e: MouseEvent) => {
      const doel = e.target as Node
      if (knopRef.current?.contains(doel) || paneelRef.current?.contains(doel)) return
      sluit()
    }
    document.addEventListener('mousedown', buitenklik)
    window.addEventListener('resize', plaats)
    window.addEventListener('scroll', plaats, true)
    return () => {
      document.removeEventListener('mousedown', buitenklik)
      window.removeEventListener('resize', plaats)
      window.removeEventListener('scroll', plaats, true)
    }
  }, [open, sluit, hoogte, breedte])

  const portal = (inhoud: React.ReactNode) => {
    if (!open || !pos || typeof document === 'undefined') return null
    return createPortal(
      <div
        ref={paneelRef}
        style={{ position: 'fixed', top: pos.top, left: pos.left, width: breedte }}
        className="z-[60]"
        onClick={(e) => e.stopPropagation()}
      >
        {inhoud}
      </div>,
      document.body
    )
  }

  return { knopRef, portal }
}

// ── Badge: wanneer moet ik hier weer wat mee ─────────────────────────

export function OpvolgBadge({ record }: { record: OpvolgRecord }) {
  const contact = contactStand(record)

  if (contact === 'blokkade') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border bg-gray-800 text-white border-gray-800"
        title={record.contact_status_reden || 'Wil niet meer benaderd worden'}
      >
        <Ban size={10} /> Niet benaderen
      </span>
    )
  }

  if (contact === 'pauze') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border bg-gray-100 text-gray-600 border-gray-300"
        title={record.contact_status_reden || 'Voorlopig even niet benaderen'}
      >
        <PauseCircle size={10} /> {contactStatusLabel(record)}
      </span>
    )
  }

  if (pauzeAfgelopen(record)) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-300"
        title={record.contact_status_reden || 'De pauze is voorbij, je mag weer'}
      >
        <PlayCircle size={10} /> Pauze afgelopen
      </span>
    )
  }

  const stand = opvolgStand(record.volgende_actie)
  if (stand === 'geen') return null

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border ${STAND_STIJL[stand]}`}
      title={record.volgende_actie_notitie || `Volgende actie: ${record.volgende_actie}`}
    >
      <Bell size={10} /> {opvolgLabel(record.volgende_actie)}
    </span>
  )
}

// ── Datumkiezer: standaardwaarde per fase, zelf aan te passen ────────

export function OpvolgPicker({
  record,
  onSaved,
  variant = 'knop',
}: {
  record: OpvolgRecord
  onSaved: (patch: OpvolgPatch) => void
  variant?: 'knop' | 'icoon'
}) {
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const standaard = standaardOpvolgdatum(record.status)
  const [datum, setDatum] = useState(record.volgende_actie?.slice(0, 10) || standaard || datumISO())
  const [notitie, setNotitie] = useState(record.volgende_actie_notitie || '')
  const { knopRef, portal } = usePopover(open, () => setOpen(false), 330, 256)

  useEffect(() => {
    if (!open) return
    setDatum(record.volgende_actie?.slice(0, 10) || standaard || datumISO())
    setNotitie(record.volgende_actie_notitie || '')
    setFout('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const bewaar = async (nieuweDatum: string | null) => {
    setBezig(true)
    setFout('')
    try {
      await patchRecord(record.id, {
        volgende_actie: nieuweDatum,
        volgende_actie_notitie: nieuweDatum ? notitie.trim() || null : null,
      })
      onSaved({
        volgende_actie: nieuweDatum,
        volgende_actie_notitie: nieuweDatum ? notitie.trim() || null : null,
      })
      setOpen(false)
    } catch (e: any) {
      setFout(e.message || 'Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  const fase = faseDef(record.status)
  const stand = opvolgStand(record.volgende_actie)

  return (
    <div className="relative" ref={knopRef}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        disabled={isGeblokkeerd(record)}
        title={isGeblokkeerd(record) ? 'Staat op de blokkeerlijst' : 'Volgende actie instellen'}
        className={variant === 'icoon'
          ? 'p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-text-primary disabled:opacity-40 transition-colors'
          : `inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
              stand === 'geen' ? 'border-gray-200 text-gray-500 hover:border-brand-lavender' : STAND_STIJL[stand]
            }`}
      >
        <Bell size={variant === 'icoon' ? 13 : 12} />
        {variant === 'knop' && (
          <span>{record.volgende_actie ? opvolgLabel(record.volgende_actie) : 'Volgende actie'}</span>
        )}
      </button>

      {portal(
        <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Volgende actie</p>

          <div className="grid grid-cols-2 gap-1">
            {OPVOLG_PRESETS.map((p) => {
              const waarde = datumPlusDagen(p.dagen)
              const isStandaard = standaard === waarde
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setDatum(waarde)}
                  className={`text-left text-xs px-2 py-1 rounded-lg border transition-colors ${
                    datum === waarde
                      ? 'border-brand-lavender bg-brand-lavender/10 text-brand-text-primary'
                      : 'border-transparent hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  {p.label}
                  {isStandaard && <span className="text-[10px] text-brand-lavender ml-1">standaard</span>}
                </button>
              )
            })}
          </div>

          <input
            type="date"
            className="input text-sm py-1.5"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
          />
          <input
            className="input text-sm py-1.5"
            placeholder="Waarover? (optioneel)"
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
          />

          {fase?.opvolgDagen != null && (
            <p className="text-[11px] text-gray-400">
              Standaard voor {fase.label.toLowerCase()}: over {fase.opvolgDagen} dagen.
            </p>
          )}
          {fout && <p className="text-[11px] text-red-500">{fout}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => bewaar(datum || null)}
              disabled={bezig || !datum}
              className="btn-primary text-xs py-1.5 px-3 flex-1 justify-center disabled:opacity-50"
            >
              <Check size={12} /> Instellen
            </button>
            {record.volgende_actie && (
              <button
                type="button"
                onClick={() => bewaar(null)}
                disabled={bezig}
                title="Volgende actie wissen"
                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
              >
                <BellOff size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Contact loggen: één klik legt vast en plant de volgende stap ─────

export function ContactKnop({
  record,
  onSaved,
  variant = 'knop',
}: {
  record: OpvolgRecord
  onSaved: (patch: OpvolgPatch) => void
  variant?: 'knop' | 'icoon'
}) {
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState<ContactSoort | null>(null)
  const [fout, setFout] = useState('')
  const { knopRef, portal } = usePopover(open, () => setOpen(false), 260, 208)

  const log = async (soort: ContactSoort) => {
    setBezig(soort)
    setFout('')
    try {
      // Notities verzetten de planning niet, echt contact wel.
      const nieuweStatus = soort === 'notitie' ? null : faseNaContact(record.status)
      const volgende = soort === 'notitie'
        ? undefined
        : standaardOpvolgdatum(nieuweStatus || record.status)

      const res = await fetch(`/api/crm/records/${record.id}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soort,
          status: nieuweStatus || undefined,
          ...(volgende !== undefined ? { volgende_actie: volgende } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Opslaan mislukt')

      onSaved({
        status: json.item?.status ?? record.status,
        volgende_actie: json.item?.volgende_actie ?? record.volgende_actie,
        laatste_contact: json.item?.laatste_contact ?? record.laatste_contact,
        contact_pogingen: json.item?.contact_pogingen ?? record.contact_pogingen,
        // Contact leggen heft een lopende pauze op
        contact_status: json.item?.contact_status ?? record.contact_status,
        contact_status_tot: json.item?.contact_status_tot ?? null,
      })
      setOpen(false)
    } catch (e: any) {
      setFout(e.message || 'Opslaan mislukt')
    } finally {
      setBezig(null)
    }
  }

  return (
    <div className="relative" ref={knopRef}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        disabled={isGeblokkeerd(record)}
        title={isGeblokkeerd(record) ? 'Staat op de blokkeerlijst' : 'Contact loggen'}
        className={variant === 'icoon'
          ? 'p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-text-primary disabled:opacity-40 transition-colors'
          : 'inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-brand-lavender transition-colors disabled:opacity-40'}
      >
        <Mail size={variant === 'icoon' ? 13 : 12} />
        {variant === 'knop' && <span>Contact loggen</span>}
        {variant === 'knop' && <ChevronDown size={11} className="opacity-60" />}
      </button>

      {portal(
        <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-1.5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1">Wat heb je gedaan?</p>
          {CONTACT_SOORTEN.map(({ soort, werkwoord, label }) => {
            const Icoon = CONTACT_ICOON[soort]
            return (
              <button
                key={soort}
                type="button"
                onClick={() => log(soort)}
                disabled={bezig !== null}
                className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <Icoon size={13} className="text-gray-400 shrink-0" />
                <span className="text-gray-700">{werkwoord}</span>
                <span className="text-[11px] text-gray-400 ml-auto">{label}</span>
              </button>
            )
          })}
          <p className="text-[11px] text-gray-400 px-2 py-1 border-t border-gray-100 mt-1">
            Zet de volgende actie automatisch op de standaard van de fase.
          </p>
          {fout && <p className="text-[11px] text-red-500 px-2 pb-1">{fout}</p>}
        </div>
      )}
    </div>
  )
}

// ── Contactstatus: benaderbaar, pauze of blokkade ────────────────────

const STATUS_ICOON: Record<ContactStatus, typeof Ban> = {
  open: PlayCircle,
  pauze: PauseCircle,
  blokkade: Ban,
}

export function ContactStatusBlok({
  record,
  onSaved,
}: {
  record: OpvolgRecord
  onSaved: (patch: OpvolgPatch) => void
}) {
  const opgeslagen = ((record.contact_status || 'open') as ContactStatus)
  const [reden, setReden] = useState(record.contact_status_reden || '')
  const [tot, setTot] = useState(record.contact_status_tot?.slice(0, 10) || '')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')

  const zet = async (status: ContactStatus, nieuweTot?: string | null) => {
    setBezig(true)
    setFout('')
    const eindDatum = status === 'pauze' ? (nieuweTot !== undefined ? nieuweTot : tot || null) : null
    const nieuweReden = status === 'open' ? null : reden.trim() || null
    try {
      const item = await patchRecord(record.id, {
        contact_status: status,
        contact_status_tot: eindDatum,
        contact_status_reden: nieuweReden,
      })
      if (nieuweTot !== undefined) setTot(nieuweTot || '')
      onSaved({
        contact_status: status,
        contact_status_tot: eindDatum,
        contact_status_reden: nieuweReden,
        volgende_actie: item?.volgende_actie ?? null,
        volgende_actie_notitie: item?.volgende_actie_notitie ?? null,
      })
    } catch (e: any) {
      setFout(e.message || 'Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  const randKleur = opgeslagen === 'blokkade'
    ? 'border-gray-800 bg-gray-50'
    : opgeslagen === 'pauze' ? 'border-gray-300 bg-gray-50/60' : 'border-gray-200'

  return (
    <div className={`rounded-xl border p-3 ${randKleur}`}>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Contactstatus</p>

      <div className="flex flex-wrap gap-1.5">
        {CONTACT_STATUSSEN.map(({ status, label, korteUitleg }) => {
          const Icoon = STATUS_ICOON[status]
          const actief = opgeslagen === status
          return (
            <button
              key={status}
              type="button"
              onClick={() => zet(status)}
              disabled={bezig || actief}
              title={korteUitleg}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-100 ${
                actief
                  ? status === 'blokkade'
                    ? 'border-gray-800 bg-gray-800 text-white'
                    : status === 'pauze'
                      ? 'border-gray-400 bg-white text-gray-700'
                      : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 text-gray-600 hover:border-brand-lavender disabled:opacity-50'
              }`}
            >
              <Icoon size={12} /> {label}
            </button>
          )
        })}
      </div>

      {opgeslagen === 'pauze' && (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-gray-400">Tot:</span>
            {PAUZE_PRESETS.map((p) => {
              const waarde = p.dagen == null ? '' : datumPlusDagen(p.dagen)
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => zet('pauze', waarde || null)}
                  disabled={bezig}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
                    (tot || '') === waarde
                      ? 'border-brand-lavender bg-brand-lavender/10 text-brand-text-primary'
                      : 'border-gray-200 text-gray-600 hover:bg-white'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <input
            type="date"
            className="input text-sm py-1.5"
            value={tot}
            onChange={(e) => zet('pauze', e.target.value || null)}
            disabled={bezig}
          />
          <p className="text-[11px] text-gray-500">
            {tot
              ? 'Op deze datum staat de relatie vanzelf weer in "Vandaag oppakken".'
              : 'Zonder einddatum blijft de pauze staan tot je hem zelf opheft.'}
          </p>
        </div>
      )}

      {opgeslagen === 'blokkade' && (
        <p className="text-[11px] text-gray-500 mt-2">
          Deze relatie wordt niet meer benaderd: geen opvolging, contact loggen is geblokkeerd.
        </p>
      )}

      {opgeslagen !== 'open' ? (
        <input
          className="input text-sm py-1.5 mt-2"
          placeholder="Reden (optioneel), bijv. reageert nergens op"
          value={reden}
          onChange={(e) => setReden(e.target.value)}
          onBlur={() => {
            if ((record.contact_status_reden || '') !== reden.trim()) zet(opgeslagen)
          }}
        />
      ) : (
        <p className="text-[11px] text-gray-400 mt-2">
          Pauze is de zachte stop, blokkade de harde. Allebei los van de fase waarin de lead staat.
        </p>
      )}

      {fout && <p className="text-[11px] text-red-500 mt-1">{fout}</p>}
    </div>
  )
}

// ── Regel met laatste contact en teller ──────────────────────────────

export function ContactSamenvatting({ record }: { record: OpvolgRecord }) {
  const pogingen = Number(record.contact_pogingen) || 0
  if (!record.laatste_contact && !pogingen) return null
  const laatste = record.laatste_contact
    ? new Date(record.laatste_contact).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' })
    : null
  return (
    <p className="text-[11px] text-gray-400 inline-flex items-center gap-1">
      <Clock size={10} />
      {laatste ? `Laatste contact ${laatste}` : 'Nog geen contact'}
      {pogingen > 0 && ` (${pogingen}x)`}
    </p>
  )
}
