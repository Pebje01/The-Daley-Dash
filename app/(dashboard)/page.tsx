'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, TrendingUp, AlertCircle, CheckCircle2, ArrowRight, FileText } from 'lucide-react'
import { getCompany } from '@/lib/companies'
import { FactuurStatusBadge, OfferteStatusBadge } from '@/components/StatusBadge'
import { Offerte, Factuur } from '@/lib/types'
import { useActiveCompany } from '@/components/CompanyContext'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function Dashboard() {
  const router = useRouter()
  const { activeCompany } = useActiveCompany()
  const [offerteStats, setOfferteStats] = useState<{
    openOffertes: number
    totalOpenAmount: number
    openMonthCount: number
    openMonthAmount: number
    revenueYear: number
    revenueYearIncl: number
    revenueMonth: number
    revenueMonthIncl: number
    recentOffertes: Offerte[]
  }>({ openOffertes: 0, totalOpenAmount: 0, openMonthCount: 0, openMonthAmount: 0, revenueYear: 0, revenueYearIncl: 0, revenueMonth: 0, revenueMonthIncl: 0, recentOffertes: [] })
  const [factuurStats, setFactuurStats] = useState<{
    totalOpenAmount: number
    paidThisMonth: number
    recentFacturen: Factuur[]
  }>({ totalOpenAmount: 0, paidThisMonth: 0, recentFacturen: [] })

  const fetchData = useCallback(() => {
    fetch('/api/offertes/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setOfferteStats(data) })
      .catch(() => {})

    fetch('/api/facturen/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setFactuurStats(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchData()

    const onFocus = () => fetchData()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchData()
    })
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchData])

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Goedemorgen' : now.getHours() < 18 ? 'Goedemiddag' : 'Goedenavond'

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">{greeting}, Daley</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            {now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/offertes/nieuw?bedrijf=${activeCompany}`} className="btn-secondary">
            <Plus size={15} /> Nieuwe offerte
          </Link>
          <Link href={`/facturen/nieuw?bedrijf=${activeCompany}`} className="btn-primary">
            <Plus size={15} /> Nieuwe factuur
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Openstaand bedrag', value: euro(offerteStats.totalOpenAmount), icon: <AlertCircle size={17} className="text-brand-status-orange" />, bg: 'bg-brand-pink', sub: `${offerteStats.openOffertes} openstaande offertes` },
          { label: 'Openstaand deze maand', value: euro(offerteStats.openMonthAmount), icon: <TrendingUp size={17} className="text-brand-lime-accent" />, bg: 'bg-brand-lime', sub: `${offerteStats.openMonthCount} verstuurd deze maand` },
          { label: 'Omzet dit jaar', value: euro(offerteStats.revenueYear), icon: <CheckCircle2 size={17} className="text-brand-lav-accent" />, bg: 'bg-brand-lavender-accent', sub: `incl. btw: ${euro(offerteStats.revenueYearIncl)}` },
          { label: 'Omzet deze maand', value: euro(offerteStats.revenueMonth), icon: <FileText size={17} className="text-brand-blue-accent" />, bg: 'bg-brand-light-blue', sub: `incl. btw: ${euro(offerteStats.revenueMonthIncl)}` },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="flex items-start justify-between mb-3">
              <p className="text-caption text-brand-text-secondary">{s.label}</p>
              <div className={`w-8 h-8 rounded-brand-sm ${s.bg} flex items-center justify-center`}>{s.icon}</div>
            </div>
            <p className="font-uxum text-stat text-brand-text-primary">{s.value}</p>
            {s.sub && <p className="text-caption text-brand-text-secondary mt-1">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
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
        <RecentTable
          title="Recente facturen"
          href="/facturen"
          items={factuurStats.recentFacturen}
          emptyHref="/facturen/nieuw"
          emptyCta="Maak je eerste factuur"
          renderRow={(f: any) => {
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
          }}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-body">Betalingen</h2>
            <Link href="/betalingen" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
              Openen <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-brand border-brand border-brand-card-border bg-brand-card-bg p-3">
              <p className="text-caption text-brand-text-secondary mb-1">Binnengekomen deze maand</p>
              <p className="font-semibold text-body">{euro(factuurStats.paidThisMonth)}</p>
            </div>
            <div className="rounded-brand border-brand border-brand-card-border bg-brand-card-bg p-3">
              <p className="text-caption text-brand-text-secondary mb-1">Openstaand</p>
              <p className="font-semibold text-body">{euro(factuurStats.totalOpenAmount)}</p>
            </div>
            <div className="rounded-brand border-brand border-brand-card-border bg-brand-card-bg p-3">
              <p className="text-caption text-brand-text-secondary mb-1">Mollie</p>
              <p className="font-semibold text-body">Onderin / technisch</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-body">Abonnementen</h2>
            <Link href="/abonnementen" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
              Openen <ArrowRight size={12} />
            </Link>
          </div>
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-card-bg p-4">
            <p className="text-body text-brand-text-primary mb-1">Fase 1 structuur staat klaar</p>
            <p className="text-caption text-brand-text-secondary">
              Lijst met lopende abonnementen, voorwaarden en contractdetails kun je hierna invullen.
            </p>
          </div>
        </div>
      </div>

      <div className="card mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-body">Mollie betalingen (technisch)</h2>
          <Link href="/betalingen" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
            Naar betalingen <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-3">
            <p className="text-caption text-brand-text-secondary mb-1">Koppelingstatus</p>
            <p className="font-semibold text-body">Nog in te richten</p>
          </div>
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-3">
            <p className="text-caption text-brand-text-secondary mb-1">Binnengekomen via Mollie</p>
            <p className="font-semibold text-body">Wordt gekoppeld</p>
          </div>
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-3">
            <p className="text-caption text-brand-text-secondary mb-1">Sync / logs</p>
            <p className="font-semibold text-body">Komt onderaan te staan</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function RecentTable({ title, href, items, emptyHref, emptyCta, renderRow }: any) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-body">{title}</h2>
        <Link href={href} className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
          Alles <ArrowRight size={12} />
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-body text-brand-text-secondary mb-2">Nog niets hier</p>
          <Link href={emptyHref} className="text-caption font-semibold text-brand-purple underline underline-offset-2">{emptyCta}</Link>
        </div>
      ) : (
        <table className="w-full"><tbody className="divide-y divide-brand-page-medium">{items.map(renderRow)}</tbody></table>
      )}
    </div>
  )
}
