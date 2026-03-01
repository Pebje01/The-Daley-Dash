'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, Send, Download, CheckCircle2, XCircle, Trash2,
  Copy, ExternalLink, Eye, Clock, RefreshCw, Save, Plus, GripVertical, ChevronDown,
  Sparkles, Loader2, ChevronLeft
} from 'lucide-react'
import { getCompany, COMPANIES } from '@/lib/companies'
import { Offerte, LineItem, CompanyId, OfferteStatus } from '@/lib/types'
import { OfferteStatusBadge } from '@/components/StatusBadge'
import { downloadOffertePdf } from '@/lib/pdf/offertePdf'
import { pickOfferteFolder, getOfferteFolder } from '@/lib/pdf/folderStorage'

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

export default function OfferteDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [offerte, setOfferte] = useState<Offerte | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [folderName, setFolderName] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const statusMenuRef = useRef<HTMLDivElement>(null)

  // Editable fields
  const [client, setClient] = useState({ name: '', contactPerson: '', email: '', phone: '' })
  const [sections, setSections] = useState<Section[]>([])
  const [btwPct, setBtwPct] = useState(21)
  const [introText, setIntroText] = useState('')
  const [termsText, setTermsText] = useState('')
  const [companyId, setCompanyId] = useState<CompanyId>('tde')

  // AI herschrijf state
  const [showAiRewrite, setShowAiRewrite] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState('')

  const fetchOfferte = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/offertes/${id}`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      setOfferte(data)
      setClient({
        name: data.client.name || '',
        contactPerson: data.client.contactPerson || '',
        email: data.client.email || '',
        phone: data.client.phone || '',
      })
      setSections(itemsToSections(data.items || []))
      setBtwPct(data.btwPercentage)
      setIntroText(data.introText || '')
      setTermsText(data.termsText || '')
      setCompanyId(data.companyId)
    } catch {
      router.push('/offertes')
    }
    setLoading(false)
  }, [id, router])

  useEffect(() => { fetchOfferte() }, [fetchOfferte])

  useEffect(() => {
    getOfferteFolder().then(h => { if (h) setFolderName(h.name) })
  }, [])

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

  if (loading || !offerte) {
    return (
      <div className="p-8 flex items-center gap-2 text-brand-text-secondary">
        <RefreshCw size={16} className="animate-spin" /> Laden…
      </div>
    )
  }

  const company = getCompany(offerte.companyId)

  const handleStatusChange = async (status: OfferteStatus) => {
    try {
      await fetch(`/api/offertes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      fetchOfferte()
    } catch {
      alert('Status wijzigen mislukt')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Weet je zeker dat je deze offerte wilt verwijderen?')) return
    try {
      await fetch(`/api/offertes/${id}`, { method: 'DELETE' })
      router.push('/offertes')
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
      const patchRes = await fetch(`/api/offertes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          client,
          items: flatItems,
          subtotal,
          btwPercentage: btwPct,
          btwAmount,
          total,
          introText: introText || undefined,
          termsText: termsText || undefined,
        }),
      })
      if (!patchRes.ok) throw new Error('Opslaan mislukt')

      // Haal bijgewerkte offerte op en download PDF automatisch
      const freshRes = await fetch(`/api/offertes/${id}`)
      if (freshRes.ok) {
        const freshData: Offerte = await freshRes.json()
        setOfferte(freshData)
        setClient({
          name: freshData.client.name || '',
          contactPerson: freshData.client.contactPerson || '',
          email: freshData.client.email || '',
          phone: freshData.client.phone || '',
        })
        setSections(itemsToSections(freshData.items || []))
        setBtwPct(freshData.btwPercentage)
        setIntroText(freshData.introText || '')
        setTermsText(freshData.termsText || '')
        setCompanyId(freshData.companyId)

        const pdfCompany = getCompany(freshData.companyId)
        downloadOffertePdf(freshData, pdfCompany)
      }

      setEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 5000)
    } catch {
      alert('Opslaan mislukt')
    }
    setSaving(false)
  }

  const handleAiRewrite = async () => {
    setAiGenerating(true)
    setAiError('')
    try {
      const res = await fetch('/api/offertes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          clientName: client.name,
          contactPerson: client.contactPerson || undefined,
          prompt: aiPrompt,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'AI generatie mislukt')
      }
      const result = await res.json()

      // Pas AI resultaat toe op de edit-velden
      const newSections: Section[] = result.sections.map((s: { title: string; items: { description: string; details?: string; quantity: number; unitPrice: number }[] }) => ({
        id: crypto.randomUUID(),
        title: s.title,
        items: s.items.map((item: { description: string; details?: string; quantity: number; unitPrice: number }) => ({
          id: crypto.randomUUID(),
          description: item.description,
          details: item.details || '',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      }))

      // Klantgegevens invullen (overschrijf alleen als AI iets gevonden heeft)
      if (result.client) {
        setClient(prev => ({
          name: result.client.name || prev.name,
          contactPerson: result.client.contactPerson || prev.contactPerson,
          email: result.client.email || prev.email,
          phone: result.client.phone || prev.phone,
        }))
      }

      setSections(newSections)
      setIntroText(result.introText || '')
      setTermsText(result.termsText || '')
      setBtwPct(result.btwPercentage || 21)
      setShowAiRewrite(false)
      setAiPrompt('')
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'AI generatie mislukt')
    } finally {
      setAiGenerating(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const publicUrl = offerte.slug
    ? `${window.location.origin}/offerte/${offerte.slug}`
    : null

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
  const viewSections = offerte.items.reduce<{ title: string; items: LineItem[] }[]>((acc, item) => {
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
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/offertes')} className="btn-secondary px-2.5">
          <ArrowLeft size={15} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-uxum text-sidebar-t text-brand-text-primary">{offerte.number}</h1>
            {/* Klikbare status dropdown */}
            <div className="relative" ref={statusMenuRef}>
              <button
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <OfferteStatusBadge status={offerte.status} />
                <ChevronDown size={12} className={`text-brand-text-secondary transition-transform ${statusMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {statusMenuOpen && (
                <div className="absolute top-full left-0 mt-1 bg-brand-card-bg border border-brand-card-border rounded-brand shadow-lg z-20 min-w-[160px] py-1">
                  {(['concept', 'opgeslagen', 'verstuurd', 'akkoord', 'afgewezen', 'verlopen'] as OfferteStatus[])
                    .filter(s => s !== offerte.status)
                    .map(s => (
                      <button
                        key={s}
                        onClick={() => {
                          handleStatusChange(s)
                          setStatusMenuOpen(false)
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-brand-page-light transition-colors flex items-center gap-2"
                      >
                        <OfferteStatusBadge status={s} />
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-caption text-brand-text-secondary mt-0.5">
            {offerte.client.name} · <span style={{ color: company.color }}>{company.name}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => setEditing(!editing)} className="btn-secondary">
            {editing ? 'Annuleer' : 'Bewerken'}
          </button>
          {(offerte.status === 'concept' || offerte.status === 'opgeslagen') && (
            <button onClick={() => handleStatusChange('verstuurd')} className="btn-primary">
              <Send size={14} /> Markeer als verstuurd
            </button>
          )}
          {offerte.status === 'verstuurd' && (
            <>
              <button onClick={() => handleStatusChange('akkoord')} className="btn-secondary text-brand-lime-accent">
                <CheckCircle2 size={14} /> Akkoord
              </button>
              <button onClick={() => handleStatusChange('afgewezen')} className="btn-secondary text-brand-pink-accent">
                <XCircle size={14} /> Afgewezen
              </button>
            </>
          )}
          <button onClick={() => downloadOffertePdf(offerte, company)} className="btn-secondary">
            <Download size={14} /> PDF downloaden
          </button>
          <button onClick={handleDelete} className="btn-secondary text-brand-status-red hover:bg-brand-pink">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-brand-lime/20 border border-brand-lime-accent/30 text-brand-lime-accent rounded-brand px-4 py-3 mb-5 text-body flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} /> Offerte bijgewerkt — online pagina en PDF zijn opnieuw gegenereerd
          </span>
          <button onClick={() => setSaveSuccess(false)} className="text-brand-lime-accent/60 hover:text-brand-lime-accent transition-colors text-caption">
            Sluiten
          </button>
        </div>
      )}

      {editing ? (
        /* ── Edit mode ──────────────────────────────────────────────── */
        <div className="space-y-5">
          {/* AI Herschrijf optie — bovenaan */}
          {!showAiRewrite ? (
            <button
              onClick={() => setShowAiRewrite(true)}
              className="flex items-center gap-1.5 text-caption text-brand-text-secondary hover:text-brand-text-primary transition-colors"
            >
              <Sparkles size={14} />
              <span>Herschrijf met AI</span>
            </button>
          ) : (
            <div className="card border-2 border-brand-lavender">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-brand-text-primary" />
                <h2 className="font-semibold text-body">Herschrijf offerte met AI</h2>
              </div>
              <p className="text-caption text-brand-text-secondary mb-3">
                Beschrijf wat je wilt — AI herkent klantgegevens, diensten en prijzen automatisch en vult alle velden in.
              </p>
              <textarea
                className="input h-32 resize-none mb-1"
                placeholder={`Bijv. "Offerte voor Jan de Vries van Makelaardij Amsterdam (jan@mak.nl, 06-12345678). Website redesign inclusief homepage en contactpagina."`}
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                disabled={aiGenerating}
              />
              <p className="text-caption text-brand-text-secondary/60 mb-3">
                Vermeld klantgegevens en gewenste diensten. AI vult alles automatisch in.
              </p>
              {aiError && (
                <div className="bg-brand-pink border border-brand-pink-accent/30 text-brand-status-red rounded-brand px-3 py-2 mb-3 text-caption">
                  {aiError}
                </div>
              )}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setShowAiRewrite(false); setAiPrompt(''); setAiError('') }}
                  className="btn-secondary"
                  disabled={aiGenerating}
                >
                  <ChevronLeft size={14} /> Terug naar handmatig
                </button>
                <button
                  onClick={handleAiRewrite}
                  disabled={!aiPrompt.trim() || aiGenerating}
                  className="btn-primary disabled:opacity-50"
                >
                  {aiGenerating ? (
                    <><Loader2 size={15} className="animate-spin" /> AI verwerkt tekst…</>
                  ) : (
                    <><Sparkles size={15} /> Genereer offerte</>
                  )}
                </button>
              </div>
            </div>
          )}

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
            </div>
          </div>

          {/* Introductietekst */}
          <div className="card">
            <h2 className="font-semibold text-body mb-3">Introductietekst (optioneel)</h2>
            <textarea className="input h-20 resize-none" placeholder="Bijv. Bedankt voor je aanvraag! Hieronder vind je..."
              value={introText} onChange={e => setIntroText(e.target.value)} />
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

          {/* Voorwaarden */}
          <div className="card">
            <h2 className="font-semibold text-body mb-3">Voorwaarden & opmerkingen</h2>
            <textarea className="input h-24 resize-none" placeholder="Bijv. Betalingstermijn 14 dagen..."
              value={termsText} onChange={e => setTermsText(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="btn-secondary">Annuleer</button>
            <button onClick={handleSaveEdit} disabled={saving} className="btn-primary">
              <Save size={14} /> {saving ? 'Opslaan…' : 'Wijzigingen opslaan'}
            </button>
          </div>
        </div>
      ) : (
        /* ── View mode ──────────────────────────────────────────────── */
        <div className="space-y-5">
          <div className="card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-semibold text-body mb-1">Status beheren</h2>
                <p className="text-caption text-brand-text-secondary">
                  Pas de status van deze offerte direct hier aan.
                </p>
              </div>
              <OfferteStatusBadge status={offerte.status} />
            </div>
            <div className="flex gap-2 flex-wrap mt-4">
              {(offerte.status === 'concept' || offerte.status === 'opgeslagen') && (
                <button onClick={() => handleStatusChange('verstuurd')} className="btn-primary">
                  <Send size={14} /> Markeer als verstuurd
                </button>
              )}
              {offerte.status !== 'concept' && (
                <button onClick={() => handleStatusChange('concept')} className="btn-secondary">
                  Concept
                </button>
              )}
              {offerte.status !== 'opgeslagen' && (
                <button onClick={() => handleStatusChange('opgeslagen')} className="btn-secondary">
                  Opgeslagen
                </button>
              )}
              {offerte.status !== 'verstuurd' && (
                <button onClick={() => handleStatusChange('verstuurd')} className="btn-secondary">
                  Verstuurd
                </button>
              )}
              {offerte.status !== 'akkoord' && (
                <button onClick={() => handleStatusChange('akkoord')} className="btn-secondary text-brand-lime-accent">
                  <CheckCircle2 size={14} /> Akkoord
                </button>
              )}
              {offerte.status !== 'afgewezen' && (
                <button onClick={() => handleStatusChange('afgewezen')} className="btn-secondary text-brand-pink-accent">
                  <XCircle size={14} /> Afgewezen
                </button>
              )}
              {offerte.status !== 'verlopen' && (
                <button onClick={() => handleStatusChange('verlopen')} className="btn-secondary">
                  Verlopen
                </button>
              )}
            </div>
          </div>

          {/* Client link section */}
          {publicUrl && (
            <div className="card bg-brand-page-light">
              <h2 className="font-semibold text-body mb-3 flex items-center gap-2">
                <ExternalLink size={14} /> Online offertepagina
              </h2>
              <div className="flex items-center gap-3 text-caption">
                <code className="bg-brand-card-bg px-3 py-1.5 rounded-brand-sm border border-brand-card-border flex-1 truncate">
                  {publicUrl}
                </code>
                <button onClick={() => copyToClipboard(publicUrl)} className="btn-secondary py-1.5 px-2.5" title="Kopieer link">
                  {copied ? <CheckCircle2 size={13} className="text-brand-lime-accent" /> : <Copy size={13} />}
                </button>
                <a href={publicUrl} target="_blank" rel="noopener" className="btn-secondary py-1.5 px-2.5" title="Open in browser">
                  <Eye size={13} />
                </a>
              </div>
            </div>
          )}

          {/* PDF map info */}
          <div className="card bg-brand-page-light">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-body">
                <Download size={14} className="text-brand-text-secondary" />
                <span className="text-brand-text-secondary">PDF-opslagmap:</span>
                {folderName ? (
                  <span className="font-semibold text-brand-text-primary">{folderName}/</span>
                ) : (
                  <span className="text-brand-text-secondary italic">Nog niet ingesteld</span>
                )}
              </div>
              <button
                onClick={async () => {
                  const handle = await pickOfferteFolder()
                  if (handle) setFolderName(handle.name)
                }}
                className="btn-secondary py-1.5 text-caption"
              >
                {folderName ? 'Wijzig map' : 'Kies map'}
              </button>
            </div>
          </div>

          {/* Info grid */}
          <div className="card">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-3">Offerte details</h3>
                <dl className="space-y-2 text-body">
                  <div className="flex justify-between">
                    <dt className="text-brand-text-secondary">Nummer</dt>
                    <dd className="font-mono">{offerte.number}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-text-secondary">Bedrijf</dt>
                    <dd><span className="text-pill px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: company.bgColor, color: company.color }}>{company.name}</span></dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-text-secondary">Datum</dt>
                    <dd>{new Date(offerte.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-brand-text-secondary">Geldig tot</dt>
                    <dd className={new Date(offerte.validUntil) < new Date() ? 'text-brand-status-red font-semibold' : ''}>
                      {new Date(offerte.validUntil).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-3">Klant</h3>
                <dl className="space-y-2 text-body">
                  <div className="flex justify-between">
                    <dt className="text-brand-text-secondary">Naam</dt>
                    <dd className="font-semibold">{offerte.client.name}</dd>
                  </div>
                  {offerte.client.contactPerson && (
                    <div className="flex justify-between">
                      <dt className="text-brand-text-secondary">Contactpersoon</dt>
                      <dd>{offerte.client.contactPerson}</dd>
                    </div>
                  )}
                  {offerte.client.email && (
                    <div className="flex justify-between">
                      <dt className="text-brand-text-secondary">E-mail</dt>
                      <dd>{offerte.client.email}</dd>
                    </div>
                  )}
                  {offerte.client.phone && (
                    <div className="flex justify-between">
                      <dt className="text-brand-text-secondary">Telefoon</dt>
                      <dd>{offerte.client.phone}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </div>

          {/* Intro text */}
          {offerte.introText && (
            <div className="card bg-brand-lime/10">
              <p className="text-body text-brand-text-primary whitespace-pre-wrap">{offerte.introText}</p>
            </div>
          )}

          {/* Line items grouped by section */}
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-body">
              <thead className="bg-brand-page-light border-b border-brand-page-medium">
                <tr>
                  <th className="text-left px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Omschrijving</th>
                  <th className="text-center px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Aantal</th>
                  <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Prijs</th>
                  <th className="text-right px-5 py-3 text-caption text-brand-text-secondary uppercase tracking-wide">Totaal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-page-medium">
                {viewSections.map((section, sIdx) => (
                  <>
                    {section.title && (
                      <tr key={`section-${sIdx}`} className="bg-brand-page-light/50">
                        <td colSpan={4} className="px-5 py-2.5 font-semibold text-brand-text-primary text-caption uppercase tracking-wide">
                          {section.title}
                        </td>
                      </tr>
                    )}
                    {section.items.map(item => (
                      <tr key={item.id}>
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-brand-text-primary">{item.description}</div>
                          {item.details && <div className="text-caption text-brand-text-secondary mt-0.5">{item.details}</div>}
                        </td>
                        <td className="px-5 py-3.5 text-center text-brand-text-secondary">{item.quantity}</td>
                        <td className="px-5 py-3.5 text-right text-brand-text-secondary">{euro(item.unitPrice)}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-brand-text-primary">{euro(item.quantity * item.unitPrice)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
            <div className="border-t border-brand-page-medium px-5 py-4">
              <div className="ml-auto max-w-xs space-y-2">
                <div className="flex justify-between text-body">
                  <span className="text-brand-text-secondary">Subtotaal</span>
                  <span className="font-semibold">{euro(offerte.subtotal)}</span>
                </div>
                <div className="flex justify-between text-body">
                  <span className="text-brand-text-secondary">BTW {offerte.btwPercentage}%</span>
                  <span>{euro(offerte.btwAmount)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-brand-page-medium pt-2">
                  <span>Totaal</span>
                  <span>{euro(offerte.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Terms */}
          {offerte.termsText && (
            <div className="card">
              <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-2">Voorwaarden & opmerkingen</h3>
              <p className="text-body text-brand-text-primary whitespace-pre-wrap">{offerte.termsText}</p>
            </div>
          )}

          {/* Notes (legacy) */}
          {offerte.notes && (
            <div className="card">
              <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-2">Notities</h3>
              <p className="text-body text-brand-text-primary whitespace-pre-wrap">{offerte.notes}</p>
            </div>
          )}

          {/* Approval info */}
          {offerte.approvedAt && (
            <div className="card bg-brand-lime/20 border-brand-lime-accent/30">
              <h3 className="font-semibold text-body text-brand-lime-accent flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} /> Goedgekeurd
              </h3>
              <dl className="space-y-1 text-caption text-brand-text-secondary">
                <div className="flex gap-3">
                  <dt>Door:</dt>
                  <dd className="text-brand-text-primary">{offerte.approvedByName} ({offerte.approvedByEmail})</dd>
                </div>
                <div className="flex gap-3">
                  <dt>Datum:</dt>
                  <dd className="text-brand-text-primary">{new Date(offerte.approvedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex gap-4 text-caption text-brand-text-secondary">
            <span className="flex items-center gap-1"><Clock size={11} /> Aangemaakt: {new Date(offerte.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span className="flex items-center gap-1"><Clock size={11} /> Bijgewerkt: {new Date(offerte.updatedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      )}
    </div>
  )
}
