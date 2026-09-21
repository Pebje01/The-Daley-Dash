'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Archive, Loader2, Plus } from 'lucide-react'
import type { UurKlant, Offerte, Factuur } from '@/lib/types'
import { VELD_INPUT } from '@/lib/crm/stijl'
import { useMelding } from '@/components/MeldingProvider'

/**
 * De uren- en factuurkant van een CRM-bedrijf, in de detailkaart van dat
 * bedrijf. Dit verving de losse pagina Klanten (september 2026): een klant is
 * een bedrijf, en de contactpersonen staan bij Contacten.
 *
 * De gegevens staan in uren_klanten, gekoppeld via crm_record_id. Zolang de
 * migratie 20260918_uren_klanten_crm_record.sql niet gedraaid is, zoekt het
 * blok de klant op naam.
 */

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

const VELDEN: { key: keyof Form; label: string; placeholder?: string; breed?: boolean }[] = [
  { key: 'contactpersoon', label: 'T.a.v. op de factuur', breed: true },
  { key: 'email', label: 'Factuur-e-mail', breed: true },
  { key: 'adres', label: 'Adres', breed: true },
  { key: 'postcode', label: 'Postcode' },
  { key: 'stad', label: 'Plaats' },
]

interface Form {
  klantnummer: string
  standaardUurtarief: string
  contactpersoon: string
  email: string
  adres: string
  postcode: string
  stad: string
}

function naarForm(k: UurKlant): Form {
  return {
    klantnummer: k.klantnummer ?? '',
    standaardUurtarief: k.standaardUurtarief ? String(k.standaardUurtarief) : '',
    contactpersoon: k.contactpersoon ?? '',
    email: k.email ?? '',
    adres: k.adres ?? '',
    postcode: k.postcode ?? '',
    stad: k.stad ?? '',
  }
}

const zelfdeNaam = (a?: string, b?: string) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

export default function UrenKlantBlok({ recordId, recordNaam }: { recordId: string; recordNaam: string }) {
  const melding = useMelding()
  const [laden, setLaden] = useState(true)
  const [klant, setKlant] = useState<UurKlant | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [bezig, setBezig] = useState(false)
  const [stats, setStats] = useState<{
    uren: number; urenOmzet: number; urenOpen: number
    offertes: number; facturen: number; gefactureerd: number; openstaand: number
  } | null>(null)

  const laad = useCallback(async () => {
    setLaden(true)
    try {
      const klanten: UurKlant[] = await fetch('/api/uren-klanten?archief=1').then((r) => r.json())
      const gevonden =
        klanten.find((k) => k.crmRecordId === recordId) ??
        klanten.find((k) => !k.crmRecordId && zelfdeNaam(k.naam, recordNaam)) ??
        null
      setKlant(gevonden)
      setForm(gevonden ? naarForm(gevonden) : null)

      // Wat de pagina Klanten per klant liet zien: offertes, facturen, gefactureerd.
      // Offertes en facturen dragen de klantnaam, niet het bedrijf, dus op naam.
      const namen = [recordNaam, gevonden?.naam]
      const [uren, offertes, facturen] = await Promise.all([
        gevonden ? fetch(`/api/uren?klant=${encodeURIComponent(gevonden.naam)}`).then((r) => r.json()) : [],
        fetch('/api/offertes').then((r) => r.json()),
        fetch('/api/facturen').then((r) => r.json()),
      ])
      const urenLijst = Array.isArray(uren) ? uren : []
      const bedrag = (u: any) => (Number(u.uren) || 0) * (Number(u.uurtarief) || 0)
      const vanKlant = (c?: { name?: string }) => namen.some((n) => zelfdeNaam(c?.name, n))
      const f = (Array.isArray(facturen) ? facturen : []).filter((x: Factuur) => vanKlant(x.client))
      setStats({
        uren: urenLijst.reduce((s: number, u: any) => s + (Number(u.uren) || 0), 0),
        urenOmzet: urenLijst.reduce((s: number, u: any) => s + bedrag(u), 0),
        urenOpen: urenLijst.filter((u: any) => !u.gefactureerd).reduce((s: number, u: any) => s + bedrag(u), 0),
        offertes: (Array.isArray(offertes) ? offertes : []).filter((x: Offerte) => vanKlant(x.client)).length,
        facturen: f.length,
        gefactureerd: f.reduce((s: number, x: Factuur) => s + (x.total || 0), 0),
        openstaand: f.filter((x: Factuur) => x.status === 'verzonden' || x.status === 'te-laat').reduce((s: number, x: Factuur) => s + (x.total || 0), 0),
      })
    } catch {
      /* het blok blijft leeg, de rest van de kaart werkt gewoon */
    } finally {
      setLaden(false)
    }
  }, [recordId, recordNaam])

  useEffect(() => { laad() }, [laad])

  async function toevoegen() {
    setBezig(true)
    try {
      const res = await fetch('/api/uren-klanten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naam: recordNaam, crmRecordId: recordId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Toevoegen mislukt')
      melding.gelukt(`${recordNaam} staat nu in de urenregistratie (${json.klantnummer ?? ''})`)
      await laad()
    } catch (e: any) {
      melding.fout(e.message)
    } finally {
      setBezig(false)
    }
  }

  async function opslaan() {
    if (!klant || !form) return
    setBezig(true)
    try {
      const res = await fetch(`/api/uren-klanten/${klant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          klantnummer: form.klantnummer.trim(),
          standaardUurtarief: Number(form.standaardUurtarief.replace(',', '.')) || 0,
          contactpersoon: form.contactpersoon.trim(),
          email: form.email.trim(),
          adres: form.adres.trim(),
          postcode: form.postcode.trim(),
          stad: form.stad.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Opslaan mislukt')
      setKlant(json)
      setForm(naarForm(json))
      melding.gelukt('Factuurgegevens opgeslagen')
    } catch (e: any) {
      melding.fout(e.message)
    } finally {
      setBezig(false)
    }
  }

  if (laden) {
    return <p className="text-caption text-brand-text-secondary">Laden...</p>
  }

  const gewijzigd = !!klant && !!form && JSON.stringify(form) !== JSON.stringify(naarForm(klant))

  return (
    <div className="space-y-3">
      {!klant ? (
        <div className="space-y-2">
          <p className="text-caption text-brand-text-secondary">Nog niet in de urenregistratie.</p>
          <button onClick={toevoegen} disabled={bezig} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50">
            {bezig ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Toevoegen aan urenregistratie
          </button>
        </div>
      ) : form && (
        <>
          {klant.gearchiveerdOp && (
            <p className="text-caption text-brand-text-secondary flex items-center gap-1.5">
              <Archive size={12} /> Staat niet tussen de tabs op /uren (gearchiveerd)
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className="block text-caption text-brand-text-secondary mb-1">Klantnummer</span>
              <input
                className={`${VELD_INPUT} font-mono tracking-wider`}
                value={form.klantnummer}
                maxLength={10}
                onChange={(e) => setForm({ ...form, klantnummer: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="block min-w-0">
              <span className="block text-caption text-brand-text-secondary mb-1">Uurtarief (ex. btw)</span>
              <input
                className={VELD_INPUT}
                inputMode="decimal"
                value={form.standaardUurtarief}
                onChange={(e) => setForm({ ...form, standaardUurtarief: e.target.value })}
              />
            </label>
            {VELDEN.map((v) => (
              <label key={v.key} className={`block min-w-0 ${v.breed ? 'col-span-2' : ''}`}>
                <span className="block text-caption text-brand-text-secondary mb-1">{v.label}</span>
                <input
                  className={VELD_INPUT}
                  value={form[v.key]}
                  onChange={(e) => setForm({ ...form, [v.key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {gewijzigd && (
              <button onClick={opslaan} disabled={bezig} className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50">
                {bezig && <Loader2 size={12} className="animate-spin" />} Factuurgegevens opslaan
              </button>
            )}
            <Link href="/uren" className="btn-secondary text-xs py-1.5 px-3">
              Uren <ArrowRight size={12} />
            </Link>
          </div>
        </>
      )}

      {stats && (klant || stats.offertes > 0 || stats.facturen > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {klant && (
            <Tegel label="Uren" waarde={`${stats.uren.toFixed(1)}u`} sub={stats.urenOmzet ? euro(stats.urenOmzet) : undefined} />
          )}
          <Tegel label="Gefactureerd" waarde={stats.gefactureerd ? euro(stats.gefactureerd) : '–'} sub={`${stats.facturen} ${stats.facturen === 1 ? 'factuur' : 'facturen'}, ${stats.offertes} ${stats.offertes === 1 ? 'offerte' : 'offertes'}`} />
          {stats.urenOpen > 0 && (
            <p className="col-span-2 text-caption text-brand-status-orange">{euro(stats.urenOpen)} aan uren nog niet gefactureerd</p>
          )}
          {stats.openstaand > 0 && (
            <p className="col-span-2 text-caption text-brand-status-orange">{euro(stats.openstaand)} aan facturen staat nog open</p>
          )}
        </div>
      )}
    </div>
  )
}

function Tegel({ label, waarde, sub }: { label: string; waarde: string; sub?: string }) {
  return (
    <div className="rounded-brand-btn bg-brand-card-bg border-brand border-brand-card-border/15 px-3 py-2 min-w-0">
      <p className="text-caption text-brand-text-secondary">{label}</p>
      <p className="text-body font-semibold text-brand-text-primary truncate">{waarde}</p>
      {sub && <p className="text-caption text-brand-text-secondary truncate">{sub}</p>}
    </div>
  )
}
