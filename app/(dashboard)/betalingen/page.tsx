'use client'

import Link from 'next/link'
import { ArrowRight, CreditCard, RefreshCw } from 'lucide-react'
import { getDashboardStats } from '@/lib/store'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function BetalingenPage() {
  const stats = getDashboardStats()
  const paidThisMonth = stats.recentFacturen.filter((f) => f.status === 'betaald')
  const recentPayments = paidThisMonth.slice(0, 8)

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">Betalingen</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            Overzicht van ontvangen betalingen, openstaand saldo en Mollie (onderaan).
          </p>
        </div>
        <Link href="/facturen" className="btn-secondary">
          Facturen bekijken <ArrowRight size={14} />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Binnengekomen deze maand</p>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(stats.totalPaidThisMonth)}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Openstaand bedrag</p>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(stats.totalOpenAmount)}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Ontvangen betalingen (lijst)</p>
          <p className="font-uxum text-stat text-brand-text-primary">{recentPayments.length}</p>
          <p className="text-caption text-brand-text-secondary mt-1">Tijdelijk op basis van lokale facturen</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-body">Binnengekomen betalingen (deze maand / recent)</h2>
          <button className="btn-secondary py-1.5">
            <RefreshCw size={13} /> Vernieuwen
          </button>
        </div>

        {recentPayments.length === 0 ? (
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-5">
            <p className="text-body text-brand-text-primary">Nog geen betalingen zichtbaar</p>
            <p className="text-caption text-brand-text-secondary mt-1">
              Zodra facturen als betaald gemarkeerd worden, verschijnen ze hier.
            </p>
          </div>
        ) : (
          <table className="w-full text-body">
            <thead className="bg-brand-page-light border-b border-brand-page-medium">
              <tr>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Factuur</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Klant</th>
                <th className="text-left px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Betaald op</th>
                <th className="text-right px-4 py-2.5 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-page-medium">
              {recentPayments.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-3 font-semibold">{f.number}</td>
                  <td className="px-4 py-3">{f.client.name}</td>
                  <td className="px-4 py-3 text-brand-text-secondary">
                    {f.paidAt ? new Date(f.paidAt).toLocaleDateString('nl-NL') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{euro(f.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard size={15} />
          <h2 className="font-semibold text-body">Mollie (onderaan / technisch)</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-4">
            <p className="text-caption text-brand-text-secondary mb-1">Koppeling</p>
            <p className="font-semibold text-body">Nog niet gekoppeld / in te richten</p>
          </div>
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-4">
            <p className="text-caption text-brand-text-secondary mb-1">Sync logs</p>
            <p className="font-semibold text-body">Komt hier</p>
          </div>
          <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-4">
            <p className="text-caption text-brand-text-secondary mb-1">Webhook status</p>
            <p className="font-semibold text-body">Komt hier</p>
          </div>
        </div>
      </div>
    </div>
  )
}
