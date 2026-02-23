'use client'
import { useEffect, useState } from 'react'
import { getFacturen } from '@/lib/store'
import { getCompany } from '@/lib/companies'
import { Offerte } from '@/lib/types'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function KlantenPage() {
  const [clients, setClients] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      // Fetch offertes from Supabase API
      let offertes: Offerte[] = []
      try {
        const res = await fetch('/api/offertes')
        if (res.ok) offertes = await res.json()
      } catch {}

      const facturen = getFacturen()
      const map: Record<string, any> = {}

      offertes.forEach(o => {
        const key = o.client.name.toLowerCase()
        if (!map[key]) map[key] = { name: o.client.name, email: o.client.email, offertes: 0, facturen: 0, totalBilled: 0, companies: new Set() }
        map[key].offertes++
        map[key].companies.add(o.companyId)
      })

      facturen.forEach(f => {
        const key = f.client.name.toLowerCase()
        if (!map[key]) map[key] = { name: f.client.name, email: f.client.email, offertes: 0, facturen: 0, totalBilled: 0, companies: new Set() }
        map[key].facturen++
        map[key].totalBilled += f.total
        map[key].companies.add(f.companyId)
      })

      setClients(Object.values(map).map(c => ({ ...c, companies: Array.from(c.companies) })))
    }
    load()
  }, [])

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-uxum text-sidebar-t text-brand-text-primary">Klanten</h1>
        <p className="text-body text-brand-text-secondary mt-0.5">{clients.length} klanten</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-body">
          <thead className="bg-brand-page-light border-b border-brand-page-medium">
            <tr>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Naam</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">E-mail</th>
              <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrijven</th>
              <th className="text-center px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Offertes</th>
              <th className="text-center px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Facturen</th>
              <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Totaal gefactureerd</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-page-medium">
            {clients.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-brand-text-secondary">Klanten verschijnen hier zodra je offertes of facturen aanmaakt</td></tr>
            ) : clients.sort((a, b) => b.totalBilled - a.totalBilled).map(c => (
              <tr key={c.name} className="hover:bg-brand-page-light">
                <td className="px-5 py-3.5 font-semibold text-brand-text-primary">{c.name}</td>
                <td className="px-5 py-3.5 text-brand-text-secondary">{c.email || '–'}</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1 flex-wrap">
                    {c.companies.map((id: string) => {
                      const co = getCompany(id)
                      return <span key={id} className="text-pill px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: co.bgColor, color: co.color }}>{co.shortName}</span>
                    })}
                  </div>
                </td>
                <td className="px-5 py-3.5 text-center text-brand-text-primary">{c.offertes}</td>
                <td className="px-5 py-3.5 text-center text-brand-text-primary">{c.facturen}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-brand-text-primary">{euro(c.totalBilled)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
