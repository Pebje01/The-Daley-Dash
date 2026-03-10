'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Send, Download, CheckCircle2, XCircle, Trash2,
  Copy, ExternalLink, Eye, Clock, RefreshCw, Plus, GripVertical, ChevronDown,
  Sparkles, Loader2, ChevronLeft, Check
} from 'lucide-react'
import { getCompany, COMPANIES } from '@/lib/companies'
import { Offerte, LineItem, CompanyId, OfferteStatus } from '@/lib/types'
import { OfferteStatusBadge } from '@/components/StatusBadge'
import { saveOffertePdf } from '@/lib/pdf/offertePdf'
import { pickOfferteFolder, getOfferteFolder } from '@/lib/pdf/folderStorage'
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

/* -- InlineDetailField ---------------------------------------------------- */
function InlineDetailField({
  label,
  value,
  displayValue,
  onChange,
  onSave,
  type = 'text',
  readOnly = false,
  placeholder,
  className = '',
}: {
  label: string
  value: string
  displayValue?: React.ReactNode
  onChange?: (_v: string) => void
  onSave?: () => void
  type?: 'text' | 'date' | 'email' | 'tel'
  readOnly?: boolean
  placeholder?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (type !== 'date') inputRef.current.select()
    }
  }, [editing, type])

  const commit = async () => {
    setEditing(false)
    setError('')
    try {
      await onSave?.()
    } catch {
      setError('Opslaan mislukt')
      setTimeout(() => setError(''), 3000)
    }
  }

  const cancel = () => {
    setEditing(false)
    setError('')
  }

  if (readOnly) {
    return (
      <div className="flex justify-between items-baseline -my-0.5">
        <dt className="text-brand-text-secondary">{label}</dt>
        <dd className={className}>{displayValue || value || <span className="text-brand-text-secondary/40 italic">-</span>}</dd>
      </div>
    )
  }

  return (
    <div className="flex justify-between items-baseline -my-0.5">
      <dt className="text-brand-text-secondary">{label}</dt>
      <dd className="relative">
        {editing ? (
          <input
            ref={inputRef}
            type={type}
            value={value}
            onChange={e => onChange?.(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') cancel()
            }}
            placeholder={placeholder}
            className={`bg-transparent border-b border-brand-card-border/50 focus:border-brand-lavender-dark outline-none text-right py-0.5 px-1 -mx-1 text-body text-brand-text-primary ${className}`}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className={`text-right py-0.5 px-1 -mx-1 rounded-brand-sm hover:bg-brand-page-light border-b border-dashed border-transparent hover:border-brand-text-secondary/30 transition-all cursor-text ${className}`}
          >
            {displayValue || value || <span className="text-brand-text-secondary/40 italic">{placeholder || 'Klik om in te vullen...'}</span>}
          </button>
        )}
        {error && (
          <span className="absolute -bottom-4 right-0 text-brand-status-red text-[10px] whitespace-nowrap">{error}</span>
        )}
      </dd>
    </div>
  )
}

/* -- InlineTextArea ------------------------------------------------------- */
function InlineTextArea({
  value,
  onChange,
  onSave,
  placeholder = 'Klik om tekst toe te voegen...',
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  placeholder?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      // Move cursor to end
      textareaRef.current.selectionStart = textareaRef.current.value.length
    }
  }, [editing])

  // Auto-resize textarea
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [editing, value])

  const commit = async () => {
    setEditing(false)
    setError('')
    try {
      await onSave()
    } catch {
      setError('Opslaan mislukt')
      setTimeout(() => setError(''), 3000)
    }
  }

  return (
    <div className="relative">
      {editing ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => {
            onChange(e.target.value)
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto'
              textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
            }
          }}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setEditing(false)
              setError('')
            }
          }}
          placeholder={placeholder}
          className={`w-full bg-transparent border border-brand-card-border/30 focus:border-brand-lavender-dark rounded-brand-sm outline-none py-2 px-3 text-body text-brand-text-primary resize-none min-h-[60px] ${className}`}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className={`w-full text-left py-2 px-3 -mx-0 rounded-brand-sm hover:bg-brand-page-light border border-dashed border-transparent hover:border-brand-text-secondary/20 transition-all cursor-text min-h-[40px] ${className}`}
        >
          {value ? (
            <span className="text-body text-brand-text-primary whitespace-pre-wrap">{value}</span>
          ) : (
            <span className="text-body text-brand-text-secondary/40 italic">{placeholder}</span>
          )}
        </button>
      )}
      {error && (
        <span className="absolute -bottom-4 left-0 text-brand-status-red text-[10px]">{error}</span>
      )}
    </div>
  )
}

/* -- InlineCompanySelector ------------------------------------------------ */
function InlineCompanySelector({
  companyId,
  onChange,
  onSave,
}: {
  companyId: CompanyId
  onChange: (id: CompanyId) => void
  onSave: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const company = getCompany(companyId)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <div className="flex justify-between items-baseline -my-0.5">
      <dt className="text-brand-text-secondary">Bedrijf</dt>
      <dd className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 py-0.5 px-1 -mx-1 rounded-brand-sm hover:bg-brand-page-light border-b border-dashed border-transparent hover:border-brand-text-secondary/30 transition-all"
        >
          <span className="text-pill px-2 py-0.5 rounded font-semibold" style={{ backgroundColor: company.bgColor, color: company.color }}>
            {company.name}
          </span>
          <ChevronDown size={10} className="text-brand-text-secondary" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 bg-brand-card-bg border border-brand-card-border rounded-brand-sm shadow-lg z-20 py-1 min-w-[180px]">
            {COMPANIES.map(c => (
              <button
                key={c.id}
                onClick={() => {
                  onChange(c.id as CompanyId)
                  setOpen(false)
                  // Defer save so state updates first
                  setTimeout(() => onSave(), 0)
                }}
                className={`w-full text-left px-3 py-2 hover:bg-brand-page-light transition-colors flex items-center gap-2 ${c.id === companyId ? 'bg-brand-page-light' : ''}`}
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-caption">{c.name}</span>
                {c.id === companyId && <Check size={12} className="ml-auto text-brand-lime-accent" />}
              </button>
            ))}
          </div>
        )}
      </dd>
    </div>
  )
}


/* =========================================================================
   MAIN COMPONENT
   ========================================================================= */

interface OfferteDetailContentProps {
  id: string
  onClose?: () => void
  isDrawer?: boolean
}

export default function OfferteDetailContent({ id, onClose, isDrawer }: OfferteDetailContentProps) {
  const router = useRouter()
  const [offerte, setOfferte] = useState<Offerte | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [folderName, setFolderName] = useState<string | null>(null)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const statusMenuRef = useRef<HTMLDivElement>(null)

  // Editable fields (local state synced from server)
  const [client, setClient] = useState({ name: '', contactPerson: '', email: '', phone: '' })
  const [sections, setSections] = useState<Section[]>([])
  const [btwPct, setBtwPct] = useState(21)
  const [introText, setIntroText] = useState('')
  const [termsText, setTermsText] = useState('')
  const [companyId, setCompanyId] = useState<CompanyId>('tde')
  const [offerteDate, setOfferteDate] = useState('')
  const [validUntilDate, setValidUntilDate] = useState('')

  // Auto-save indicator
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // AI herschrijf state
  const [showAiRewrite, setShowAiRewrite] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState('')

  // Verwijder bevestiging
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const goBack = () => {
    if (onClose) onClose()
    else router.push('/offertes')
  }

  const showSaveIndicator = (state: 'saved' | 'error') => {
    setSaveIndicator(state)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setSaveIndicator('idle'), 2000)
  }

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
      setOfferteDate(data.date ? data.date.split('T')[0] : '')
      setValidUntilDate(data.validUntil ? data.validUntil.split('T')[0] : '')
    } catch {
      goBack()
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

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
      <div className={`${isDrawer ? 'p-6' : 'p-8'} flex items-center gap-2 text-brand-text-secondary`}>
        <RefreshCw size={16} className="animate-spin" /> Laden...
      </div>
    )
  }

  const company = getCompany(offerte.companyId)

  /* -- Auto-save helpers -------------------------------------------------- */

  const saveField = async (updates: Record<string, unknown>) => {
    setSaveIndicator('saving')
    try {
      const res = await fetch(`/api/offertes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error()
      await fetchOfferte()
      dataChanged('offertes')
      showSaveIndicator('saved')
    } catch {
      await fetchOfferte() // revert
      showSaveIndicator('error')
      throw new Error('Opslaan mislukt')
    }
  }

  // Save all line items + recalculated totals
  const saveLineItems = async () => {
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

    await saveField({
      items: flatItems,
      subtotal,
      btwPercentage: btwPct,
      btwAmount,
      total,
    })
  }

  const handleStatusChange = async (status: OfferteStatus) => {
    try {
      const res = await fetch(`/api/offertes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) dataChanged('offertes')
      fetchOfferte()
    } catch {
      alert('Status wijzigen mislukt')
    }
  }

  const handleDelete = () => setShowDeleteModal(true)

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await fetch(`/api/offertes/${id}`, { method: 'DELETE' })
      dataChanged('offertes')
      goBack()
    } catch {
      alert('Verwijderen mislukt')
      setDeleting(false)
      setShowDeleteModal(false)
    }
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

      // Klantgegevens invullen
      if (result.client) {
        setClient(prev => ({
          name: result.client.name || prev.name,
          contactPerson: result.client.contactPerson || prev.contactPerson,
          email: result.client.email || prev.email,
          phone: result.client.phone || prev.phone,
        }))
      }

      // Secties + introductietekst bijwerken
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
      setSections(newSections)
      setIntroText(result.introText || '')
      setShowAiRewrite(false)
      setAiPrompt('')

      // Auto-save the AI result
      const flatItems = newSections.flatMap(s =>
        s.items.map(item => ({
          description: item.description,
          details: item.details || undefined,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          sectionTitle: s.title || undefined,
        }))
      )
      const subtotal = flatItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
      const btwAmount = subtotal * (btwPct / 100)
      const total = subtotal + btwAmount
      const updatedClient = result.client ? {
        name: result.client.name || client.name,
        contactPerson: result.client.contactPerson || client.contactPerson,
        email: result.client.email || client.email,
        phone: result.client.phone || client.phone,
      } : client

      await saveField({
        client: updatedClient,
        items: flatItems,
        subtotal,
        btwPercentage: btwPct,
        btwAmount,
        total,
        introText: result.introText || undefined,
      })
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

  // Section helpers
  const updateSectionTitle = (sectionId: string, title: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, title } : s))
  }
  const addSection = () => setSections(prev => [...prev, { id: crypto.randomUUID(), title: '', items: [{ id: crypto.randomUUID(), description: '', details: '', quantity: 1, unitPrice: 0 }] }])
  const removeSection = (sectionId: string) => {
    setSections(prev => {
      const next = prev.length > 1 ? prev.filter(s => s.id !== sectionId) : prev
      return next
    })
  }
  const moveSectionUp = (idx: number) => {
    if (idx === 0) return
    setSections(prev => { const next = [...prev]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next })
  }
  const moveSectionDown = (idx: number) => {
    setSections(prev => { if (idx >= prev.length - 1) return prev; const next = [...prev]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; return next })
  }
  const updateItem = (sectionId: string, itemId: string, field: keyof LineItem, value: string | number) => {
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

  return (
    <div className={isDrawer ? 'p-6' : ''}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {!isDrawer && (
          <button onClick={goBack} className="btn-secondary px-2.5">
            <ArrowLeft size={15} />
          </button>
        )}
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
            {/* Auto-save indicator */}
            <span className={`text-caption transition-opacity duration-300 flex items-center gap-1 ${saveIndicator === 'idle' ? 'opacity-0' : 'opacity-100'}`}>
              {saveIndicator === 'saving' && <><RefreshCw size={10} className="animate-spin" /> <span className="text-brand-text-secondary">Opslaan...</span></>}
              {saveIndicator === 'saved' && <><Check size={10} className="text-brand-lime-accent" /> <span className="text-brand-lime-accent">Opgeslagen</span></>}
              {saveIndicator === 'error' && <span className="text-brand-status-red">Opslaan mislukt</span>}
            </span>
          </div>
          <p className="text-caption text-brand-text-secondary mt-0.5">
            {offerte.client.name} · <span style={{ color: company.color }}>{company.name}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
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
          <button onClick={async () => {
            const result = await saveOffertePdf(offerte, company)
            if (result === 'folder') {
              getOfferteFolder().then(h => { if (h) setFolderName(h.name) })
            }
          }} className="btn-secondary">
            <Download size={14} /> PDF {folderName ? 'opslaan' : 'downloaden'}
          </button>
          <button onClick={handleDelete} className="btn-secondary text-brand-status-red hover:bg-brand-pink">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* -- Unified inline-editable view ---------------------------------- */}
      <div className="space-y-5">

        {/* AI Herschrijf optie */}
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
                <ChevronLeft size={14} /> Terug
              </button>
              <button
                onClick={handleAiRewrite}
                disabled={!aiPrompt.trim() || aiGenerating}
                className="btn-primary disabled:opacity-50"
              >
                {aiGenerating ? (
                  <><Loader2 size={15} className="animate-spin" /> AI verwerkt tekst...</>
                ) : (
                  <><Sparkles size={15} /> Genereer offerte</>
                )}
              </button>
            </div>
          </div>
        )}

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

        {/* -- Info grid: Offerte Details + Klant -------------------------- */}
        <div className="card">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-3">Offerte details</h3>
              <dl className="space-y-2 text-body">
                <InlineDetailField
                  label="Nummer"
                  value={offerte.number}
                  readOnly
                  className="font-mono"
                />
                <InlineCompanySelector
                  companyId={companyId}
                  onChange={setCompanyId}
                  onSave={() => saveField({ companyId })}
                />
                <InlineDetailField
                  label="Datum"
                  value={offerteDate}
                  displayValue={offerteDate ? new Date(offerteDate + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined}
                  onChange={v => {
                    setOfferteDate(v)
                    // Auto-update validUntil (+14 days)
                    if (v) {
                      const d = new Date(v + 'T00:00:00')
                      d.setDate(d.getDate() + 14)
                      setValidUntilDate(d.toISOString().split('T')[0])
                    }
                  }}
                  onSave={() => {
                    const updates: Record<string, string> = { date: offerteDate }
                    if (offerteDate) {
                      const d = new Date(offerteDate + 'T00:00:00')
                      d.setDate(d.getDate() + 14)
                      updates.validUntil = d.toISOString().split('T')[0]
                    }
                    return saveField(updates)
                  }}
                  type="date"
                />
                <InlineDetailField
                  label="Geldig tot"
                  value={validUntilDate}
                  displayValue={
                    validUntilDate ? (
                      <span className={new Date(validUntilDate) < new Date() ? 'text-brand-status-red font-semibold' : ''}>
                        {new Date(validUntilDate + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    ) : undefined
                  }
                  readOnly
                />
              </dl>
            </div>
            <div>
              <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-3">Klant</h3>
              <dl className="space-y-2 text-body">
                <InlineDetailField
                  label="Naam"
                  value={client.name}
                  onChange={v => setClient(p => ({ ...p, name: v }))}
                  onSave={() => saveField({ client: { ...client } })}
                  className="font-semibold"
                  placeholder="Klantnaam..."
                />
                <InlineDetailField
                  label="Contactpersoon"
                  value={client.contactPerson}
                  onChange={v => setClient(p => ({ ...p, contactPerson: v }))}
                  onSave={() => saveField({ client: { ...client } })}
                  placeholder="Contactpersoon..."
                />
                <InlineDetailField
                  label="E-mail"
                  value={client.email}
                  onChange={v => setClient(p => ({ ...p, email: v }))}
                  onSave={() => saveField({ client: { ...client } })}
                  type="email"
                  placeholder="email@voorbeeld.nl"
                />
                <InlineDetailField
                  label="Telefoon"
                  value={client.phone}
                  onChange={v => setClient(p => ({ ...p, phone: v }))}
                  onSave={() => saveField({ client: { ...client } })}
                  type="tel"
                  placeholder="06-12345678"
                />
              </dl>
            </div>
          </div>
        </div>

        {/* -- Introductietekst -------------------------------------------- */}
        <div className="card">
          <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-2">Introductietekst</h3>
          <InlineTextArea
            value={introText}
            onChange={setIntroText}
            onSave={() => saveField({ introText: introText || undefined })}
            placeholder="Klik om introductietekst toe te voegen..."
          />
        </div>

        {/* -- Line items: always-editable section-based grid -------------- */}
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
                <input
                  className="flex-1 font-semibold bg-transparent border-b border-dashed border-transparent hover:border-brand-text-secondary/30 focus:border-brand-card-border/50 outline-none py-1 px-1 text-body text-brand-text-primary placeholder:text-brand-text-secondary/40 placeholder:italic placeholder:font-normal transition-colors"
                  placeholder="Sectie titel (bijv. Website & Design)"
                  value={section.title}
                  onChange={e => updateSectionTitle(section.id, e.target.value)}
                  onBlur={() => saveLineItems()}
                />
                {sections.length > 1 && (
                  <button onClick={() => {
                    removeSection(section.id)
                    // Defer save so state updates
                    setTimeout(() => saveLineItems(), 0)
                  }}
                    className="p-2 text-brand-text-secondary hover:text-brand-status-red rounded-brand-sm hover:bg-brand-pink transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* Items table met lichte grid borders (ClickUp-stijl) */}
              <div className="border border-brand-card-border/25 rounded-brand-sm overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[1fr_80px_100px_100px_36px] bg-brand-page-light/70">
                  <span className="text-caption text-brand-text-secondary uppercase tracking-wide px-3 py-2">Omschrijving</span>
                  <span className="text-caption text-brand-text-secondary uppercase tracking-wide text-center px-3 py-2 border-l border-brand-card-border/20">Aantal</span>
                  <span className="text-caption text-brand-text-secondary uppercase tracking-wide text-right px-3 py-2 border-l border-brand-card-border/20">Prijs</span>
                  <span className="text-caption text-brand-text-secondary uppercase tracking-wide text-right px-3 py-2 border-l border-brand-card-border/20">Totaal</span>
                  <span className="border-l border-brand-card-border/20"></span>
                </div>

                {/* Items */}
                <div>
                  {section.items.map((item, itemIdx) => (
                    <div key={item.id} className={`grid grid-cols-[1fr_80px_100px_100px_36px] items-start group hover:bg-brand-lavender-light/20 transition-colors ${itemIdx < section.items.length - 1 ? 'border-b border-brand-card-border/15' : ''}`}>
                      <div className="px-2 py-1">
                        <input
                          className="w-full bg-transparent outline-none py-0.5 px-1 text-body font-semibold text-brand-text-primary placeholder:text-brand-text-secondary/40 placeholder:italic placeholder:font-normal transition-colors rounded-brand-sm hover:bg-brand-page-light/50 focus:bg-brand-page-light/50 focus:ring-1 focus:ring-brand-purple/15"
                          placeholder="Omschrijving"
                          value={item.description}
                          onChange={e => updateItem(section.id, item.id, 'description', e.target.value)}
                          onBlur={() => saveLineItems()}
                        />
                        <input
                          className="w-full bg-transparent outline-none py-0.5 px-1 text-caption text-brand-text-secondary placeholder:text-brand-text-secondary/30 placeholder:italic transition-colors rounded-brand-sm hover:bg-brand-page-light/50 focus:bg-brand-page-light/50 focus:ring-1 focus:ring-brand-purple/15"
                          placeholder="Details (optioneel)"
                          value={item.details ?? ''}
                          onChange={e => updateItem(section.id, item.id, 'details', e.target.value)}
                          onBlur={() => saveLineItems()}
                        />
                      </div>
                      <div className="border-l border-brand-card-border/15 flex items-center h-full">
                        <input
                          className="w-full bg-transparent outline-none py-1.5 px-2 text-body text-center text-brand-text-primary transition-colors rounded-brand-sm hover:bg-brand-page-light/50 focus:bg-brand-page-light/50 focus:ring-1 focus:ring-brand-purple/15"
                          type="number"
                          min="0"
                          step="0.5"
                          value={item.quantity}
                          onChange={e => updateItem(section.id, item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          onBlur={() => saveLineItems()}
                        />
                      </div>
                      <div className="border-l border-brand-card-border/15 flex items-center h-full">
                        <input
                          className="w-full bg-transparent outline-none py-1.5 px-2 text-body text-right text-brand-text-primary transition-colors rounded-brand-sm hover:bg-brand-page-light/50 focus:bg-brand-page-light/50 focus:ring-1 focus:ring-brand-purple/15"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={e => updateItem(section.id, item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                          onBlur={() => saveLineItems()}
                        />
                      </div>
                      <div className="border-l border-brand-card-border/15 py-1.5 px-2 text-body text-right font-semibold text-brand-text-primary flex items-center justify-end h-full">
                        {euro(item.quantity * item.unitPrice)}
                      </div>
                      <div className="border-l border-brand-card-border/15 flex items-center justify-center h-full">
                        <button
                          onClick={() => {
                            removeItem(section.id, item.id)
                            setTimeout(() => saveLineItems(), 0)
                          }}
                          disabled={section.items.length <= 1}
                          className="p-1.5 text-brand-text-secondary/0 group-hover:text-brand-text-secondary hover:!text-brand-status-red rounded-brand-sm hover:bg-brand-pink transition-all disabled:opacity-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={() => addItem(section.id)} className="mt-3 text-caption text-brand-text-secondary hover:text-brand-text-primary flex items-center gap-1 transition-colors">
                <Plus size={12} /> Regel toevoegen
              </button>
            </div>
          ))}
        </div>

        {/* -- Totalen ----------------------------------------------------- */}
        <div className="card">
          <div className="border-t border-brand-page-medium pt-4 ml-auto max-w-xs space-y-2">
            <div className="flex justify-between text-body">
              <span className="text-brand-text-secondary">Subtotaal</span>
              <span className="font-semibold">{euro(editSubtotal)}</span>
            </div>
            <div className="flex justify-between text-body items-center">
              <span className="text-brand-text-secondary flex items-center gap-2">
                BTW
                <select
                  className="border-brand border-brand-card-border rounded-brand-sm px-1.5 py-0.5 text-caption bg-transparent hover:bg-brand-page-light transition-colors cursor-pointer"
                  value={btwPct}
                  onChange={e => {
                    setBtwPct(Number(e.target.value))
                    // Defer save
                    setTimeout(() => saveLineItems(), 0)
                  }}
                >
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

        {/* -- Voorwaarden & opmerkingen ----------------------------------- */}
        <div className="card">
          <h3 className="text-caption text-brand-text-secondary uppercase tracking-wide mb-2">Voorwaarden & opmerkingen</h3>
          <InlineTextArea
            value={termsText}
            onChange={setTermsText}
            onSave={() => saveField({ termsText: termsText || undefined })}
            placeholder="Klik om voorwaarden of opmerkingen toe te voegen..."
          />
        </div>

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

      {/* Verwijder bevestigingsmodal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setShowDeleteModal(false)} />
          <div className="relative bg-white rounded-brand border border-brand-card-border shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-brand-sm bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <h2 className="font-semibold text-body text-brand-text-primary">Offerte verwijderen</h2>
                <p className="text-caption text-brand-text-secondary">Dit kan niet ongedaan worden gemaakt.</p>
              </div>
            </div>
            <p className="text-body text-brand-text-secondary mb-6">
              Weet je zeker dat je <span className="font-semibold text-brand-text-primary">{offerte.number}</span> van <span className="font-semibold text-brand-text-primary">{offerte.client.name}</span> permanent wilt verwijderen?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="btn-secondary"
              >
                Annuleren
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="btn-primary bg-red-500 hover:bg-red-600 border-red-500 hover:border-red-600"
              >
                <Trash2 size={14} /> {deleting ? 'Verwijderen...' : 'Ja, verwijder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
