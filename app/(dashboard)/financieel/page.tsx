'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Plus, TrendingUp, AlertCircle, CheckCircle2, ArrowRight, FileText, Clock, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, PiggyBank } from 'lucide-react'
import { Abonnement, Factuur } from '@/lib/types'
import { useActiveCompany } from '@/components/CompanyContext'
import { onDataChanged } from '@/lib/events'
import { useDrawer } from '@/components/DrawerContext'
import TeInnenBlok from '@/components/financieel/TeInnenBlok'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function calcMRR(abonnementen: Abonnement[]): number {
  return abonnementen
    .filter(a => a.status === 'actief')
    .reduce((sum, a) => {
      if (a.interval === 'maandelijks') return sum + a.amount
      if (a.interval === 'kwartaal') return sum + a.amount / 3
      if (a.interval === 'jaarlijks') return sum + a.amount / 12
      return sum
    }, 0)
}

/**
 * Financieel overzicht: alles over geld op één plek. Omzet, verwachte omzet,
 * wat nog gefactureerd en betaald moet worden (met de betaalacties die de Dash
 * klaarzet), ontvangsten, btw en abonnementen. Het dashboard is een
 * overzichtspagina en toont hiervan alleen de omzet.
 */
export default function Financieel() {
  const { openDrawer } = useDrawer()
  const { scope, scopeGeladen } = useActiveCompany()

  const [factuurStats, setFactuurStats] = useState<{
    openFacturen: number
    totalOpenAmount: number
    overdueFacturen: number
    overdueBedrag: number
    openUren: number
    openUrenIncl: number
    paidThisMonth: number
    revenueYear: number
    revenueYearIncl: number
    revenueMonth: number
    revenueMonthIncl: number
    omzetPerMaand: {
      maand: string; label: string; excl: number; incl: number; aantal: number; ontvangen: number
      facturen: { id: string; nummer: string; klant: string; bedrag: number; status: string }[]
    }[]
    verwachteOmzet: number
    verwachteOmzetIncl: number
    recentFacturen: Factuur[]
    perMaand: { maand: string; openstaand: number; uren: number; totaal: number }[]
  }>({ openFacturen: 0, totalOpenAmount: 0, overdueFacturen: 0, overdueBedrag: 0, openUren: 0, openUrenIncl: 0, paidThisMonth: 0, revenueYear: 0, revenueYearIncl: 0, revenueMonth: 0, revenueMonthIncl: 0, omzetPerMaand: [], verwachteOmzet: 0, verwachteOmzetIncl: 0, recentFacturen: [], perMaand: [] })

  // Welke maand de omzetkaart toont. -1 betekent "nog niet gezet", dan springt hij
  // naar de huidige maand zodra de cijfers binnen zijn.
  const [maandIndex, setMaandIndex] = useState(-1)
  const [maandOpen, setMaandOpen] = useState(false)
  const gekozenMaand = factuurStats.omzetPerMaand[maandIndex] ?? factuurStats.omzetPerMaand[factuurStats.omzetPerMaand.length - 1]

  useEffect(() => {
    if (maandIndex === -1 && factuurStats.omzetPerMaand.length > 0) {
      setMaandIndex(factuurStats.omzetPerMaand.length - 1)
    }
  }, [factuurStats.omzetPerMaand.length, maandIndex])

  const [belastingStats, setBelastingStats] = useState<{
    jaar: number
    huidigKwartaal: number
    eigen: { btwDitKwartaal: number }
  } | null>(null)

  const [offerteStats, setOfferteStats] = useState<{
    openOffertes: number
    totalOpenAmount: number
    nogTeFacturerenAantal: number
    nogTeFactureren: number
  }>({ openOffertes: 0, totalOpenAmount: 0, nogTeFacturerenAantal: 0, nogTeFactureren: 0 })

  const [abonnementen, setAbonnementen] = useState<Abonnement[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState<Date | null>(null)

  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = useCallback((minimumDuur = 0) => {
    // Debounce: samenvoegen van meerdere triggers binnen 300ms tot één fetch
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
    fetchTimerRef.current = setTimeout(() => {
      setLoading(true)
      const start = Date.now()
      // De BTW-kaart valt buiten de bedrijfskeuze: alle drie de bedrijven
      // vallen onder hetzelfde KVK- en BTW-nummer, dus dat is één aangifte.
      const bedrijf = scope === 'alle' ? '' : `company=${scope}`
      Promise.all([
        fetch(`/api/facturen/stats?${bedrijf}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/abonnementen?status=actief&${bedrijf}`).then(r => r.ok ? r.json() : null),
        scope === 'alle' ? fetch('/api/belasting/stats').then(r => r.ok ? r.json() : null) : null,
        fetch(`/api/offertes/stats?${bedrijf}`).then(r => r.ok ? r.json() : null),
      ]).then(([fac, abo, bel, off]) => {
        if (off) setOfferteStats(off)
        if (fac) setFactuurStats(fac)
        if (abo) setAbonnementen(abo)
        if (bel) setBelastingStats(bel)
      }).finally(() => {
        const wacht = minimumDuur - (Date.now() - start)
        if (wacht > 0) setTimeout(() => setLoading(false), wacht)
        else setLoading(false)
      })
    }, 300)
  }, [scope])

  useEffect(() => {
    // Wachten tot het opgeslagen bedrijf bekend is, anders haal je eerst alles
    // op en direct daarna nog eens het gekozen bedrijf.
    if (!scopeGeladen) return
    fetchData()
    const onFocus = () => fetchData()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchData() }
    const cleanupDataChanged = onDataChanged(() => fetchData())
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    // Hier stond een Supabase Realtime-abonnement op offertes en facturen. Dat
    // leverde nooit een event op: de browser gebruikt de anon-key en op alle
    // tabellen staat RLS aan zonder policies. De focus- en zichtbaarheidsrefresh
    // hierboven deed al het werk.

    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
      cleanupDataChanged()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchData, scopeGeladen])

  useEffect(() => { setNow(new Date()) }, [])
  const mrr = calcMRR(abonnementen)
  const activeAbonnementen = abonnementen.filter(a => a.status === 'actief').length
  const ontvangenDitJaar = factuurStats.omzetPerMaand.reduce((som, m) => som + m.ontvangen, 0)


  return (
    <div className="p-4 sm:p-6 lg:p-8 xl:pt-8 xl:pb-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6 xl:mb-3">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">Financieel</h1>
          <p className="text-body text-brand-text-secondary mt-1">Omzet, wat nog binnen moet komen, btw en abonnementen</p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => { setLoading(true); fetchData(600) }} className="btn-secondary" title="Vernieuwen">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => openDrawer({ type: 'factuur-nieuw' })} className="btn-primary">
            <Plus size={15} /> Nieuwe factuur
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6 xl:mb-3 [&>*]:xl:p-3">
        <Link href="/facturen?periode=jaar" className="card hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start justify-between mb-3 xl:mb-2">
            <p className="text-caption text-brand-text-secondary">Omzet dit jaar</p>
            <div className="w-8 h-8 rounded-brand-sm bg-brand-lavender-accent flex items-center justify-center">
              <CheckCircle2 size={17} className="text-brand-lav-accent" />
            </div>
          </div>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(factuurStats.revenueYear)}</p>
          <p className="text-caption text-brand-text-secondary mt-1">incl. btw: {euro(factuurStats.revenueYearIncl)}</p>
        </Link>

        {/* Omzet per maand, met pijltjes zodat je op de 1e van de maand nog gewoon
            de vorige maand kunt bekijken in plaats van een lege kaart. */}
        <div className="card">
          <div className="flex items-start justify-between mb-3 xl:mb-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMaandIndex(i => Math.max(0, i - 1))}
                disabled={maandIndex <= 0}
                aria-label="Vorige maand"
                className="p-0.5 rounded text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
              </button>
              <p className="text-caption text-brand-text-secondary capitalize min-w-[74px] text-center">
                Omzet {gekozenMaand?.label ?? 'deze maand'}
              </p>
              <button
                onClick={() => setMaandIndex(i => Math.min(factuurStats.omzetPerMaand.length - 1, i + 1))}
                disabled={maandIndex >= factuurStats.omzetPerMaand.length - 1}
                aria-label="Volgende maand"
                className="p-0.5 rounded text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="w-8 h-8 rounded-brand-sm bg-brand-lime flex items-center justify-center">
              <TrendingUp size={17} className="text-brand-lime-accent" />
            </div>
          </div>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(gekozenMaand?.excl ?? 0)}</p>
          <p className="text-caption text-brand-text-secondary mt-1">incl. btw: {euro(gekozenMaand?.incl ?? 0)}</p>
          {(gekozenMaand?.aantal ?? 0) === 0 ? (
            <p className="text-caption text-brand-text-secondary/70 mt-0.5">geen facturen</p>
          ) : (
            <button
              onClick={() => setMaandOpen(o => !o)}
              className="flex items-center gap-1 text-caption text-brand-text-secondary/70 hover:text-brand-text-primary mt-0.5 transition-colors"
            >
              {gekozenMaand!.aantal} {gekozenMaand!.aantal === 1 ? 'factuur' : 'facturen'}
              <ChevronDown size={12} className={`transition-transform ${maandOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
          {maandOpen && gekozenMaand && gekozenMaand.facturen.length > 0 && (
            <div className="mt-2 pt-2 border-t border-brand-page-medium space-y-1">
              {gekozenMaand.facturen.map(f => (
                <Link
                  key={f.id}
                  href={`/facturen/${f.id}`}
                  className="flex items-baseline justify-between gap-2 text-caption hover:bg-brand-page-light rounded px-1 -mx-1 py-0.5 transition-colors"
                >
                  <span className="truncate">
                    <span className="font-mono text-brand-text-secondary">{f.nummer}</span>
                    <span className="ml-1.5 text-brand-text-primary">{f.klant}</span>
                  </span>
                  <span className="font-semibold whitespace-nowrap">{euro(f.bedrag)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <Link href="/offertes?status=akkoord" className="card hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start justify-between mb-3 xl:mb-2">
            <p className="text-caption text-brand-text-secondary">Verwachte omzet</p>
            <div className="w-8 h-8 rounded-brand-sm bg-brand-light-blue flex items-center justify-center">
              <FileText size={17} className="text-brand-blue-accent" />
            </div>
          </div>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(factuurStats.verwachteOmzet)}</p>
          <p className="text-caption text-brand-text-secondary mt-1">incl. btw: {euro(factuurStats.verwachteOmzetIncl)}</p>
        </Link>

        <Link href="/facturen?status=te-laat" className={`card hover:shadow-md transition-shadow cursor-pointer ${factuurStats.overdueFacturen > 0 ? 'border-red-200 bg-red-50' : ''}`}>
          <div className="flex items-start justify-between mb-3 xl:mb-2">
            <p className="text-caption text-brand-text-secondary">Te laat</p>
            <div className={`w-8 h-8 rounded-brand-sm flex items-center justify-center ${factuurStats.overdueFacturen > 0 ? 'bg-red-100' : 'bg-brand-pink'}`}>
              <AlertCircle size={17} className={factuurStats.overdueFacturen > 0 ? 'text-red-500' : 'text-brand-status-orange'} />
            </div>
          </div>
          <p className={`font-uxum text-stat ${factuurStats.overdueFacturen > 0 ? 'text-red-600' : 'text-brand-text-primary'}`}>
            {factuurStats.overdueFacturen}
          </p>
          <p className="text-caption text-brand-text-secondary mt-1">
            {factuurStats.overdueFacturen === 0 ? 'Alles op tijd' : `factuur${factuurStats.overdueFacturen > 1 ? 'en' : ''} verlopen`}
          </p>
        </Link>
      </div>

      {/* Nog te factureren en te innen, met de betaalacties eronder */}
      <TeInnenBlok
        className="mb-6 xl:mb-3"
        openUren={factuurStats.openUren}
        openUrenIncl={factuurStats.openUrenIncl}
        nogTeFactureren={offerteStats.nogTeFactureren}
        nogTeFacturerenAantal={offerteStats.nogTeFacturerenAantal}
        totalOpenAmount={factuurStats.totalOpenAmount}
        openFacturen={factuurStats.openFacturen}
        overdueBedrag={factuurStats.overdueBedrag}
        overdueFacturen={factuurStats.overdueFacturen}
      />

      {/* Omzet per maand en verwachte omzet per maand naast elkaar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 xl:gap-4 mb-6 xl:mb-3 items-start">
        {/* Omzet per maand dit jaar, uit dezelfde cijfers als de maandtegel */}
        <div className="card">
          <div className="flex items-center justify-between mb-4 xl:mb-2">
            <h2 className="font-semibold text-body">Omzet per maand</h2>
            <span className="text-caption text-brand-text-secondary">excl. btw</span>
          </div>
          {factuurStats.omzetPerMaand.length === 0 ? (
            <p className="text-body text-brand-text-secondary py-6 text-center">Nog geen omzet dit jaar</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[320px] text-body">
              <thead>
                <tr className="border-b border-brand-page-medium">
                  <th className="text-left pb-2 text-caption text-brand-text-secondary font-medium">Maand</th>
                  <th className="text-right pb-2 text-caption text-brand-text-secondary font-medium">Facturen</th>
                  <th className="text-right pb-2 text-caption text-brand-text-secondary font-medium">Ontvangen</th>
                  <th className="text-right pb-2 text-caption text-brand-text-secondary font-medium">Omzet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-page-medium">
                {[...factuurStats.omzetPerMaand].reverse().map(m => (
                  <tr key={m.maand}>
                    <td className="py-2 xl:py-1.5 capitalize text-brand-text-secondary">{m.label}</td>
                    <td className="py-2 xl:py-1.5 text-right text-brand-text-secondary">{m.aantal || '–'}</td>
                    <td className="py-2 xl:py-1.5 text-right text-brand-text-secondary">{m.ontvangen > 0 ? euro(m.ontvangen) : '–'}</td>
                    <td className="py-2 xl:py-1.5 text-right font-semibold text-brand-text-primary">{euro(m.excl)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

      {/* Verwachte omzet per maand */}
      {factuurStats.perMaand.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4 xl:mb-2">
            <h2 className="font-semibold text-body">Verwachte omzet per maand</h2>
            <span className="text-caption text-brand-text-secondary">excl. btw</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[360px] text-body">
            <thead>
              <tr className="border-b border-brand-page-medium">
                <th className="text-left pb-2 text-caption text-brand-text-secondary font-medium">Maand</th>
                <th className="text-right pb-2 text-caption text-brand-text-secondary font-medium">Openstaand</th>
                <th className="text-right pb-2 text-caption text-brand-text-secondary font-medium">Extra uren</th>
                <th className="text-right pb-2 text-caption text-brand-text-secondary font-medium">Totaal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-page-medium">
              {factuurStats.perMaand.map(r => {
                const [year, month] = r.maand.split('-')
                const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
                const isCurrentMonth = r.maand === now?.toISOString().substring(0, 7)
                return (
                  <tr key={r.maand} className={isCurrentMonth ? 'bg-brand-lavender-accent/30' : ''}>
                    <td className={`py-2.5 xl:py-1.5 font-medium ${isCurrentMonth ? 'text-brand-text-primary' : 'text-brand-text-secondary'}`}>
                      {label}
                      {isCurrentMonth && <span className="ml-2 text-pill px-1.5 py-0.5 rounded bg-brand-lavender text-brand-lav-accent font-semibold">nu</span>}
                    </td>
                    <td className="py-2.5 xl:py-1.5 text-right text-brand-text-secondary">{r.openstaand > 0 ? euro(r.openstaand) : <span className="text-brand-text-secondary/40">–</span>}</td>
                    <td className="py-2.5 xl:py-1.5 text-right text-brand-text-secondary">{r.uren > 0 ? euro(r.uren) : <span className="text-brand-text-secondary/40">–</span>}</td>
                    <td className="py-2.5 xl:py-1.5 text-right font-semibold text-brand-text-primary">{euro(r.totaal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </div>
      )}
      </div>

      {/* Betalingen + BTW + Abonnementen */}
      <div className={`grid grid-cols-1 gap-6 xl:gap-4 [&>*]:xl:p-3 ${scope === 'alle' ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
        {/* Openstaand en te laat staan in het blok hierboven; hier wat er binnenkwam
            en wat er bij klanten ligt */}
        <div className="card block">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-body">Ontvangen en uitstaand</h2>
            <Clock size={15} className="text-brand-text-secondary" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link href="/betalingen" className="rounded-brand-sm border border-brand-card-border/60 bg-brand-lime p-3 xl:p-2.5 hover:opacity-80 transition-opacity">
              <p className="text-caption text-brand-text-secondary mb-1 whitespace-nowrap">Ontvangen deze mnd</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(factuurStats.paidThisMonth)}</p>
            </Link>
            <Link href="/betalingen" className="rounded-brand-sm border border-brand-card-border/60 bg-brand-lavender-accent p-3 xl:p-2.5 hover:opacity-80 transition-opacity">
              <p className="text-caption text-brand-text-secondary mb-1 whitespace-nowrap">Ontvangen dit jaar</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(ontvangenDitJaar)}</p>
            </Link>
            <Link href="/offertes?status=verstuurd" title="Offertes die verstuurd zijn en nog op antwoord wachten" className="rounded-brand-sm border border-brand-card-border/60 bg-brand-light-blue p-3 xl:p-2.5 hover:opacity-80 transition-opacity">
              <p className="text-caption text-brand-text-secondary mb-1 whitespace-nowrap">Offertes uitstaand</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(offerteStats.totalOpenAmount)}</p>
              <p className="text-caption text-brand-text-secondary">{offerteStats.openOffertes} {offerteStats.openOffertes === 1 ? 'offerte' : 'offertes'}</p>
            </Link>
          </div>
        </div>

        {/* De aangifte loopt over alle drie de bedrijven samen, dus die kaart
            hoort alleen in de overkoepelende weergave */}
        {scope === 'alle' && (
        <Link href="/belasting" className="card hover:shadow-md transition-shadow cursor-pointer block">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-body">BTW opzij zetten</h2>
            <div className="w-8 h-8 rounded-brand-sm bg-brand-lime flex items-center justify-center">
              <PiggyBank size={17} className="text-brand-lime-accent" />
            </div>
          </div>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(belastingStats?.eigen.btwDitKwartaal ?? 0)}</p>
          <p className="text-caption text-brand-text-secondary mt-1">
            {belastingStats ? `Q${belastingStats.huidigKwartaal} ${belastingStats.jaar} · factuurstelsel` : 'dit kwartaal'}
          </p>
        </Link>
        )}

        <Link href="/abonnementen" className="card hover:shadow-md transition-shadow cursor-pointer block">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-body">Abonnementen</h2>
            <ArrowRight size={15} className="text-brand-text-secondary" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-3 xl:p-2.5">
              <p className="text-caption text-brand-text-secondary mb-1">Actief</p>
              <p className="font-semibold text-body text-brand-text-primary">{activeAbonnementen}</p>
            </div>
            <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-3 xl:p-2.5">
              <p className="text-caption text-brand-text-secondary mb-1">MRR</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(mrr)}</p>
            </div>
            <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-3 xl:p-2.5">
              <p className="text-caption text-brand-text-secondary mb-1">ARR</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(mrr * 12)}</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
