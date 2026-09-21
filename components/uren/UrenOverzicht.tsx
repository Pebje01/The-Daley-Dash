'use client'

import { ArrowRight, Clock } from 'lucide-react'
import type { Uur, UurKlant, UurProject } from '@/lib/types'
import { COMPANIES } from '@/lib/companies'

/**
 * De startpagina van de urenregistratie: per klant wat er nog openstaat.
 *
 * Open = nog niet gefactureerd. Maand maakt niet uit: zodra er een factuur van
 * gemaakt is, vallen de uren eruit (gefactureerd = true) en de losse projecten
 * ook (status gefactureerd). Wat hier staat is dus precies wat je nog kunt
 * factureren, of het nu uit augustus of september komt.
 *
 * De pagina haalt al alleen open uren en actieve projecten op, dus dit telt
 * gewoon op wat er is.
 */

const BTW = 0.21

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function urenTekst(n: number) {
  return `${n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} u`
}

function datumKort(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

interface KlantStand {
  klant: UurKlant
  uren: number
  urenBedrag: number
  regels: number
  projectBedrag: number
  projecten: number
  oudste: string | null
  laatste: string | null
  dezeMaandUren: number
}

export default function UrenOverzicht({
  klanten,
  uren,
  projecten,
  onKies,
}: {
  klanten: UurKlant[]
  uren: Uur[]
  projecten: UurProject[]
  onKies: (klantId: string) => void
}) {
  const nu = new Date()
  const maandPrefix = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}`
  const maandNaam = nu.toLocaleDateString('nl-NL', { month: 'long' })

  const standen: KlantStand[] = klanten.map((klant) => {
    const u = uren.filter((x) => x.klant === klant.naam && !x.gefactureerd)
    const p = projecten.filter((x) => x.klant === klant.naam && x.status === 'actief')
    const datums = u.map((x) => x.datum).sort()
    return {
      klant,
      uren: u.reduce((s, x) => s + x.uren, 0),
      urenBedrag: u.reduce((s, x) => s + x.uren * x.uurtarief, 0),
      regels: u.length,
      projectBedrag: p.reduce((s, x) => s + (x.bedrag || 0), 0),
      projecten: p.length,
      oudste: datums[0] ?? null,
      laatste: datums[datums.length - 1] ?? null,
      dezeMaandUren: u.filter((x) => x.datum.startsWith(maandPrefix)).reduce((s, x) => s + x.uren, 0),
    }
  })

  const open = (s: KlantStand) => s.regels > 0 || s.projecten > 0
  // Actieve klanten altijd; een gearchiveerde alleen als er nog iets openstaat,
  // anders zou je geld vergeten dat er nog ligt
  const zichtbaar = standen
    .filter((s) => !s.klant.gearchiveerdOp || open(s))
    .sort((a, b) => (b.urenBedrag + b.projectBedrag) - (a.urenBedrag + a.projectBedrag) || a.klant.naam.localeCompare(b.klant.naam))

  const totaal = {
    uren: standen.reduce((s, x) => s + x.uren, 0),
    ex: standen.reduce((s, x) => s + x.urenBedrag + x.projectBedrag, 0),
    klanten: standen.filter(open).length,
    dezeMaand: standen.reduce((s, x) => s + x.dezeMaandUren, 0),
  }

  return (
    <div className="space-y-5">
      {/* Totaal: wat er in totaal nog te factureren valt */}
      <div className="card grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Cijfer label="Open uren" waarde={urenTekst(totaal.uren)} sub={totaal.dezeMaand > 0 ? `waarvan ${urenTekst(totaal.dezeMaand)} in ${maandNaam}` : undefined} />
        <Cijfer label="Te factureren ex. btw" waarde={euro(totaal.ex)} />
        <Cijfer label="Incl. btw (21%)" waarde={euro(totaal.ex * (1 + BTW))} />
        <Cijfer label="Klanten met open uren" waarde={String(totaal.klanten)} />
      </div>

      {zichtbaar.length === 0 ? (
        <div className="card p-8 text-center text-brand-text-secondary">
          Nog geen klanten. Voeg er een toe met Nieuwe klant.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {zichtbaar.map((s) => (
            <KlantBlok key={s.klant.id} stand={s} maandNaam={maandNaam} onKies={() => onKies(s.klant.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Cijfer({ label, waarde, sub }: { label: string; waarde: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-brand-text-secondary">{label}</p>
      <p className="font-uxum text-sidebar-t text-brand-text-primary truncate">{waarde}</p>
      {sub && <p className="text-caption text-brand-text-secondary truncate">{sub}</p>}
    </div>
  )
}

function KlantBlok({ stand: s, maandNaam, onKies }: { stand: KlantStand; maandNaam: string; onKies: () => void }) {
  const bedrijf = COMPANIES.find((c) => c.id === s.klant.companyId)
  const ex = s.urenBedrag + s.projectBedrag
  const leeg = s.regels === 0 && s.projecten === 0

  return (
    <button
      onClick={onKies}
      className={`card text-left w-full flex flex-col gap-3 transition-all hover:shadow-md hover:-translate-y-px ${leeg ? 'opacity-60 hover:opacity-100' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-brand-text-primary truncate flex items-center gap-2">
            {bedrijf && (
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: bedrijf.color }} title={bedrijf.name} />
            )}
            {s.klant.naam}
          </p>
          <p className="text-caption text-brand-text-secondary">
            {s.klant.klantnummer && <span className="font-mono tracking-wider">{s.klant.klantnummer}</span>}
            {s.klant.klantnummer && s.klant.standaardUurtarief > 0 && ' · '}
            {s.klant.standaardUurtarief > 0 && `${euro(s.klant.standaardUurtarief)} per uur`}
            {s.klant.gearchiveerdOp && ' · gearchiveerd'}
          </p>
        </div>
        <span className="text-caption text-brand-text-secondary flex items-center gap-1 shrink-0">
          Openen <ArrowRight size={12} />
        </span>
      </div>

      {leeg ? (
        <p className="text-caption text-brand-text-secondary flex items-center gap-1.5">
          <Clock size={12} /> Niets open, alles is gefactureerd
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-caption text-brand-text-secondary">Open uren</p>
              <p className="text-body font-semibold text-brand-text-primary">{urenTekst(s.uren)}</p>
            </div>
            <div>
              <p className="text-caption text-brand-text-secondary">Ex. btw</p>
              <p className="text-body font-semibold text-brand-text-primary">{euro(ex)}</p>
            </div>
            <div>
              <p className="text-caption text-brand-text-secondary">Incl. btw</p>
              <p className="text-body font-semibold text-brand-text-primary">{euro(ex * (1 + BTW))}</p>
            </div>
          </div>
          <p className="text-caption text-brand-text-secondary">
            {s.regels > 0 && `${s.regels} ${s.regels === 1 ? 'regel' : 'regels'}`}
            {s.regels > 0 && s.oudste && s.oudste !== s.laatste && `, ${datumKort(s.oudste)} t/m ${datumKort(s.laatste!)}`}
            {s.regels > 0 && s.oudste && s.oudste === s.laatste && `, ${datumKort(s.oudste)}`}
            {s.dezeMaandUren > 0 && s.dezeMaandUren !== s.uren && ` · ${urenTekst(s.dezeMaandUren)} in ${maandNaam}`}
            {s.projecten > 0 && `${s.regels > 0 ? ' · ' : ''}${s.projecten} los${s.projecten === 1 ? ' project' : 'se projecten'} (${euro(s.projectBedrag)})`}
          </p>
        </>
      )}
    </button>
  )
}
