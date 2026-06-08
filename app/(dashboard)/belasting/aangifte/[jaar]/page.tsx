'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, ChevronRight, Plus, Trash2, RefreshCw, Info,
  AlertTriangle, Calculator, FileBarChart, Receipt, PiggyBank,
  Landmark, ClipboardList, Check, X,
} from 'lucide-react'
import {
  berekenAangifte, berekenKIA, berekenAfschrijvingDitJaar,
  getConstanten, CONSTANTEN_PER_JAAR,
} from '@/lib/belasting-aangifte'
import { aggregeerPerKwartaal } from '@/lib/belasting'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AangifteRecord {
  id: string
  jaar: number
  urencriterium_voldaan: boolean
  claim_zelfstandigenaftrek: boolean
  claim_startersaftrek: boolean
  startersaftrek_keer_gebruikt: number
  for_saldo_begin_jaar: number
  for_vrijval: number
  banksaldo_eindstand: number | null
  voorraad: number
  eigen_vermogen: number | null
  crediteuren: number
  notities: string | null
  laatst_bijgewerkt: string
}

interface FactuurRij {
  id: string
  number: string
  client_name: string
  date: string
  due_date: string
  subtotal: number
  total: number
  status: string
  paid_at: string | null
  debiteur_status: string | null
  debiteur_notitie: string | null
}

interface KostenRegel {
  id: string
  label: string
  categorie: string
  bedrag: number
  datum: string | null
  notitie: string | null
}

interface Investering {
  id: string
  label: string
  bedrag: number
  datum: string
  afschrijvingstermijn_jaren: number
  notitie: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function formatDatum(d: string) {
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

const KOSTENCATEGORIEN: Record<string, string> = {
  inkoop: 'Inkoop/materialen',
  software_abonnementen: 'Software & abonnementen',
  telefoon_internet: 'Telefoon & internet',
  reiskosten_auto: 'Reiskosten auto',
  reiskosten_ov: 'Reiskosten OV',
  representatie_80pct: 'Representatie (80%)',
  kantoorbenodigdheden: 'Kantoorbenodigdheden',
  contributies_vakliteratuur: 'Contributies & vakliteratuur',
  verzekeringen: 'Verzekeringen',
  bankkosten: 'Bankkosten',
  advocaat_juridisch: 'Advocaat & juridisch',
  overig: 'Overig',
}

const DEBITEUR_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-brand-page-medium text-brand-text-secondary' },
  aangemaand: { label: 'Aangemaand', cls: 'bg-yellow-100 text-yellow-800' },
  in_incasso: { label: 'In incasso', cls: 'bg-orange-100 text-orange-800' },
  in_rechtszaak: { label: 'Rechtszaak', cls: 'bg-red-100 text-red-700' },
  oninbaar: { label: 'Oninbaar', cls: 'bg-gray-800 text-white' },
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function SectieTitel({
  titel, open, onToggle, icoon,
}: { titel: string; open: boolean; onToggle: () => void; icoon?: React.ReactNode }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full text-left mb-4 group"
    >
      {open
        ? <ChevronDown size={16} className="text-brand-text-secondary flex-shrink-0" />
        : <ChevronRight size={16} className="text-brand-text-secondary flex-shrink-0" />
      }
      {icoon}
      <h2 className="font-uxum text-subtitle text-brand-text-primary group-hover:text-brand-lav-accent transition-colors">
        {titel}
      </h2>
    </button>
  )
}

function BerekenRij({
  label, waarde, muted, bold, highlight, streep,
}: {
  label: string; waarde: string
  muted?: boolean; bold?: boolean; highlight?: boolean; streep?: boolean
}) {
  return (
    <div className={`flex justify-between items-center py-1 ${streep ? 'border-t border-brand-card-border pt-2 mt-1' : ''}`}>
      <span className={`text-caption ${muted ? 'text-brand-text-secondary' : 'text-brand-text-primary'}`}>
        {label}
      </span>
      <span className={`text-caption font-mono ${
        highlight ? 'text-brand-status-green font-bold text-body' :
        bold ? 'text-brand-text-primary font-semibold' :
        muted ? 'text-brand-text-secondary' : 'text-brand-text-primary font-medium'
      }`}>
        {waarde}
      </span>
    </div>
  )
}

function KPICard({ label, waarde, onderschrift, kleur }: {
  label: string; waarde: string; onderschrift?: string; kleur?: string
}) {
  return (
    <div className="card">
      <p className="text-caption text-brand-text-secondary mb-2">{label}</p>
      <p className={`font-uxum text-stat ${kleur ?? 'text-brand-text-primary'}`}>{waarde}</p>
      {onderschrift && <p className="text-caption text-brand-text-secondary mt-1">{onderschrift}</p>}
    </div>
  )
}

// ─── Hoofdpagina ────────────────────────────────────────────────────────────

export default function AangiftePage({ params }: { params: { jaar: string } }) {
  const jaar = parseInt(params.jaar)
  const router = useRouter()

  const [aangifte, setAangifte] = useState<AangifteRecord | null>(null)
  const [facturen, setFacturen] = useState<FactuurRij[]>([])
  const [kosten, setKosten] = useState<KostenRegel[]>([])
  const [investeringen, setInvesteringen] = useState<Investering[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [heeftWijzigingen, setHeeftWijzigingen] = useState(false)
  const [toast, setToast] = useState<{ tekst: string; type: 'succes' | 'fout' } | null>(null)
  const [oninbaarModal, setOninbaarModal] = useState<{ factuurId: string; notitie: string } | null>(null)

  const [sectiesOpen, setSectiesOpen] = useState({
    omzet: true, debiteuren: true, kosten: true,
    investeringen: true, aftrekposten: true, berekening: true,
    balans: true, invulhulp: true,
  })

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Data laden ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/belasting/aangifte/${jaar}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Fout ${res.status}`)
      }
      const { aangifte: a, facturen: f, kosten: k, investeringen: i } = await res.json()
      setAangifte(a)
      setFacturen(f)
      setKosten(k)
      setInvesteringen(i)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kon data niet laden')
    }
    setLoading(false)
  }, [jaar])

  useEffect(() => { loadData() }, [loadData])

  // ─── Toast helper ────────────────────────────────────────────────────────

  function toonToast(tekst: string, type: 'succes' | 'fout' = 'succes') {
    setToast({ tekst, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── Aangifte opslaan (debounced) ────────────────────────────────────────

  const slaAangifteOp = useCallback((updates: Partial<AangifteRecord>) => {
    setHeeftWijzigingen(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/belasting/aangifte/${jaar}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
        if (!res.ok) throw new Error()
        setHeeftWijzigingen(false)
      } catch {
        toonToast('Opslaan mislukt', 'fout')
      }
    }, 300)
  }, [jaar])

  function updateAangifte(updates: Partial<AangifteRecord>) {
    setAangifte(prev => prev ? { ...prev, ...updates } : prev)
    slaAangifteOp(updates)
  }

  // ─── Kosten CRUD ─────────────────────────────────────────────────────────

  async function voegKostToe() {
    const res = await fetch(`/api/belasting/aangifte/${jaar}/kosten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Nieuwe kostenpost', categorie: 'overig', bedrag: 0 }),
    })
    if (res.ok) {
      const nieuw = await res.json()
      setKosten(prev => [...prev, nieuw])
    }
  }

  const updateKostDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function updateKost(id: string, updates: Partial<KostenRegel>) {
    setKosten(prev => prev.map(k => k.id === id ? { ...k, ...updates } : k))
    setHeeftWijzigingen(true)
    if (updateKostDebounce.current[id]) clearTimeout(updateKostDebounce.current[id])
    updateKostDebounce.current[id] = setTimeout(async () => {
      await fetch(`/api/belasting/aangifte/${jaar}/kosten/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      setHeeftWijzigingen(false)
    }, 300)
  }

  async function verwijderKost(id: string) {
    await fetch(`/api/belasting/aangifte/${jaar}/kosten/${id}`, { method: 'DELETE' })
    setKosten(prev => prev.filter(k => k.id !== id))
  }

  // ─── Investeringen CRUD ───────────────────────────────────────────────────

  async function voegInvesteringToe() {
    const vandaag = new Date().toISOString().split('T')[0]
    const res = await fetch(`/api/belasting/aangifte/${jaar}/investeringen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: 'Nieuwe investering', bedrag: 0,
        datum: vandaag, afschrijvingstermijn_jaren: 5,
      }),
    })
    if (res.ok) {
      const nieuw = await res.json()
      setInvesteringen(prev => [...prev, nieuw])
    }
  }

  const updateInvDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function updateInvestering(id: string, updates: Partial<Investering>) {
    setInvesteringen(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
    setHeeftWijzigingen(true)
    if (updateInvDebounce.current[id]) clearTimeout(updateInvDebounce.current[id])
    updateInvDebounce.current[id] = setTimeout(async () => {
      await fetch(`/api/belasting/aangifte/${jaar}/investeringen/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      setHeeftWijzigingen(false)
    }, 300)
  }

  async function verwijderInvestering(id: string) {
    await fetch(`/api/belasting/aangifte/${jaar}/investeringen/${id}`, { method: 'DELETE' })
    setInvesteringen(prev => prev.filter(i => i.id !== id))
  }

  // ─── Debiteur status ──────────────────────────────────────────────────────

  async function updateDebiteurStatus(
    factuurId: string,
    status: string,
    notitie?: string
  ) {
    const res = await fetch(`/api/belasting/aangifte/${jaar}/debiteur/${factuurId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notitie: notitie ?? null }),
    })
    if (res.ok) {
      setFacturen(prev => prev.map(f =>
        f.id === factuurId
          ? { ...f, debiteur_status: status, debiteur_notitie: notitie ?? f.debiteur_notitie }
          : f
      ))
    }
  }

  // ─── Berekeningen ─────────────────────────────────────────────────────────

  const kwartalen = useMemo(() => aggregeerPerKwartaal(
    facturen.map(f => ({ subtotal: f.subtotal, total: f.total, date: f.date }))
  ), [facturen])

  const omzetStats = useMemo(() => ({
    totaalOmzetExcl: facturen.reduce((s, f) => s + (f.subtotal ?? 0), 0),
    totaalBtw: facturen.reduce((s, f) => s + ((f.total ?? 0) - (f.subtotal ?? 0)), 0),
    aantalFacturen: facturen.length,
  }), [facturen])

  const openstaandeDebiteuren = useMemo(
    () => facturen.filter(f => !f.paid_at && f.status !== 'betaald'),
    [facturen]
  )

  const totaalDebiteuren = useMemo(
    () => openstaandeDebiteuren.reduce((s, f) => s + (f.total ?? 0), 0),
    [openstaandeDebiteuren]
  )

  const kostenPerCategorie = useMemo(() => {
    const map: Record<string, number> = {}
    for (const k of kosten) {
      map[k.categorie] = (map[k.categorie] ?? 0) + (k.bedrag ?? 0)
    }
    return map
  }, [kosten])

  const kostenTotaalBruto = useMemo(
    () => kosten.reduce((s, k) => s + (k.bedrag ?? 0), 0),
    [kosten]
  )

  const kostenTotaalAftrekbaar = useMemo(
    () => kosten.reduce((s, k) => {
      const b = k.bedrag ?? 0
      return s + (k.categorie === 'representatie_80pct' ? b * 0.8 : b)
    }, 0),
    [kosten]
  )

  const kiaBerekening = useMemo(
    () => berekenKIA(investeringen, jaar),
    [investeringen, jaar]
  )

  const totaalAfschrijvingen = useMemo(
    () => investeringen.reduce((s, i) =>
      s + berekenAfschrijvingDitJaar(i.bedrag ?? 0, i.afschrijvingstermijn_jaren ?? 5), 0
    ),
    [investeringen]
  )

  const uitkomst = useMemo(() => {
    if (!aangifte) return null
    return berekenAangifte({
      jaar,
      omzetExcl: omzetStats.totaalOmzetExcl,
      kosten: kostenTotaalAftrekbaar,
      afschrijvingen: totaalAfschrijvingen,
      urencriterium: aangifte.urencriterium_voldaan,
      claimZelfstandigenaftrek: aangifte.claim_zelfstandigenaftrek,
      claimStartersaftrek: aangifte.claim_startersaftrek,
      kiaAftrek: kiaBerekening,
      forVrijval: aangifte.for_vrijval ?? 0,
    })
  }, [aangifte, omzetStats, kostenTotaalAftrekbaar, totaalAfschrijvingen, kiaBerekening, jaar])

  const constanten = getConstanten(jaar)

  const boekwaardeInventaris = useMemo(
    () => investeringen.reduce((s, i) => {
      const afschr = berekenAfschrijvingDitJaar(i.bedrag, i.afschrijvingstermijn_jaren)
      return s + Math.max(0, i.bedrag - afschr)
    }, 0),
    [investeringen]
  )

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function toggleSectie(key: keyof typeof sectiesOpen) {
    setSectiesOpen(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const beschikbareJaren = useMemo(() => {
    const huidig = new Date().getFullYear()
    return Array.from({ length: huidig - 2022 }, (_, i) => 2023 + i)
  }, [])

  // ─── Loading / Error ─────────────────────────────────────────────────────

  if (loading && !aangifte) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-brand-page-medium rounded w-72" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-brand-page-medium rounded-brand" />)}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="font-uxum text-headline text-brand-text-primary mb-4">Aangifte {jaar}</h1>
        <div className="card border-red-200 bg-red-50 flex items-center justify-between">
          <p className="text-body text-red-600">{error}</p>
          <button onClick={loadData} className="btn-secondary"><RefreshCw size={14} /> Opnieuw</button>
        </div>
      </div>
    )
  }

  if (!aangifte) return null

  const btwQ4 = kwartalen[3]?.btwBedrag ?? 0

  return (
    <div className="p-8 max-w-5xl">

      {/* ═══ Toast ══════════════════════════════════════════════════════════ */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-brand shadow-lg text-body flex items-center gap-2 ${
          toast.type === 'succes' ? 'bg-brand-status-green text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'succes' ? <Check size={14} /> : <X size={14} />}
          {toast.tekst}
        </div>
      )}

      {/* ═══ Header ═════════════════════════════════════════════════════════ */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">
            Aangifte inkomstenbelasting {jaar}
          </h1>
          <p className="text-caption text-brand-text-secondary mt-1">
            Bijgewerkt op {formatDatum(aangifte.laatst_bijgewerkt)}
            {heeftWijzigingen && (
              <span className="ml-3 inline-flex items-center gap-1 text-brand-status-orange">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-status-orange animate-pulse" />
                Niet opgeslagen
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Jaarkiezer */}
          <select
            value={jaar}
            onChange={e => router.push(`/belasting/aangifte/${e.target.value}`)}
            className="input text-body py-1.5 pr-8"
          >
            {beschikbareJaren.map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>

          <button
            onClick={() => toonToast('PDF-export binnenkort beschikbaar', 'succes')}
            className="btn-secondary"
          >
            <FileBarChart size={14} /> Exporteer PDF
          </button>

          <button
            onClick={loadData}
            className="btn-secondary"
            title="Vernieuwen"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ═══ 1. Omzet ═══════════════════════════════════════════════════════ */}
      <div className="card mb-6">
        <SectieTitel
          titel={`Omzet ${jaar}`}
          open={sectiesOpen.omzet}
          onToggle={() => toggleSectie('omzet')}
          icoon={<Receipt size={16} className="text-brand-text-secondary" />}
        />
        {sectiesOpen.omzet && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <KPICard label="Omzet excl. BTW" waarde={euro(omzetStats.totaalOmzetExcl)} onderschrift={`${jaar} totaal`} />
              <KPICard label="BTW ontvangen" waarde={euro(omzetStats.totaalBtw)} onderschrift="21% over omzet" />
              <KPICard label="Omzet incl. BTW" waarde={euro(omzetStats.totaalOmzetExcl + omzetStats.totaalBtw)} onderschrift="gefactureerd" />
              <KPICard label="Aantal facturen" waarde={String(omzetStats.aantalFacturen)} onderschrift={`in ${jaar}`} />
            </div>

            {/* Kwartaaloverzicht */}
            <div className="grid grid-cols-4 gap-3 overflow-x-auto">
              {kwartalen.map(kw => (
                <div key={kw.kwartaal} className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-4">
                  <p className="font-semibold text-body text-brand-text-primary mb-1">{kw.label}</p>
                  <p className="text-caption text-brand-text-secondary mb-3">{kw.maanden}</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-caption">
                      <span className="text-brand-text-secondary">Omzet excl.</span>
                      <span className="font-medium text-brand-text-primary">{euro(kw.omzetExcl)}</span>
                    </div>
                    <div className="flex justify-between text-caption">
                      <span className="text-brand-text-secondary">BTW (21%)</span>
                      <span className="font-semibold text-brand-text-primary">{euro(kw.btwBedrag)}</span>
                    </div>
                    <div className="flex justify-between text-caption border-t border-brand-card-border pt-1">
                      <span className="text-brand-text-secondary">Facturen</span>
                      <span className="text-brand-text-primary">{kw.aantalFacturen}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ═══ 2. Debiteuren ══════════════════════════════════════════════════ */}
      <div className="card mb-6">
        <SectieTitel
          titel={`Debiteuren per 31 december ${jaar}`}
          open={sectiesOpen.debiteuren}
          onToggle={() => toggleSectie('debiteuren')}
          icoon={<ClipboardList size={16} className="text-brand-text-secondary" />}
        />
        {sectiesOpen.debiteuren && (
          openstaandeDebiteuren.length === 0 ? (
            <p className="text-body text-brand-text-secondary py-4">Geen openstaande facturen per 31 december {jaar}.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-body">
                  <thead>
                    <tr className="border-b border-brand-card-border">
                      <th className="text-left text-caption text-brand-text-secondary font-medium py-2 pr-3">Factuur</th>
                      <th className="text-left text-caption text-brand-text-secondary font-medium py-2 px-3">Klant</th>
                      <th className="text-left text-caption text-brand-text-secondary font-medium py-2 px-3">Datum</th>
                      <th className="text-right text-caption text-brand-text-secondary font-medium py-2 px-3">Bedrag incl. BTW</th>
                      <th className="text-left text-caption text-brand-text-secondary font-medium py-2 px-3">Status</th>
                      <th className="py-2 pl-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-page-medium">
                    {openstaandeDebiteuren.map(f => {
                      const ds = f.debiteur_status ?? 'open'
                      const statusInfo = DEBITEUR_STATUS_LABELS[ds] ?? DEBITEUR_STATUS_LABELS.open
                      return (
                        <tr key={f.id} className="hover:bg-brand-page-light">
                          <td className="py-2.5 pr-3 font-mono text-caption text-brand-text-secondary">{f.number}</td>
                          <td className="py-2.5 px-3 font-medium text-brand-text-primary">{f.client_name}</td>
                          <td className="py-2.5 px-3 text-caption text-brand-text-secondary">{formatDatum(f.date)}</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-brand-text-primary">{euro(f.total)}</td>
                          <td className="py-2.5 px-3">
                            <select
                              value={ds}
                              onChange={e => updateDebiteurStatus(f.id, e.target.value)}
                              className={`pill text-pill font-semibold px-2 py-0.5 border-0 cursor-pointer ${statusInfo.cls}`}
                            >
                              {Object.entries(DEBITEUR_STATUS_LABELS).map(([val, { label }]) => (
                                <option key={val} value={val}>{label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 pl-3">
                            {ds !== 'oninbaar' && (
                              <button
                                onClick={() => setOninbaarModal({ factuurId: f.id, notitie: '' })}
                                className="text-caption text-brand-text-secondary hover:text-red-600 transition-colors whitespace-nowrap"
                                title="Markeer als oninbaar"
                              >
                                <AlertTriangle size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-brand-text-primary/20">
                      <td colSpan={3} className="py-3 font-semibold text-body text-brand-text-primary">Totaal debiteuren</td>
                      <td className="py-3 text-right font-semibold text-body text-brand-text-primary">{euro(totaalDebiteuren)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-3 flex items-start gap-2 p-3 rounded-brand-sm bg-brand-page-light">
                <Info size={13} className="text-brand-text-secondary mt-0.5 flex-shrink-0" />
                <p className="text-caption text-brand-text-secondary">
                  Dit bedrag ({euro(totaalDebiteuren)}) wordt automatisch als balanspost &quot;Handelsdebiteuren&quot; overgenomen.
                </p>
              </div>
            </>
          )
        )}
      </div>

      {/* ═══ Oninbaar modal ════════════════════════════════════════════════ */}
      {oninbaarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="card max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-uxum text-subtitle text-brand-text-primary">Markeer als oninbaar</h3>
                <p className="text-caption text-brand-text-secondary mt-1">
                  Dit mag pas na minimaal 1 jaar pogingen tot incasso, of bij hard bewijs (faillissement etc.).
                  Voeg een notitie toe ter onderbouwing.
                </p>
              </div>
            </div>
            <textarea
              placeholder="Toelichting (verplicht voor je eigen administratie)"
              value={oninbaarModal.notitie}
              onChange={e => setOninbaarModal(prev => prev ? { ...prev, notitie: e.target.value } : null)}
              className="input w-full h-24 mb-4 text-caption"
            />
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setOninbaarModal(null)}>Annuleren</button>
              <button
                className="btn-primary bg-red-600 hover:bg-red-700"
                onClick={async () => {
                  await updateDebiteurStatus(oninbaarModal.factuurId, 'oninbaar', oninbaarModal.notitie)
                  setOninbaarModal(null)
                  toonToast('Factuur gemarkeerd als oninbaar')
                }}
              >
                Bevestig oninbaar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 3. Zakelijke kosten ════════════════════════════════════════════ */}
      <div className="card mb-6">
        <SectieTitel
          titel="Zakelijke kosten"
          open={sectiesOpen.kosten}
          onToggle={() => toggleSectie('kosten')}
          icoon={<Landmark size={16} className="text-brand-text-secondary" />}
        />
        {sectiesOpen.kosten && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-brand-card-border">
                    <th className="text-left text-caption text-brand-text-secondary font-medium py-2 pr-3 w-2/5">Omschrijving</th>
                    <th className="text-left text-caption text-brand-text-secondary font-medium py-2 px-3 w-1/5">Categorie</th>
                    <th className="text-right text-caption text-brand-text-secondary font-medium py-2 px-3">Bedrag excl. BTW</th>
                    <th className="text-left text-caption text-brand-text-secondary font-medium py-2 px-3">Datum</th>
                    <th className="py-2 pl-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-page-medium">
                  {kosten.map(k => (
                    <tr key={k.id} className="hover:bg-brand-page-light group">
                      <td className="py-1.5 pr-3">
                        <input
                          value={k.label}
                          onChange={e => updateKost(k.id, { label: e.target.value })}
                          className="input w-full py-1 text-body"
                        />
                      </td>
                      <td className="py-1.5 px-3">
                        <select
                          value={k.categorie}
                          onChange={e => updateKost(k.id, { categorie: e.target.value })}
                          className="input w-full py-1 text-caption"
                        >
                          {Object.entries(KOSTENCATEGORIEN).map(([val, lbl]) => (
                            <option key={val} value={val}>{lbl}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-3">
                        <input
                          type="number"
                          value={k.bedrag}
                          min="0"
                          step="0.01"
                          onChange={e => updateKost(k.id, { bedrag: parseFloat(e.target.value) || 0 })}
                          className="input w-full py-1 text-right text-body font-mono"
                        />
                      </td>
                      <td className="py-1.5 px-3">
                        <input
                          type="date"
                          value={k.datum ?? ''}
                          onChange={e => updateKost(k.id, { datum: e.target.value || null })}
                          className="input py-1 text-caption w-36"
                        />
                      </td>
                      <td className="py-1.5 pl-3">
                        <button
                          onClick={() => verwijderKost(k.id)}
                          className="opacity-0 group-hover:opacity-100 text-brand-text-secondary hover:text-red-600 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-brand-card-border">
              <div className="flex gap-6">
                <button onClick={voegKostToe} className="btn-secondary">
                  <Plus size={14} /> Kostenpost toevoegen
                </button>
                <button
                  onClick={() => toonToast('Bonnetjes-import binnenkort beschikbaar')}
                  className="btn-secondary text-brand-text-secondary"
                >
                  Importeer uit bonnetjes
                </button>
              </div>
              <div className="text-right">
                <p className="text-caption text-brand-text-secondary">
                  Bruto: {euro(kostenTotaalBruto)}
                  {kostenTotaalBruto !== kostenTotaalAftrekbaar && (
                    <span className="ml-2 text-brand-text-primary font-semibold">
                      Aftrekbaar: {euro(kostenTotaalAftrekbaar)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Subtotalen per categorie */}
            {Object.keys(kostenPerCategorie).length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(kostenPerCategorie).map(([cat, bedrag]) => (
                  <div key={cat} className="rounded-brand-sm bg-brand-page-light px-3 py-2 flex justify-between text-caption">
                    <span className="text-brand-text-secondary">{KOSTENCATEGORIEN[cat] ?? cat}</span>
                    <span className="font-medium text-brand-text-primary">{euro(bedrag)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ 4. Investeringen + KIA ══════════════════════════════════════════ */}
      <div className="card mb-6">
        <SectieTitel
          titel="Investeringen en KIA-check"
          open={sectiesOpen.investeringen}
          onToggle={() => toggleSectie('investeringen')}
          icoon={<PiggyBank size={16} className="text-brand-text-secondary" />}
        />
        {sectiesOpen.investeringen && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-brand-card-border">
                    <th className="text-left text-caption text-brand-text-secondary font-medium py-2 pr-3 w-1/3">Omschrijving</th>
                    <th className="text-right text-caption text-brand-text-secondary font-medium py-2 px-3">Bedrag excl. BTW</th>
                    <th className="text-left text-caption text-brand-text-secondary font-medium py-2 px-3">Datum</th>
                    <th className="text-center text-caption text-brand-text-secondary font-medium py-2 px-3">Termijn (jr)</th>
                    <th className="text-right text-caption text-brand-text-secondary font-medium py-2 px-3">Afschr. p/jr</th>
                    <th className="text-center text-caption text-brand-text-secondary font-medium py-2 px-3">KIA</th>
                    <th className="py-2 pl-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-page-medium">
                  {investeringen.map(inv => {
                    const afschr = berekenAfschrijvingDitJaar(inv.bedrag, inv.afschrijvingstermijn_jaren)
                    const kiaWaardig = inv.bedrag >= constanten.kiaMinimumPerItem
                    return (
                      <tr key={inv.id} className="hover:bg-brand-page-light group">
                        <td className="py-1.5 pr-3">
                          <input
                            value={inv.label}
                            onChange={e => updateInvestering(inv.id, { label: e.target.value })}
                            className="input w-full py-1 text-body"
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="number"
                            value={inv.bedrag}
                            min="0"
                            step="0.01"
                            onChange={e => updateInvestering(inv.id, { bedrag: parseFloat(e.target.value) || 0 })}
                            className="input w-full py-1 text-right font-mono text-body"
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="date"
                            value={inv.datum}
                            onChange={e => updateInvestering(inv.id, { datum: e.target.value })}
                            className="input py-1 text-caption w-36"
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="number"
                            value={inv.afschrijvingstermijn_jaren}
                            min="1"
                            max="30"
                            onChange={e => updateInvestering(inv.id, { afschrijvingstermijn_jaren: parseInt(e.target.value) || 5 })}
                            className="input w-16 py-1 text-center text-body"
                          />
                        </td>
                        <td className="py-1.5 px-3 text-right text-caption font-mono text-brand-text-secondary">
                          {euro(afschr)}
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          <span className={`pill text-pill font-semibold px-2 py-0.5 ${
                            kiaWaardig
                              ? 'bg-brand-lime text-brand-text-primary'
                              : 'bg-brand-page-medium text-brand-text-secondary'
                          }`}>
                            {kiaWaardig ? 'KIA' : 'Directe aftrek'}
                          </span>
                        </td>
                        <td className="py-1.5 pl-3">
                          <button
                            onClick={() => verwijderInvestering(inv.id)}
                            className="opacity-0 group-hover:opacity-100 text-brand-text-secondary hover:text-red-600 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-brand-card-border">
              <button onClick={voegInvesteringToe} className="btn-secondary">
                <Plus size={14} /> Investering toevoegen
              </button>
            </div>

            {/* KIA samenvatting */}
            <div className="mt-4 p-4 rounded-brand-sm bg-brand-page-light">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-caption text-brand-text-secondary">Totaal investeringen</p>
                  <p className="font-semibold text-body text-brand-text-primary">
                    {euro(investeringen.reduce((s, i) => s + i.bedrag, 0))}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-brand-text-secondary">Totaal afschrijvingen {jaar}</p>
                  <p className="font-semibold text-body text-brand-text-primary">{euro(totaalAfschrijvingen)}</p>
                </div>
                <div>
                  <p className="text-caption text-brand-text-secondary">KIA-aftrek</p>
                  {kiaBerekening > 0 ? (
                    <p className="font-semibold text-body text-brand-status-green">{euro(kiaBerekening)}</p>
                  ) : (
                    <div>
                      <p className="font-semibold text-body text-brand-text-secondary">{euro(0)}</p>
                      <p className="text-caption text-brand-text-secondary">
                        Geen KIA (min. {euro(constanten.kiaMinimumTotaal)} + item ≥ {euro(constanten.kiaMinimumPerItem)})
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══ 5. Aftrekposten ════════════════════════════════════════════════ */}
      <div className="card mb-6">
        <SectieTitel
          titel="Aftrekposten en voorwaarden"
          open={sectiesOpen.aftrekposten}
          onToggle={() => toggleSectie('aftrekposten')}
          icoon={<Calculator size={16} className="text-brand-text-secondary" />}
        />
        {sectiesOpen.aftrekposten && (
          <div className="space-y-4">
            {/* Urencriterium */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={aangifte.urencriterium_voldaan}
                onChange={e => updateAangifte({ urencriterium_voldaan: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-brand-lav-accent flex-shrink-0"
              />
              <div>
                <span className="text-body font-medium text-brand-text-primary">Urencriterium voldaan (1.225+ uur in onderneming)</span>
                <p className="text-caption text-brand-text-secondary mt-0.5">
                  Vereist voor zelfstandigenaftrek en startersaftrek. Houd je urenstaten bij als bewijs.
                </p>
              </div>
            </label>

            {/* Zelfstandigenaftrek */}
            <label className={`flex items-start gap-3 cursor-pointer ${!aangifte.urencriterium_voldaan ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={aangifte.claim_zelfstandigenaftrek && aangifte.urencriterium_voldaan}
                disabled={!aangifte.urencriterium_voldaan}
                onChange={e => updateAangifte({ claim_zelfstandigenaftrek: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-brand-lav-accent flex-shrink-0"
              />
              <div>
                <span className="text-body font-medium text-brand-text-primary">
                  Zelfstandigenaftrek {euro(constanten.zelfstandigenaftrek)}
                </span>
                <p className="text-caption text-brand-text-secondary mt-0.5">
                  Automatisch aangevinkt bij voldaan urencriterium. Afbouwend richting 2030.
                </p>
              </div>
            </label>

            {/* Startersaftrek */}
            <label className={`flex items-start gap-3 cursor-pointer ${!aangifte.urencriterium_voldaan ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={aangifte.claim_startersaftrek && aangifte.urencriterium_voldaan}
                disabled={!aangifte.urencriterium_voldaan}
                onChange={e => updateAangifte({ claim_startersaftrek: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-brand-lav-accent flex-shrink-0"
              />
              <div>
                <span className="text-body font-medium text-brand-text-primary">
                  Startersaftrek {euro(constanten.startersaftrek)}
                </span>
                {aangifte.claim_startersaftrek && (
                  <div className="mt-2 flex items-center gap-3">
                    <label className="text-caption text-brand-text-secondary">Al gebruikt (max 3x):</label>
                    <input
                      type="number"
                      min={0}
                      max={3}
                      value={aangifte.startersaftrek_keer_gebruikt}
                      onChange={e => {
                        const val = Math.min(3, Math.max(0, parseInt(e.target.value) || 0))
                        updateAangifte({ startersaftrek_keer_gebruikt: val })
                      }}
                      className="input w-16 py-1 text-center text-body"
                    />
                    {aangifte.startersaftrek_keer_gebruikt >= 3 && (
                      <span className="text-caption text-red-600">Maximaal bereikt</span>
                    )}
                  </div>
                )}
              </div>
            </label>

            {/* MKB-winstvrijstelling */}
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-4 h-4 flex items-center justify-center flex-shrink-0">
                <Check size={14} className="text-brand-status-green" />
              </div>
              <div>
                <span className="text-body font-medium text-brand-text-primary">
                  MKB-winstvrijstelling ({(constanten.mkbVrijstellingPct * 100).toFixed(2)}%)
                </span>
                <p className="text-caption text-brand-text-secondary mt-0.5">Altijd van toepassing als ondernemer voor de IB.</p>
              </div>
            </div>

            {/* FOR */}
            <div className="mt-4 p-4 rounded-brand-sm border border-brand-card-border bg-brand-page-light">
              <div className="flex items-start gap-2 mb-3">
                <Info size={14} className="text-brand-text-secondary mt-0.5 flex-shrink-0" />
                <p className="text-caption text-brand-text-secondary">
                  <strong>Oudedagsreserve (FOR)</strong> is afgeschaft per 1 januari 2023. Bestaand FOR-saldo kan alleen nog worden afgebouwd.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-caption text-brand-text-secondary block mb-1">FOR-saldo per 1-1-{jaar} (historisch)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={aangifte.for_saldo_begin_jaar ?? 0}
                    onChange={e => updateAangifte({ for_saldo_begin_jaar: parseFloat(e.target.value) || 0 })}
                    className="input w-full py-1 text-body font-mono"
                  />
                </div>
                <div>
                  <label className="text-caption text-brand-text-secondary block mb-1">FOR vrijval dit jaar (telt bij belastbaar inkomen)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={aangifte.for_vrijval ?? 0}
                    onChange={e => updateAangifte({ for_vrijval: parseFloat(e.target.value) || 0 })}
                    className="input w-full py-1 text-body font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 6. Berekening ══════════════════════════════════════════════════ */}
      <div className="card mb-6">
        <SectieTitel
          titel="Berekening inkomstenbelasting"
          open={sectiesOpen.berekening}
          onToggle={() => toggleSectie('berekening')}
          icoon={<Calculator size={16} className="text-brand-text-secondary" />}
        />
        {sectiesOpen.berekening && uitkomst && (
          <div className="max-w-lg">
            <BerekenRij label="Omzet excl. BTW" waarde={euro(omzetStats.totaalOmzetExcl)} bold />
            <BerekenRij label="Af: Zakelijke kosten (incl. representatie 80%)" waarde={`- ${euro(kostenTotaalAftrekbaar)}`} muted />
            <BerekenRij label="Af: Afschrijvingen" waarde={`- ${euro(totaalAfschrijvingen)}`} muted />
            <BerekenRij label="Winst voor ondernemersaftrek" waarde={euro(uitkomst.winstVoorAftrek)} bold streep />

            {uitkomst.zelfstandigenaftrek > 0 && (
              <BerekenRij label="Af: Zelfstandigenaftrek" waarde={`- ${euro(uitkomst.zelfstandigenaftrek)}`} muted />
            )}
            {uitkomst.startersaftrek > 0 && (
              <BerekenRij label="Af: Startersaftrek" waarde={`- ${euro(uitkomst.startersaftrek)}`} muted />
            )}
            {uitkomst.kia > 0 && (
              <BerekenRij label="Af: KIA" waarde={`- ${euro(uitkomst.kia)}`} muted />
            )}
            <BerekenRij label="Winst na ondernemersaftrek" waarde={euro(uitkomst.winstNaAftrek)} bold streep />

            <BerekenRij
              label={`Af: MKB-winstvrijstelling (${(constanten.mkbVrijstellingPct * 100).toFixed(2)}%)`}
              waarde={`- ${euro(uitkomst.mkbVrijstelling)}`}
              muted
            />
            {uitkomst.forVrijval > 0 && (
              <BerekenRij label="Bij: FOR vrijval" waarde={`+ ${euro(uitkomst.forVrijval)}`} muted />
            )}
            <BerekenRij label="Belastbaar inkomen uit onderneming" waarde={euro(uitkomst.belastbaarInkomen)} bold streep />

            <BerekenRij
              label={`Schijf 1 (${(constanten.schijf1Tarief * 100).toFixed(2)}% tot ${euro(constanten.schijf1Grens)})`}
              waarde={euro(uitkomst.ib.belastingSchijf1)}
              muted
            />
            {uitkomst.ib.belastingSchijf2 > 0 && (
              <BerekenRij label={`Schijf 2 (${(constanten.schijf2Tarief * 100).toFixed(2)}%)`} waarde={euro(uitkomst.ib.belastingSchijf2)} muted />
            )}
            <BerekenRij label="Bruto belasting" waarde={euro(uitkomst.ib.brutoBelasting)} bold streep />
            <BerekenRij label="Af: Algemene heffingskorting" waarde={`- ${euro(uitkomst.ib.ahk)}`} muted />
            <BerekenRij label="Af: Arbeidskorting" waarde={`- ${euro(uitkomst.ib.ak)}`} muted />
            <BerekenRij label="Geschatte te betalen IB" waarde={euro(uitkomst.ib.geschatteIB)} bold highlight streep />

            <div className="mt-4 flex items-start gap-2 p-3 rounded-brand-sm bg-brand-page-light">
              <Info size={13} className="text-brand-text-secondary mt-0.5 flex-shrink-0" />
              <p className="text-caption text-brand-text-secondary">
                Grove schatting. Geen rekening gehouden met box 3, eigen woning, of ander inkomen. Raadpleeg je boekhouder.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 7. Balans ══════════════════════════════════════════════════════ */}
      <div className="card mb-6">
        <SectieTitel
          titel={`Balans per 31 december ${jaar}`}
          open={sectiesOpen.balans}
          onToggle={() => toggleSectie('balans')}
          icoon={<Landmark size={16} className="text-brand-text-secondary" />}
        />
        {sectiesOpen.balans && (
          <div className="grid grid-cols-2 gap-8">
            {/* Activa */}
            <div>
              <h3 className="font-semibold text-body text-brand-text-primary mb-3">Activa</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-caption text-brand-text-secondary block mb-1">Banksaldo eindstand</label>
                  <input
                    type="number"
                    step="0.01"
                    value={aangifte.banksaldo_eindstand ?? ''}
                    placeholder="0,00"
                    onChange={e => updateAangifte({ banksaldo_eindstand: parseFloat(e.target.value) || null })}
                    className="input w-full py-1 text-body font-mono"
                  />
                </div>
                <div>
                  <label className="text-caption text-brand-text-secondary block mb-1">
                    Handelsdebiteuren (auto, uit sectie 2)
                  </label>
                  <div className="input bg-brand-page-light py-1 text-body font-mono text-brand-text-secondary select-none">
                    {euro(totaalDebiteuren)}
                  </div>
                </div>
                <div>
                  <label className="text-caption text-brand-text-secondary block mb-1">Voorraad</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={aangifte.voorraad ?? 0}
                    onChange={e => updateAangifte({ voorraad: parseFloat(e.target.value) || 0 })}
                    className="input w-full py-1 text-body font-mono"
                  />
                </div>
                <div>
                  <label className="text-caption text-brand-text-secondary block mb-1">
                    Inventaris/bedrijfsmiddelen (boekwaarde, auto)
                  </label>
                  <div className="input bg-brand-page-light py-1 text-body font-mono text-brand-text-secondary select-none">
                    {euro(boekwaardeInventaris)}
                  </div>
                </div>
                <div className="pt-2 border-t border-brand-card-border flex justify-between">
                  <span className="font-semibold text-body text-brand-text-primary">Totaal activa</span>
                  <span className="font-semibold text-body font-mono text-brand-text-primary">
                    {euro(
                      (aangifte.banksaldo_eindstand ?? 0) +
                      totaalDebiteuren +
                      (aangifte.voorraad ?? 0) +
                      boekwaardeInventaris
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Passiva */}
            <div>
              <h3 className="font-semibold text-body text-brand-text-primary mb-3">Passiva</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-caption text-brand-text-secondary block mb-1">Eigen vermogen</label>
                  <input
                    type="number"
                    step="0.01"
                    value={aangifte.eigen_vermogen ?? ''}
                    placeholder="0,00"
                    onChange={e => updateAangifte({ eigen_vermogen: parseFloat(e.target.value) || null })}
                    className="input w-full py-1 text-body font-mono"
                  />
                </div>
                <div>
                  <label className="text-caption text-brand-text-secondary block mb-1">Crediteuren</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={aangifte.crediteuren ?? 0}
                    onChange={e => updateAangifte({ crediteuren: parseFloat(e.target.value) || 0 })}
                    className="input w-full py-1 text-body font-mono"
                  />
                </div>
                <div>
                  <label className="text-caption text-brand-text-secondary block mb-1">
                    Te betalen BTW Q4 (auto)
                  </label>
                  <div className="input bg-brand-page-light py-1 text-body font-mono text-brand-text-secondary select-none">
                    {euro(btwQ4)}
                  </div>
                </div>
                <div className="pt-2 border-t border-brand-card-border flex justify-between">
                  <span className="font-semibold text-body text-brand-text-primary">Totaal passiva</span>
                  <span className="font-semibold text-body font-mono text-brand-text-primary">
                    {euro(
                      (aangifte.eigen_vermogen ?? 0) +
                      (aangifte.crediteuren ?? 0) +
                      btwQ4
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ 8. Invulhulp Mijn Belastingdienst ════════════════════════════ */}
      <div className="card mb-6">
        <SectieTitel
          titel="Invulhulp Mijn Belastingdienst"
          open={sectiesOpen.invulhulp}
          onToggle={() => toggleSectie('invulhulp')}
          icoon={<FileBarChart size={16} className="text-brand-text-secondary" />}
        />
        {sectiesOpen.invulhulp && uitkomst && (
          <>
            <div className="flex items-start gap-2 mb-4 p-3 rounded-brand-sm bg-brand-page-light">
              <Info size={13} className="text-brand-text-secondary mt-0.5 flex-shrink-0" />
              <p className="text-caption text-brand-text-secondary">
                Kopieer deze bedragen naar de overeenkomende velden in Mijn Belastingdienst.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-brand-card-border">
                    <th className="text-left text-caption text-brand-text-secondary font-medium py-2 pr-8">Veld in aangifte</th>
                    <th className="text-right text-caption text-brand-text-secondary font-medium py-2">Bedrag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-page-medium">
                  {[
                    { label: 'Netto-omzet (excl. BTW)', waarde: omzetStats.totaalOmzetExcl },
                    { label: 'Af: Zakelijke kosten (incl. representatie 80%)', waarde: -kostenTotaalAftrekbaar },
                    { label: 'Af: Afschrijvingen', waarde: -totaalAfschrijvingen },
                    { label: 'Winst voor ondernemersaftrek', waarde: uitkomst.winstVoorAftrek },
                    ...(uitkomst.zelfstandigenaftrek > 0 ? [{ label: 'Zelfstandigenaftrek', waarde: -uitkomst.zelfstandigenaftrek }] : []),
                    ...(uitkomst.startersaftrek > 0 ? [{ label: 'Startersaftrek', waarde: -uitkomst.startersaftrek }] : []),
                    ...(uitkomst.kia > 0 ? [{ label: 'Kleinschaligheidsinvesteringsaftrek (KIA)', waarde: -uitkomst.kia }] : []),
                    { label: `MKB-winstvrijstelling (${(constanten.mkbVrijstellingPct * 100).toFixed(2)}%)`, waarde: -uitkomst.mkbVrijstelling },
                    { label: 'Belastbaar inkomen uit onderneming', waarde: uitkomst.belastbaarInkomen },
                    { label: 'Geschatte te betalen IB', waarde: uitkomst.ib.geschatteIB },
                    { label: 'Handelsdebiteuren (balanspost)', waarde: totaalDebiteuren },
                    { label: 'Te betalen BTW Q4', waarde: btwQ4 },
                  ].map(({ label, waarde }) => (
                    <tr key={label} className="hover:bg-brand-page-light">
                      <td className="py-2.5 pr-8 text-body text-brand-text-primary">{label}</td>
                      <td className={`py-2.5 text-right font-mono text-body font-semibold ${waarde < 0 ? 'text-brand-text-secondary' : 'text-brand-text-primary'}`}>
                        {waarde < 0 ? `- ${euro(Math.abs(waarde))}` : euro(waarde)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

    </div>
  )
}
