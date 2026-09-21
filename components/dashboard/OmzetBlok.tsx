'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'

/**
 * Omzet op het dashboard: dit jaar, de gekozen maand, verwachte omzet, en een
 * staafje per maand. Stond eerst alleen op /financieel; Daley wilde het weer op
 * het dashboard zien (september 2026). Dezelfde cijfers als Financieel, uit
 * getFactuurStats, dus exclude_from_revenue en revenue_date tellen gewoon mee.
 *
 * Klik op een staaf of gebruik de pijltjes om een andere maand te bekijken.
 */

export interface OmzetMaand {
  maand: string
  label: string
  excl: number
  incl: number
  aantal: number
  ontvangen: number
}

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

/** "2026-03" wordt "mrt": de gangbare afkorting, niet de eerste drie letters ("maa"). */
function maandKort(maand: string) {
  return new Date(`${maand}-01T12:00:00`).toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '')
}

export default function OmzetBlok({
  omzetPerMaand,
  revenueYear,
  revenueYearIncl,
  verwachteOmzet,
  className = '',
}: {
  omzetPerMaand: OmzetMaand[]
  revenueYear: number
  revenueYearIncl: number
  verwachteOmzet: number
  className?: string
}) {
  // -1 = nog niet gezet: dan de laatste (huidige) maand zodra de cijfers er zijn
  const [index, setIndex] = useState(-1)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    if (index === -1 && omzetPerMaand.length > 0) setIndex(omzetPerMaand.length - 1)
  }, [omzetPerMaand.length, index])

  const gekozen = omzetPerMaand[index] ?? omzetPerMaand[omzetPerMaand.length - 1]
  const max = Math.max(...omzetPerMaand.map((m) => m.excl), 1)
  const toon = hover !== null ? omzetPerMaand[hover] : null

  return (
    <div className={`card xl:p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3 xl:mb-2">
        <h2 className="font-semibold text-body flex items-center gap-2">
          <TrendingUp size={15} className="text-brand-lav-accent" /> Omzet
          <span className="text-caption font-normal text-brand-text-secondary">ex. btw</span>
        </h2>
        <Link href="/financieel" className="text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
          Per maand in detail <ArrowRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 lg:gap-6 items-end">
        {/* De cijfers */}
        <div className="grid grid-cols-3 gap-3 self-center">
          <Link href="/facturen?periode=jaar" className="min-w-0 group">
            <p className="text-caption text-brand-text-secondary">Dit jaar</p>
            <p className="font-uxum text-sidebar-t text-brand-text-primary group-hover:underline truncate">{euro(revenueYear)}</p>
            <p className="text-caption text-brand-text-secondary truncate">incl. btw {euro(revenueYearIncl)}</p>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-0.5 -ml-1">
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index <= 0}
                aria-label="Vorige maand"
                className="p-0.5 rounded text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-30"
              >
                <ChevronLeft size={13} />
              </button>
              <p className="text-caption text-brand-text-secondary capitalize truncate">{gekozen?.label ?? 'Deze maand'}</p>
              <button
                onClick={() => setIndex((i) => Math.min(omzetPerMaand.length - 1, i + 1))}
                disabled={index >= omzetPerMaand.length - 1}
                aria-label="Volgende maand"
                className="p-0.5 rounded text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-30"
              >
                <ChevronRight size={13} />
              </button>
            </div>
            <p className="font-uxum text-sidebar-t text-brand-text-primary truncate">{euro(gekozen?.excl ?? 0)}</p>
            <p className="text-caption text-brand-text-secondary truncate">
              {(gekozen?.aantal ?? 0) === 0 ? 'geen facturen' : `${gekozen!.aantal} ${gekozen!.aantal === 1 ? 'factuur' : 'facturen'}`}
            </p>
          </div>
          <Link href="/offertes?status=akkoord" className="min-w-0 group" title="Akkoord-offertes die nog niet gefactureerd zijn, plus verstuurde offertes">
            <p className="text-caption text-brand-text-secondary">Verwacht</p>
            <p className="font-uxum text-sidebar-t text-brand-text-primary group-hover:underline truncate">{euro(verwachteOmzet)}</p>
            <p className="text-caption text-brand-text-secondary truncate">nog te komen</p>
          </Link>
        </div>

        {/* Per maand: één reeks, dus één kleur; de gekozen maand is voller */}
        {omzetPerMaand.length === 0 ? (
          <p className="text-body text-brand-text-secondary text-center py-6">Nog geen omzet dit jaar</p>
        ) : (
          <div className="min-w-0">
            <p className="text-caption text-brand-text-secondary h-4 mb-1 truncate" aria-live="polite">
              {toon ? <><span className="capitalize">{toon.label}</span>: {euro(toon.excl)}{toon.aantal ? `, ${toon.aantal} ${toon.aantal === 1 ? 'factuur' : 'facturen'}` : ''}</> : 'Per maand'}
            </p>
            <div className="flex items-end gap-[2px] h-20 xl:h-16 border-b border-brand-card-border/20" role="group" aria-label="Omzet per maand">
              {omzetPerMaand.map((m, i) => {
                const actief = i === index
                const hoogte = m.excl > 0 ? Math.max(3, (m.excl / max) * 100) : 0
                return (
                  <button
                    key={m.maand}
                    onClick={() => setIndex(i)}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    aria-label={`${m.label}: ${euro(m.excl)}`}
                    aria-pressed={actief}
                    className="flex-1 h-full flex items-end min-w-0 group"
                  >
                    <span
                      className={`block w-full rounded-t-[4px] transition-colors ${
                        actief ? 'bg-brand-lav-accent' : 'bg-brand-lav-accent/35 group-hover:bg-brand-lav-accent/60'
                      }`}
                      style={{ height: `${hoogte}%` }}
                    />
                  </button>
                )
              })}
            </div>
            <div className="flex gap-[2px] mt-1">
              {omzetPerMaand.map((m, i) => (
                <span
                  key={m.maand}
                  className={`flex-1 text-center text-pill capitalize truncate ${i === index ? 'text-brand-text-primary font-semibold' : 'text-brand-text-secondary'}`}
                >
                  {maandKort(m.maand)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
