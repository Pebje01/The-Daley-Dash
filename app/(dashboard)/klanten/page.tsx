'use client'

import { useEffect, useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, Search, X, Check, RefreshCw, Building2 } from 'lucide-react'
import { UurKlant, CompanyId, Offerte, Factuur } from '@/lib/types'
import { COMPANIES, getCompany } from '@/lib/companies'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

interface KlantForm {
  naam: string
  contactpersoon: string
  email: string
  adres: string
  postcode: string
  stad: string
  klantnummer: string
  standaardUurtarief: string
  companyId: CompanyId | ''
}

function emptyForm(): KlantForm {
  return {
    naam: '',
    contactpersoon: '',
    email: '',
    adres: '',
    postcode: '',
    stad: '',
    klantnummer: '',
    standaardUurtarief: '',
    companyId: '',
  }
}

function toForm(k: UurKlant): KlantForm {
  return {
    naam: k.naam,
    contactpersoon: k.contactpersoon ?? '',
    email: k.email ?? '',
    adres: k.adres ?? '',
    postcode: k.postcode ?? '',
    stad: k.stad ?? '',
    klantnummer: k.klantnummer ?? '',
    standaardUurtarief: k.standaardUurtarief > 0 ? String(k.standaardUurtarief) : '',
    companyId: k.companyId ?? '',
  }
}

export default function KlantenPage() {
  const [klanten, setKlanten] = useState<UurKlant[]>([])
  const [offertes, setOffertes] = useState<Offerte[]>([])
  const [facturen, setFacturen] = useState<Factuur[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalKlant, setModalKlant] = useState<UurKlant | 'new' | null>(null)
  const [form, setForm] = useState<KlantForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [kRes, oRes, fRes] = await Promise.all([
        fetch('/api/uren-klanten'),
        fetch('/api/offertes'),
        fetch('/api/facturen'),
      ])
      if (kRes.ok) setKlanten(await kRes.json())
      if (oRes.ok) setOffertes(await oRes.json())
      if (fRes.ok) setFacturen(await fRes.json())
    } catch (e) {
      console.error('klanten/load fout:', e)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Stats per klant (uit offertes + facturen)
  const stats = useMemo(() => {
    const map: Record<string, { offertes: number; facturen: number; gefactureerd: number; openstaand: number }> = {}
    offertes.forEach(o => {
      const key = o.client.name.toLowerCase()
      if (!map[key]) map[key] = { offertes: 0, facturen: 0, gefactureerd: 0, openstaand: 0 }
      map[key].offertes++
    })
    facturen.forEach(f => {
      const key = f.client.name.toLowerCase()
      if (!map[key]) map[key] = { offertes: 0, facturen: 0, gefactureerd: 0, openstaand: 0 }
      map[key].facturen++
      map[key].gefactureerd += f.total
      if (f.status === 'verzonden' || f.status === 'te-laat') {
        map[key].openstaand += f.total
      }
    })
    return map
  }, [offertes, facturen])

  const filteredKlanten = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return klanten
    return klanten.filter(k =>
      k.naam.toLowerCase().includes(q) ||
      k.email?.toLowerCase().includes(q) ||
      k.stad?.toLowerCase().includes(q) ||
      k.contactpersoon?.toLowerCase().includes(q)
    )
  }, [klanten, search])

  const openNew = () => {
    setForm(emptyForm())
    setModalKlant('new')
  }

  const openEdit = (k: UurKlant) => {
    setForm(toForm(k))
    setModalKlant(k)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.naam.trim()) return
    setSaving(true)
    try {
      const payload = {
        naam: form.naam.trim(),
        contactpersoon: form.contactpersoon.trim() || undefined,
        email: form.email.trim() || undefined,
        adres: form.adres.trim() || undefined,
        postcode: form.postcode.trim() || undefined,
        stad: form.stad.trim() || undefined,
        klantnummer: form.klantnummer.trim() || undefined,
        standaardUurtarief: Number(form.standaardUurtarief) || 0,
        companyId: form.companyId || undefined,
      }

      if (modalKlant === 'new') {
        const res = await fetch('/api/uren-klanten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Onbekende fout' }))
          alert(`Aanmaken mislukt: ${err.error}`)
          return
        }
        const created = await res.json()
        setKlanten(prev => [...prev, created].sort((a, b) => a.naam.localeCompare(b.naam)))
      } else if (modalKlant) {
        const res = await fetch(`/api/uren-klanten/${modalKlant.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Onbekende fout' }))
          alert(`Opslaan mislukt: ${err.error}`)
          return
        }
        const updated = await res.json()
        setKlanten(prev => prev.map(k => k.id === modalKlant.id ? updated : k))
      }
      setModalKlant(null)
    } catch (e) {
      console.error('klant opslaan fout:', e)
      alert('Fout bij opslaan, zie console.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (k: UurKlant) => {
    if (!confirm(`Weet je zeker dat je ${k.naam} wilt verwijderen?\n\nDit verwijdert alleen de klantgegevens, niet de bijbehorende uren of facturen.`)) return
    try {
      const res = await fetch(`/api/uren-klanten/${k.id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert('Verwijderen mislukt')
        return
      }
      setKlanten(prev => prev.filter(x => x.id !== k.id))
    } catch (e) {
      console.error('klant verwijderen fout:', e)
      alert('Fout bij verwijderen, zie console.')
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">Klanten</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            {klanten.length} {klanten.length === 1 ? 'klant' : 'klanten'} | beheer adres, contact en standaard uurtarief.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary" title="Vernieuwen">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openNew} className="btn-primary">
            <Plus size={14} /> Nieuwe klant
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Zoek op naam, e-mail of stad..."
          className="input pl-9 w-full"
        />
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-brand-text-secondary">Laden...</div>
        ) : filteredKlanten.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 size={36} className="mx-auto text-brand-text-secondary/40 mb-3" />
            <p className="text-body text-brand-text-primary">
              {search ? 'Geen klanten gevonden' : 'Nog geen klanten'}
            </p>
            <p className="text-caption text-brand-text-secondary mt-1">
              {search ? 'Probeer een andere zoekterm.' : 'Klik op "Nieuwe klant" om er een toe te voegen.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-body">
            <thead className="bg-brand-page-light border-b border-brand-page-medium">
              <tr>
                <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide font-medium">Naam</th>
                <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide font-medium">Contact</th>
                <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide font-medium">Adres</th>
                <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide font-medium">Bedrijf</th>
                <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide font-medium">Uurtarief</th>
                <th className="text-center px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide font-medium">Offertes</th>
                <th className="text-center px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide font-medium">Facturen</th>
                <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide font-medium">Gefactureerd</th>
                <th className="text-center px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide font-medium w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-page-medium">
              {filteredKlanten.map(k => {
                const s = stats[k.naam.toLowerCase()] ?? { offertes: 0, facturen: 0, gefactureerd: 0, openstaand: 0 }
                const company = k.companyId ? getCompany(k.companyId) : null
                return (
                  <tr key={k.id} className="hover:bg-brand-page-light/50 transition-colors group">
                    <td className="px-5 py-3.5 font-semibold text-brand-text-primary">
                      {k.naam}
                      {k.klantnummer && (
                        <span className="ml-2 text-caption text-brand-text-secondary/60">#{k.klantnummer}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-brand-text-secondary">
                      {k.contactpersoon && <div>{k.contactpersoon}</div>}
                      {k.email && <div className="text-caption">{k.email}</div>}
                      {!k.contactpersoon && !k.email && <span className="text-brand-text-secondary/40">–</span>}
                    </td>
                    <td className="px-5 py-3.5 text-brand-text-secondary">
                      {k.adres || k.postcode || k.stad ? (
                        <>
                          {k.adres && <div>{k.adres}</div>}
                          <div className="text-caption">{[k.postcode, k.stad].filter(Boolean).join(' ')}</div>
                        </>
                      ) : <span className="text-brand-text-secondary/40">–</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {company ? (
                        <span className="pill" style={{ backgroundColor: company.bgColor, color: company.color }}>
                          {company.shortName}
                        </span>
                      ) : <span className="text-brand-text-secondary/40">–</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right text-brand-text-primary font-medium">
                      {k.standaardUurtarief > 0 ? `${euro(k.standaardUurtarief)}/u` : <span className="text-brand-text-secondary/40">–</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center text-brand-text-primary">{s.offertes || <span className="text-brand-text-secondary/40">–</span>}</td>
                    <td className="px-5 py-3.5 text-center text-brand-text-primary">{s.facturen || <span className="text-brand-text-secondary/40">–</span>}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-brand-text-primary">
                      {s.gefactureerd > 0 ? euro(s.gefactureerd) : <span className="text-brand-text-secondary/40">–</span>}
                      {s.openstaand > 0 && (
                        <div className="text-caption text-amber-600 font-normal">{euro(s.openstaand)} open</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(k)}
                          className="p-1.5 rounded hover:bg-brand-page-light text-brand-text-secondary hover:text-brand-text-primary transition-colors"
                          title="Bewerken"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(k)}
                          className="p-1.5 rounded hover:bg-red-50 text-brand-text-secondary hover:text-red-500 transition-colors"
                          title="Verwijderen"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalKlant && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setModalKlant(null)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-brand border border-brand-card-border shadow-xl p-6 w-full max-w-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-uxum text-body text-brand-text-primary">
                {modalKlant === 'new' ? 'Nieuwe klant' : `${modalKlant.naam} bewerken`}
              </h2>
              <button
                type="button"
                onClick={() => setModalKlant(null)}
                className="text-brand-text-secondary hover:text-brand-text-primary"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Bedrijfsnaam *</label>
                <input
                  type="text"
                  value={form.naam}
                  onChange={e => setForm(f => ({ ...f, naam: e.target.value }))}
                  className="input w-full"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Contactpersoon</label>
                <input
                  type="text"
                  value={form.contactpersoon}
                  onChange={e => setForm(f => ({ ...f, contactpersoon: e.target.value }))}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="label">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="input w-full"
                />
              </div>

              <div className="col-span-2">
                <label className="label">Adres</label>
                <input
                  type="text"
                  value={form.adres}
                  onChange={e => setForm(f => ({ ...f, adres: e.target.value }))}
                  placeholder="Straat + huisnummer"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="label">Postcode</label>
                <input
                  type="text"
                  value={form.postcode}
                  onChange={e => setForm(f => ({ ...f, postcode: e.target.value }))}
                  placeholder="1234 AB"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="label">Stad</label>
                <input
                  type="text"
                  value={form.stad}
                  onChange={e => setForm(f => ({ ...f, stad: e.target.value }))}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="label">Klantnummer</label>
                <input
                  type="text"
                  value={form.klantnummer}
                  onChange={e => setForm(f => ({ ...f, klantnummer: e.target.value }))}
                  placeholder="Optioneel"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="label">Bedrijf</label>
                <select
                  value={form.companyId}
                  onChange={e => setForm(f => ({ ...f, companyId: e.target.value as CompanyId | '' }))}
                  className="input w-full"
                >
                  <option value="">Geen voorkeur</option>
                  {COMPANIES.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="label">Standaard uurtarief</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary">€</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.standaardUurtarief}
                    onChange={e => setForm(f => ({ ...f, standaardUurtarief: e.target.value }))}
                    placeholder="0.00"
                    className="input pl-7 w-full"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <><RefreshCw size={15} className="animate-spin" /> Opslaan...</> : <><Check size={15} /> Opslaan</>}
              </button>
              <button type="button" onClick={() => setModalKlant(null)} className="btn-secondary">
                Annuleren
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
