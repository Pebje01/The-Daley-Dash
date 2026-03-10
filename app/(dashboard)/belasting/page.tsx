'use client'
import { useEffect, useState, useCallback } from 'react'
import { Landmark, RefreshCw, Info, TrendingUp, Receipt, PiggyBank, Calculator, Building2 } from 'lucide-react'
import type { IBBreakdown, KwartaalData, MaandData } from '@/lib/belasting'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

interface GroepStats {
  label: string
  bedrijven: string[]
  totaalOmzetExcl: number
  totaalBtw: number
  btwDitKwartaal: number
  geprojecteerdeJaaromzet: number
  kwartalen: KwartaalData[]
  maanden: MaandData[]
  ibWerkelijk: IBBreakdown
  ibProjectie: IBBreakdown
  maandelijkseIBReservering: number
}

interface BelastingResponse {
  jaar: number
  huidigKwartaal: number
  eigen: GroepStats
  apart: GroepStats[]
}

export default function BelastingPage() {
  const [data, setData] = useState<BelastingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/belasting/stats')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `API fout (${res.status})`)
      }
      setData(await res.json())
    } catch (e: any) {
      setError(e.message || 'Kon belastingdata niet ophalen')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading && !data) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-brand-page-medium rounded w-48" />
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
        <h1 className="font-uxum text-headline text-brand-text-primary mb-4">Belasting</h1>
        <div className="card border-red-200 bg-red-50 flex items-center justify-between">
          <p className="text-body text-red-600">{error}</p>
          <button onClick={fetchData} className="btn-secondary">
            <RefreshCw size={14} /> Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { eigen, apart, jaar, huidigKwartaal: huidigKw } = data

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">Belasting</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            BTW overzicht en inkomstenbelasting indicatie {jaar}
          </p>
        </div>
        <button onClick={fetchData} className="btn-secondary" title="Vernieuwen">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ═══ EIGEN BEDRIJVEN (TDE + WGB + DPH) ═══ */}
      <GroepSectie
        groep={eigen}
        jaar={jaar}
        huidigKw={huidigKw}
        toonIB
        toonMaandoverzicht
      />

      {/* ═══ APARTE BEDRIJVEN ═══ */}
      {apart.filter(g => g.totaalOmzetExcl > 0 || g.totaalBtw > 0).map(groep => (
        <div key={groep.label} className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-brand-text-secondary" />
            <h2 className="font-uxum text-subtitle text-brand-text-primary">{groep.label}</h2>
          </div>
          <GroepSectie
            groep={groep}
            jaar={jaar}
            huidigKw={huidigKw}
            toonIB={false}
            toonMaandoverzicht={false}
          />
        </div>
      ))}

      {/* Lege state voor aparte bedrijven */}
      {apart.every(g => g.totaalOmzetExcl === 0 && g.totaalBtw === 0) && (
        <div className="mt-10 card text-center py-8">
          <Building2 size={24} className="text-brand-text-secondary mx-auto mb-2" />
          <p className="text-body text-brand-text-secondary">
            Geen omzet voor Bleijenberg of Montung in {jaar}
          </p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Groep sectie component — herbruikbaar voor eigen + apart
// ═══════════════════════════════════════════════════════════════

function GroepSectie({ groep, jaar, huidigKw, toonIB, toonMaandoverzicht }: {
  groep: GroepStats
  jaar: number
  huidigKw: number
  toonIB: boolean
  toonMaandoverzicht: boolean
}) {
  const totaalOpzijZetten = groep.totaalBtw + groep.ibWerkelijk.geschatteIB

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="flex items-start justify-between mb-3">
            <p className="text-caption text-brand-text-secondary">BTW dit kwartaal</p>
            <div className="w-8 h-8 rounded-brand-sm bg-brand-light-blue flex items-center justify-center">
              <Receipt size={17} className="text-brand-blue-accent" />
            </div>
          </div>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(groep.btwDitKwartaal)}</p>
          <p className="text-caption text-brand-text-secondary mt-1">Q{huidigKw} af te dragen</p>
        </div>

        <div className="card">
          <div className="flex items-start justify-between mb-3">
            <p className="text-caption text-brand-text-secondary">BTW dit jaar</p>
            <div className="w-8 h-8 rounded-brand-sm bg-brand-lavender-accent flex items-center justify-center">
              <Landmark size={17} className="text-brand-lav-accent" />
            </div>
          </div>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(groep.totaalBtw)}</p>
          <p className="text-caption text-brand-text-secondary mt-1">totaal {jaar}</p>
        </div>

        {toonIB ? (
          <div className="card">
            <div className="flex items-start justify-between mb-3">
              <p className="text-caption text-brand-text-secondary">Geschatte IB</p>
              <div className="w-8 h-8 rounded-brand-sm bg-brand-pink flex items-center justify-center">
                <Calculator size={17} className="text-brand-status-orange" />
              </div>
            </div>
            <p className="font-uxum text-stat text-brand-text-primary">{euro(groep.ibProjectie.geschatteIB)}</p>
            <p className="text-caption text-brand-text-secondary mt-1">op basis van projectie</p>
          </div>
        ) : (
          <div className="card">
            <div className="flex items-start justify-between mb-3">
              <p className="text-caption text-brand-text-secondary">Omzet excl. BTW</p>
              <div className="w-8 h-8 rounded-brand-sm bg-brand-pink flex items-center justify-center">
                <TrendingUp size={17} className="text-brand-status-orange" />
              </div>
            </div>
            <p className="font-uxum text-stat text-brand-text-primary">{euro(groep.totaalOmzetExcl)}</p>
            <p className="text-caption text-brand-text-secondary mt-1">totaal {jaar}</p>
          </div>
        )}

        <div className="card">
          <div className="flex items-start justify-between mb-3">
            <p className="text-caption text-brand-text-secondary">Totaal opzij zetten</p>
            <div className="w-8 h-8 rounded-brand-sm bg-brand-lime flex items-center justify-center">
              <PiggyBank size={17} className="text-brand-lime-accent" />
            </div>
          </div>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(totaalOpzijZetten)}</p>
          <p className="text-caption text-brand-text-secondary mt-1">{toonIB ? 'BTW + IB reservering' : 'BTW reservering'}</p>
        </div>
      </div>

      {/* BTW per kwartaal */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-body">BTW per kwartaal</h2>
          <span className="text-caption text-brand-text-secondary">21% over gefactureerde omzet</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {groep.kwartalen.map(kw => {
            const isHuidig = kw.kwartaal === huidigKw
            return (
              <div
                key={kw.kwartaal}
                className={`rounded-brand-sm border p-4 ${
                  isHuidig
                    ? 'border-brand-lime-accent bg-brand-lime/30'
                    : 'border-brand-card-border bg-brand-card-bg'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-body text-brand-text-primary">{kw.label}</p>
                  {isHuidig && (
                    <span className="pill bg-brand-lime text-brand-text-primary text-pill font-semibold px-2 py-0.5">
                      Huidig
                    </span>
                  )}
                </div>
                <p className="text-caption text-brand-text-secondary mb-1">{kw.maanden}</p>
                <div className="space-y-1 mt-3">
                  <div className="flex justify-between text-caption">
                    <span className="text-brand-text-secondary">Omzet excl.</span>
                    <span className="text-brand-text-primary font-medium">{euro(kw.omzetExcl)}</span>
                  </div>
                  <div className="flex justify-between text-caption">
                    <span className="text-brand-text-secondary">BTW (21%)</span>
                    <span className="text-brand-text-primary font-semibold">{euro(kw.btwBedrag)}</span>
                  </div>
                  <div className="flex justify-between text-caption pt-1 border-t border-brand-card-border">
                    <span className="text-brand-text-secondary">Offertes</span>
                    <span className="text-brand-text-primary">{kw.aantalFacturen}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* IB breakdown + Jaarprojectie (alleen voor eigen bedrijven) */}
      {toonIB && (
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* IB Berekening */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-body">Inkomstenbelasting indicatie</h2>
              <TrendingUp size={15} className="text-brand-text-secondary" />
            </div>

            <div className="space-y-2">
              <Row label="Bruto winst (omzet excl. BTW)" value={euro(groep.ibProjectie.brutoWinst)} />
              <Row label="Zelfstandigenaftrek" value={`- ${euro(groep.ibProjectie.zelfstandigenaftrek)}`} muted />
              <Row label="Winst na aftrek" value={euro(groep.ibProjectie.winstNaAftrek)} />
              <Row label="MKB-winstvrijstelling (13,31%)" value={`- ${euro(groep.ibProjectie.mkbVrijstelling)}`} muted />
              <div className="border-t border-brand-card-border pt-2">
                <Row label="Belastbaar inkomen" value={euro(groep.ibProjectie.belastbaarInkomen)} bold />
              </div>
              <Row label={`Schijf 1 (36,97% tot ${euro(75518)})`} value={euro(groep.ibProjectie.belastingSchijf1)} muted />
              {groep.ibProjectie.belastingSchijf2 > 0 && (
                <Row label="Schijf 2 (49,50%)" value={euro(groep.ibProjectie.belastingSchijf2)} muted />
              )}
              <Row label="Bruto belasting" value={euro(groep.ibProjectie.brutoBelasting)} />
              <Row label="Algemene heffingskorting" value={`- ${euro(groep.ibProjectie.algemeneHeffingskorting)}`} muted />
              <Row label="Arbeidskorting" value={`- ${euro(groep.ibProjectie.arbeidskorting)}`} muted />
              <div className="border-t border-brand-card-border pt-2">
                <Row label="Geschatte inkomstenbelasting" value={euro(groep.ibProjectie.geschatteIB)} bold highlight />
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 p-3 rounded-brand-sm bg-brand-page-light">
              <Info size={14} className="text-brand-text-secondary mt-0.5 flex-shrink-0" />
              <p className="text-caption text-brand-text-secondary">
                Grove schatting op basis van projectie ({euro(groep.geprojecteerdeJaaromzet)}).
                Kosten buiten zelfstandigenaftrek niet meegenomen. Raadpleeg je boekhouder.
              </p>
            </div>
          </div>

          {/* Jaarprojectie samenvatting */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-body">Jaaroverzicht {jaar}</h2>
              <PiggyBank size={15} className="text-brand-text-secondary" />
            </div>

            <div className="space-y-3">
              <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-4">
                <p className="text-caption text-brand-text-secondary mb-1">Omzet excl. BTW (werkelijk)</p>
                <p className="font-uxum text-stat text-brand-text-primary">{euro(groep.totaalOmzetExcl)}</p>
              </div>
              <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-4">
                <p className="text-caption text-brand-text-secondary mb-1">Geprojecteerde jaaromzet</p>
                <p className="font-uxum text-stat text-brand-text-primary">{euro(groep.geprojecteerdeJaaromzet)}</p>
              </div>
              <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-4">
                <p className="text-caption text-brand-text-secondary mb-1">Maandelijks opzij zetten</p>
                <p className="font-uxum text-stat text-brand-text-primary">
                  {euro(groep.maandelijkseIBReservering + (groep.totaalBtw / Math.max(1, new Date().getMonth() + 1)))}
                </p>
                <p className="text-caption text-brand-text-secondary mt-1">
                  {euro(groep.totaalBtw / Math.max(1, new Date().getMonth() + 1))} BTW + {euro(groep.maandelijkseIBReservering)} IB
                </p>
              </div>
              <div className="rounded-brand-sm border border-brand-lime-accent bg-brand-lime/20 p-4">
                <p className="text-caption text-brand-text-secondary mb-1">Netto na belasting (schatting)</p>
                <p className="font-uxum text-stat text-brand-text-primary">
                  {euro(groep.geprojecteerdeJaaromzet - groep.ibProjectie.geschatteIB)}
                </p>
                <p className="text-caption text-brand-text-secondary mt-1">
                  {euro((groep.geprojecteerdeJaaromzet - groep.ibProjectie.geschatteIB) / 12)}/maand
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Maandoverzicht tabel */}
      {toonMaandoverzicht && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-body">Maandoverzicht {jaar}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-card-border">
                  <th className="text-left text-caption text-brand-text-secondary font-medium py-2 pr-4">Maand</th>
                  <th className="text-right text-caption text-brand-text-secondary font-medium py-2 px-4">Omzet excl.</th>
                  <th className="text-right text-caption text-brand-text-secondary font-medium py-2 px-4">BTW</th>
                  <th className="text-right text-caption text-brand-text-secondary font-medium py-2 px-4">IB reservering</th>
                  <th className="text-right text-caption text-brand-text-secondary font-medium py-2 pl-4">Totaal opzij</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-page-medium">
                {groep.maanden.map(m => {
                  const huidigeMaand = new Date().getMonth()
                  const isHuidig = m.maand === huidigeMaand
                  const isVerleden = m.maand < huidigeMaand
                  const ibReservering = m.omzetExcl > 0 ? groep.maandelijkseIBReservering : 0
                  const totaalOpzij = m.btwBedrag + ibReservering

                  if (!isVerleden && !isHuidig) {
                    return (
                      <tr key={m.maand} className="text-brand-text-secondary/40">
                        <td className="py-2.5 pr-4 text-body">{m.label}</td>
                        <td className="py-2.5 px-4 text-right text-body">-</td>
                        <td className="py-2.5 px-4 text-right text-body">-</td>
                        <td className="py-2.5 px-4 text-right text-body">-</td>
                        <td className="py-2.5 pl-4 text-right text-body">-</td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={m.maand} className={isHuidig ? 'bg-brand-lime/10' : 'hover:bg-brand-page-light'}>
                      <td className="py-2.5 pr-4">
                        <span className="text-body text-brand-text-primary font-medium">{m.label}</span>
                        {isHuidig && (
                          <span className="ml-2 pill bg-brand-lime text-brand-text-primary text-pill font-semibold px-1.5 py-0.5">
                            Nu
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right text-body text-brand-text-primary">{euro(m.omzetExcl)}</td>
                      <td className="py-2.5 px-4 text-right text-body text-brand-text-primary">{euro(m.btwBedrag)}</td>
                      <td className="py-2.5 px-4 text-right text-body text-brand-text-primary">{euro(ibReservering)}</td>
                      <td className="py-2.5 pl-4 text-right text-body font-semibold text-brand-text-primary">{euro(totaalOpzij)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-text-primary/20">
                  <td className="py-3 pr-4 font-semibold text-body text-brand-text-primary">Totaal</td>
                  <td className="py-3 px-4 text-right font-semibold text-body text-brand-text-primary">{euro(groep.totaalOmzetExcl)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-body text-brand-text-primary">{euro(groep.totaalBtw)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-body text-brand-text-primary">{euro(groep.ibWerkelijk.geschatteIB)}</td>
                  <td className="py-3 pl-4 text-right font-semibold text-body text-brand-text-primary">{euro(groep.totaalBtw + groep.ibWerkelijk.geschatteIB)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

// Helper component voor IB breakdown rijen
function Row({ label, value, muted, bold, highlight }: {
  label: string
  value: string
  muted?: boolean
  bold?: boolean
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-caption ${muted ? 'text-brand-text-secondary' : 'text-brand-text-primary'}`}>
        {label}
      </span>
      <span className={`text-caption ${
        highlight ? 'text-brand-status-green font-bold text-body' :
        bold ? 'text-brand-text-primary font-semibold' :
        muted ? 'text-brand-text-secondary' : 'text-brand-text-primary font-medium'
      }`}>
        {value}
      </span>
    </div>
  )
}
