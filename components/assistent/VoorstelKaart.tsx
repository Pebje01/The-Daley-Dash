'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Check, FileText, Link2, Loader2, RefreshCw, X, XCircle } from 'lucide-react'
import { getCompany } from '@/lib/companies'
import { dataChanged } from '@/lib/events'
import { useDrawer } from '@/components/DrawerContext'
import type {
  FactuurNieuwPayload,
  FactuurWijzigenPayload,
  VoorstelRij,
} from '@/lib/assistent/voorstellen'

const euro = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
const datum = (d?: string) => d ? new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
/** ISO-datums in de wijzigingslijst leesbaar tonen, de rest ongemoeid laten */
const toon = (waarde: string) => /^\d{4}-\d{2}-\d{2}$/.test(waarde) ? datum(waarde) : waarde

const TITEL: Record<VoorstelRij['type'], { tekst: string; knop: string; icoon: typeof FileText }> = {
  factuur_nieuw: { tekst: 'Nieuwe factuur', knop: 'Aanmaken', icoon: FileText },
  factuur_wijzigen: { tekst: 'Factuur wijzigen', knop: 'Wijzigen', icoon: FileText },
  factuur_pdf: { tekst: 'PDF opnieuw maken', knop: 'PDF maken', icoon: RefreshCw },
  factuur_koppelen: { tekst: 'Koppelen aan factuur', knop: 'Koppelen', icoon: Link2 },
}

/**
 * Een voorstel van de assistent. Er is niets gebeurd tot je hier op de knop
 * klikt; die voert het uit via /api/assistent/voorstellen/[id]/uitvoeren.
 */
export default function VoorstelKaart({ voorstelId, startWaarde }: { voorstelId: string; startWaarde?: VoorstelRij }) {
  const { openDrawer } = useDrawer()
  const [voorstel, setVoorstel] = useState<VoorstelRij | null>(startWaarde ?? null)
  const [bezig, setBezig] = useState<'uitvoeren' | 'annuleren' | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    if (startWaarde) return
    fetch(`/api/assistent/voorstellen/${voorstelId}`)
      .then(r => r.ok ? r.json() : null)
      .then(v => v && setVoorstel(v))
      .catch(() => {})
  }, [voorstelId, startWaarde])

  if (!voorstel) {
    return (
      <div className="rounded-brand-sm border border-brand-card-border bg-brand-card-bg p-3 text-caption text-brand-text-secondary flex items-center gap-2">
        <Loader2 size={13} className="animate-spin" /> Voorstel laden
      </div>
    )
  }

  const { type, controle, status, resultaat } = voorstel
  const meta = TITEL[type]
  const Icoon = meta.icoon
  const fouten = controle?.fouten ?? []
  const waarschuwingen = controle?.waarschuwingen ?? []
  const factuurId = (resultaat?.factuurId as string | undefined) ?? controle?.factuur?.id

  async function actie(soort: 'uitvoeren' | 'annuleren') {
    setBezig(soort)
    setFout(null)
    const res = await fetch(`/api/assistent/voorstellen/${voorstelId}/${soort}`, { method: 'POST' }).catch(() => null)
    const data = await res?.json().catch(() => null)
    setBezig(null)
    if (data?.id) setVoorstel(data)
    if (!res?.ok) {
      setFout(data?.error ?? 'Dat lukte niet')
      return
    }
    if (soort === 'uitvoeren') dataChanged('facturen')
  }

  return (
    <div className={`rounded-brand-sm border bg-brand-card-bg overflow-hidden ${status === 'open' ? 'border-brand-card-border' : 'border-brand-card-border/40'}`}>
      {/* Kop */}
      <div className="flex items-center gap-2 px-3 py-2 bg-brand-lavender-accent/50 border-b border-brand-card-border/30">
        <Icoon size={14} className="text-brand-lav-accent shrink-0" />
        <span className="text-caption font-semibold text-brand-text-primary flex-1 min-w-0 truncate">
          {meta.tekst}
          {controle?.factuur && ` ${controle.factuur.nummer}`}
        </span>
        <StatusLabel status={status} />
      </div>

      <div className="px-3 py-2.5 space-y-2.5 text-caption text-brand-text-primary">
        {type === 'factuur_nieuw' && <NieuwInhoud voorstel={voorstel} />}
        {type === 'factuur_wijzigen' && <WijzigInhoud voorstel={voorstel} />}
        {(type === 'factuur_pdf' || type === 'factuur_koppelen') && controle?.factuur && (
          <p className="text-brand-text-secondary">
            {controle.factuur.klant} · {datum(controle.factuur.datum)} · {euro(controle.factuur.totaal)}
          </p>
        )}
        {type === 'factuur_koppelen' && (
          <>
            {!!controle?.uren?.length && (
              <ul className="space-y-0.5">
                {controle.uren.map(u => (
                  <li key={u.id} className="flex justify-between gap-2">
                    <span className="truncate">{datum(u.datum)} {u.omschrijving}</span>
                    <span className="shrink-0 text-brand-text-secondary">{u.uren} uur</span>
                  </li>
                ))}
              </ul>
            )}
            {controle?.wijzigingen?.map(w => <p key={w.veld}>{w.veld}: {w.nieuw}</p>)}
          </>
        )}

        {/* Wat de Dash ervan vindt */}
        {fouten.map(f => (
          <p key={f} className="flex gap-1.5 text-brand-status-red"><XCircle size={13} className="shrink-0 mt-px" />{f}</p>
        ))}
        {waarschuwingen.map(w => (
          <p key={w} className="flex gap-1.5 text-brand-status-orange"><AlertTriangle size={13} className="shrink-0 mt-px" />{w}</p>
        ))}

        {status === 'mislukt' && typeof resultaat?.fout === 'string' && (
          <p className="flex gap-1.5 text-brand-status-red"><XCircle size={13} className="shrink-0 mt-px" />{resultaat.fout}</p>
        )}
        {fout && <p className="flex gap-1.5 text-brand-status-red"><XCircle size={13} className="shrink-0 mt-px" />{fout}</p>}

        {status === 'uitgevoerd' && (
          <div className="space-y-1">
            <p className="flex gap-1.5 text-brand-status-green font-medium">
              <Check size={13} className="shrink-0 mt-px" />
              {{
                factuur_nieuw: `Factuur ${resultaat?.factuurnummer} aangemaakt`,
                factuur_wijzigen: `Factuur ${resultaat?.factuurnummer} bijgewerkt`,
                factuur_pdf: 'PDF opnieuw in de map gezet',
                factuur_koppelen: `Gekoppeld aan ${resultaat?.factuurnummer}`,
              }[type]}
            </p>
            {typeof resultaat?.pdfFout === 'string' && resultaat.pdfFout && (
              <p className="text-brand-status-orange">De gegevens staan erin, maar de PDF niet: {resultaat.pdfFout}</p>
            )}
          </div>
        )}
      </div>

      {/* Knoppen */}
      {(status === 'open' || status === 'mislukt' || (status === 'uitgevoerd' && factuurId)) && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-brand-card-border/30">
          {status === 'open' && (
            <>
              <button
                onClick={() => actie('uitvoeren')}
                disabled={!!bezig || fouten.length > 0}
                title={fouten.length ? 'Los eerst de fouten op' : undefined}
                className="btn-primary px-3 py-1.5 text-caption disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bezig === 'uitvoeren' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {bezig === 'uitvoeren' ? 'Bezig' : meta.knop}
              </button>
              <button
                onClick={() => actie('annuleren')}
                disabled={!!bezig}
                className="px-2.5 py-1.5 text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1 disabled:opacity-40"
              >
                <X size={13} /> Annuleren
              </button>
            </>
          )}
          {status === 'mislukt' && (
            <button onClick={() => actie('annuleren')} disabled={!!bezig} className="px-2.5 py-1.5 text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1">
              <X size={13} /> Wegzetten
            </button>
          )}
          {status === 'uitgevoerd' && factuurId && (
            <button onClick={() => openDrawer({ type: 'factuur-detail', id: factuurId })} className="btn-secondary px-3 py-1.5 text-caption">
              <FileText size={13} /> Open factuur
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StatusLabel({ status }: { status: VoorstelRij['status'] }) {
  const stijl: Record<VoorstelRij['status'], [string, string]> = {
    open: ['Wacht op jou', 'bg-brand-lime text-brand-text-primary'],
    bezig: ['Bezig', 'bg-brand-light-blue text-brand-blue-accent'],
    uitgevoerd: ['Uitgevoerd', 'bg-brand-status-green/15 text-brand-status-green'],
    geannuleerd: ['Geannuleerd', 'bg-gray-100 text-brand-text-secondary'],
    mislukt: ['Mislukt', 'bg-brand-status-red/10 text-brand-status-red'],
  }
  const [tekst, klasse] = stijl[status]
  return <span className={`pill ${klasse} shrink-0`}>{tekst}</span>
}

function NieuwInhoud({ voorstel }: { voorstel: VoorstelRij }) {
  const p = voorstel.payload as FactuurNieuwPayload
  const c = voorstel.controle
  const bedrijf = p.bedrijf ? getCompany(p.bedrijf) : null
  const klant = c?.klant

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-body truncate">{klant?.naam ?? p.klant?.naam}</p>
          {klant && (klant.adres || klant.stad) && (
            <p className="text-brand-text-secondary truncate">{[klant.adres, [klant.postcode, klant.stad].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>
          )}
        </div>
        {bedrijf && (
          <span className="text-pill px-1.5 py-0.5 rounded font-semibold shrink-0" style={{ backgroundColor: bedrijf.bgColor, color: bedrijf.color }}>
            {bedrijf.shortName}
          </span>
        )}
      </div>

      <p className="text-brand-text-secondary">
        {c?.verwachtNummer ?? 'Nummer volgt'} · {datum(p.factuurdatum)} · vervalt {datum(c?.vervaldatum)} · {p.status === 'verzonden' ? 'verzonden' : 'concept'}
      </p>

      <Regels regels={p.regels ?? []} />
      {c?.bedragen && <Totalen bedragen={c.bedragen} />}
    </>
  )
}

function WijzigInhoud({ voorstel }: { voorstel: VoorstelRij }) {
  const p = voorstel.payload as FactuurWijzigenPayload
  const c = voorstel.controle
  return (
    <>
      {c?.factuur && (
        <p className="text-brand-text-secondary">{c.factuur.klant} · {c.factuur.status}</p>
      )}
      {!!c?.wijzigingen?.length && (
        <ul className="space-y-1.5">
          {c.wijzigingen.filter(w => w.veld !== 'Regels').map(w => (
            <li key={w.veld}>
              <span className="text-brand-text-secondary">{w.veld}: </span>
              {w.oud && <span className="line-through text-brand-text-secondary/70 mr-1.5">{toon(w.oud)}</span>}
              <span className="font-medium">{w.nieuw ? toon(w.nieuw) : '(leeg)'}</span>
            </li>
          ))}
        </ul>
      )}
      {p.regels && (
        <>
          <p className="text-brand-text-secondary">Nieuwe regels:</p>
          <Regels regels={p.regels} />
        </>
      )}
      {c?.bedragen && <Totalen bedragen={c.bedragen} />}
    </>
  )
}

function Regels({ regels }: { regels: FactuurNieuwPayload['regels'] }) {
  return (
    <ul className="divide-y divide-brand-page-medium border-y border-brand-page-medium">
      {regels.map((r, i) => (
        <li key={i} className="py-1.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{r.omschrijving}</p>
            {(r.datum || r.detail) && (
              <p className="text-brand-text-secondary">{[datum(r.datum), r.detail].filter(Boolean).join(' · ')}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-medium">{euro(Number(r.aantal) * Number(r.prijs))}</p>
            <p className="text-brand-text-secondary">
              {r.perUur ? `${r.aantal} uur × ${euro(Number(r.prijs))}` : Number(r.aantal) !== 1 ? `${r.aantal} × ${euro(Number(r.prijs))}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Totalen({ bedragen }: { bedragen: NonNullable<VoorstelRij['controle']>['bedragen'] & object }) {
  return (
    <div className="space-y-0.5">
      <p className="flex justify-between"><span className="text-brand-text-secondary">Subtotaal</span><span>{euro(bedragen.subtotaal)}</span></p>
      <p className="flex justify-between"><span className="text-brand-text-secondary">Btw {bedragen.btwPercentage}%</span><span>{euro(bedragen.btw)}</span></p>
      <p className="flex justify-between font-semibold text-body"><span>Totaal</span><span>{euro(bedragen.totaal)}</span></p>
    </div>
  )
}
