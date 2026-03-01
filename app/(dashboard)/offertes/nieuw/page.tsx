'use client'
import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, Save, GripVertical, Sparkles, PenLine, RefreshCw, Check, ChevronLeft, Loader2, FileText } from 'lucide-react'
import { COMPANIES, getCompany } from '@/lib/companies'
import { LineItem, CompanyId, Offerte } from '@/lib/types'
import { generateOffertePdf, downloadOffertePdf } from '@/lib/pdf/offertePdf'
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

interface AIOfferteResult {
  client: {
    name: string
    contactPerson?: string
    email?: string
    phone?: string
  }
  introText: string
  sections: {
    title: string
    items: {
      description: string
      details?: string
      quantity: number
      unitPrice: number
    }[]
  }[]
  termsText: string
  btwPercentage: number
}

export default function NieuweOfferte() {
  return (
    <Suspense fallback={<div className="p-8 text-brand-text-secondary">Laden…</div>}>
      <NieuweOfferteContent />
    </Suspense>
  )
}

type FormMode = 'keuze' | 'handmatig' | 'ai-preview' | 'preview'

function NieuweOfferteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeCompany } = useActiveCompany()
  const initialCompany = (searchParams.get('bedrijf') as CompanyId) || activeCompany

  const [companyId, setCompanyId] = useState<CompanyId>(initialCompany)
  const [client, setClient] = useState({ name: '', contactPerson: '', email: '', phone: '' })
  const [btwPct, setBtwPct] = useState(21)
  const [sections, setSections] = useState<Section[]>([emptySection()])
  const [introText, setIntroText] = useState('')
  const [termsText, setTermsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)

  // AI state
  const [mode, setMode] = useState<FormMode>('keuze')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiExtraInstructions, setAiExtraInstructions] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiResult, setAiResult] = useState<AIOfferteResult | null>(null)
  const [aiCooldown, setAiCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCooldown = useCallback(() => {
    setAiCooldown(30)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setAiCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!)
          cooldownRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }
  }, [])

  const company = COMPANIES.find(c => c.id === companyId)!

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

  // Flatten sections to items for calculations and saving
  const allItems = sections.flatMap(s =>
    s.items.map(item => ({ ...item, sectionTitle: s.title || undefined }))
  )
  const subtotal = allItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const btwAmount = subtotal * (btwPct / 100)
  const total = subtotal + btwAmount

  // AI generation — vult ALLE velden in (klant + diensten + intro + voorwaarden)
  const handleGenerateAI = async (extraInstructions?: string) => {
    setAiGenerating(true)
    setError('')

    try {
      const fullPrompt = extraInstructions
        ? `${aiPrompt}\n\nExtra instructies: ${extraInstructions}`
        : aiPrompt

      const res = await fetch('/api/offertes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          clientName: client.name || undefined,
          contactPerson: client.contactPerson || undefined,
          prompt: fullPrompt,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'AI generatie mislukt')
      }

      const result: AIOfferteResult = await res.json()
      setAiResult(result)
      setAiExtraInstructions('')
      setMode('ai-preview')
      startCooldown()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAiGenerating(false)
    }
  }

  // Apply AI result to form — inclusief klantgegevens
  const handleApproveAI = () => {
    if (!aiResult) return

    // Klantgegevens invullen vanuit AI (overschrijf alleen als AI iets gevonden heeft)
    setClient(prev => ({
      name: aiResult.client?.name || prev.name,
      contactPerson: aiResult.client?.contactPerson || prev.contactPerson,
      email: aiResult.client?.email || prev.email,
      phone: aiResult.client?.phone || prev.phone,
    }))

    const newSections: Section[] = aiResult.sections.map(s => ({
      id: crypto.randomUUID(),
      title: s.title,
      items: s.items.map(item => ({
        id: crypto.randomUUID(),
        description: item.description,
        details: item.details || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    }))

    setSections(newSections)
    setIntroText(aiResult.introText)
    setTermsText(aiResult.termsText)
    setBtwPct(aiResult.btwPercentage)
    setMode('handmatig')
  }

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

      const res = await fetch('/api/offertes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          client,
          items: flatItems,
          btwPercentage: btwPct,
          introText: introText || undefined,
          termsText: termsText || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Opslaan mislukt')
      }

      const offerte = await res.json()

      // Auto-download PDF
      const pdfCompany = getCompany(companyId)
      downloadOffertePdf(offerte, pdfCompany)

      router.push(`/offertes/${offerte.id}`)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  // PDF Preview: maak een tijdelijk Offerte object en genereer PDF blob
  const handleShowPreview = () => {
    const now = new Date()
    const validUntil = new Date(now)
    validUntil.setDate(validUntil.getDate() + 14)

    const tempOfferte: Offerte = {
      id: 'preview',
      number: 'PREVIEW',
      companyId,
      client: { name: client.name, contactPerson: client.contactPerson, email: client.email, phone: client.phone },
      date: now.toISOString(),
      validUntil: validUntil.toISOString(),
      status: 'concept',
      items: allItems.map((item, idx) => ({ ...item, id: item.id || `preview-${idx}` })),
      subtotal,
      btwPercentage: btwPct,
      btwAmount,
      total,
      introText: introText || undefined,
      termsText: termsText || undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    try {
      const doc = generateOffertePdf(tempOfferte, company)
      const blob = doc.output('blob')
      // Ruim vorige blob URL op
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
      const url = URL.createObjectURL(blob)
      setPdfBlobUrl(url)
      setMode('preview')
    } catch (e: any) {
      setError('PDF preview genereren mislukt: ' + e.message)
    }
  }

  // Cleanup blob URL bij unmount
  useEffect(() => {
    return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl) }
  }, [pdfBlobUrl])

  // AI Preview helper: calculate totals from AI result
  const aiPreviewTotals = aiResult ? (() => {
    const sub = aiResult.sections.reduce((acc, s) =>
      acc + s.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0), 0)
    const btw = sub * (aiResult.btwPercentage / 100)
    return { subtotal: sub, btwAmount: btw, total: sub + btw }
  })() : null

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => {
          if (mode === 'ai-preview') setMode('keuze')
          else if (mode === 'preview') setMode('handmatig')
          else if (mode === 'handmatig') setMode('keuze')
          else router.back()
        }} className="btn-secondary px-2.5"><ArrowLeft size={15} /></button>
        <div>
          <h1 className="font-uxum text-sidebar-t text-brand-text-primary">Nieuwe offerte</h1>
          <p className="text-caption text-brand-text-secondary mt-0.5">
            {mode === 'ai-preview' && 'Controleer de gegenereerde offerte — pas aan indien nodig'}
            {mode === 'preview' && 'Controleer de PDF — keur goed om op te slaan en te downloaden'}
            {mode === 'handmatig' && 'Nummer wordt automatisch toegewezen op basis van datum'}
            {mode === 'keuze' && 'Beschrijf je offerte — AI herkent automatisch klantgegevens en diensten'}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-brand-pink border border-brand-pink-accent/30 text-brand-status-red rounded-brand px-4 py-3 mb-5 text-body">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {/* Bedrijf selectie — verborgen bij ai-preview en pdf preview */}
        {mode !== 'ai-preview' && mode !== 'preview' && (
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
        )}

        {/* Klantgegevens — verborgen bij ai-preview en pdf preview */}
        {mode !== 'ai-preview' && mode !== 'preview' && (
          <div className="card">
            <h2 className="font-semibold text-body mb-4">Klantgegevens</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Bedrijfsnaam *</label>
                <input className="input" value={client.name} onChange={e => setClient(p => ({...p, name: e.target.value}))}
                  placeholder="BONVUE" />
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
            </div>
          </div>
        )}

        {/* === KEUZE MODE — AI bovenaan === */}
        {mode === 'keuze' && (
          <div className="card border-2 border-brand-lavender">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-brand-sm bg-brand-lavender-light flex items-center justify-center">
                <Sparkles size={16} className="text-brand-text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-body">Vul offerte in met AI</h2>
                <p className="text-caption text-brand-text-secondary">Beschrijf alles in één tekst — AI herkent automatisch de klantgegevens, diensten en prijzen</p>
              </div>
            </div>
            <textarea
              className="input h-40 resize-none mb-1"
              placeholder={`Bijv. "Offerte voor Makelaardij Amsterdam (contact: Jan de Vries, jan@makelaardij.nl, 06-12345678). We maken een nieuwe website met homepage, over ons, contactpagina en woningzoeker. Inclusief huisstijl toepassing en 3 maanden onderhoud."`}
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              disabled={aiGenerating}
            />
            <p className="text-caption text-brand-text-secondary/60 mb-4">
              Vermeld: bedrijfsnaam klant, contactpersoon, e-mail, telefoon en gewenste diensten. AI vult alle velden automatisch in.
            </p>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setMode('handmatig')}
                className="flex items-center gap-1.5 text-caption text-brand-text-secondary hover:text-brand-text-primary transition-colors"
                disabled={aiGenerating}
              >
                <PenLine size={13} />
                <span>Liever handmatig invullen</span>
              </button>
              <button
                onClick={() => handleGenerateAI()}
                disabled={!aiPrompt.trim() || aiGenerating || aiCooldown > 0}
                className="btn-primary disabled:opacity-50"
              >
                {aiGenerating ? (
                  <><Loader2 size={15} className="animate-spin" /> AI verwerkt tekst…</>
                ) : aiCooldown > 0 ? (
                  <>Wacht {aiCooldown}s…</>
                ) : (
                  <><Sparkles size={15} /> Genereer offerte</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* === AI PREVIEW MODE === */}
        {mode === 'ai-preview' && aiResult && aiPreviewTotals && (
          <>
            {/* Preview card styled like public offerte */}
            <div className="bg-white rounded-brand shadow-sm overflow-hidden border border-brand-page-medium">
              {/* Company header bar */}
              <div className="px-6 py-4" style={{ backgroundColor: company.color }}>
                <h2 className="text-base font-bold text-white">{company.name}</h2>
                <p className="text-white/80 text-caption mt-0.5">{company.address} · {company.email}</p>
              </div>

              <div className="px-6 py-5">
                {/* Client info — uit AI geëxtraheerd */}
                <div className="grid grid-cols-2 gap-6 mb-5">
                  <div>
                    <h3 className="text-caption uppercase tracking-wide text-brand-text-secondary mb-1">Aan</h3>
                    <p className="font-semibold text-body">{aiResult.client?.name || client.name || '—'}</p>
                    {(aiResult.client?.contactPerson || client.contactPerson) && <p className="text-caption text-brand-text-secondary">t.a.v. {aiResult.client?.contactPerson || client.contactPerson}</p>}
                    {(aiResult.client?.email || client.email) && <p className="text-caption text-brand-text-secondary">{aiResult.client?.email || client.email}</p>}
                    {(aiResult.client?.phone || client.phone) && <p className="text-caption text-brand-text-secondary">{aiResult.client?.phone || client.phone}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-caption text-brand-text-secondary">
                      Datum: <span className="text-brand-text-primary">{new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </p>
                  </div>
                </div>

                {/* Intro text */}
                {aiResult.introText && (
                  <p className="text-body text-brand-text-secondary mb-5 whitespace-pre-wrap">{aiResult.introText}</p>
                )}

                {/* Sections with items */}
                {aiResult.sections.map((section, sIdx) => (
                  <div key={sIdx} className="mb-5">
                    {section.title && (
                      <h3 className="font-semibold text-body mb-2 pb-1 border-b border-brand-page-medium"
                        style={{ color: company.color }}>
                        {section.title}
                      </h3>
                    )}
                    <table className="w-full text-caption">
                      <thead>
                        <tr className="border-b border-brand-page-medium">
                          <th className="text-left py-2 text-brand-text-secondary font-medium">Omschrijving</th>
                          <th className="text-center py-2 text-brand-text-secondary font-medium w-16">Aantal</th>
                          <th className="text-right py-2 text-brand-text-secondary font-medium w-24">Prijs</th>
                          <th className="text-right py-2 text-brand-text-secondary font-medium w-24">Totaal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.items.map((item, iIdx) => (
                          <tr key={iIdx} className="border-b border-brand-page-light">
                            <td className="py-2">
                              <div className="font-medium text-brand-text-primary">{item.description}</div>
                              {item.details && <div className="text-brand-text-secondary text-[11px] mt-0.5">{item.details}</div>}
                            </td>
                            <td className="py-2 text-center text-brand-text-secondary">{item.quantity}</td>
                            <td className="py-2 text-right text-brand-text-secondary">{euro(item.unitPrice)}</td>
                            <td className="py-2 text-right font-medium text-brand-text-primary">{euro(item.quantity * item.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {/* Totals */}
                <div className="ml-auto max-w-xs space-y-1.5 text-caption mt-4">
                  <div className="flex justify-between">
                    <span className="text-brand-text-secondary">Subtotaal</span>
                    <span className="font-medium">{euro(aiPreviewTotals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-text-secondary">BTW {aiResult.btwPercentage}%</span>
                    <span>{euro(aiPreviewTotals.btwAmount)}</span>
                  </div>
                  <div className="flex justify-between text-body font-bold border-t border-brand-page-medium pt-1.5">
                    <span>Totaal</span>
                    <span>{euro(aiPreviewTotals.total)}</span>
                  </div>
                </div>

                {/* Terms */}
                {aiResult.termsText && (
                  <div className="mt-5 p-3 bg-brand-page-light rounded-brand-sm text-caption text-brand-text-secondary">
                    <h3 className="font-medium text-brand-text-primary mb-1">Voorwaarden</h3>
                    <p className="whitespace-pre-wrap">{aiResult.termsText}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="card">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleApproveAI}
                  className="btn-primary"
                >
                  <Check size={15} /> Goedkeuren & bewerken
                </button>
                <button
                  onClick={() => setMode('keuze')}
                  className="btn-secondary"
                >
                  <ChevronLeft size={14} /> Terug naar prompt
                </button>
              </div>

              {/* Regenerate with extra instructions */}
              <div className="mt-4 pt-4 border-t border-brand-page-medium">
                <p className="text-caption text-brand-text-secondary mb-2">Niet helemaal goed? Geef extra instructies en genereer opnieuw:</p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Bijv. 'Maak de prijzen 10% lager' of 'Voeg een sectie toe voor hosting'"
                    value={aiExtraInstructions}
                    onChange={e => setAiExtraInstructions(e.target.value)}
                    disabled={aiGenerating}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && aiExtraInstructions.trim()) {
                        handleGenerateAI(aiExtraInstructions)
                      }
                    }}
                  />
                  <button
                    onClick={() => handleGenerateAI(aiExtraInstructions)}
                    disabled={!aiExtraInstructions.trim() || aiGenerating || aiCooldown > 0}
                    className="btn-secondary disabled:opacity-50 shrink-0"
                  >
                    {aiGenerating ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    {aiCooldown > 0 ? `Wacht ${aiCooldown}s` : 'Opnieuw'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* === HANDMATIG MODE — bestaand formulier === */}
        {mode === 'handmatig' && (
          <>
            {/* Methode switcher */}
            <button
              onClick={() => setMode('keuze')}
              className="flex items-center gap-1.5 text-caption text-brand-text-secondary hover:text-brand-text-primary transition-colors"
            >
              <ChevronLeft size={14} />
              <span>Andere methode kiezen <span className="text-brand-text-secondary/50">(bijv. AI schrijven)</span></span>
            </button>

            {/* Introductietekst */}
            <div className="card">
              <h2 className="font-semibold text-body mb-3">Introductietekst (optioneel)</h2>
              <textarea className="input h-20 resize-none" placeholder="Bijv. Bedankt voor je aanvraag! Hieronder vind je onze offerte voor de besproken werkzaamheden..."
                value={introText} onChange={e => setIntroText(e.target.value)} />
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

            {/* Voorwaarden */}
            <div className="card">
              <h2 className="font-semibold text-body mb-3">Voorwaarden & opmerkingen (optioneel)</h2>
              <textarea className="input h-24 resize-none" placeholder="Bijv. Betalingstermijn 14 dagen, offerte is 14 dagen geldig..."
                value={termsText} onChange={e => setTermsText(e.target.value)} />
            </div>

            {/* Save bar */}
            <div className="bg-brand-page-light border-brand border-brand-card-border rounded-brand px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={handleShowPreview} disabled={!client.name || allItems.length === 0} className="btn-secondary disabled:opacity-50">
                  <FileText size={15} /> Bekijk PDF voorbeeld
                </button>
              </div>
              <button onClick={handleSave} disabled={!client.name || allItems.length === 0 || saving} className="btn-primary disabled:opacity-50">
                <Save size={15} /> {saving ? 'Opslaan…' : 'Opslaan & PDF downloaden'}
              </button>
            </div>
          </>
        )}

        {/* === PDF PREVIEW MODE === */}
        {mode === 'preview' && pdfBlobUrl && (
          <>
            <div className="card p-0 overflow-hidden">
              <iframe
                src={pdfBlobUrl}
                className="w-full border-0"
                style={{ height: '80vh' }}
                title="PDF Voorbeeld"
              />
            </div>

            <div className="bg-brand-page-light border-brand border-brand-card-border rounded-brand px-4 py-3 flex items-center justify-between">
              <button
                onClick={() => setMode('handmatig')}
                className="btn-secondary"
              >
                <ArrowLeft size={14} /> Terug naar bewerken
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary disabled:opacity-50"
              >
                <Save size={15} /> {saving ? 'Opslaan…' : 'Goedkeuren & opslaan'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
