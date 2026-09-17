'use client'
import { useEffect, useState } from 'react'
import { RefreshCw, ExternalLink, FolderOpen, ChevronRight, Download } from 'lucide-react'
import { getCompany } from '@/lib/companies'
import type { ScannedFile } from '@/app/api/admin/scan/route'
import type { ExtractedDoc } from '@/app/api/admin/extract/route'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function Skeleton() {
  return <span className="inline-block w-20 h-3 rounded bg-brand-page-medium animate-pulse" />
}

interface Props {
  type: 'factuur' | 'offerte'
}

/** Een factuur of offerte zoals de Dash hem zelf teruggeeft. */
interface DashRecord {
  number: string
  companyId: string | null
  client?: { name?: string | null } | null
  date: string | null
  dueDate?: string | null
  validUntil?: string | null
  subtotal?: number | null
  btwAmount?: number | null
  total?: number | null
  status?: string | null
}

/**
 * Gegevens van een bestand dat al in de Dash staat komen uit de Dash zelf,
 * niet uit de PDF. Dat scheelt een AI-verzoek per bestand, en wat je ziet is
 * dan hetzelfde als op de factuur- of offertekaart.
 */
function alsDoc(r: DashRecord, type: 'factuur' | 'offerte'): ExtractedDoc {
  return {
    type,
    number: r.number,
    clientName: r.client?.name ?? null,
    clientContactPerson: null,
    clientAddress: null,
    date: r.date ?? null,
    dueDate: r.dueDate ?? null,
    validUntil: r.validUntil ?? null,
    subtotal: r.subtotal ?? null,
    btwAmount: r.btwAmount ?? null,
    total: r.total ?? null,
    btwPercentage: null,
    companyId: r.companyId ?? null,
    status: r.status ?? null,
    paidAt: null,
    lineItems: [],
  }
}

export default function LocaleBestandenSection({ type }: Props) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<ScannedFile[]>([])
  const [extracted, setExtracted] = useState<Map<string, ExtractedDoc>>(new Map())
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [extracting, setExtracting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  /** Bestanden van vóór 2026, bewust niet in de lijst. */
  const [oudAantal, setOudAantal] = useState(0)
  /** Hoeveel onbekende PDF's uitgelezen worden, voor de voortgangsbalk. */
  const [lezenTotaal, setLezenTotaal] = useState(0)

  const [importing, setImporting] = useState<Set<string>>(new Set())
  const [importedSet, setImportedSet] = useState<Set<string>>(new Set())
  const [importErrors, setImportErrors] = useState<Map<string, string>>(new Map())
  const [bulkRunning, setBulkRunning] = useState(false)

  const load = async () => {
    setScanning(true)
    setExtracted(new Map())
    setProgress(0)
    setLezenTotaal(0)
    setImportedSet(new Set())
    setImportErrors(new Map())

    let withNumbers: ScannedFile[] = []
    try {
      const res = await fetch('/api/admin/scan')
      if (!res.ok) { setScanning(false); return }
      const all: ScannedFile[] = await res.json()
      const vanDitType = all.filter(f => f.type === type && f.number !== null)
      // Administratie van vóór 2026 hoort niet in de Dash, dus staat hij ook
      // niet in deze lijst. Zou hij er wel staan, dan leest de Dash elke PDF
      // uit met AI en kan één klik op importeren ze alsnog binnenhalen, met de
      // verkeerde nummers die in die oude bestanden staan.
      withNumbers = vanDitType.filter(f => !f.oud)
      setOudAantal(vanDitType.length - withNumbers.length)
      setFiles(withNumbers)
    } catch {
      setScanning(false)
      return
    }
    setScanning(false)
    setLoaded(true)

    // Wat al in de Dash staat hoeft niet uitgelezen te worden: die gegevens
    // staan in Supabase. Alleen onbekende bestanden gaan naar de PDF-lezer.
    const bekend = withNumbers.filter(f => f.matched)
    if (bekend.length > 0) {
      try {
        const res = await fetch(type === 'factuur' ? '/api/facturen' : '/api/offertes')
        if (res.ok) {
          const records: DashRecord[] = await res.json()
          const perNummer = new Map(records.map(r => [r.number.toUpperCase(), r]))
          setExtracted(prev => {
            const next = new Map(prev)
            for (const f of bekend) {
              const record = perNummer.get(f.number!.toUpperCase())
              if (record) next.set(f.absolutePath, alsDoc(record, type))
            }
            return next
          })
        }
      } catch {
        // Lukt dit niet, dan blijven die regels leeg. Geen reden om de hele
        // lijst te laten vallen.
      }
    }

    const teLezen = withNumbers.filter(f => !f.matched)
    setLezenTotaal(teLezen.length)
    if (teLezen.length === 0) return

    setExtracting(true)
    const batchSize = 8
    for (let i = 0; i < teLezen.length; i += batchSize) {
      const batch = teLezen.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(f =>
          fetch('/api/admin/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ absolutePath: f.absolutePath }),
          })
            .then(r => r.ok ? r.json() as Promise<ExtractedDoc> : null)
            .catch(() => null)
        )
      )
      setExtracted(prev => {
        const next = new Map(prev)
        batch.forEach((f, idx) => { if (results[idx]) next.set(f.absolutePath, results[idx]) })
        return next
      })
      setProgress(Math.min(i + batch.length, teLezen.length))
    }
    setExtracting(false)
  }

  useEffect(() => {
    if (open && !loaded) load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const callAction = async (absolutePath: string, action: 'open' | 'reveal') => {
    await fetch('/api/admin/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ absolutePath, action }),
    }).catch(() => {})
  }

  const handleImport = async (f: ScannedFile) => {
    const doc = extracted.get(f.absolutePath)
    if (!doc) return

    setImporting(prev => new Set(Array.from(prev).concat(f.absolutePath)))
    setImportErrors(prev => { const m = new Map(prev); m.delete(f.absolutePath); return m })

    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          absolutePath: f.absolutePath,
          doc,
          filenameNumber: f.number,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setImportErrors(prev => new Map(prev).set(f.absolutePath, result.error ?? 'Import mislukt'))
      } else {
        setImportedSet(prev => new Set(Array.from(prev).concat(f.absolutePath)))
      }
    } catch {
      setImportErrors(prev => new Map(prev).set(f.absolutePath, 'Netwerkfout'))
    } finally {
      setImporting(prev => { const s = new Set(prev); s.delete(f.absolutePath); return s })
    }
  }

  const handleBulkImport = async () => {
    const toImport = files.filter(f =>
      !f.matched &&
      !importedSet.has(f.absolutePath) &&
      extracted.has(f.absolutePath) &&
      !importing.has(f.absolutePath)
    )
    setBulkRunning(true)
    for (const f of toImport) {
      await handleImport(f)
    }
    setBulkRunning(false)
  }

  const label = type === 'factuur' ? 'facturen' : 'offertes'
  const newCount = files.filter(f => !f.matched && !importedSet.has(f.absolutePath)).length

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 text-body font-semibold text-brand-text-secondary hover:text-brand-text-primary transition-colors text-left"
        >
          <ChevronRight size={14} className={`transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`} />
          Lokale bestanden
          {loaded && (
            <span className="text-pill px-2 py-0.5 rounded bg-brand-page-medium text-brand-text-secondary font-normal">
              {files.length} {label}
            </span>
          )}
          {(scanning || extracting) && (
            <RefreshCw size={13} className="animate-spin text-brand-text-secondary ml-1" />
          )}
        </button>

      </div>

      {open && (
        <>
          {loaded && oudAantal > 0 && (
            <p className="mb-3 text-caption text-brand-text-secondary">
              {oudAantal} {label} van vóór 2026 staan niet in deze lijst. Die administratie is van
              vóór de Dash en wordt bewust niet ingelezen.
            </p>
          )}
          {extracting && (
            <div className="mb-3">
              <div className="flex justify-between text-caption text-brand-text-secondary mb-1">
                <span>PDF&apos;s uitlezen{process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : ''}...</span>
                <span>{progress} / {lezenTotaal}</span>
              </div>
              <div className="h-1 bg-brand-page-medium rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-purple transition-all duration-300"
                  style={{ width: lezenTotaal > 0 ? `${(progress / lezenTotaal) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}

          <div className="card p-0 overflow-x-auto">
            <table className="w-full min-w-[640px] text-body">
              <thead className="bg-brand-page-light border-b border-brand-page-medium">
                <tr>
                  <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Nummer</th>
                  <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Klant</th>
                  <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrijf</th>
                  <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Datum</th>
                  <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">
                    {type === 'factuur' ? 'Vervaldatum' : 'Geldig tot'}
                  </th>
                  <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Bedrag</th>
                  <th className="px-4 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-page-medium">
                {scanning ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-brand-text-secondary">
                      <RefreshCw size={14} className="animate-spin inline mr-2" /> Mappen scannen...
                    </td>
                  </tr>
                ) : files.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-caption text-brand-text-secondary">
                      Geen lokale {label} gevonden
                    </td>
                  </tr>
                ) : files.map(f => {
                  const doc = extracted.get(f.absolutePath)
                  const co = doc?.companyId ? getCompany(doc.companyId as never) : null
                  const vervaldatum = type === 'factuur' ? doc?.dueDate : doc?.validUntil

                  const isImported = importedSet.has(f.absolutePath)
                  const isInDash = f.matched || isImported
                  const isImporting = importing.has(f.absolutePath)
                  const importError = importErrors.get(f.absolutePath)
                  const canImport = !isInDash && !isImporting && !!doc

                  return (
                    <tr
                      key={f.absolutePath}
                      onClick={() => callAction(f.absolutePath, 'open')}
                      className={`hover:bg-brand-page-light transition-colors cursor-pointer group ${!isInDash ? 'bg-orange-50/30' : ''}`}
                      title="Klik om te openen"
                    >
                      <td className="px-5 py-3 font-mono text-caption text-brand-text-secondary">
                        <span className="inline-flex items-center gap-1.5">
                          {f.number}
                          {f.duplicaat && !isInDash && (
                            <span
                              className="text-pill px-2 py-0.5 rounded bg-red-50 text-red-600 font-semibold border border-red-200"
                              title="Meerdere bestanden dragen dit nummer. Hernummer er één, anders koppelt de sync aan de verkeerde factuur."
                            >
                              Dubbel
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-semibold text-brand-text-primary">
                        {doc ? (doc.clientName ?? '–') : <Skeleton />}
                      </td>
                      <td className="px-5 py-3">
                        {doc ? (
                          co ? (
                            <span className="text-pill px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: co.bgColor, color: co.color }}>
                              {co.shortName}
                            </span>
                          ) : '–'
                        ) : <Skeleton />}
                      </td>
                      <td className="px-5 py-3 text-brand-text-secondary">
                        {doc ? (doc.date ? new Date(doc.date).toLocaleDateString('nl-NL') : '–') : <Skeleton />}
                      </td>
                      <td className="px-5 py-3 text-brand-text-secondary">
                        {doc ? (vervaldatum ? new Date(vervaldatum).toLocaleDateString('nl-NL') : '–') : <Skeleton />}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-brand-text-primary">
                        {doc ? (doc.total != null ? euro(doc.total) : '–') : <Skeleton />}
                      </td>
                      <td className="px-4 py-3">
                        {isImporting ? (
                          <span className="inline-flex items-center gap-1 text-pill px-2 py-0.5 rounded bg-brand-page-medium text-brand-text-secondary font-semibold">
                            <RefreshCw size={10} className="animate-spin" /> Importeren...
                          </span>
                        ) : isInDash ? (
                          <span className="text-pill px-2 py-0.5 rounded bg-green-50 text-green-700 font-semibold border border-green-200">
                            In de Dash
                          </span>
                        ) : importError ? (
                          <span className="text-pill px-2 py-0.5 rounded bg-red-50 text-red-600 font-semibold border border-red-200" title={importError}>
                            Fout
                          </span>
                        ) : (
                          <span className="text-pill px-2 py-0.5 rounded bg-orange-50 text-orange-700 font-semibold border border-orange-200">
                            Nieuw
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canImport && (
                            <button
                              onClick={() => handleImport(f)}
                              title="Importeer naar de Dash"
                              className="p-1.5 rounded hover:bg-orange-100 text-orange-600 hover:text-orange-700 transition-colors"
                            >
                              <Download size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => callAction(f.absolutePath, 'open')}
                            title="Open PDF"
                            className="p-1.5 rounded hover:bg-brand-page-medium text-brand-text-secondary hover:text-brand-purple transition-colors"
                          >
                            <ExternalLink size={13} />
                          </button>
                          <button
                            onClick={() => callAction(f.absolutePath, 'reveal')}
                            title="Toon in Finder"
                            className="p-1.5 rounded hover:bg-brand-page-medium text-brand-text-secondary hover:text-brand-purple transition-colors"
                          >
                            <FolderOpen size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
