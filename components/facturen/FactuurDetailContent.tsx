'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Send, Download, CheckCircle2, XCircle, Trash2,
  Clock, RefreshCw, Save, Plus, GripVertical, ChevronDown, CreditCard,
  FileText, FolderOpen
} from 'lucide-react'
import { getCompany, COMPANIES } from '@/lib/companies'
import { Factuur, LineItem, CompanyId, FactuurStatus } from '@/lib/types'
import { FactuurStatusBadge } from '@/components/StatusBadge'
import { getFacturenFolder, pickFacturenFolder } from '@/lib/pdf/folderStorage'
import { dataChanged } from '@/lib/events'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

interface Section {
  id: string
  title: string
  items: LineItem[]
}

// Build sections from flat items (group by sectionTitle, preserve order)
function itemsToSections(items: LineItem[]): Section[] {
  if (items.length === 0) return [{ id: crypto.randomUUID(), title: '', items: [{ id: crypto.randomUUID(), description: '', details: '', quantity: 1, unitPrice: 0 }] }]
  const sections: Section[] = []
  let currentTitle: string | undefined = undefined
  for (const item of items) {
    const title = item.sectionTitle || ''
    if (sections.length === 0 || title !== currentTitle) {
      sections.push({ id: crypto.randomUUID(), title, items: [] })
      currentTitle = title
    }
    sections[sections.length - 1].items.push(item)
  }
  return sections
}

interface FactuurDetailContentProps {
  id: string
  onClose?: () => void
  isDrawer?: boolean
}

export default function FactuurDetailContent({ id, onClose, isDrawer }: FactuurDetailContentProps) {
  const router = useRouter()
  const [factuur, setFactuur] = useState<Factuur | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const [pdfSaving, setPdfSaving] = useState(false)
  const [pdfFolderName, setPdfFolderName] = useState<string | null>(null)

  // Navigation helper: use onClose for drawer mode, router for page mode
  const goBack = () => {
    if (onClose) onClose()
    else router.push('/facturen')
  }

  // Editable fields
  const [client, setClient] = useState({
    name: '', contactPerson: '', email: '', phone: '', address: '', kvk: '', btw: '',
  })
  const [sections, setSections] = useState<Section[]>([])
  const [btwPct, setBtwPct] = useState(21)
  const [notes, setNotes] = useState('')
  const [molliePaymentUrl, setMolliePaymentUrl] = useState('')
  const [companyId, setCompanyId] = useState<CompanyId>('tde')
  const [factuurDate, setFactuurDate] = useState('')
  const [factuurDueDate, setFactuurDueDate] = useState('')
  const [revenueDate, setRevenueDate] = useState('')
  const [paidAtDate, setPaidAtDate] = useState('')

  const fetchFactuur = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/facturen/${id}`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      setFactuur(data)
      setClient({
        name: data.client.name || '',
        contactPerson: data.client.contactPerson || '',
        email: data.client.email || '',
        phone: data.client.phone || '',
        address: data.client.address || '',
        kvk: data.client.kvk || '',
        btw: data.client.btw || '',
      })
      setSections(itemsToSections(data.items || []))
      setBtwPct(data.btwPercentage)
      setNotes(data.notes || '')
      setMolliePaymentUrl(data.molliePaymentUrl || '')
      setCompanyId(data.companyId)
      setFactuurDate(data.date ? data.date.split('T')[0] : '')
      setFactuurDueDate(data.dueDate ? data.dueDate.split('T')[0] : '')
      setRevenueDate(data.revenueDate ? data.revenueDate.split('T')[0] : '')
      setPaidAtDate(data.paidAt ? data.paidAt.split('T')[0] : '')
    } catch {
      goBack()
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { fetchFactuur() }, [fetchFactuur])

  // Sync: herlaad deze factuur zodra het venster weer focus/zichtbaar wordt,
  // zodat wijzigingen die elders zijn gedaan (bijv. in de database) hier
  // automatisch verschijnen.
  useEffect(() => {
    const onFocus = () => fetchFactuur()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchFactuur() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchFactuur])

  // Haal facturen mapnaam op voor weergave in knop
  useEffect(() => {
    getFacturenFolder().then(h => setPdfFolderName(h?.name ?? null)).catch(() => {})
  }, [])

  const handleSavePdf = async () => {
    if (!factuur) return
    setPdfSaving(true)
    try {
      // Regenereer via de gedeelde server-generator: zelfde stijl en map als de
      // factuur die automatisch vanuit uren is aangemaakt (single source of truth).
      const res = await fetch(`/api/facturen/${id}/regenerate-pdf`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'PDF opslaan mislukt')
      }
    } catch (err) {
      console.error('PDF opslaan mislukt:', err)
      alert('PDF opslaan mislukt')
    }
    setPdfSaving(false)
  }

  const handlePickFolder = async () => {
    const handle = await pickFacturenFolder()
    if (handle) setPdfFolderName(handle.name)
  }

  // Sluit status dropdown bij klik buiten het menu
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false)
      }
    }
    if (statusMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [statusMenuOpen])

  if (loading || !factuur) {
    return (
      <div className={`${isDrawer ? 'p-6' : 'p-8'} flex items-center gap-2 text-brand-text-secondary`}>
        <RefreshCw size={16} className="animate-spin" /> Laden...
      </div>
    )
  }

  const company = getCompany(factuur.companyId)
  const isOverdue = factuur.status === 'te-laat' || ((factuur.status === 'verzonden' || factuur.status === 'herinnering-verzonden') && new Date(factuur.dueDate) < new Date())

  const handleStatusChange = async (status: FactuurStatus) => {
    try {
      const body: Record<string, unknown> = { status }
      // Auto-set paidAt when marking as betaald
      if (status === 'betaald') {
        body.paidAt = new Date().toISOString()
      }
      await fetch(`/api/facturen/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      dataChanged('facturen')
      fetchFactuur()
    } catch {
      alert('Status wijzigen mislukt')
    }
  }

  const handleMarkAsPaid = async () => {
    await handleStatusChange('betaald')
  }

  const handleDelete = async () => {
    if (!confirm('Weet je zeker dat je deze factuur wilt verwijderen?')) return
    try {
      await fetch(`/api/facturen/${id}`, { method: 'DELETE' })
      dataChanged('facturen')
      goBack()
    } catch {
      alert('Verwijderen mislukt')
    }
  }

  const handleSaveEdit = async () => {
    setSaving(true)
    const flatItems = sections.flatMap(s =>
      s.items.map(item => ({
        description: item.description,
        details: item.details || undefined,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        sectionTitle: s.title || undefined,
      }))
    )
    const subtotal = flatItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const btwAmount = subtotal * (btwPct / 100)
    const total = subtotal + btwAmount

    try {
      const patchRes = await fetch(`/api/facturen/${id}`, {
        method: 'PATCH',
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
          subtotal,
          btwPercentage: btwPct,
          btwAmount,
          total,
          notes: notes || undefined,
          molliePaymentUrl: molliePaymentUrl || undefined,
          date: factuurDate || undefined,
          dueDate: factuurDueDate || undefined,
          revenueDate: revenueDate || null,
          paidAt: factuur.status === 'betaald' || paidAtDate
            ? (paidAtDate ? `${paidAtDate}T12:00:00+01:00` : null)
            : null,
        }),
      })
      if (!patchRes.ok) throw new Error('Opslaan mislukt')
      dataChanged('facturen')

      // Haal bijgewerkte factuur op
      const freshRes = await fetch(`/api/facturen/${id}`)
      if (freshRes.ok) {
        const freshData: Factuur = await freshRes.json()
        setFactuur(freshData)
        setClient({
          name: freshData.client.name || '',
          contactPerson: freshData.client.contactPerson || '',
          email: freshData.client.email || '',
          phone: freshData.client.phone || '',
          address: freshData.client.address || '',
          kvk: freshData.client.kvk || '',
          btw: freshData.client.btw || '',
        })
        setSections(itemsToSections(freshData.items || []))
        setBtwPct(freshData.btwPercentage)
        setNotes(freshData.notes || '')
        setMolliePaymentUrl(freshData.molliePaymentUrl || '')
        setCompanyId(freshData.companyId)
        setFactuurDate(freshData.date ? freshData.date.split('T')[0] : '')
        setFactuurDueDate(freshData.dueDate ? freshData.dueDate.split('T')[0] : '')
        setRevenueDate(freshData.revenueDate ? freshData.revenueDate.split('T')[0] : '')
        setPaidAtDate(freshData.paidAt ? freshData.paidAt.split('T')[0] : '')
      }

      setEditing(false)
    } catch {
      alert('Opslaan mislukt')
    }
    setSaving(false)
  }

  // Section helpers for edit mode
  const updateSectionTitle = (sectionId: string, title: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, title } : s))
  }
  const addSection = () => setSections(prev => [...prev, { id: crypto.randomUUID(), title: '', items: [{ id: crypto.randomUUID(), description: '', details: '', quantity: 1, unitPrice: 0 }] }])
  const removeSection = (sectionId: string) => {
    setSections(prev => prev.length > 1 ? prev.filter(s => s.id !== sectionId) : prev)
  }
  const moveSectionUp = (idx: number) => {
    if (idx === 0) return
    setSections(prev => { const next = [...prev]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next })
  }
  const moveSectionDown = (idx: number) => {
    setSections(prev => { if (idx >= prev.length - 1) return prev; const next = [...prev]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; return next })
  }
  const updateItem = (sectionId: string, itemId: string, field: keyof LineItem, value: any) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, [field]: value } : i) } : s))
  }
  const addItem = (sectionId: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, items: [...s.items, { id: crypto.randomUUID(), description: '', details: '', quantity: 1, unitPrice: 0 }] } : s))
  }
  const removeItem = (sectionId: string, itemId: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s))
  }

  const allEditItems = sections.flatMap(s => s.items)
  const editSubtotal = allEditItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const editBtwAmount = editSubtotal * (btwPct / 100)
  const editTotal = editSubtotal + editBtwAmount

  // Group items by section for view mode
  const viewSections = factuur.items.reduce<{ title: string; items: LineItem[] }[]>((acc, item) => {
    const title = item.sectionTitle || ''
    const last = acc[acc.length - 1]
    if (last && last.title === title) {
      last.items.push(item)
    } else {
      acc.push({ title, items: [item] })
    }
    return acc
  }, [])

  return (
    <div className={isDrawer ? 'p-6' : ''}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        {!isDrawer && (
          <button onClick={goBack} className="btn-secondary px-2.5 self-start">
            <ArrowLeft size={15} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-uxum text-sidebar-t text-brand-text-primary whitespace-nowrap">{factuur.number}</h1>
            {/* Klikbare status dropdown */}
            <div className="relative" ref={statusMenuRef}>
              <button
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <FactuurStatusBadge status={isOverdue && factuur.status === 'verzonden' ? 'te-laat' : factuur.status} />
                <ChevronDown size={12} className={`text-brand-text-secondary transition-transform ${statusMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {statusMenuOpen && (
                <div className="absolute top-full left-0 mt-1 bg-brand-card-bg border border-brand-card-border rounded-brand shadow-lg z-20 min-w-[160px] py-1">
                  {(['concept', 'verzonden', 'herinnering-verzonden', 'betaald', 'te-laat', 'geannuleerd'] as FactuurStatus[])
                    .filter(s => s !== factuur.status)
                    .map(s => (
                      <button
                        key={s}
                        onClick={() => {
                          handleStatusChange(s)
                          setStatusMenuOpen(false)
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-brand-page-light transition-colors flex items-center gap-2"
                      >
                        <FactuurStatusBadge status={s} />
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-caption text-brand-text-secondary mt-0.5">
            {factuur.client.name} · <span style={{ color: company.color }}>{company.name}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-start sm:justify-end">
          {/* PDF opslaan */}
          <button
            onClick={handlePickFolder}
            className="btn-secondary px-2.5"
            title={pdfFolderName ? `Facturen map: ${pdfFolderName}` : 'Selecteer facturen map'}
          >
            <FolderOpen size={14} />
            {pdfFolderName && (
              <span className="text-caption max-w-[100px] truncate">{pdfFolderName}</span>
            )}
          </button>
          <button
            onClick={handleSavePdf}
            disabled={pdfSaving}
            className="btn-secondary"
            title="Factuur opslaan als PDF"
          >
            <FileText size={14} />
            {pdfSaving ? 'Opslaan...' : 'PDF opslaan'}
          </button>
          <button onClick={() => setEditing(!editing)} className="btn-secondary">
            {editing ? 'Annuleer' : 'Bewerken'}
          </button>
          {(factuur.status === 'concept') && (
            <button onClick={() => handleStatusChange('verzonden')} className="btn-primary">
              <Send size={14} /> Markeer als verzonden
            </button>
          )}
          {(factuur.status === 'verzonden' || factuur.status === 'herinnering-verzonden' || factuur.status === 'te-laat') && (
            <button onClick={handleMarkAsPaid} className="btn-primary">
              <CreditCard size={14} /> Markeer als betaald
            </button>
          )}
          {(factuur.status === 'verzonden' || factuur.status === 'te-laat') && (
            <button onClick={() => handleStatusChange('herinnering-verzonden')} className="btn-secondary text-brand-status-orange">
              <Send size={14} /> Herinnering verzonden
            </button>
          )}
          <button onClick={handleDelete} className="btn-secondary text-brand-status-red hover:bg-brand-pink">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {editing ? (
        /* -- Edit mode ---------------------------------------------------- */
        <div className="space-y-5">
          <div className="card">
            <h2 className="font-semibold text-body mb-4">Bedrijf</h2>
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

          <div className="card">
            <h2 className="font-semibold text-body mb-4">Klantgegevens</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Bedrijfsnaam *</label>
                <input className="input" value={client.name} onChange={e => setClient(p => ({...p, name: e.target.value}))} />
              </div>
              <div>
                <label className="label">Contactpersoon</label>
                <input className="input" value={client.contactPerson} onChange={e => setClient(p => ({...p, contactPerson: e.target.value}))} />
              </div>
              <div>
                <label className="label">E-mailadres</label>
                <input className="input" type="email" value={client.email} onChange={e => setClient(p => ({...p, email: e.target.value}))} />
              </div>
              <div>
                <label className="label">Telefoonnummer</label>
                <input className="input" value={client.phone} onChange={e => setClient(p => ({...p, phone: e.target.value}))} />
              </div>
              <div>
                <label className="label">Adres</label>
                <input className="input" value={client.address} onChange={e => setClient(p => ({...p, address: e.target.value}))} />
              </div>
              <div>
                <label className="label">KVK-nummer</label>
                <input className="input" value={client.kvk} onChange={e => setClient(p => ({...p, kvk: e.target.value}))} />
              </div>
              <div>
                <label className="label">BTW-nummer</label>
                <input className="input" value={client.btw} onChange={e => setClient(p => ({...p, btw: e.target.value}))} />
              </div>
            </div>
          </div>

          {/* Datum & vervaldatum */}
          <div className="card">
            <h2 className="font-semibold text-body mb-4">Datum & vervaldatum</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Factuurdatum</label>
                <input className="input" type="date" value={factuurDate}
                  onChange={e => setFactuurDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Vervaldatum</label>
                <input className="input" type="date" value={factuurDueDate}
                  onChange={e => setFactuurDueDate(e.target.value)} />
              </div>
              {(factuur.status === 'betaald' || paidAtDate) && (
                <div className="col-span-2">
                  <label className="label">
                    Betaaldatum
                    <span className="ml-1.5 text-brand-text-secondary font-normal">(datum waarop de betaling echt binnen was)</span>
                  </label>
                  <input className="input" type="date" value={paidAtDate}
                    onChange={e => setPaidAtDate(e.target.value)} />
                </div>
              )}
              <div className="col-span-2">
                <label className="label">
                  Omzet toerekenen aan
                  <span className="ml-1.5 text-brand-text-secondary font-normal">(optioneel, overschrijft factuurdatum in rapportages)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input className="input flex-1" type="date" value={revenueDate}
                    onChange={e => setRevenueDate(e.target.value)} />
                  {revenueDate && (
                    <button
                      type="button"
                      onClick={() => setRevenueDate('')}
                      className="btn-secondary py-1.5 px-3 text-caption shrink-0"
                    >
                      Wis
                    </button>
                  )}
                </div>
                {revenueDate && (
                  <p className="mt-1 text-caption text-brand-text-secondary">
                    Omzet telt mee in {new Date(revenueDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Secties */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-body">Diensten / producten</h2>
              <button onClick={addSection} className="btn-secondary py-1.5 text-caption">
                <Plus size={13} /> Nieuwe sectie
              </button>
            </div>

            {sections.map((section, sIdx) => (
              <div key={section.id} className="card border-2 border-brand-page-medium">
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
                  <input className="input flex-1 font-semibold" placeholder="Sectie titel (bijv. Website & Design)"
                    value={section.title} onChange={e => updateSectionTitle(section.id, e.target.value)} />
                  {sections.length > 1 && (
                    <button onClick={() => removeSection(section.id)}
                      className="p-2 text-brand-text-secondary hover:text-brand-status-red rounded-brand-sm hover:bg-brand-pink transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {section.items.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-[1fr_100px_100px_100px_36px] gap-2 items-start">
                      <div>
                        <input className="input mb-1" placeholder="Omschrijving" value={item.description}
                          onChange={e => updateItem(section.id, item.id, 'description', e.target.value)} />
                        <input className="input text-caption text-brand-text-secondary" placeholder="Details (optioneel)" value={item.details ?? ''}
                          onChange={e => updateItem(section.id, item.id, 'details', e.target.value)} />
                      </div>
                      <div>
                        {idx === 0 && <label className="label">Aantal</label>}
                        <input className="input" type="number" min="0" step="0.5" value={item.quantity}
                          onChange={e => updateItem(section.id, item.id, 'quantity', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div>
                        {idx === 0 && <label className="label">Prijs</label>}
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
                <span className="font-semibold">{euro(editSubtotal)}</span>
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
                <span>{euro(editBtwAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-brand-page-medium pt-2">
                <span>Totaal</span>
                <span>{euro(editTotal)}</span>
              </div>
            </div>
          </div>

          {/* Mollie betaal-URL */}
          <div className="card space-y-2">
            <h2 className="font-semibold text-body">Mollie betaallink</h2>
            <p className="text-caption text-brand-text-secondary">
              Plak hier een Mollie betaal-URL. De link verschijnt automatisch als groene knop op de PDF en publieke offerte-/factuurpagina.
            </p>
            <input
              type="url"
              className="input w-full"
              placeholder="https://www.mollie.com/checkout/..."
              value={molliePaymentUrl}
              onChange={e => setMolliePaymentUrl(e.target.value)}
            />
          </div>

          {/* Notities */}
          <div className="card">
            <h2 className="font-semibold text-body mb-3">Notities</h2>
            <textarea className="input h-24 resize-none" placeholder="Bijv. rekeningnummer, betalingsinstructies..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="btn-secondary">Annuleer</button>
            <button onClick={handleSaveEdit} disabled={saving} className="btn-primary">
              <Save size={14} /> {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
            </button>
          </div>
        </div>
      ) : (
        /* -- View mode ---------------------------------------------------- */
        <div className="space-y-5">
          {/* Status management card */}
          <div className="card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-semibold text-body mb-1">Status beheren</h2>
                <p className="text-caption text-brand-text-secondary">
                  Pas de status van deze factuur direct hier aan.
                </p>
              </div>
              <FactuurStatusBadge status={isOverdue && factuur.status === 'verzonden' ? 'te-laat' : factuur.status} />
            </div>
            <div className="flex gap-2 flex-wrap mt-4">
              {factuur.status === 'concept' && (
                <button onClick={() => handleStatusChange('verzonden')} className="btn-primary">
                  <Send size={14} /> Markeer als verzonden
                </button>
              )}
              {(factuur.status === 'verzonden' || factuur.status === 'herinnering-verzonden' || factuur.status === 'te-laat') && (
                <button onClick={handleMarkAsPaid} className="btn-primary">
                  <CreditCard size={14} /> Markeer als betaald
                </button>
              )}
              {factuur.status !== 'concept' && (
                <button onClick={() => handleStatusChange('concept')} className="btn-secondary">
                  Concept
                </button>
              )}
              {factuur.status !== 'verzonden' && (
                <button onClick={() => handleStatusChange('verzonden')} className="btn-secondary">
                  Verzonden
                </button>
              )}
              {factuur.status !== 'herinnering-verzonden' && (
                <button onClick={() => handleStatusChange('herinnering-verzonden')} className="btn-secondary text-brand-status-orange">
                  <Send size={14} /> Herinnering verzonden
                </button>
              )}
              {factuur.status !== 'betaald' && (
                <button onClick={() => handleStatusChange('betaald')} className="btn-secondary text-brand-lime-accent">
                  <CheckCircle2 size={14} /> Betaald
                </button>
              )}
              {factuur.status !== 'te-laat' && (
                <button onClick={() => handleStatusChange('te-laat')} className="btn-secondary text-brand-pink-accent">
                  <XCircle size={14} /> Te laat
                </button>
              )}
              {factuur.status !== 'geannuleerd' && (
                <button onClick={() => handleStatusChange('geannuleerd')} className="btn-secondary">
                  Geannuleerd
                </button>
              )}
            </div>
          </div>

          {/* Overdue warning */}
          {isOverdue && (
            <div className="card bg-brand-pink/30 border-brand-pink-accent/30">
              <div className="flex items-center gap-2 text-brand-status-red font-semibold text-body">
                <Clock size={16} />
                <span>Deze factuur is te laat! Vervaldatum was {new Date(factuur.dueDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
            </div>
          )}

          {/* Info grid */}
          <div className="card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="min-w-0">
                <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-3">Factuur details</h3>
                <dl className="space-y-2 text-body">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                    <dt className="text-brand-text-secondary shrink-0">Nummer</dt>
                    <dd className="font-mono">{factuur.number}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                    <dt className="text-brand-text-secondary shrink-0">Bedrijf</dt>
                    <dd><span className="text-pill px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: company.bgColor, color: company.color }}>{company.name}</span></dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                    <dt className="text-brand-text-secondary shrink-0">Datum</dt>
                    <dd>{new Date(factuur.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                    <dt className="text-brand-text-secondary shrink-0">Vervaldatum</dt>
                    <dd className={isOverdue ? 'text-brand-status-red font-semibold' : ''}>
                      {new Date(factuur.dueDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </dd>
                  </div>
                  {factuur.offerteId && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                      <dt className="text-brand-text-secondary shrink-0">Gekoppelde offerte</dt>
                      <dd>
                        <button
                          onClick={() => router.push(`/offertes/${factuur.offerteId}`)}
                          className="text-brand-purple font-semibold underline underline-offset-2"
                        >
                          Bekijk offerte
                        </button>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="min-w-0">
                <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-3">Klant</h3>
                <dl className="space-y-2 text-body">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                    <dt className="text-brand-text-secondary shrink-0">Naam</dt>
                    <dd className="font-semibold">{factuur.client.name}</dd>
                  </div>
                  {factuur.client.contactPerson && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                      <dt className="text-brand-text-secondary shrink-0">Contactpersoon</dt>
                      <dd>{factuur.client.contactPerson}</dd>
                    </div>
                  )}
                  {factuur.client.email && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                      <dt className="text-brand-text-secondary shrink-0">E-mail</dt>
                      <dd>{factuur.client.email}</dd>
                    </div>
                  )}
                  {factuur.client.phone && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                      <dt className="text-brand-text-secondary shrink-0">Telefoon</dt>
                      <dd>{factuur.client.phone}</dd>
                    </div>
                  )}
                  {factuur.client.address && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                      <dt className="text-brand-text-secondary shrink-0">Adres</dt>
                      <dd className="sm:text-right break-words min-w-0">{factuur.client.address}</dd>
                    </div>
                  )}
                  {factuur.client.kvk && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                      <dt className="text-brand-text-secondary shrink-0">KVK</dt>
                      <dd>{factuur.client.kvk}</dd>
                    </div>
                  )}
                  {factuur.client.btw && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                      <dt className="text-brand-text-secondary shrink-0">BTW-nummer</dt>
                      <dd>{factuur.client.btw}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </div>

          {/* Line items grouped by section */}
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-body">
              <thead className="bg-brand-page-light border-b border-brand-page-medium">
                <tr>
                  <th className="text-left px-3 sm:px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Omschrijving</th>
                  <th className="text-center px-3 sm:px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Aantal</th>
                  <th className="text-right px-3 sm:px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Prijs</th>
                  <th className="text-right px-3 sm:px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Totaal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-page-medium">
                {viewSections.map((section, sIdx) => (
                  <>
                    {section.title && (
                      <tr key={`section-${sIdx}`} className="bg-brand-page-light/50">
                        <td colSpan={4} className="px-3 sm:px-5 py-2.5 font-semibold text-brand-text-primary text-caption uppercase tracking-wide">
                          {section.title}
                        </td>
                      </tr>
                    )}
                    {section.items.map(item => (
                      <tr key={item.id}>
                        <td className="px-3 sm:px-5 py-3.5">
                          <div className="font-semibold text-brand-text-primary">{item.description}</div>
                          {item.details && <div className="text-caption text-brand-text-secondary mt-0.5">{item.details}</div>}
                        </td>
                        <td className="px-3 sm:px-5 py-3.5 text-center text-brand-text-secondary">{item.quantity}</td>
                        <td className="px-3 sm:px-5 py-3.5 text-right text-brand-text-secondary">{euro(item.unitPrice)}</td>
                        <td className="px-3 sm:px-5 py-3.5 text-right font-semibold text-brand-text-primary">{euro(item.quantity * item.unitPrice)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
            </div>
            <div className="border-t border-brand-page-medium px-3 sm:px-5 py-4">
              <div className="ml-auto max-w-xs space-y-2">
                <div className="flex justify-between text-body">
                  <span className="text-brand-text-secondary">Subtotaal</span>
                  <span className="font-semibold">{euro(factuur.subtotal)}</span>
                </div>
                <div className="flex justify-between text-body">
                  <span className="text-brand-text-secondary">BTW {factuur.btwPercentage}%</span>
                  <span>{euro(factuur.btwAmount)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-brand-page-medium pt-2">
                  <span>Totaal</span>
                  <span>{euro(factuur.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mollie betaallink */}
          {factuur.molliePaymentUrl && (
            <div className="card">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-1">Mollie betaallink</h3>
                  <p className="text-caption text-brand-text-primary truncate">{factuur.molliePaymentUrl}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(factuur.molliePaymentUrl!)
                    }}
                    className="btn-secondary"
                    title="Kopieer link"
                  >
                    Kopieer
                  </button>
                  <a
                    href={factuur.molliePaymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                  >
                    Open
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {factuur.notes && (
            <div className="card">
              <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-2">Notities</h3>
              <p className="text-body text-brand-text-primary whitespace-pre-wrap">{factuur.notes}</p>
            </div>
          )}

          {/* Paid info */}
          {factuur.paidAt && (
            <div className="card bg-brand-lime/20 border-brand-lime-accent/30">
              <h3 className="font-semibold text-body text-brand-lime-accent flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} /> Betaald
              </h3>
              <dl className="space-y-1 text-caption text-brand-text-secondary">
                <div className="flex gap-3">
                  <dt>Betaald op:</dt>
                  <dd className="text-brand-text-primary">{new Date(factuur.paidAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex gap-4 text-caption text-brand-text-secondary">
            <span className="flex items-center gap-1"><Clock size={11} /> Aangemaakt: {new Date(factuur.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span className="flex items-center gap-1"><Clock size={11} /> Bijgewerkt: {new Date(factuur.updatedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      )}
    </div>
  )
}
