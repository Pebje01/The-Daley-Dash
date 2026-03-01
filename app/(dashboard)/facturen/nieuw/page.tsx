'use client'
import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, GripVertical } from 'lucide-react'
import { COMPANIES, getCompany } from '@/lib/companies'
import { LineItem, CompanyId, Offerte } from '@/lib/types'
import { useActiveCompany } from '@/components/CompanyContext'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

const emptyItem = (): LineItem => ({
  id: crypto.randomUUID(),
  description: '',
  details: '',
  quantity: 1,
  unitPrice: 0,
})

interface Section {
  id: string
  title: string
  items: LineItem[]
}

const emptySection = (): Section => ({
  id: crypto.randomUUID(),
  title: '',
  items: [emptyItem()],
})

export default function NieuweFactuur() {
  return (
    <Suspense fallback={<div className="p-8 text-brand-text-secondary">Laden...</div>}>
      <NieuweFactuurContent />
    </Suspense>
  )
}

function NieuweFactuurContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeCompany } = useActiveCompany()
  const initialCompany = (searchParams.get('bedrijf') as CompanyId) || activeCompany

  const [companyId, setCompanyId] = useState<CompanyId>(initialCompany)
  const [client, setClient] = useState({
    name: '', contactPerson: '', email: '', phone: '', address: '', kvk: '', btw: '',
  })
  const [btwPct, setBtwPct] = useState(21)
  const [sections, setSections] = useState<Section[]>([emptySection()])
  const [dueDays, setDueDays] = useState(14)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Linked offerte state
  const [offertes, setOffertes] = useState<Offerte[]>([])
  const [selectedOfferteId, setSelectedOfferteId] = useState<string>('')
  const [loadingOffertes, setLoadingOffertes] = useState(false)

  const company = COMPANIES.find(c => c.id === companyId)!

  // Fetch offertes (only akkoord status) for linking
  const fetchOffertes = useCallback(async () => {
    setLoadingOffertes(true)
    try {
      const params = new URLSearchParams()
      params.set('status', 'akkoord')
      if (companyId) params.set('company', companyId)
      const res = await fetch(`/api/offertes?${params}`)
      if (res.ok) setOffertes(await res.json())
    } catch (e) {
      console.error('Failed to fetch offertes:', e)
    }
    setLoadingOffertes(false)
  }, [companyId])

  useEffect(() => { fetchOffertes() }, [fetchOffertes])

  // Populate from linked offerte
  const handleOfferteLink = (offerteId: string) => {
    setSelectedOfferteId(offerteId)
    if (!offerteId) return

    const offerte = offertes.find(o => o.id === offerteId)
    if (!offerte) return

    setClient({
      name: offerte.client.name || '',
      contactPerson: offerte.client.contactPerson || '',
      email: offerte.client.email || '',
      phone: offerte.client.phone || '',
      address: offerte.client.address || '',
      kvk: offerte.client.kvk || '',
      btw: offerte.client.btw || '',
    })
    setBtwPct(offerte.btwPercentage)

    // Group items into sections
    const newSections: Section[] = []
    let currentTitle: string | undefined = undefined
    for (const item of offerte.items) {
      const title = item.sectionTitle || ''
      if (newSections.length === 0 || title !== currentTitle) {
        newSections.push({ id: crypto.randomUUID(), title, items: [] })
        currentTitle = title
      }
      newSections[newSections.length - 1].items.push({
        id: crypto.randomUUID(),
        description: item.description,
        details: item.details || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        sectionTitle: item.sectionTitle,
      })
    }
    if (newSections.length > 0) {
      setSections(newSections)
    }
  }

  // Section helpers
  const updateSectionTitle = (sectionId: string, title: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, title } : s))
  }
  const addSection = () => setSections(prev => [...prev, emptySection()])
  const removeSection = (sectionId: string) => {
    setSections(prev => prev.length > 1 ? prev.filter(s => s.id !== sectionId) : prev)
  }
  const moveSectionUp = (idx: number) => {
    if (idx === 0) return
    setSections(prev => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }
  const moveSectionDown = (idx: number) => {
    setSections(prev => {
      if (idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  // Item helpers within a section
  const updateItem = (sectionId: string, itemId: string, field: keyof LineItem, value: any) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, [field]: value } : i) }
        : s
    ))
  }
  const addItem = (sectionId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, items: [...s.items, emptyItem()] } : s
    ))
  }
  const removeItem = (sectionId: string, itemId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s
    ))
  }

  // Flatten sections to items for calculations
  const allItems = sections.flatMap(s =>
    s.items.map(item => ({ ...item, sectionTitle: s.title || undefined }))
  )
  const subtotal = allItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const btwAmount = subtotal * (btwPct / 100)
  const total = subtotal + btwAmount

  // Calculate due date display
  const dueDate = new Date(Date.now() + dueDays * 86400000)

  const handleSave = async () => {
    setSaving(true)
    setError('')

    try {
      const flatItems = sections.flatMap(s =>
        s.items.map(item => ({
          description: item.description,
          details: item.details || undefined,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          sectionTitle: s.title || undefined,
        }))
      )

      const res = await fetch('/api/facturen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          client: {
            name: client.name,
            contactPerson: client.contactPerson || undefined,
            email: client.email || undefined,
            phone: client.phone || undefined,
            address: client.address || undefined,
            kvk: client.kvk || undefined,
            btw: client.btw || undefined,
          },
          items: flatItems,
          btwPercentage: btwPct,
          notes: notes || undefined,
          offerteId: selectedOfferteId || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Opslaan mislukt')
      }

      router.push('/facturen')
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="btn-secondary px-2.5"><ArrowLeft size={15} /></button>
        <div>
          <h1 className="font-uxum text-sidebar-t text-brand-text-primary">Nieuwe factuur</h1>
          <p className="text-caption text-brand-text-secondary mt-0.5">
            Factuurnummer wordt automatisch toegewezen op basis van datum
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-brand-pink border border-brand-pink-accent/30 text-brand-status-red rounded-brand px-4 py-3 mb-5 text-body">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {/* Bedrijf selectie */}
        <div className="card">
          <h2 className="font-semibold text-body mb-4">Vanuit welk bedrijf?</h2>
          <div className="flex gap-3">
            {COMPANIES.map(c => (
              <button key={c.id} onClick={() => setCompanyId(c.id as CompanyId)}
                className={`flex-1 border-2 rounded-brand p-3 text-left transition-all ${companyId === c.id ? 'border-brand-card-border' : 'border-brand-page-medium hover:border-brand-lavender-dark'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="font-semibold text-caption">{c.shortName}</span>
                </div>
                <p className="text-caption text-brand-text-secondary leading-tight">{c.name}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Link met bestaande offerte */}
        <div className="card">
          <h2 className="font-semibold text-body mb-4">Koppel aan offerte (optioneel)</h2>
          <select
            className="input"
            value={selectedOfferteId}
            onChange={e => handleOfferteLink(e.target.value)}
          >
            <option value="">Geen offerte gekoppeld</option>
            {loadingOffertes ? (
              <option disabled>Offertes laden...</option>
            ) : offertes.map(o => (
              <option key={o.id} value={o.id}>
                {o.number} - {o.client.name} ({euro(o.total)})
              </option>
            ))}
          </select>
          <p className="text-caption text-brand-text-secondary mt-2">
            Bij het koppelen worden klantgegevens en diensten automatisch overgenomen.
          </p>
        </div>

        {/* Klantgegevens */}
        <div className="card">
          <h2 className="font-semibold text-body mb-4">Klantgegevens</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Bedrijfsnaam *</label>
              <input className="input" value={client.name} onChange={e => setClient(p => ({...p, name: e.target.value}))}
                placeholder="Klantnaam" />
            </div>
            <div>
              <label className="label">Contactpersoon</label>
              <input className="input" value={client.contactPerson} onChange={e => setClient(p => ({...p, contactPerson: e.target.value}))}
                placeholder="Jan Jansen" />
            </div>
            <div>
              <label className="label">E-mailadres</label>
              <input className="input" type="email" value={client.email} onChange={e => setClient(p => ({...p, email: e.target.value}))}
                placeholder="jan@bedrijf.nl" />
            </div>
            <div>
              <label className="label">Telefoonnummer</label>
              <input className="input" value={client.phone} onChange={e => setClient(p => ({...p, phone: e.target.value}))}
                placeholder="+31 6 00000000" />
            </div>
            <div>
              <label className="label">Adres</label>
              <input className="input" value={client.address} onChange={e => setClient(p => ({...p, address: e.target.value}))}
                placeholder="Straat 1, 1000 AA Stad" />
            </div>
            <div>
              <label className="label">KVK-nummer</label>
              <input className="input" value={client.kvk} onChange={e => setClient(p => ({...p, kvk: e.target.value}))}
                placeholder="12345678" />
            </div>
            <div>
              <label className="label">BTW-nummer</label>
              <input className="input" value={client.btw} onChange={e => setClient(p => ({...p, btw: e.target.value}))}
                placeholder="NL000000000B01" />
            </div>
            <div>
              <label className="label">Betaaltermijn</label>
              <select className="input" value={dueDays} onChange={e => setDueDays(Number(e.target.value))}>
                <option value={7}>7 dagen</option>
                <option value={14}>14 dagen</option>
                <option value={30}>30 dagen</option>
                <option value={60}>60 dagen</option>
              </select>
              <p className="text-caption text-brand-text-secondary mt-1">
                Vervaldatum: {dueDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Secties met diensten */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-body">Diensten / producten</h2>
            <button onClick={addSection} className="btn-secondary py-1.5 text-caption">
              <Plus size={13} /> Nieuwe sectie
            </button>
          </div>

          {sections.map((section, sIdx) => (
            <div key={section.id} className="card border-2 border-brand-page-medium">
              {/* Section header */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveSectionUp(sIdx)} disabled={sIdx === 0}
                    className="p-0.5 text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-30 transition-colors">
                    <GripVertical size={12} className="rotate-180" />
                  </button>
                  <button onClick={() => moveSectionDown(sIdx)} disabled={sIdx === sections.length - 1}
                    className="p-0.5 text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-30 transition-colors">
                    <GripVertical size={12} />
                  </button>
                </div>
                <input className="input flex-1 font-semibold" placeholder={`Sectie titel (bijv. Website & Design)`}
                  value={section.title} onChange={e => updateSectionTitle(section.id, e.target.value)} />
                {sections.length > 1 && (
                  <button onClick={() => removeSection(section.id)}
                    className="p-2 text-brand-text-secondary hover:text-brand-status-red rounded-brand-sm hover:bg-brand-pink transition-colors"
                    title="Sectie verwijderen">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* Items within section */}
              <div className="space-y-3">
                {section.items.map((item, idx) => (
                  <div key={item.id} className="grid grid-cols-[1fr_120px_100px_100px_36px] gap-2 items-start">
                    <div>
                      <input className="input mb-1" placeholder="Dienst / product omschrijving" value={item.description}
                        onChange={e => updateItem(section.id, item.id, 'description', e.target.value)} />
                      <input className="input text-caption text-brand-text-secondary" placeholder="Extra details (optioneel)" value={item.details}
                        onChange={e => updateItem(section.id, item.id, 'details', e.target.value)} />
                    </div>
                    <div>
                      {idx === 0 && <label className="label">Aantal</label>}
                      <input className="input" type="number" min="0" step="0.5" value={item.quantity}
                        onChange={e => updateItem(section.id, item.id, 'quantity', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      {idx === 0 && <label className="label">Prijs p/s</label>}
                      <input className="input" type="number" min="0" step="0.01" value={item.unitPrice}
                        onChange={e => updateItem(section.id, item.id, 'unitPrice', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      {idx === 0 && <label className="label">Totaal</label>}
                      <div className="input bg-brand-page-light font-semibold text-right">{euro(item.quantity * item.unitPrice)}</div>
                    </div>
                    <div className={idx === 0 ? 'pt-5' : ''}>
                      <button onClick={() => removeItem(section.id, item.id)}
                        disabled={section.items.length <= 1}
                        className="p-2 text-brand-text-secondary hover:text-brand-status-red rounded-brand-sm hover:bg-brand-pink transition-colors disabled:opacity-30">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => addItem(section.id)} className="mt-3 text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1 transition-colors">
                <Plus size={12} /> Regel toevoegen
              </button>
            </div>
          ))}
        </div>

        {/* Totalen */}
        <div className="card">
          <div className="border-t border-brand-page-medium pt-4 ml-auto max-w-xs space-y-2">
            <div className="flex justify-between text-body">
              <span className="text-brand-text-secondary">Subtotaal</span>
              <span className="font-semibold text-brand-text-primary">{euro(subtotal)}</span>
            </div>
            <div className="flex justify-between text-body items-center">
              <span className="text-brand-text-secondary flex items-center gap-2">
                BTW
                <select className="border-brand border-brand-card-border rounded-brand-sm px-1.5 py-0.5 text-caption" value={btwPct} onChange={e => setBtwPct(Number(e.target.value))}>
                  <option value={0}>0%</option>
                  <option value={9}>9%</option>
                  <option value={21}>21%</option>
                </select>
              </span>
              <span className="text-brand-text-primary">{euro(btwAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t border-brand-page-medium pt-2 text-brand-text-primary">
              <span>Totaal</span>
              <span>{euro(total)}</span>
            </div>
          </div>
        </div>

        {/* Notities */}
        <div className="card">
          <h2 className="font-semibold text-body mb-3">Notities (optioneel)</h2>
          <textarea className="input h-20 resize-none" placeholder="Bijv. rekeningnummer, betalingsinstructies..."
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {/* Save bar */}
        <div className="bg-brand-page-light border-brand border-brand-card-border rounded-brand px-4 py-3 flex items-center justify-between">
          <div className="text-caption text-brand-text-secondary">
            <span className="font-semibold text-brand-text-primary">Bedrijf: </span>
            <span style={{ color: company.color }}>{company.name}</span>
            <span className="ml-3 text-brand-text-secondary/50">(nummer wordt automatisch gegenereerd)</span>
          </div>
          <button onClick={handleSave} disabled={!client.name || saving} className="btn-primary disabled:opacity-50">
            <Save size={15} /> {saving ? 'Opslaan...' : 'Factuur opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
