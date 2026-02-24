'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Download, Check } from 'lucide-react'
import { Offerte, Company, LineItem } from '@/lib/types'
import { COMPANIES } from '@/lib/companies'
import { downloadOffertePdf } from '@/lib/pdf/offertePdf'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function groupBySection(items: LineItem[]) {
  return items.reduce<{ title: string; items: LineItem[] }[]>((acc, item) => {
    const title = item.sectionTitle || ''
    const last = acc[acc.length - 1]
    if (last && last.title === title) {
      last.items.push(item)
    } else {
      acc.push({ title, items: [item] })
    }
    return acc
  }, [])
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const normalized = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function OffertePublicPage() {
  const { slug } = useParams<{ slug: string }>()
  const [offerte, setOfferte] = useState<Offerte | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')


  const loadOfferte = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/offerte-public/${slug}`)
      if (!res.ok) {
        setError('Offerte niet gevonden')
        setLoading(false)
        return
      }
      const data = await res.json()
      setOfferte(data)
      setCompany(COMPANIES.find((c) => c.id === data.companyId) ?? COMPANIES[0])
    } catch {
      setError('Er ging iets mis bij het laden van de offerte')
    }
    setLoading(false)
  }, [slug])

  useEffect(() => {
    loadOfferte()
  }, [loadOfferte])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Offerte laden...</p>
        </div>
      </div>
    )
  }

  if (error || !offerte || !company) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f7f7f5]">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
          <h1 className="text-xl font-bold mb-2">Offerte niet gevonden</h1>
          <p className="text-sm text-gray-500">Deze offerte bestaat niet of is niet meer actief.</p>
        </div>
      </div>
    )
  }

  const sections = groupBySection(offerte.items)
  const serviceSections = sections.filter(s => s.title.toLowerCase() !== 'prijsoverzicht')
  const brand = company.color
  const brandSoft = hexToRgba(brand, 0.06)
  const brandSoftBorder = hexToRgba(brand, 0.14)
  const brandTextSoft = hexToRgba(brand, 0.78)
  const isApproved = offerte.status === 'akkoord'

  if (isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f7f7f5]">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-[22px] shadow-lg p-10 text-center border border-gray-100">
            <div
              className="flex items-center justify-center w-16 h-16 rounded-full mx-auto mb-6"
              style={{ backgroundColor: brand }}
            >
              <Check size={28} className="text-white" />
            </div>
            <h1 className="text-3xl font-semibold mb-3" style={{ color: brand }}>
              Offerte goedgekeurd
            </h1>
            <p className="text-gray-600 mb-2">
              Bedankt! Offerte <strong>{offerte.number}</strong> is succesvol goedgekeurd.
            </p>
            <p className="text-gray-500 text-sm mb-8">
              We nemen contact met je op voor de volgende stappen.
            </p>

            <div className="rounded-2xl p-5 text-left text-sm space-y-2 mb-8 bg-gray-50 border border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-500">Bedrag</span>
                <span className="font-semibold" style={{ color: brand }}>{euro(offerte.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Offerte</span>
                <span>{offerte.number}</span>
              </div>
            </div>

            <button
              onClick={() => downloadOffertePdf(offerte, company)}
              className="inline-flex items-center gap-2 border-2 px-5 py-3 rounded-xl font-semibold transition hover:bg-gray-50"
              style={{ borderColor: brand, color: brand }}
            >
              <Download size={16} />
              Download Offerte als PDF
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] py-8 px-4 lg:px-6 xl:px-8">
      <div className="w-full max-w-[1680px] mx-auto rounded-[28px] shadow-lg overflow-hidden bg-white border border-gray-100">
        <div className="p-8 lg:p-14" style={{ backgroundColor: brand }}>
          <div className="text-center mb-8">
            <h2 className="text-4xl lg:text-5xl font-instrument text-white font-light tracking-tight">OFFERTE</h2>
          </div>

          <div className="flex flex-col lg:flex-row justify-between gap-10 items-start">
            <div>
              <h3 className="text-lg font-instrument text-white mb-2 font-light">Klantgegevens</h3>
              <div className="space-y-0.5 text-xs text-white/80">
                <p className="font-medium text-white">{offerte.client.name}</p>
                {offerte.client.contactPerson && <p>t.a.v. {offerte.client.contactPerson}</p>}
                {offerte.client.email && <p>{offerte.client.email}</p>}
                {offerte.client.phone && <p>{offerte.client.phone}</p>}
              </div>
            </div>

            <div className="text-left lg:text-right">
              <h3 className="font-instrument text-lg text-white mb-1 font-light">{company.name}</h3>
              <div className="space-y-0.5 text-xs text-white/80">
                <p>{company.address}</p>
                <p>{company.email} | {company.phone}</p>
                <p className="text-white/60">KVK: {company.kvk} | BTW: {company.btw}</p>
              </div>
              <div className="flex flex-wrap gap-5 mt-4 pt-3 border-t border-white/20 lg:justify-end">
                <div>
                  <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-0.5">Offertenummer</p>
                  <p className="text-xs text-white font-medium">{offerte.number}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-0.5">Datum</p>
                  <p className="text-xs text-white font-medium">{formatDate(offerte.date)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-0.5">Geldig tot</p>
                  <p className="text-xs text-white font-medium">{formatDate(offerte.validUntil)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-16 bg-white">
          {/* Intro tekst */}
          {offerte.introText && (
            <div className="mb-16 text-center">
              <p className="text-base text-gray-500 font-light leading-relaxed max-w-3xl mx-auto whitespace-pre-wrap">
                {offerte.introText}
              </p>
            </div>
          )}

          {/* Zwart klantgegevens vlak */}
          <div className="mb-20">
            <div className="bg-[#1a1a1a] rounded-[20px] p-10 text-white">
              <h2 className="text-2xl font-instrument text-white/90 mb-8 font-light tracking-tight">Klantgegevens</h2>
              <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Bedrijfsnaam</p>
                  <p className="text-base text-white border-b border-white/20 pb-3">{offerte.client.name}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Contactpersoon</p>
                  <p className="text-base text-white border-b border-white/20 pb-3">{offerte.client.contactPerson || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Email</p>
                  <p className="text-base text-white border-b border-white/20 pb-3">{offerte.client.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Telefoonnummer</p>
                  <p className="text-base text-white border-b border-white/20 pb-3">{offerte.client.phone || '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Diensten secties */}
          {serviceSections.length > 0 && (
            <div className="mb-20 pb-12 border-b border-gray-200">
              <div className="space-y-6">
                {serviceSections.map((section, sIdx) => (
                  <div
                    key={sIdx}
                    className="rounded-[20px] p-8 border"
                    style={{ background: `linear-gradient(135deg, ${brandSoft}, transparent)`, borderColor: brandSoftBorder }}
                  >
                    {section.title && (
                      <h4 className="font-semibold text-[20px] mb-4" style={{ color: brand }}>
                        {section.title}
                      </h4>
                    )}
                    <ul className="space-y-2 text-sm text-gray-500">
                      {section.items.map((item) => (
                        <li key={item.id} className="flex items-start">
                          <span className="mr-3" style={{ color: brand }}>•</span>
                          <span>
                            <strong className="text-gray-800">{item.description}</strong>
                            {item.details && <span className="text-gray-500"> — {item.details}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-12 pb-12 border-b border-gray-200">
            <h3 className="text-xl font-instrument mb-8 font-light tracking-tight" style={{ color: brand }}>
              <strong>Prijsoverzicht</strong>
            </h3>

            <div className="max-w-md ml-auto text-sm">
              <div className="flex justify-between py-2 pt-3 mt-2 border-t border-gray-200">
                <span className="font-semibold text-gray-800">Subtotaal</span>
                <span className="font-semibold">{euro(offerte.subtotal)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-700">BTW {offerte.btwPercentage}%</span>
                <span className="font-semibold">{euro(offerte.btwAmount)}</span>
              </div>
              <div
                className="flex justify-between py-3 mt-2 px-4 rounded-lg border"
                style={{ backgroundColor: brandSoft, borderColor: brandSoftBorder }}
              >
                <span className="font-semibold text-lg" style={{ color: brand }}>Totaal incl. btw</span>
                <span className="font-semibold text-lg" style={{ color: brand }}>{euro(offerte.total)}</span>
              </div>
              <div
                className="mt-4 rounded-lg p-4 flex justify-between items-center"
                style={{ backgroundColor: brand }}
              >
                <div>
                  <span className="font-bold text-white text-base">Aanbetaling (50%)</span>
                  <p className="text-white/70 text-xs mt-0.5">Restant bij oplevering: {euro(offerte.total / 2)}</p>
                </div>
                <span className="font-bold text-white text-xl">{euro(offerte.total / 2)}</span>
              </div>
            </div>
          </div>

          {(offerte.termsText || offerte.notes) && (
            <div className="mb-10">
              <div className="rounded-[20px] p-8 lg:p-10 text-white" style={{ backgroundColor: brand }}>
                <h3 className="text-2xl font-instrument text-white/90 mb-4 font-light">Voorwaarden &amp; Opmerkingen</h3>
                <ul className="space-y-2 text-white/85 leading-relaxed">
                  {(offerte.termsText || offerte.notes || '').split('\n').filter(line => line.trim()).map((line, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="text-white/50 mt-0.5">•</span>
                      <span>{line.replace(/^[-•]\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Acties onderaan */}
          <div className="text-center space-y-4 pb-4">
            {offerte.paymentUrl && (
              <>
                <a
                  href={offerte.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-12 py-4 rounded-2xl font-bold text-white text-lg shadow-lg transition hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
                >
                  Betaal aanbetaling — {euro(offerte.total / 2)}
                </a>
                <p className="text-xs text-gray-400">Veilig betalen via KNAB</p>
              </>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => downloadOffertePdf(offerte, company)}
                className="inline-flex items-center gap-2 bg-white border-2 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition"
                style={{ borderColor: brand, color: brand }}
              >
                <Download size={16} />
                Download PDF
              </button>
              <a
                href={`mailto:${company.email}?subject=Vraag%20over%20offerte%20${encodeURIComponent(offerte.number)}`}
                className="inline-flex items-center gap-2 bg-white border-2 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition"
                style={{ borderColor: brand, color: brand }}
              >
                Stel een vraag
              </a>
            </div>
          </div>
        </div>

        <div className="text-center py-6 px-4 text-xs text-gray-400 border-t border-gray-100">
          {company.name} · KVK: {company.kvk} · BTW: {company.btw}
          {offerte.approvedAt && (
            <span style={{ color: brandTextSoft }}>
              {' '}· Goedgekeurd op {new Date(offerte.approvedAt).toLocaleDateString('nl-NL')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
