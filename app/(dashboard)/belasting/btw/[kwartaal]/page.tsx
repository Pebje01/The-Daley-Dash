'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Receipt, Landmark, PiggyBank, Calculator, Upload, RefreshCw, Info,
  CheckCircle2, AlertTriangle, Trash2, Plus, FileText, ArrowRight, Banknote,
} from 'lucide-react'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n || 0)
}
function datumNL(s: string | null) {
  if (!s) return '-'
  const d = new Date(s)
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: '2-digit' })
}

interface Berekening {
  omzet1aExcl: number; omzet1aBtw: number
  correctieExcl: number; correctieBtw: number
  verlegdGrondslag: number; verlegdBtw: number
  voorbelastingNl: number; voorbelastingVerlegd: number; voorbelastingTotaal: number
  verschuldigd: number; teBetalen: number; aantalKosten: number
}
interface Factuur {
  id: string; number: string; company_id: string; client_name: string
  date: string; status: string; subtotal: number; btw_amount: number; total: number
  paid_at: string | null; bank_tx: any; betaald_in_kwartaal: boolean
}
interface Transactie {
  id: string; datum: string; bedrag: number; credit_debet: string
  tegenrekeninghouder: string; omschrijving: string; categorie: string
  categorie_handmatig: boolean; factuur_id: string | null; factuur_nummer: string | null
}
interface Kostenpost {
  id: string; leverancier: string; datum: string | null; bedrag_incl: number
  bedrag_excl: number; btw_bedrag: number; btw_behandeling: string
  land: string | null; aftrekbaar_pct: number; bron: string | null; notitie: string | null
}
interface BtwData {
  kwartaal: { kwartaal: string; jaar: number; nummer: number; start: string; eind: string; label: string; maanden: string }
  aangifte: any
  facturen: Factuur[]
  transacties: Transactie[]
  kosten: Kostenpost[]
  reconciliatie: {
    omzetOntvangsten: Transactie[]
    ontvangstenZonderFactuur: Transactie[]
    facturenZonderOntvangst: Factuur[]
    omzetOntvangenBank: number
  }
  berekening: Berekening
  meta: { bankImportAanwezig: boolean; aantalTransacties: number }
}

const CATEGORIE_LABEL: Record<string, string> = {
  omzet: 'Omzet', zakelijke_kost: 'Zakelijke kost', kosten_retour: 'Kosten retour',
  btw_afdracht: 'BTW-afdracht', intern_spaarpot: 'Intern (spaarpot)',
  prive_overboeking: 'Prive overboeking', prive_lening: 'Prive lening',
  prive_overig: 'Prive', onbekend: 'Onbekend',
}

/** Aangifte-deadline: einde van de maand na het kwartaaleinde. */
function deadline(eind: string) {
  const d = new Date(eind)
  const dl = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0))
  return dl.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function BtwAangiftePage({ params }: { params: { kwartaal: string } }) {
  const router = useRouter()
  const [data, setData] = useState<BtwData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/belasting/btw/${params.kwartaal}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fout ${res.status}`)
      setData(await res.json())
    } catch (e: any) {
      setError(e.message || 'Kon data niet laden')
    }
    setLoading(false)
  }, [params.kwartaal])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function handleImport(file: File) {
    setBusy('import')
    try {
      const csv = await file.text()
      const res = await fetch(`/api/belasting/btw/${params.kwartaal}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Import mislukt')
      setToast(`${body.geimporteerd} transacties geimporteerd, ${body.gematcht} aan facturen gekoppeld`)
      await fetchData()
    } catch (e: any) {
      setToast(`Import mislukt: ${e.message}`)
    }
    setBusy(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleResetBank() {
    if (!confirm('Alle geimporteerde banktransacties van dit kwartaal verwijderen?')) return
    setBusy('reset')
    await fetch(`/api/belasting/btw/${params.kwartaal}/import`, { method: 'DELETE' })
    await fetchData()
    setBusy(null)
  }

  async function setTransactieCategorie(id: string, categorie: string) {
    await fetch(`/api/belasting/btw/${params.kwartaal}/transactie/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categorie }),
    })
    fetchData()
  }

  async function patchAangifte(velden: Record<string, any>) {
    await fetch(`/api/belasting/btw/${params.kwartaal}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(velden),
    })
    fetchData()
  }

  if (loading && !data) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-brand-page-medium rounded w-64" />
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
        <h1 className="font-uxum text-headline text-brand-text-primary mb-4">BTW-aangifte</h1>
        <div className="card border-red-200 bg-red-50 flex items-center justify-between">
          <p className="text-body text-red-600">{error}</p>
          <button onClick={fetchData} className="btn-secondary"><RefreshCw size={14} /> Opnieuw</button>
        </div>
      </div>
    )
  }
  if (!data) return null

  const { kwartaal, berekening: b, reconciliatie: rec, facturen, kosten, transacties } = data
  const grondslag = data.aangifte.grondslag || 'kasstelsel'
  const isKas = grondslag === 'kasstelsel'

  // Bank-samenvatting per categorie
  const perCat = new Map<string, { n: number; som: number }>()
  for (const t of transacties) {
    const g = perCat.get(t.categorie) || { n: 0, som: 0 }
    g.n++; g.som += Number(t.bedrag)
    perCat.set(t.categorie, g)
  }

  const kwartaalOpties: string[] = []
  for (let j = kwartaal.jaar; j >= kwartaal.jaar - 1; j--) {
    for (let q = 4; q >= 1; q--) kwartaalOpties.push(`${j}-Q${q}`)
  }

  return (
    <div className="p-8 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">BTW-aangifte {kwartaal.label}</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            Zakelijke kwartaalaangifte ({kwartaal.maanden}). Uiterste datum: <span className="font-medium text-brand-text-primary">{deadline(kwartaal.eind)}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={grondslag}
            onChange={e => patchAangifte({ grondslag: e.target.value })}
            className="input py-1.5 text-body"
            title="Kasstelsel = BTW op ontvangst (bank leidend). Factuurstelsel = BTW op factuurdatum."
          >
            <option value="kasstelsel">Kasstelsel</option>
            <option value="factuurstelsel">Factuurstelsel</option>
          </select>
          <select
            value={kwartaal.kwartaal}
            onChange={e => router.push(`/belasting/btw/${e.target.value}`)}
            className="input py-1.5 text-body"
          >
            {kwartaalOpties.map(k => <option key={k} value={k}>{k.replace('-', ' ')}</option>)}
          </select>
          <button onClick={fetchData} className="btn-secondary" title="Vernieuwen">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={<Receipt size={17} className="text-brand-blue-accent" />} bg="bg-brand-light-blue"
          label="Omzet excl. BTW" waarde={euro(b.omzet1aExcl + b.correctieExcl)}
          sub={b.correctieExcl ? `incl. correctie ${euro(b.correctieExcl)}` : 'rubriek 1a'} />
        <KpiCard icon={<Landmark size={17} className="text-brand-lav-accent" />} bg="bg-brand-lavender-accent"
          label="Verschuldigde BTW" waarde={euro(b.verschuldigd)} sub="over omzet + verlegd" />
        <KpiCard icon={<PiggyBank size={17} className="text-brand-lime-accent" />} bg="bg-brand-lime"
          label="Voorbelasting" waarde={euro(b.voorbelastingTotaal)} sub={`${b.aantalKosten} kostenposten`} />
        <KpiCard icon={<Calculator size={17} className="text-brand-status-orange" />} bg="bg-brand-pink"
          label={b.teBetalen >= 0 ? 'Te betalen' : 'Terug te ontvangen'} waarde={euro(Math.abs(b.teBetalen))}
          sub="saldo aangifte" highlight />
      </div>

      {/* Bank import */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Banknote size={16} className="text-brand-text-secondary" />
            <h2 className="font-semibold text-body">Bankcontrole (Knab)</h2>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f) }} />
            <button onClick={() => fileRef.current?.click()} className="btn-primary" disabled={busy === 'import'}>
              <Upload size={14} /> {busy === 'import' ? 'Bezig...' : data.meta.bankImportAanwezig ? 'Opnieuw importeren' : 'Knab CSV importeren'}
            </button>
            {data.meta.bankImportAanwezig && (
              <button onClick={handleResetBank} className="btn-secondary" disabled={busy === 'reset'} title="Verwijderen">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        {!data.meta.bankImportAanwezig ? (
          <p className="text-caption text-brand-text-secondary">
            Nog geen bankexport geladen. Upload je Knab-transactieoverzicht van dit kwartaal om je facturen tegen je werkelijke ontvangsten te leggen.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {['omzet', 'zakelijke_kost', 'kosten_retour', 'intern_spaarpot', 'prive_overboeking', 'prive_lening', 'prive_overig', 'btw_afdracht'].map(cat => {
              const g = perCat.get(cat)
              if (!g) return null
              return (
                <div key={cat} className="rounded-brand-sm border border-brand-card-border bg-brand-page-light px-3 py-2">
                  <p className="text-pill text-brand-text-secondary">{CATEGORIE_LABEL[cat]}</p>
                  <p className="text-caption font-semibold text-brand-text-primary">{euro(g.som)} <span className="text-brand-text-secondary font-normal">({g.n})</span></p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Omzet */}
      <div className="card mb-6">
        <h2 className="font-semibold text-body mb-1">{isKas ? 'Betaalde omzet (kasbasis)' : 'Omzet: facturen vs bank'}</h2>
        <p className="text-caption text-brand-text-secondary mb-4">
          {isKas
            ? `Grondslag = facturen die in ${kwartaal.label} betaald zijn (op betaaldatum), eigen bedrijven, Montung apart. Zet een factuur op 'betaald' met de juiste betaaldatum en hij valt vanzelf in het goede kwartaal. Een bankimport is optionele controle.`
            : `Grondslag = facturen met factuurdatum in ${kwartaal.label} (eigen bedrijven, Montung apart). De bank laat zien of het echt binnen is.`}
        </p>
        <div className="overflow-x-auto">
          {isKas ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-card-border text-caption text-brand-text-secondary">
                  <th className="text-left font-medium py-2 pr-3">Betaald op</th>
                  <th className="text-left font-medium py-2 px-3">Klant</th>
                  <th className="text-left font-medium py-2 px-3">Factuur</th>
                  <th className="text-right font-medium py-2 px-3">Excl.</th>
                  <th className="text-right font-medium py-2 px-3">BTW</th>
                  <th className="text-right font-medium py-2 pl-3">Incl.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-page-medium">
                {facturen.map(f => (
                  <tr key={f.id} className="hover:bg-brand-page-light">
                    <td className="py-2 pr-3 text-caption text-brand-text-secondary whitespace-nowrap">{datumNL(f.paid_at)}</td>
                    <td className="py-2 px-3 text-caption text-brand-text-primary">{f.client_name}</td>
                    <td className="py-2 px-3 text-caption text-brand-text-secondary whitespace-nowrap">{f.number} <span className="text-brand-text-secondary/70">| factuurdatum {datumNL(f.date)}</span></td>
                    <td className="py-2 px-3 text-caption text-right text-brand-text-primary whitespace-nowrap">{euro(f.subtotal)}</td>
                    <td className="py-2 px-3 text-caption text-right text-brand-text-secondary whitespace-nowrap">{euro(f.btw_amount)}</td>
                    <td className="py-2 pl-3 text-caption text-right font-medium text-brand-text-primary whitespace-nowrap">{euro(f.total)}</td>
                  </tr>
                ))}
                {facturen.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-caption text-brand-text-secondary">Nog geen facturen betaald in dit kwartaal. Zet betaalde facturen op &lsquo;betaald&rsquo; met de juiste betaaldatum.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-text-primary/20 font-semibold text-caption text-brand-text-primary">
                  <td className="py-2 pr-3" colSpan={3}>Totaal betaald dit kwartaal</td>
                  <td className="py-2 px-3 text-right">{euro(b.omzet1aExcl)}</td>
                  <td className="py-2 px-3 text-right">{euro(b.omzet1aBtw)}</td>
                  <td className="py-2 pl-3 text-right">{euro(b.omzet1aExcl + b.omzet1aBtw)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-card-border text-caption text-brand-text-secondary">
                  <th className="text-left font-medium py-2 pr-3">Factuur</th>
                  <th className="text-left font-medium py-2 px-3">Klant</th>
                  <th className="text-left font-medium py-2 px-3">Datum</th>
                  <th className="text-right font-medium py-2 px-3">Excl.</th>
                  <th className="text-right font-medium py-2 px-3">BTW</th>
                  <th className="text-right font-medium py-2 px-3">Incl.</th>
                  <th className="text-left font-medium py-2 pl-3">Bank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-page-medium">
                {facturen.map(f => (
                  <tr key={f.id} className="hover:bg-brand-page-light">
                    <td className="py-2 pr-3 text-caption font-medium text-brand-text-primary whitespace-nowrap">{f.number}</td>
                    <td className="py-2 px-3 text-caption text-brand-text-primary">{f.client_name}</td>
                    <td className="py-2 px-3 text-caption text-brand-text-secondary whitespace-nowrap">{datumNL(f.date)}</td>
                    <td className="py-2 px-3 text-caption text-right text-brand-text-primary whitespace-nowrap">{euro(f.subtotal)}</td>
                    <td className="py-2 px-3 text-caption text-right text-brand-text-secondary whitespace-nowrap">{euro(f.btw_amount)}</td>
                    <td className="py-2 px-3 text-caption text-right font-medium text-brand-text-primary whitespace-nowrap">{euro(f.total)}</td>
                    <td className="py-2 pl-3">
                      {f.betaald_in_kwartaal ? (
                        <span className="pill bg-brand-lime/60 text-brand-text-primary inline-flex items-center gap-1 text-pill"><CheckCircle2 size={11} /> ontvangen</span>
                      ) : (
                        <span className="pill bg-brand-page-medium text-brand-text-secondary inline-flex items-center gap-1 text-pill">geen match {kwartaal.label}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {facturen.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-caption text-brand-text-secondary">Geen facturen in dit kwartaal.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-text-primary/20 font-semibold text-caption text-brand-text-primary">
                  <td className="py-2 pr-3" colSpan={3}>Totaal facturen</td>
                  <td className="py-2 px-3 text-right">{euro(b.omzet1aExcl)}</td>
                  <td className="py-2 px-3 text-right">{euro(b.omzet1aBtw)}</td>
                  <td className="py-2 px-3 text-right">{euro(b.omzet1aExcl + b.omzet1aBtw)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Controle bij kasbasis: facturen die nog niet ontvangen zijn */}
        {isKas && rec.facturenZonderOntvangst.length > 0 && (
          <div className="mt-5 rounded-brand-sm border border-brand-card-border bg-brand-page-light p-4">
            <h3 className="font-semibold text-caption text-brand-text-primary mb-1">Betaald gemarkeerd, geen bankmatch ({rec.facturenZonderOntvangst.length})</h3>
            <p className="text-pill text-brand-text-secondary mb-3">Deze facturen staan als betaald in dit kwartaal, maar ik vind geen bijbehorende bijschrijving in de geïmporteerde bank. Controleer of de betaaldatum klopt.</p>
            <div className="space-y-1">
              {rec.facturenZonderOntvangst.map(f => (
                <div key={f.id} className="flex items-center justify-between text-caption">
                  <span className="text-brand-text-primary">{f.number} · {f.client_name}</span>
                  <span className="text-brand-text-secondary">{euro(f.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ontvangsten zonder factuur */}
        {rec.ontvangstenZonderFactuur.length > 0 && (
          <div className="mt-5 rounded-brand-sm border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={15} className="text-amber-600" />
              <h3 className="font-semibold text-caption text-brand-text-primary">Ontvangsten zonder gekoppelde factuur ({rec.ontvangstenZonderFactuur.length})</h3>
            </div>
            <p className="text-pill text-brand-text-secondary mb-3">Bijschrijvingen die als omzet zijn herkend maar (nog) geen factuur in de app hebben. Controleer of hier een factuur bij hoort.</p>
            <div className="space-y-1.5">
              {rec.ontvangstenZonderFactuur.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 text-caption bg-white/70 rounded px-3 py-2">
                  <div className="min-w-0">
                    <span className="font-medium text-brand-text-primary">{t.tegenrekeninghouder || 'Onbekend'}</span>
                    <span className="text-brand-text-secondary"> · {datumNL(t.datum)} · {t.omschrijving || 'geen omschrijving'}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-semibold text-brand-text-primary whitespace-nowrap">{euro(t.bedrag)}</span>
                    <select value={t.categorie} onChange={e => setTransactieCategorie(t.id, e.target.value)}
                      className="input py-1 text-pill">
                      {Object.entries(CATEGORIE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Correctie eerdere periode */}
      <CorrectieBlok aangifte={data.aangifte} onSave={patchAangifte} />

      {/* Voorbelasting / kosten */}
      <KostenBlok kwartaal={params.kwartaal} kosten={kosten} onChange={fetchData} setToast={setToast} berekening={b} />

      {/* Invulhulp */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={16} className="text-brand-text-secondary" />
          <h2 className="font-semibold text-body">Invulhulp Mijn Belastingdienst</h2>
        </div>
        <p className="text-caption text-brand-text-secondary mb-4">Neem deze bedragen over in je digitale aangifte.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-caption">
            <thead>
              <tr className="border-b border-brand-card-border text-brand-text-secondary">
                <th className="text-left font-medium py-2 pr-3 w-16">Rubriek</th>
                <th className="text-left font-medium py-2 px-3">Omschrijving</th>
                <th className="text-right font-medium py-2 px-3">Bedrag</th>
                <th className="text-right font-medium py-2 pl-3">Omzetbelasting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-page-medium">
              <RubriekRij code="1a" oms={`Omzet hoog tarief${b.correctieExcl ? ' (incl. correctie vorige periode)' : ''}`}
                bedrag={b.omzet1aExcl + b.correctieExcl} btw={b.omzet1aBtw + b.correctieBtw} />
              {b.verlegdBtw > 0 && (
                <RubriekRij code="4b" oms="Diensten uit het buitenland (btw verlegd)" bedrag={b.verlegdGrondslag} btw={b.verlegdBtw} />
              )}
              <RubriekRij code="5a" oms="Verschuldigde omzetbelasting" bedrag={null} btw={b.verschuldigd} bold />
              <RubriekRij code="5b" oms="Voorbelasting" bedrag={null} btw={b.voorbelastingTotaal} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-text-primary/20">
                <td className="py-3 pr-3" />
                <td className="py-3 px-3 font-semibold text-brand-text-primary">{b.teBetalen >= 0 ? 'Te betalen' : 'Terug te ontvangen'}</td>
                <td />
                <td className="py-3 pl-3 text-right font-bold text-brand-status-green text-body">{euro(Math.abs(b.teBetalen))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-4 flex items-start gap-2 p-3 rounded-brand-sm bg-brand-page-light">
          <Info size={14} className="text-brand-text-secondary mt-0.5 flex-shrink-0" />
          <p className="text-pill text-brand-text-secondary">
            Voorbereiding en controle, geen belastingadvies. Verlegde BTW (buitenlandse diensten) staat zowel bij 4b als in de voorbelasting, per saldo doorgaans nul. Controleer alles voor je indient.
          </p>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-brand-text-primary text-white text-caption px-4 py-2.5 rounded-brand-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

function KpiCard({ icon, bg, label, waarde, sub, highlight }: {
  icon: React.ReactNode; bg: string; label: string; waarde: string; sub: string; highlight?: boolean
}) {
  return (
    <div className={`card ${highlight ? 'border-brand-lime-accent' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-caption text-brand-text-secondary">{label}</p>
        <div className={`w-8 h-8 rounded-brand-sm ${bg} flex items-center justify-center`}>{icon}</div>
      </div>
      <p className="font-uxum text-stat text-brand-text-primary">{waarde}</p>
      <p className="text-caption text-brand-text-secondary mt-1">{sub}</p>
    </div>
  )
}

function RubriekRij({ code, oms, bedrag, btw, bold }: {
  code: string; oms: string; bedrag: number | null; btw: number; bold?: boolean
}) {
  return (
    <tr className={bold ? 'font-semibold' : ''}>
      <td className="py-2 pr-3 text-brand-text-secondary">{code}</td>
      <td className="py-2 px-3 text-brand-text-primary">{oms}</td>
      <td className="py-2 px-3 text-right text-brand-text-secondary whitespace-nowrap">{bedrag == null ? '' : euro(bedrag)}</td>
      <td className="py-2 pl-3 text-right text-brand-text-primary whitespace-nowrap">{euro(btw)}</td>
    </tr>
  )
}

function CorrectieBlok({ aangifte, onSave }: { aangifte: any; onSave: (v: Record<string, any>) => void }) {
  const [excl, setExcl] = useState(String(aangifte.correctie_omzet_excl || ''))
  const [btw, setBtw] = useState(String(aangifte.correctie_btw || ''))
  const [toel, setToel] = useState(aangifte.correctie_toelichting || '')
  const heeftCorrectie = Number(aangifte.correctie_omzet_excl) || Number(aangifte.correctie_btw)

  return (
    <div className="card mb-6">
      <div className="flex items-center gap-2 mb-1">
        <ArrowRight size={16} className="text-brand-text-secondary" />
        <h2 className="font-semibold text-body">Correctie vorige periode</h2>
      </div>
      <p className="text-caption text-brand-text-secondary mb-4">
        Vergeten omzet of een correctie uit een eerder kwartaal. Blijft het btw-saldo onder € 1.000, dan mag je het hier meenemen in plaats van een aparte suppletie.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-caption text-brand-text-secondary">Omzet excl. BTW
          <input type="number" step="0.01" value={excl} onChange={e => setExcl(e.target.value)} className="input mt-1 w-full" placeholder="0,00" />
        </label>
        <label className="text-caption text-brand-text-secondary">Extra af te dragen BTW
          <input type="number" step="0.01" value={btw} onChange={e => setBtw(e.target.value)} className="input mt-1 w-full" placeholder="0,00" />
        </label>
        <label className="text-caption text-brand-text-secondary">Toelichting
          <input type="text" value={toel} onChange={e => setToel(e.target.value)} className="input mt-1 w-full" placeholder="bijv. Samen Effectief 2025" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button className="btn-primary" onClick={() => onSave({
          correctie_omzet_excl: Number(excl) || 0, correctie_btw: Number(btw) || 0, correctie_toelichting: toel,
        })}>Opslaan</button>
        {heeftCorrectie && <span className="text-pill text-brand-text-secondary">Wordt meegeteld bij rubriek 1a.</span>}
      </div>
    </div>
  )
}

function KostenBlok({ kwartaal, kosten, onChange, setToast, berekening }: {
  kwartaal: string; kosten: Kostenpost[]; onChange: () => void; setToast: (s: string) => void; berekening: Berekening
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ leverancier: '', datum: '', bedrag: '', btw_behandeling: 'nl_21', land: '' })

  async function add() {
    if (!form.leverancier || !form.bedrag) { setToast('Vul leverancier en bedrag in'); return }
    const res = await fetch(`/api/belasting/btw/${kwartaal}/kosten`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, bedrag: Number(form.bedrag) }),
    })
    if (res.ok) {
      setForm({ leverancier: '', datum: '', bedrag: '', btw_behandeling: 'nl_21', land: '' })
      setOpen(false); onChange()
    } else setToast('Toevoegen mislukt')
  }
  async function del(id: string) {
    await fetch(`/api/belasting/btw/${kwartaal}/kosten/${id}`, { method: 'DELETE' })
    onChange()
  }

  const behandelingLabel: Record<string, string> = {
    nl_21: 'NL 21%', nl_9: 'NL 9%', verlegd: 'Verlegd (buitenland)', vrij: 'BTW-vrij', geen: 'Geen',
  }

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Receipt size={16} className="text-brand-text-secondary" />
          <h2 className="font-semibold text-body">Voorbelasting (inkoop)</h2>
        </div>
        <button onClick={() => setOpen(o => !o)} className="btn-secondary"><Plus size={14} /> Kostenpost</button>
      </div>
      <p className="text-caption text-brand-text-secondary mb-4">
        Aftrekbare BTW over je zakelijke inkopen. NL-inkoop telt mee als voorbelasting; buitenlandse diensten zijn verlegd (per saldo nul).
      </p>

      {open && (
        <div className="rounded-brand-sm border border-brand-card-border bg-brand-page-light p-3 mb-4 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <label className="text-pill text-brand-text-secondary col-span-2">Leverancier
            <input value={form.leverancier} onChange={e => setForm({ ...form, leverancier: e.target.value })} className="input mt-1 w-full" />
          </label>
          <label className="text-pill text-brand-text-secondary">Datum
            <input type="date" value={form.datum} onChange={e => setForm({ ...form, datum: e.target.value })} className="input mt-1 w-full" />
          </label>
          <label className="text-pill text-brand-text-secondary">Bedrag
            <input type="number" step="0.01" value={form.bedrag} onChange={e => setForm({ ...form, bedrag: e.target.value })} className="input mt-1 w-full" />
          </label>
          <label className="text-pill text-brand-text-secondary">BTW
            <select value={form.btw_behandeling} onChange={e => setForm({ ...form, btw_behandeling: e.target.value })} className="input mt-1 w-full">
              {Object.entries(behandelingLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button onClick={add} className="btn-primary h-9">Toevoegen</button>
        </div>
      )}

      {kosten.length === 0 ? (
        <p className="text-caption text-brand-text-secondary">Nog geen kostenposten. Voeg je inkoopfacturen toe voor de voorbelasting.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-caption">
            <thead>
              <tr className="border-b border-brand-card-border text-brand-text-secondary">
                <th className="text-left font-medium py-2 pr-3">Leverancier</th>
                <th className="text-left font-medium py-2 px-3">Datum</th>
                <th className="text-left font-medium py-2 px-3">BTW-type</th>
                <th className="text-right font-medium py-2 px-3">Excl.</th>
                <th className="text-right font-medium py-2 px-3">BTW</th>
                <th className="text-right font-medium py-2 pl-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-page-medium">
              {kosten.map(k => (
                <tr key={k.id} className="hover:bg-brand-page-light">
                  <td className="py-2 pr-3 text-brand-text-primary">{k.leverancier}</td>
                  <td className="py-2 px-3 text-brand-text-secondary whitespace-nowrap">{datumNL(k.datum)}</td>
                  <td className="py-2 px-3 text-brand-text-secondary">{behandelingLabel[k.btw_behandeling] || k.btw_behandeling}</td>
                  <td className="py-2 px-3 text-right text-brand-text-primary whitespace-nowrap">{euro(k.bedrag_excl)}</td>
                  <td className="py-2 px-3 text-right text-brand-text-primary whitespace-nowrap">{euro(k.btw_bedrag)}</td>
                  <td className="py-2 pl-3 text-right">
                    <button onClick={() => del(k.id)} className="text-brand-text-secondary/50 hover:text-red-500"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brand-text-primary/20 font-semibold text-brand-text-primary">
                <td className="py-2 pr-3" colSpan={4}>Voorbelasting totaal</td>
                <td className="py-2 px-3 text-right">{euro(berekening.voorbelastingTotaal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
