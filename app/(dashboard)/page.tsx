'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, TrendingUp, AlertCircle, CheckCircle2, ArrowRight, FileText, Clock, RefreshCw } from 'lucide-react'
import { getCompany } from '@/lib/companies'
import { FactuurStatusBadge, OfferteStatusBadge } from '@/components/StatusBadge'
import { Offerte, Factuur, Abonnement } from '@/lib/types'
import { useActiveCompany } from '@/components/CompanyContext'

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
  const router = useRouter()
  const { activeCompany } = useActiveCompany()

  const [offerteStats, setOfferteStats] = useState<{
    conceptOffertes: number
    openOffertes: number
    totalOpenAmount: number
    akkoordOffertes: number
    akkoordAmount: number
    recentOffertes: Offerte[]
  }>({ conceptOffertes: 0, openOffertes: 0, totalOpenAmount: 0, akkoordOffertes: 0, akkoordAmount: 0, recentOffertes: [] })

  const [factuurStats, setFactuurStats] = useState<{
    openFacturen: number
    totalOpenAmount: number
    overdueFacturen: number
    paidThisMonth: number
    revenueYear: number
    revenueYearIncl: number
    revenueMonth: number
    revenueMonthIncl: number
    recentFacturen: Factuur[]
  }>({ openFacturen: 0, totalOpenAmount: 0, overdueFacturen: 0, paidThisMonth: 0, revenueYear: 0, revenueYearIncl: 0, revenueMonth: 0, revenueMonthIncl: 0, recentFacturen: [] })

  const [abonnementen, setAbonnementen] = useState<Abonnement[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/offertes/stats').then(r => r.ok ? r.json() : null),
      fetch('/api/facturen/stats').then(r => r.ok ? r.json() : null),
      fetch('/api/abonnementen?status=actief').then(r => r.ok ? r.json() : null),
    ]).then(([off, fac, abo]) => {
      if (off) setOfferteStats(off)
      if (fac) setFactuurStats(fac)
      if (abo) setAbonnementen(abo)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchData() }
    window.addEventListener('focus', fetchData)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', fetchData)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchData])

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Goedemorgen' : now.getHours() < 18 ? 'Goedemiddag' : 'Goedenavond'
  const mrr = calcMRR(abonnementen)
  const activeAbonnementen = abonnementen.filter(a => a.status === 'actief').length

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">{greeting}, Daley</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            {now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={fetchData} className="btn-secondary" title="Vernieuwen">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <Link href={`/offertes/nieuw?bedrijf=${activeCompany}`} className="btn-secondary">
            <Plus size={15} /> Nieuwe offerte
          </Link>
          <Link href={`/facturen/nieuw?bedrijf=${activeCompany}`} className="btn-primary">
            <Plus size={15} /> Nieuwe factuur
          </Link>
        </div>
      </div>

      {/* KPI Cards — gebaseerd op betaalde facturen */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Link href="/facturen?status=betaald" className="card hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start justify-between mb-3">
            <p className="text-caption text-brand-text-secondary">Omzet dit jaar</p>
            <div className="w-8 h-8 rounded-brand-sm bg-brand-lavender-accent flex items-center justify-center">
              <CheckCircle2 size={17} className="text-brand-lav-accent" />
            </div>
          </div>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(factuurStats.revenueYear)}</p>
          <p className="text-caption text-brand-text-secondary mt-1">incl. btw: {euro(factuurStats.revenueYearIncl)}</p>
        </Link>

        <Link href="/facturen?status=betaald" className="card hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start justify-between mb-3">
            <p className="text-caption text-brand-text-secondary">Omzet deze maand</p>
            <div className="w-8 h-8 rounded-brand-sm bg-brand-lime flex items-center justify-center">
              <TrendingUp size={17} className="text-brand-lime-accent" />
            </div>
          </div>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(factuurStats.revenueMonth)}</p>
          <p className="text-caption text-brand-text-secondary mt-1">incl. btw: {euro(factuurStats.revenueMonthIncl)}</p>
        </Link>

        <Link href="/facturen?status=verzonden" className="card hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-start justify-between mb-3">
            <p className="text-caption text-brand-text-secondary">Openstaande facturen</p>
            <div className="w-8 h-8 rounded-brand-sm bg-brand-light-blue flex items-center justify-center">
              <FileText size={17} className="text-brand-blue-accent" />
            </div>
          </div>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(factuurStats.totalOpenAmount)}</p>
          <p className="text-caption text-brand-text-secondary mt-1">{factuurStats.openFacturen} facturen openstaand</p>
        </Link>

        <Link href="/facturen?status=te-laat" className={`card hover:shadow-md transition-shadow cursor-pointer ${factuurStats.overdueFacturen > 0 ? 'border-red-200 bg-red-50' : ''}`}>
          <div className="flex items-start justify-between mb-3">
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

      {/* Pipeline + MRR strip */}
      <div className="card mb-6 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-body">Pipeline</h2>
          <Link href="/offertes" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
            Alle offertes <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/offertes?status=concept" className="rounded-brand-sm bg-brand-page-light border border-brand-card-border p-3 hover:bg-brand-page-medium transition-colors">
            <p className="text-caption text-brand-text-secondary mb-1">Concept</p>
            <p className="font-semibold text-body text-brand-text-primary">{offerteStats.conceptOffertes}</p>
          </Link>
          <Link href="/offertes?status=verstuurd" className="rounded-brand-sm bg-brand-light-blue border border-brand-card-border p-3 hover:opacity-80 transition-opacity">
            <p className="text-caption text-brand-text-secondary mb-1">Verstuurd</p>
            <p className="font-semibold text-body text-brand-text-primary">{offerteStats.openOffertes} · {euro(offerteStats.totalOpenAmount)}</p>
          </Link>
          <Link href="/offertes?status=akkoord" className="rounded-brand-sm bg-brand-lime border border-brand-card-border p-3 hover:opacity-80 transition-opacity">
            <p className="text-caption text-brand-text-secondary mb-1">Akkoord</p>
            <p className="font-semibold text-body text-brand-text-primary">{offerteStats.akkoordOffertes} · {euro(offerteStats.akkoordAmount)}</p>
          </Link>
          <Link href="/abonnementen" className="rounded-brand-sm bg-brand-lavender-accent border border-brand-card-border p-3 hover:opacity-80 transition-opacity">
            <p className="text-caption text-brand-text-secondary mb-1">MRR ({activeAbonnementen} abo&apos;s)</p>
            <p className="font-semibold text-body text-brand-text-primary">{euro(mrr)}/mnd</p>
          </Link>
        </div>
      </div>

      {/* Recente tabellen */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Recente offertes */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-body">Recente offertes</h2>
            <Link href="/offertes" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
              Alles <ArrowRight size={12} />
            </Link>
          </div>
          {offerteStats.recentOffertes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-body text-brand-text-secondary mb-2">Nog geen offertes</p>
              <Link href="/offertes/nieuw" className="text-caption font-semibold text-brand-purple underline underline-offset-2">Maak je eerste offerte</Link>
            </div>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-brand-page-medium">
                {offerteStats.recentOffertes.map((o: Offerte) => {
                  const co = getCompany(o.companyId)
                  return (
                    <tr key={o.id} className="hover:bg-brand-page-light cursor-pointer" onClick={() => router.push(`/offertes/${o.id}`)}>
                      <td className="py-2.5 pr-3">
                        <div className="text-caption text-brand-text-secondary">{o.number}</div>
                        <div className="font-semibold text-body">{o.client.name}</div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="text-pill px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: co.bgColor, color: co.color }}>{co.shortName}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-body font-semibold">{euro(o.total)}</td>
                      <td className="py-2.5 text-right"><OfferteStatusBadge status={o.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Recente facturen */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-body">Recente facturen</h2>
            <Link href="/facturen" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
              Alles <ArrowRight size={12} />
            </Link>
          </div>
          {factuurStats.recentFacturen.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-body text-brand-text-secondary mb-2">Nog geen facturen</p>
              <Link href="/facturen/nieuw" className="text-caption font-semibold text-brand-purple underline underline-offset-2">Maak je eerste factuur</Link>
            </div>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-brand-page-medium">
                {factuurStats.recentFacturen.map((f: Factuur) => {
                  const co = getCompany(f.companyId)
                  return (
                    <tr key={f.id} className="hover:bg-brand-page-light cursor-pointer" onClick={() => router.push(`/facturen/${f.id}`)}>
                      <td className="py-2.5 pr-3">
                        <div className="text-caption text-brand-text-secondary">{f.number}</div>
                        <div className="font-semibold text-body">{f.client.name}</div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="text-pill px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: co.bgColor, color: co.color }}>{co.shortName}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-body font-semibold">{euro(f.total)}</td>
                      <td className="py-2.5 text-right"><FactuurStatusBadge status={f.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Betalingen + Abonnementen */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Link href="/facturen" className="card hover:shadow-md transition-shadow cursor-pointer block">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-body">Betalingen overzicht</h2>
            <Clock size={15} className="text-brand-text-secondary" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-3">
              <p className="text-caption text-brand-text-secondary mb-1">Betaald deze maand</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(factuurStats.paidThisMonth)}</p>
            </div>
            <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-3">
              <p className="text-caption text-brand-text-secondary mb-1">Openstaand</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(factuurStats.totalOpenAmount)}</p>
            </div>
            <div className={`rounded-brand-sm border p-3 ${factuurStats.overdueFacturen > 0 ? 'border-red-200 bg-red-50' : 'border-brand-card-border bg-brand-card-bg'}`}>
              <p className="text-caption text-brand-text-secondary mb-1">Te laat</p>
              <p className={`font-semibold text-body ${factuurStats.overdueFacturen > 0 ? 'text-red-600' : 'text-brand-text-primary'}`}>
                {factuurStats.overdueFacturen} factuur{factuurStats.overdueFacturen !== 1 ? 'en' : ''}
              </p>
            </div>
          </div>
        </Link>

        <Link href="/abonnementen" className="card hover:shadow-md transition-shadow cursor-pointer block">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-body">Abonnementen</h2>
            <ArrowRight size={15} className="text-brand-text-secondary" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-3">
              <p className="text-caption text-brand-text-secondary mb-1">Actief</p>
              <p className="font-semibold text-body text-brand-text-primary">{activeAbonnementen}</p>
            </div>
            <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-3">
              <p className="text-caption text-brand-text-secondary mb-1">MRR</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(mrr)}</p>
            </div>
            <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-3">
              <p className="text-caption text-brand-text-secondary mb-1">ARR</p>
              <p className="font-semibold text-body text-brand-text-primary">{euro(mrr * 12)}</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
