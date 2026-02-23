'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save } from 'lucide-react'
import { COMPANIES } from '@/lib/companies'
import { saveFactuur, nextFactuurNumber } from '@/lib/store'
import { Factuur, LineItem, CompanyId } from '@/lib/types'

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

export default function NieuweFactuur() {
  const router = useRouter()
  const [companyId, setCompanyId] = useState<CompanyId>('tde')
  const [client, setClient] = useState({ name: '', contactPerson: '', email: '', phone: '' })
  const [btwPct, setBtwPct] = useState(21)
  const [items, setItems] = useState<LineItem[]>([emptyItem()])
  const [dueDays, setDueDays] = useState(14)
  const [notes, setNotes] = useState('')

  const company = COMPANIES.find(c => c.id === companyId)!

  const updateItem = (id: string, field: keyof LineItem, value: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }
  const addItem = () => setItems(prev => [...prev, emptyItem()])
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id))

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const btwAmount = subtotal * (btwPct / 100)
  const total = subtotal + btwAmount

  const handleSave = () => {
    const now = new Date().toISOString()
    const number = nextFactuurNumber(companyId, company.prefix.factuur)
    const dueDate = new Date(Date.now() + dueDays * 86400000).toISOString().split('T')[0]

    const factuur: Factuur = {
      id: crypto.randomUUID(),
      number,
      companyId,
      client,
      date: now.split('T')[0],
      dueDate,
      status: 'concept',
      items,
      subtotal,
      btwPercentage: btwPct,
      btwAmount,
      total,
      notes,
      createdAt: now,
      updatedAt: now,
    }
    saveFactuur(factuur)
    router.push('/facturen')
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="btn-secondary px-2.5"><ArrowLeft size={15} /></button>
        <div>
          <h1 className="font-uxum text-sidebar-t text-brand-text-primary">Nieuwe factuur</h1>
          <p className="text-caption text-brand-text-secondary mt-0.5">Factuurnummer wordt automatisch toegewezen</p>
        </div>
      </div>

      <div className="space-y-5">
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
                <p className="text-caption text-brand-text-secondary">{c.name}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-body mb-4">Klantgegevens</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Bedrijfsnaam *</label>
              <input className="input" value={client.name} onChange={e => setClient(p => ({...p, name: e.target.value}))} placeholder="Klantnaam" /></div>
            <div><label className="label">Contactpersoon</label>
              <input className="input" value={client.contactPerson} onChange={e => setClient(p => ({...p, contactPerson: e.target.value}))} placeholder="Jan Jansen" /></div>
            <div><label className="label">E-mail</label>
              <input className="input" type="email" value={client.email} onChange={e => setClient(p => ({...p, email: e.target.value}))} placeholder="jan@bedrijf.nl" /></div>
            <div><label className="label">Betaaltermijn</label>
              <select className="input" value={dueDays} onChange={e => setDueDays(Number(e.target.value))}>
                <option value={7}>7 dagen</option>
                <option value={14}>14 dagen</option>
                <option value={30}>30 dagen</option>
                <option value={60}>60 dagen</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-body">Diensten / producten</h2>
            <button onClick={addItem} className="btn-secondary py-1.5 text-caption"><Plus size={13} /> Regel toevoegen</button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id} className="grid grid-cols-[1fr_160px_120px_120px_36px] gap-2 items-start">
                <div>
                  <input className="input mb-1" placeholder="Omschrijving" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} />
                  <input className="input text-caption text-brand-text-secondary" placeholder="Details (optioneel)" value={item.details} onChange={e => updateItem(item.id, 'details', e.target.value)} />
                </div>
                <div>
                  {idx === 0 && <label className="label">Aantal</label>}
                  <input className="input" type="number" min="0" step="0.5" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  {idx === 0 && <label className="label">Prijs p/s</label>}
                  <input className="input" type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  {idx === 0 && <label className="label">Totaal</label>}
                  <div className="input bg-brand-page-light font-semibold text-right">{euro(item.quantity * item.unitPrice)}</div>
                </div>
                <div className={idx === 0 ? 'pt-5' : ''}>
                  <button onClick={() => removeItem(item.id)} className="p-2 text-brand-text-secondary hover:text-brand-status-red rounded-brand-sm hover:bg-brand-pink transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-brand-page-medium mt-5 pt-4 ml-auto max-w-xs space-y-2">
            <div className="flex justify-between text-body"><span className="text-brand-text-secondary">Subtotaal</span><span className="font-semibold text-brand-text-primary">{euro(subtotal)}</span></div>
            <div className="flex justify-between text-body items-center">
              <span className="text-brand-text-secondary flex items-center gap-2">BTW
                <select className="border-brand border-brand-card-border rounded-brand-sm px-1.5 py-0.5 text-caption" value={btwPct} onChange={e => setBtwPct(Number(e.target.value))}>
                  <option value={0}>0%</option><option value={9}>9%</option><option value={21}>21%</option>
                </select>
              </span>
              <span className="text-brand-text-primary">{euro(btwAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t border-brand-page-medium pt-2 text-brand-text-primary">
              <span>Totaal</span><span>{euro(total)}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-body mb-3">Notities</h2>
          <textarea className="input h-20 resize-none" placeholder="Bijv. rekeningnummer, betalingsinstructies…" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="bg-brand-page-light border-brand border-brand-card-border rounded-brand px-4 py-3 flex items-center justify-between">
          <div className="text-caption text-brand-text-secondary">
            <span className="font-semibold text-brand-text-primary">Factuurnummer: </span>
            <span className="font-mono">{nextFactuurNumber(companyId, company.prefix.factuur)}</span>
          </div>
          <button onClick={handleSave} disabled={!client.name} className="btn-primary disabled:opacity-50">
            <Save size={15} /> Factuur opslaan
          </button>
        </div>
      </div>
    </div>
  )
}
