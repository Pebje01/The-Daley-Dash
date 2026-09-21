'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Plus, AlertCircle, ArrowRight, FileText, Clock, RefreshCw, Coins, Send } from 'lucide-react'
import TodoWidget from '@/components/TodoWidget'
import VandaagOppakken from '@/components/dashboard/VandaagOppakken'
import OmzetBlok from '@/components/dashboard/OmzetBlok'
import { getCompany } from '@/lib/companies'
import { FactuurStatusBadge, OfferteStatusBadge } from '@/components/StatusBadge'
import { Offerte, Factuur, Abonnement } from '@/lib/types'
import { useActiveCompany } from '@/components/CompanyContext'
import { onDataChanged } from '@/lib/events'
import { useDrawer } from '@/components/DrawerContext'

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

export default function Dashboard() {
  const { openDrawer } = useDrawer()
  const { scope, scopeGeladen } = useActiveCompany()

  const [offerteStats, setOfferteStats] = useState<{
    conceptOffertes: number
    openOffertes: number
    totalOpenAmount: number
    akkoordOffertes: number
    akkoordAmount: number
    nogTeFacturerenAantal: number
    nogTeFactureren: number
    revenueYear: number
    revenueYearIncl: number
    revenueMonth: number
    revenueMonthIncl: number
    recentOffertes: Offerte[]
  }>({ conceptOffertes: 0, openOffertes: 0, totalOpenAmount: 0, akkoordOffertes: 0, akkoordAmount: 0, nogTeFacturerenAantal: 0, nogTeFactureren: 0, revenueYear: 0, revenueYearIncl: 0, revenueMonth: 0, revenueMonthIncl: 0, recentOffertes: [] })

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

  const [abonnementen, setAbonnementen] = useState<Abonnement[]>([])
  const [crmStats, setCrmStats] = useState<{
    openLeads: number
    openLeadsWaarde: number
    inGesprek: number
    gewonnen: number
    verloren: number
    conversie: number | null
    openOpdrachten: number
    openOpdrachtenWaarde: number
    openCrmFacturen: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [now, setNow] = useState<Date | null>(null)

  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = useCallback((minimumDuur = 0) => {
    // Debounce: samenvoegen van meerdere triggers binnen 300ms tot één fetch
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
    fetchTimerRef.current = setTimeout(() => {
      setLoading(true)
      const start = Date.now()
      // In het CRM zijn alleen de leads bedrijfsgericht; opdrachten en
      // facturatie blijven gedeeld.
      const bedrijf = scope === 'alle' ? '' : `company=${scope}`
      Promise.all([
        fetch(`/api/offertes/stats?${bedrijf}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/facturen/stats?${bedrijf}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/abonnementen?status=actief&${bedrijf}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/crm/stats?${bedrijf}`).then(r => r.ok ? r.json() : null),
      ]).then(([off, fac, abo, crm]) => {
        if (off) setOfferteStats(off)
        if (fac) setFactuurStats(fac)
        if (abo) setAbonnementen(abo)
        if (crm) setCrmStats(crm)
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

  useEffect(() => {
    const d = new Date()
    setNow(d)
    setGreeting(d.getHours() < 12 ? 'Goedemorgen' : d.getHours() < 18 ? 'Goedemiddag' : 'Goedenavond')
  }, [])
  const mrr = calcMRR(abonnementen)
  const activeAbonnementen = abonnementen.filter(a => a.status === 'actief').length


  return (
    // Het dashboard: omzet bovenaan (september 2026 teruggezet, Daley wilde het
    // overzicht hier zien), dan wat klaarligt en wat je vandaag moet doen. De
    // details per maand en de btw staan op /financieel. Vanaf xl vult het de
    // hoogte van het scherm; "Vandaag oppakken" houdt minstens 10rem, en is het
    // scherm daarvoor te laag dan scrolt de pagina in plaats van dat hij verdwijnt:
    // de to-do list loopt rechts over de volle hoogte, "Vandaag oppakken" vangt
    // de ruimte op en scrolt zelf.
    <div className="p-4 sm:p-6 lg:p-8 xl:pt-8 xl:pb-4 xl:min-h-[calc(100dvh-var(--dash-topbar))] xl:flex xl:flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6 xl:mb-3 xl:shrink-0">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">{greeting}, Daley</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            {now?.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) ?? ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={() => { setLoading(true); fetchData(600) }} className="btn-secondary" title="Vernieuwen">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => openDrawer({ type: 'offerte-nieuw' })} className="btn-secondary">
            <Plus size={15} /> Nieuwe offerte
          </button>
          <button onClick={() => openDrawer({ type: 'factuur-nieuw' })} className="btn-primary">
            <Plus size={15} /> Nieuwe factuur
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 xl:grid-rows-[auto_auto_minmax(10rem,1fr)_auto_auto] gap-4 xl:flex-1 xl:min-h-0">
        {/* Omzet: dit jaar, per maand, verwacht */}
        <OmzetBlok
          className="xl:col-span-2 xl:col-start-1 xl:row-start-1"
          omzetPerMaand={factuurStats.omzetPerMaand}
          revenueYear={factuurStats.revenueYear}
          revenueYearIncl={factuurStats.revenueYearIncl}
          verwachteOmzet={factuurStats.verwachteOmzet}
        />

        {/* Geld dat klaarligt: wat je nu kunt factureren of binnenhalen */}
        <div className="card xl:p-4 xl:col-span-2 xl:col-start-1 xl:row-start-2">
          <div className="flex items-center justify-between mb-3 xl:mb-2">
            <h2 className="font-semibold text-body flex items-center gap-2" title="Bedragen incl. btw. Voor open uren is 21% aangenomen.">
              <Coins size={15} className="text-brand-lav-accent" /> Geld dat klaarligt
              <span className="text-caption font-normal text-brand-text-secondary">incl. btw</span>
            </h2>
            <Link href="/financieel" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
              Financieel <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link href="/uren" className="rounded-brand-sm border border-brand-card-border/60 p-3 xl:p-2.5 hover:bg-brand-page-light transition-colors min-w-0">
              <p className="text-caption text-brand-text-secondary mb-1 truncate">Uren te factureren</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(factuurStats.openUrenIncl)}</p>
              <p className="text-caption text-brand-text-secondary">{factuurStats.openUren.toLocaleString('nl-NL')} uur</p>
            </Link>
            {/* Van akkoord-offertes alleen wat nog niet gefactureerd is, zie lib/offertes/facturatie.ts */}
            <Link href="/offertes?status=akkoord" title={`${offerteStats.akkoordOffertes} akkoord, samen ${euro(offerteStats.akkoordAmount)}`} className="rounded-brand-sm border border-brand-card-border/60 p-3 xl:p-2.5 hover:bg-brand-page-light transition-colors min-w-0">
              <p className="text-caption text-brand-text-secondary mb-1 truncate">Offertes te factureren</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(offerteStats.nogTeFactureren)}</p>
              <p className="text-caption text-brand-text-secondary">{offerteStats.nogTeFacturerenAantal} {offerteStats.nogTeFacturerenAantal === 1 ? 'offerte' : 'offertes'}</p>
            </Link>
            <Link href="/facturen?status=verzonden" className="rounded-brand-sm border border-brand-card-border/60 p-3 xl:p-2.5 hover:bg-brand-page-light transition-colors min-w-0">
              <p className="text-caption text-brand-text-secondary mb-1 truncate">Openstaand</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(factuurStats.totalOpenAmount)}</p>
              <p className="text-caption text-brand-text-secondary">{factuurStats.openFacturen} {factuurStats.openFacturen === 1 ? 'factuur' : 'facturen'}</p>
            </Link>
            <Link href="/facturen?status=te-laat" className={`rounded-brand-sm border p-3 xl:p-2.5 transition-colors min-w-0 ${factuurStats.overdueFacturen > 0 ? 'border-brand-status-red/30 bg-brand-status-red/5 hover:bg-brand-status-red/10' : 'border-brand-card-border/60 hover:bg-brand-page-light'}`}>
              <p className="text-caption text-brand-text-secondary mb-1 truncate flex items-center gap-1">
                {factuurStats.overdueFacturen > 0 && <AlertCircle size={12} className="text-brand-status-red" />} Te laat
              </p>
              <p className={`font-semibold text-body ${factuurStats.overdueFacturen > 0 ? 'text-brand-status-red' : 'text-brand-text-primary'}`}>{euro(factuurStats.overdueBedrag)}</p>
              <p className="text-caption text-brand-text-secondary">{factuurStats.overdueFacturen === 0 ? 'alles op tijd' : `${factuurStats.overdueFacturen} ${factuurStats.overdueFacturen === 1 ? 'factuur' : 'facturen'}`}</p>
            </Link>
          </div>
        </div>

        {/* To-do list: rechts over de volle hoogte, op telefoon direct na het geld */}
        <TodoWidget className="xl:col-start-3 xl:row-start-1 xl:row-span-5" />

        <VandaagOppakken className="max-h-96 xl:max-h-none xl:col-span-2 xl:col-start-1 xl:row-start-3" />

        {/* Pijplijn: werk dat eraan komt */}
        <div className="card xl:p-4 xl:col-span-2 xl:col-start-1 xl:row-start-4">
          <div className="flex items-center justify-between mb-3 xl:mb-2">
            <h2 className="font-semibold text-body flex items-center gap-2"><Send size={14} className="text-brand-lav-accent" /> Pijplijn</h2>
            <Link href="/crm/leads" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
              Leads <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link href="/offertes?status=verstuurd" className="rounded-brand-sm bg-brand-light-blue border border-brand-card-border/60 p-3 xl:p-2.5 hover:opacity-80 transition-opacity min-w-0">
              <p className="text-caption text-brand-text-secondary mb-1 truncate">Offertes verstuurd</p>
              <p className="font-semibold text-body text-brand-text-primary">{offerteStats.openOffertes} · {euro(offerteStats.totalOpenAmount)}</p>
            </Link>
            <Link href="/crm/leads" className="rounded-brand-sm bg-brand-page-light border border-brand-card-border/60 p-3 xl:p-2.5 hover:opacity-80 transition-opacity min-w-0">
              <p className="text-caption text-brand-text-secondary mb-1 truncate">Leads in gesprek</p>
              <p className="font-semibold text-body text-brand-text-primary">{crmStats?.inGesprek ?? 0}</p>
            </Link>
            <Link href="/crm/leads" className="rounded-brand-sm bg-brand-lime border border-brand-card-border/60 p-3 xl:p-2.5 hover:opacity-80 transition-opacity min-w-0">
              <p className="text-caption text-brand-text-secondary mb-1 truncate">Open leads</p>
              <p className="font-semibold text-body text-brand-text-primary">
                {crmStats?.openLeads ?? 0}{crmStats && crmStats.openLeadsWaarde > 0 ? ` · ${euro(crmStats.openLeadsWaarde)}` : ''}
              </p>
            </Link>
            <Link href="/abonnementen" className="rounded-brand-sm bg-brand-lavender-accent border border-brand-card-border/60 p-3 xl:p-2.5 hover:opacity-80 transition-opacity min-w-0">
              <p className="text-caption text-brand-text-secondary mb-1 truncate">MRR ({activeAbonnementen} abo&apos;s)</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(mrr)}/mnd</p>
            </Link>
          </div>
        </div>

        {/* Recente offertes en facturen */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 xl:col-span-2 xl:col-start-1 xl:row-start-5">
        {/* Recente offertes */}
        <div className="card">
          <div className="flex items-center justify-between mb-4 xl:mb-2">
            <h2 className="font-semibold text-body">Recente offertes</h2>
            <Link href="/offertes" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
              Alles <ArrowRight size={12} />
            </Link>
          </div>
          {offerteStats.recentOffertes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-body text-brand-text-secondary mb-2">Nog geen offertes</p>
              <button onClick={() => openDrawer({ type: 'offerte-nieuw' })} className="text-caption font-semibold text-brand-purple underline underline-offset-2">Maak je eerste offerte</button>
            </div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full">
              <tbody className="divide-y divide-brand-page-medium">
                {offerteStats.recentOffertes.slice(0, 4).map((o: Offerte) => {
                  const co = getCompany(o.companyId)
                  return (
                    <tr key={o.id} className="hover:bg-brand-page-light cursor-pointer" onClick={() => openDrawer({ type: 'offerte-detail', id: o.id })}>
                      {/* Vanaf xl op één regel afgekapt: twee regels per klant duwde het dashboard buiten het scherm */}
                      <td className="py-2.5 xl:py-1.5 pr-3 xl:max-w-0 xl:w-full">
                        <div className="text-caption text-brand-text-secondary">{o.number}</div>
                        <div className="font-semibold text-body xl:truncate" title={o.client.name}>{o.client.name}</div>
                      </td>
                      <td className="py-2.5 xl:py-1.5 pr-3">
                        <span className="text-pill px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: co.bgColor, color: co.color }}>{co.shortName}</span>
                      </td>
                      <td className="py-2.5 xl:py-1.5 pr-3 text-right text-body font-semibold">{euro(o.total)}</td>
                      <td className="py-2.5 xl:py-1.5 text-right"><OfferteStatusBadge status={o.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </div>


        {/* Recente facturen */}
        <div className="card">
          <div className="flex items-center justify-between mb-4 xl:mb-2">
            <h2 className="font-semibold text-body">Recente facturen</h2>
            <Link href="/facturen" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
              Alles <ArrowRight size={12} />
            </Link>
          </div>
          {factuurStats.recentFacturen.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-body text-brand-text-secondary mb-2">Nog geen facturen</p>
              <button onClick={() => openDrawer({ type: 'factuur-nieuw' })} className="text-caption font-semibold text-brand-purple underline underline-offset-2">Maak je eerste factuur</button>
            </div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full">
              <tbody className="divide-y divide-brand-page-medium">
                {factuurStats.recentFacturen.slice(0, 4).map((f: Factuur) => {
                  const co = getCompany(f.companyId)
                  return (
                    <tr key={f.id} className="hover:bg-brand-page-light cursor-pointer" onClick={() => openDrawer({ type: 'factuur-detail', id: f.id })}>
                      {/* Vanaf xl op één regel afgekapt: twee regels per klant duwde het dashboard buiten het scherm */}
                      <td className="py-2.5 xl:py-1.5 pr-3 xl:max-w-0 xl:w-full">
                        <div className="text-caption text-brand-text-secondary">{f.number}</div>
                        <div className="font-semibold text-body xl:truncate" title={f.client.name}>{f.client.name}</div>
                      </td>
                      <td className="py-2.5 xl:py-1.5 pr-3">
                        <span className="text-pill px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: co.bgColor, color: co.color }}>{co.shortName}</span>
                      </td>
                      <td className="py-2.5 xl:py-1.5 pr-3 text-right text-body font-semibold">{euro(f.total)}</td>
                      <td className="py-2.5 xl:py-1.5 text-right"><FactuurStatusBadge status={f.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </div>

        </div>
      </div>
    </div>
  )
}
