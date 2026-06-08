'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Trash2, UserPlus, X, Check, RefreshCw, FileText, ChevronDown, RotateCcw, GripVertical, Search, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { Uur, UurKlant, UurProject, CompanyId } from '@/lib/types'
import { COMPANIES } from '@/lib/companies'
import { deriveKlantnummerLetters } from '@/lib/klantnummer'

// Alleen bedrijven die de factuur-van-uren route ondersteunt
const FACTUUR_BEDRIJVEN = COMPANIES.filter(c => c.id === 'tde' || c.id === 'daleyphotography' || c.id === 'wgb')

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function today() {
  return isoDate(new Date())
}


interface NewRow {
  datum: string
  omschrijving: string
  uren: string
  uurtarief: string
}

function emptyRow(): NewRow {
  return { datum: today(), omschrijving: '', uren: '', uurtarief: '' }
}

interface NewProject {
  datum: string
  naam: string
  aantal: string
  prijs: string
  omschrijving: string
}

function emptyProject(): NewProject {
  return { datum: today(), naam: '', aantal: '', prijs: '', omschrijving: '' }
}

type FactuurRegel =
  | { id: string; type: 'uur'; uur: Uur }
  | { id: string; type: 'handmatig'; werkzaamheden: string; omschrijving?: string; aantal: number; prijs: number; bedrag: number; projectId?: string }

export default function UrenPage() {
  const [uren, setUren] = useState<Uur[]>([])
  const [klanten, setKlanten] = useState<UurKlant[]>([])
  const [loading, setLoading] = useState(true)
  const [activeKlantId, setActiveKlantId] = useState<string | null>(null)
  const [newRow, setNewRow] = useState<NewRow>(emptyRow())
  const [saving, setSaving] = useState(false)

  // Projecten (vaste tarieven)
  const [projecten, setProjecten] = useState<UurProject[]>([])
  const [newProject, setNewProject] = useState<NewProject>(emptyProject())
  const [savingProject, setSavingProject] = useState(false)

  // Tarief-modus
  const [tariefMode, setTariefMode] = useState<'vast' | 'perRij'>('vast')
  const [vastTarief, setVastTarief] = useState<string>('')

  // Selectie voor factuur
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())
  const [showFactuurModal, setShowFactuurModal] = useState(false)
  const [generatingFactuur, setGeneratingFactuur] = useState(false)
  const [factuurNummer, setFactuurNummer] = useState<string | null>(null)
  const [needsKlantDetails, setNeedsKlantDetails] = useState(false)
  const [klantDetailsForm, setKlantDetailsForm] = useState({ contactpersoon: '', adres: '', postcode: '', stad: '', klantnummer: '', email: '' })
  const [savingKlantDetails, setSavingKlantDetails] = useState(false)

  // Factuurdatum, btw en betaallink keuzes in de samenvatting-popup
  const [factuurDatumKeuze, setFactuurDatumKeuze] = useState<'vandaag' | 'morgen' | 'custom'>('vandaag')
  const [factuurCustomDatum, setFactuurCustomDatum] = useState<string>(today())
  const [factuurBtwPercentage, setFactuurBtwPercentage] = useState<number>(21)
  const [factuurBetaallink, setFactuurBetaallink] = useState<string>('')
  const [factuurRegels, setFactuurRegels] = useState<FactuurRegel[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [factuurNummerPreview, setFactuurNummerPreview] = useState<string | null>(null)
  const [newHandmatigeRegel, setNewHandmatigeRegel] = useState({ werkzaamheden: '', omschrijving: '', aantal: '', prijs: '' })

  // Archief
  const [archiefUren, setArchiefUren] = useState<Uur[]>([])
  const [archiefOpen, setArchiefOpen] = useState(false)
  const [restoringFactuur, setRestoringFactuur] = useState<string | null>(null)

  // CRM bedrijven voor uren-klant zoeken
  const [crmBedrijven, setCrmBedrijven] = useState<{ id: string; naam: string; klantnummer: string | null; status: string | null }[]>([])

  // Nieuwe klant modal
  const [showKlantModal, setShowKlantModal] = useState(false)
  const [klantModalStap, setKlantModalStap] = useState<'zoeken' | 'aanmaken'>('zoeken')
  const [klantZoekTerm, setKlantZoekTerm] = useState('')
  const [newKlantNaam, setNewKlantNaam] = useState('')
  const [newKlantNummer, setNewKlantNummer] = useState('')
  const [newKlantNummerManual, setNewKlantNummerManual] = useState(false)
  const [newKlantTarief, setNewKlantTarief] = useState('')
  const [newKlantCompanyId, setNewKlantCompanyId] = useState<CompanyId>('tde')
  const [newKlantCrmId, setNewKlantCrmId] = useState<string | undefined>(undefined)
  const [savingKlant, setSavingKlant] = useState(false)

  // Bedrijfskeuze voor factuur-van-uren
  const [factuurCompanyId, setFactuurCompanyId] = useState<CompanyId>('daleyphotography')

  const datumInputRef = useRef<HTMLInputElement>(null)
  const newRowRef = useRef<HTMLTableRowElement>(null)
  const newProjectRowRef = useRef<HTMLTableRowElement>(null)
  const newProjectNaamRef = useRef<HTMLInputElement>(null)

  const loadArchief = useCallback(async () => {
    try {
      const res = await fetch('/api/uren?gefactureerd=true')
      if (res.ok) setArchiefUren(await res.json())
    } catch (e) {
      console.error('loadArchief fout:', e)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [urenRes, klantRes, projectenRes, crmRes] = await Promise.all([
        fetch('/api/uren'),
        fetch('/api/uren-klanten'),
        fetch('/api/uren-projecten?status=actief'),
        fetch('/api/crm/bedrijven?lite=true'),
      ])
      if (urenRes.ok) setUren(await urenRes.json())
      if (klantRes.ok) {
        const kl: UurKlant[] = await klantRes.json()
        setKlanten(kl)
        setActiveKlantId(prev => prev ?? (kl[0]?.id ?? null))
      }
      if (projectenRes.ok) setProjecten(await projectenRes.json())
      if (crmRes.ok) setCrmBedrijven(await crmRes.json())
    } catch (e) {
      console.error('uren/load fout:', e)
    }
    setLoading(false)
    loadArchief()
  }, [loadArchief])

  useEffect(() => { load() }, [load])

  const activeKlant = klanten.find(k => k.id === activeKlantId) ?? null

  useEffect(() => {
    if (activeKlant) {
      setVastTarief(activeKlant.standaardUurtarief > 0 ? String(activeKlant.standaardUurtarief) : '')
      setNewRow(emptyRow())
      setSelectedIds(new Set())
      setSelectedProjectIds(new Set())
    }
  }, [activeKlantId]) // eslint-disable-line react-hooks/exhaustive-deps

  const klantUren = activeKlant
    ? uren
        .filter(u => u.klant === activeKlant.naam)
        .sort((a, b) => b.datum.localeCompare(a.datum))
    : []

  const BTW_PERCENTAGE = 21
  const totaalUren = klantUren.reduce((s, u) => s + u.uren, 0)
  const totaalExBtw = tariefMode === 'vast'
    ? totaalUren * (Number(vastTarief) || 0)
    : klantUren.reduce((s, u) => s + u.uren * u.uurtarief, 0)
  const totaalInclBtw = totaalExBtw * (1 + BTW_PERCENTAGE / 100)

  const huidigTarief = tariefMode === 'vast'
    ? Number(vastTarief) || 0
    : Number(newRow.uurtarief) || 0

  // Selectie helpers
  const allSelected = klantUren.length > 0 && klantUren.every(u => selectedIds.has(u.id))
  const someSelected = klantUren.some(u => selectedIds.has(u.id))
  const someProjectSelected = selectedProjectIds.size > 0

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(klantUren.map(u => u.id)))
    }
  }

  // Geselecteerde uren (in datumvolgorde voor factuur)
  const geselecteerdeUren = klantUren
    .filter(u => selectedIds.has(u.id))
    .sort((a, b) => a.datum.localeCompare(b.datum))

  const selectedExBtw = tariefMode === 'vast'
    ? geselecteerdeUren.reduce((s, u) => s + u.uren, 0) * (Number(vastTarief) || 0)
    : geselecteerdeUren.reduce((s, u) => s + u.uren * u.uurtarief, 0)
  const selectedBtwBedrag = selectedExBtw * (factuurBtwPercentage / 100)
  const selectedInclBtw = selectedExBtw + selectedBtwBedrag

  const modalSubtotaalExBtw = factuurRegels.reduce((s, r) => {
    if (r.type === 'uur') {
      const t = tariefMode === 'vast' ? (Number(vastTarief) || 0) : r.uur.uurtarief
      return s + r.uur.uren * t
    }
    return s + r.bedrag
  }, 0)
  const modalBtwBedrag = modalSubtotaalExBtw * (factuurBtwPercentage / 100)
  const modalTotaalInclBtw = modalSubtotaalExBtw + modalBtwBedrag

  const gekozenFactuurdatum = (() => {
    if (factuurDatumKeuze === 'custom') return factuurCustomDatum
    if (factuurDatumKeuze === 'morgen') {
      const m = new Date()
      m.setDate(m.getDate() + 1)
      return isoDate(m)
    }
    return today()
  })()

  // Haal het verwachte factuurnummer op zodra de popup opent of de datum wijzigt
  useEffect(() => {
    if (!showFactuurModal) return
    let geannuleerd = false
    setFactuurNummerPreview(null)
    fetch(`/api/factuur-van-uren?date=${gekozenFactuurdatum}&company=${factuurCompanyId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!geannuleerd && d?.factuurnummer) setFactuurNummerPreview(d.factuurnummer) })
      .catch(() => {})
    return () => { geannuleerd = true }
  }, [showFactuurModal, gekozenFactuurdatum, factuurCompanyId])

  // 'G' sneltoets: focus de naam-input van de nieuwe projectregel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'g' && e.key !== 'G') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      e.preventDefault()
      newProjectNaamRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      newProjectNaamRef.current?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleAddRow = async () => {
    if (!activeKlant || !newRow.datum || !newRow.uren) return
    setSaving(true)
    try {
      const res = await fetch('/api/uren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: activeKlant.companyId ?? 'tde',
          datum: newRow.datum,
          klant: activeKlant.naam,
          uren: Number(newRow.uren),
          uurtarief: huidigTarief,
          omschrijving: newRow.omschrijving.trim() || undefined,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setUren(prev => [created, ...prev])
        setNewRow(emptyRow())
        setTimeout(() => datumInputRef.current?.focus(), 0)
      }
    } catch (e) {
      console.error('addRow fout:', e)
    }
    setSaving(false)
  }

  const handleCellUpdate = async (id: string, field: keyof Uur, value: any) => {
    const original = uren.find(u => u.id === id)
    if (!original) return
    const parsed =
      field === 'uren' || field === 'uurtarief' ? Number(value) || 0 : value
    setUren(prev => prev.map(u => u.id === id ? { ...u, [field]: parsed } : u))
    try {
      await fetch(`/api/uren/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: parsed }),
      })
    } catch (e) {
      console.error('cellUpdate fout, rollback:', e)
      setUren(prev => prev.map(u => u.id === id ? original : u))
    }
  }

  const handleDelete = async (id: string) => {
    setUren(prev => prev.filter(u => u.id !== id))
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    try {
      await fetch(`/api/uren/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('deleteUur fout, refetching:', e)
      load()
    }
  }

  const handleVastTariefBlur = async () => {
    if (tariefMode !== 'vast' || !activeKlant) return
    const tarief = Number(vastTarief) || 0

    try {
      await fetch(`/api/uren-klanten/${activeKlant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ standaardUurtarief: tarief }),
      })
      setKlanten(prev => prev.map(k => k.id === activeKlant.id ? { ...k, standaardUurtarief: tarief } : k))
    } catch (e) {
      console.error('vastTariefBlur fout:', e)
    }

    const rijenToUpdate = klantUren.filter(u => u.uurtarief !== tarief)
    if (rijenToUpdate.length === 0) return

    setUren(prev => prev.map(u =>
      u.klant === activeKlant.naam ? { ...u, uurtarief: tarief } : u
    ))

    await Promise.all(rijenToUpdate.map(u =>
      fetch(`/api/uren/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uurtarief: tarief }),
      })
    ))
  }

  const closeKlantModal = () => {
    setShowKlantModal(false)
    setKlantModalStap('zoeken')
    setKlantZoekTerm('')
    setNewKlantNaam('')
    setNewKlantNummer('')
    setNewKlantNummerManual(false)
    setNewKlantTarief('')
    setNewKlantCrmId(undefined)
  }

  const handleAddKlant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKlantNaam.trim()) return
    setSavingKlant(true)
    try {
      const res = await fetch('/api/uren-klanten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          naam: newKlantNaam.trim(),
          standaardUurtarief: Number(newKlantTarief) || 0,
          companyId: newKlantCompanyId,
          klantnummer: newKlantNummer.trim() || undefined,
          crmBedrijfId: newKlantCrmId,
        }),
      })
      if (res.ok) {
        const klant = await res.json()
        setKlanten(prev => [...prev, klant].sort((a, b) => a.naam.localeCompare(b.naam)))
        setActiveKlantId(klant.id)
        closeKlantModal()
      }
    } catch { /* */ }
    setSavingKlant(false)
  }

  const handleNewRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddRow() }
  }

  const handleNewRowBlur = (e: React.FocusEvent) => {
    if (!newRowRef.current?.contains(e.relatedTarget as Node)) {
      if (newRow.datum && newRow.uren) handleAddRow()
    }
  }

  const handleProjectRowBlur = (e: React.FocusEvent) => {
    if (!newProjectRowRef.current?.contains(e.relatedTarget as Node)) {
      if (newProject.datum && newProject.naam && newProject.prijs) handleAddProject()
    }
  }

  const klantProjecten = activeKlant
    ? projecten
        .filter(p => p.klant === activeKlant.naam)
        .sort((a, b) => b.datum.localeCompare(a.datum))
    : []

  const handleAddProject = async () => {
    if (!activeKlant || !newProject.naam || !newProject.prijs) return
    setSavingProject(true)
    const aantal = Number(newProject.aantal) || 1
    const prijs = Number(newProject.prijs) || 0
    try {
      const res = await fetch('/api/uren-projecten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: activeKlant.companyId ?? 'tde',
          klant: activeKlant.naam,
          naam: newProject.naam.trim(),
          aantal,
          prijs,
          bedrag: aantal * prijs,
          datum: newProject.datum,
          omschrijving: newProject.omschrijving.trim() || undefined,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setProjecten(prev => [created, ...prev])
        setNewProject(emptyProject())
        setTimeout(() => newProjectNaamRef.current?.focus(), 0)
      }
    } catch (e) {
      console.error('addProject fout:', e)
    }
    setSavingProject(false)
  }

  const handleProjectKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddProject() }
  }

  const handleProjectCellUpdate = async (id: string, field: keyof UurProject, value: any) => {
    const original = projecten.find(p => p.id === id)
    if (!original) return
    const parsed = field === 'bedrag' ? Number(value) || 0 : value
    setProjecten(prev => prev.map(p => p.id === id ? { ...p, [field]: parsed } : p))
    try {
      await fetch(`/api/uren-projecten/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: parsed }),
      })
    } catch (e) {
      console.error('projectCellUpdate fout, rollback:', e)
      setProjecten(prev => prev.map(p => p.id === id ? original : p))
    }
  }

  // Aantal of prijs bijwerken en het totaalbedrag automatisch herberekenen.
  const handleProjectAantalPrijs = async (id: string, field: 'aantal' | 'prijs', value: string) => {
    const original = projecten.find(p => p.id === id)
    if (!original) return
    const num = Number(value) || 0
    const aantal = field === 'aantal' ? num : (original.aantal ?? 1)
    const prijs = field === 'prijs' ? num : (original.prijs ?? original.bedrag)
    const bedrag = aantal * prijs
    setProjecten(prev => prev.map(p => p.id === id ? { ...p, aantal, prijs, bedrag } : p))
    try {
      await fetch(`/api/uren-projecten/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: num, bedrag }),
      })
    } catch {
      setProjecten(prev => prev.map(p => p.id === id ? original : p))
    }
  }

  const handleProjectDelete = async (id: string) => {
    setProjecten(prev => prev.filter(p => p.id !== id))
    try {
      await fetch(`/api/uren-projecten/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('projectDelete fout, refetching:', e)
      load()
    }
  }

  const roepFactuurAan = async () => {
    if (!activeKlant || !factuurRegels.length) return
    setGeneratingFactuur(true)
    const gebruikteProjectIds = factuurRegels.flatMap(r => r.type === 'handmatig' && r.projectId ? [r.projectId] : [])
    const urenUitRegels = factuurRegels
      .flatMap(r => r.type === 'uur' ? [r.uur] : [])
      .map(u => ({ id: u.id, datum: u.datum, omschrijving: u.omschrijving, uren: u.uren, uurtarief: u.uurtarief }))
    const handmatigeUitRegels = factuurRegels
      .flatMap(r => r.type === 'handmatig' ? [{ werkzaamheden: r.werkzaamheden, omschrijving: r.omschrijving, aantal: r.aantal, prijs: r.prijs, bedrag: r.bedrag }] : [])
    try {
      const res = await fetch('/api/factuur-van-uren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uren: urenUitRegels,
          klantId: activeKlant.id,
          vastTarief: tariefMode === 'vast' ? (Number(vastTarief) || null) : null,
          companyId: factuurCompanyId,
          factuurdatum: gekozenFactuurdatum,
          btwPercentage: factuurBtwPercentage,
          betaallink: factuurBetaallink.trim() || null,
          handmatigeRegels: handmatigeUitRegels,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert(`Fout: ${data.error}`)
        return
      }

      if (data.needsKlantDetails) {
        // Vul form voor met bekende data
        setKlantDetailsForm({
          contactpersoon: data.klant?.contactpersoon ?? '',
          adres: data.klant?.adres ?? '',
          postcode: data.klant?.postcode ?? '',
          stad: data.klant?.stad ?? '',
          klantnummer: data.klant?.klantnummer ?? '',
          email: data.klant?.email ?? '',
        })
        setNeedsKlantDetails(true)
        return
      }

      // Factuur gegenereerd: verwijder uren uit lokale state en herlaad archief
      setUren(prev => prev.filter(u => !selectedIds.has(u.id)))
      setSelectedIds(new Set())
      setSelectedProjectIds(new Set())
      // Markeer gefactureerde projecten als 'gefactureerd' (soft-delete zodat terugzetten werkt)
      if (gebruikteProjectIds.length > 0) {
        setProjecten(prev => prev.filter(p => !gebruikteProjectIds.includes(p.id)))
        await Promise.all(gebruikteProjectIds.map(id =>
          fetch(`/api/uren-projecten/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'gefactureerd' }),
          }).catch(() => {})
        ))
      }
      setFactuurNummer(data.factuurnummer)
      loadArchief()
    } catch (err: any) {
      alert(`Fout: ${err.message}`)
    } finally {
      setGeneratingFactuur(false)
    }
  }

  const handleSlaKlantDetailsOpEnGenereer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeKlant) return
    setSavingKlantDetails(true)
    try {
      // Sla klantgegevens op in uren_klanten
      const res = await fetch(`/api/uren-klanten/${activeKlant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(klantDetailsForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setKlanten(prev => prev.map(k => k.id === activeKlant.id ? updated : k))
      }
      setNeedsKlantDetails(false)
      // Genereer factuur nu klantgegevens compleet zijn
      await roepFactuurAan()
    } catch (err: any) {
      alert(`Fout bij opslaan: ${err.message}`)
    }
    setSavingKlantDetails(false)
  }

  const openFactuurModal = () => {
    setFactuurNummer(null)
    setNeedsKlantDetails(false)
    setFactuurDatumKeuze('vandaag')
    setFactuurCustomDatum(today())
    setFactuurBtwPercentage(21)
    setFactuurBetaallink('')
    const urenRegels: FactuurRegel[] = geselecteerdeUren.map(u => ({ id: u.id, type: 'uur', uur: u }))
    const projectRegels: FactuurRegel[] = klantProjecten
      .filter(p => selectedProjectIds.has(p.id))
      .map(p => ({
        id: crypto.randomUUID(),
        type: 'handmatig' as const,
        werkzaamheden: p.naam,
        omschrijving: p.omschrijving || undefined,
        aantal: p.aantal ?? 1,
        prijs: p.prijs ?? p.bedrag,
        bedrag: p.bedrag,
        projectId: p.id,
      }))
    setFactuurRegels([...urenRegels, ...projectRegels])
    setDragId(null)
    setFactuurNummerPreview(null)
    setNewHandmatigeRegel({ werkzaamheden: '', omschrijving: '', aantal: '', prijs: '' })
    setFactuurCompanyId((activeKlant?.companyId as CompanyId | undefined) ?? 'daleyphotography')
    setShowFactuurModal(true)
  }

  // Voeg een handmatige regel toe met aantal x prijs = totaal.
  const addHandmatig = () => {
    if (!newHandmatigeRegel.prijs || !newHandmatigeRegel.werkzaamheden) return
    const aantal = parseFloat(newHandmatigeRegel.aantal) || 1
    const prijs = parseFloat(newHandmatigeRegel.prijs) || 0
    setFactuurRegels(prev => [...prev, {
      id: crypto.randomUUID(),
      type: 'handmatig',
      werkzaamheden: newHandmatigeRegel.werkzaamheden.trim(),
      omschrijving: newHandmatigeRegel.omschrijving.trim() || undefined,
      aantal, prijs, bedrag: aantal * prijs,
    }])
    setNewHandmatigeRegel({ werkzaamheden: '', omschrijving: '', aantal: '', prijs: '' })
  }

  const closeFactuurModal = () => {
    setShowFactuurModal(false)
    setFactuurNummer(null)
    setNeedsKlantDetails(false)
  }

  // Versleep een rij in de factuur-samenvatting naar een nieuwe positie
  const verplaatsFactuurRij = (naarIndex: number) => {
    if (!dragId) return
    setFactuurRegels(prev => {
      const vanIndex = prev.findIndex(r => r.id === dragId)
      if (vanIndex === -1 || vanIndex === naarIndex) return prev
      const next = [...prev]
      const [verplaatst] = next.splice(vanIndex, 1)
      next.splice(naarIndex, 0, verplaatst)
      return next
    })
  }

  // Archief helpers
  const klantArchiefUren = activeKlant
    ? archiefUren.filter(u => u.klant === activeKlant.naam)
    : []

  const archiefGroepen = Object.entries(
    klantArchiefUren.reduce((acc, u) => {
      const key = u.factuurnummer ?? 'onbekend'
      if (!acc[key]) acc[key] = []
      acc[key].push(u)
      return acc
    }, {} as Record<string, Uur[]>)
  ).sort((a, b) => b[0].localeCompare(a[0]))

  const handleRestoreFactuur = async (factuurnummer: string) => {
    const isOnbekend = factuurnummer === 'onbekend'
    const groepUren = archiefUren.filter(u => (u.factuurnummer ?? 'onbekend') === factuurnummer)
    const promptText = isOnbekend
      ? `Zet ${groepUren.length} losse gearchiveerde uren terug naar actief?`
      : `Weet je zeker dat je factuur ${factuurnummer} wilt verwijderen en de uren wilt terugzetten?`
    if (!confirm(promptText)) return

    setRestoringFactuur(factuurnummer)
    try {
      const res = await fetch('/api/uren-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factuurnummer: isOnbekend ? null : factuurnummer,
          urenIds: groepUren.map(u => u.id),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Fout bij terugzetten: ${data.error}`)
        return
      }
      if (data.restoredCount === 0) {
        alert('Geen uren gevonden om terug te zetten.')
      }
      await load()
    } catch (err: any) {
      alert(`Fout: ${err.message}`)
    } finally {
      setRestoringFactuur(null)
    }
  }

  const cellBase = 'w-full px-2 py-2 bg-transparent border-0 focus:bg-yellow-50 focus:outline focus:outline-2 focus:outline-brand-text-primary focus:relative focus:z-10 text-body'
  const cellRight = cellBase + ' text-right'

  return (
    <div className="p-8 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">Uren</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            Kies een klant en vul direct je uren in.
          </p>
        </div>
        <button onClick={load} className="btn-secondary" title="Vernieuwen">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Klant selector */}
      <div className="flex flex-wrap gap-2">
        {klanten.map(k => {
          const isActive = k.id === activeKlantId
          const bedrijf = FACTUUR_BEDRIJVEN.find(c => c.id === k.companyId)
          return (
            <button
              key={k.id}
              onClick={() => setActiveKlantId(k.id)}
              className={`px-4 py-2 rounded-brand-sm text-body transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-brand-text-primary text-white font-semibold shadow-sm'
                  : 'bg-white border border-brand-card-border text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-text-secondary'
              }`}
            >
              {bedrijf && (
                <span
                  className="w-2 h-2 rounded-full shrink-0 opacity-70"
                  style={{ backgroundColor: isActive ? 'white' : bedrijf.color }}
                  title={bedrijf.name}
                />
              )}
              {k.naam}
            </button>
          )
        })}
        <button
          onClick={() => setShowKlantModal(true)}
          className="px-4 py-2 rounded-brand-sm text-body border border-dashed border-brand-card-border text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-text-secondary transition-all flex items-center gap-2"
        >
          <UserPlus size={14} /> Nieuwe klant
        </button>
      </div>

      {!activeKlant ? (
        <div className="card p-8 text-center text-brand-text-secondary">
          Kies een klant om uren in te vullen.
        </div>
      ) : (
        <>
          {/* Klant header */}
          <div className="flex items-center justify-between gap-4 px-1">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="font-uxum text-xl text-brand-text-primary truncate">{activeKlant.naam}</h2>
              {(() => {
                const crmBedrijf = activeKlant.crmBedrijfId ? crmBedrijven.find(cb => cb.id === activeKlant.crmBedrijfId) : null
                const status = crmBedrijf?.status?.toLowerCase().trim()
                if (!status) return null
                const bg =
                  status === 'klant' || status === 'lopende samenwerking' ? '#dcfce7' :
                  status === 'in gesprek' ? '#e0e7ff' :
                  status === 'klant on hold' || status === 'on hold' ? '#fef3c7' : '#f3f4f6'
                const fg =
                  status === 'klant' || status === 'lopende samenwerking' ? '#166534' :
                  status === 'in gesprek' ? '#4338ca' :
                  status === 'klant on hold' || status === 'on hold' ? '#92400e' : '#6b7280'
                return (
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0" style={{ background: bg, color: fg }}>
                    {crmBedrijf?.status}
                  </span>
                )
              })()}
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {activeKlant.klantnummer && (
                <span className="text-sm font-mono font-semibold text-brand-text-secondary tracking-widest">
                  {activeKlant.klantnummer}
                </span>
              )}
              {activeKlant.crmBedrijfId && (
                <Link
                  href={`/crm/bedrijven?open=${encodeURIComponent(activeKlant.naam)}`}
                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-600 transition-colors"
                >
                  <ExternalLink size={11} /> CRM
                </Link>
              )}
            </div>
          </div>

          {/* Tarief controls */}
          <div className="flex flex-wrap items-end gap-4 card py-3">
            <div>
              <label className="label">Uurloon</label>
              <div className="flex gap-1 bg-brand-page-light rounded-brand-sm p-1">
                <button
                  onClick={() => setTariefMode('vast')}
                  className={`px-3 py-1 rounded-brand-sm text-caption transition-colors ${
                    tariefMode === 'vast'
                      ? 'bg-white text-brand-text-primary font-medium shadow-sm'
                      : 'text-brand-text-secondary hover:text-brand-text-primary'
                  }`}
                >
                  Vast
                </button>
                <button
                  onClick={() => setTariefMode('perRij')}
                  className={`px-3 py-1 rounded-brand-sm text-caption transition-colors ${
                    tariefMode === 'perRij'
                      ? 'bg-white text-brand-text-primary font-medium shadow-sm'
                      : 'text-brand-text-secondary hover:text-brand-text-primary'
                  }`}
                >
                  Per rij
                </button>
              </div>
            </div>

            {tariefMode === 'vast' && (
              <div>
                <label className="label">Tarief voor {activeKlant.naam}</label>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={vastTarief}
                      onChange={e => setVastTarief(e.target.value)}
                      onBlur={handleVastTariefBlur}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          ;(e.target as HTMLInputElement).blur()
                        }
                      }}
                      placeholder="0.00"
                      className="input pl-7 w-32"
                    />
                  </div>
                  <span className="text-caption text-brand-text-secondary">per uur</span>
                </div>
              </div>
            )}
          </div>

          {/* Spreadsheet */}
          <div className="bg-white rounded-brand border border-brand-card-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-body border-collapse">
                <thead>
                  <tr className="bg-brand-page-light">
                    <th className="border border-brand-page-medium px-2 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                        onChange={toggleAll}
                        className="cursor-pointer accent-brand-text-primary"
                        title="Alles selecteren"
                      />
                    </th>
                    <th className="text-left text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2 w-36">Datum</th>
                    <th className="text-left text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2">Omschrijving</th>
                    <th className="text-right text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2 w-24">Uren</th>
                    {tariefMode === 'perRij' && (
                      <th className="text-right text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2 w-28">Tarief</th>
                    )}
                    <th className="text-right text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2 w-28">Totaal</th>
                    <th className="border border-brand-page-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {klantUren.map(entry => {
                    const effectiefTarief = tariefMode === 'vast' ? (Number(vastTarief) || 0) : entry.uurtarief
                    const isSelected = selectedIds.has(entry.id)
                    return (
                      <tr key={entry.id} className={`group ${isSelected ? 'bg-brand-lavender-light/30' : ''}`}>
                        <td className="border border-brand-page-medium px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(entry.id)}
                            className="cursor-pointer accent-brand-text-primary"
                          />
                        </td>
                        <td className="border border-brand-page-medium p-0">
                          <input
                            type="date"
                            defaultValue={entry.datum}
                            onBlur={e => e.target.value !== entry.datum && handleCellUpdate(entry.id, 'datum', e.target.value)}
                            className={cellBase + ' text-brand-text-secondary'}
                          />
                        </td>
                        <td className="border border-brand-page-medium p-0">
                          <input
                            type="text"
                            defaultValue={entry.omschrijving ?? ''}
                            onBlur={e => e.target.value !== (entry.omschrijving ?? '') && handleCellUpdate(entry.id, 'omschrijving', e.target.value)}
                            placeholder="–"
                            className={cellBase}
                          />
                        </td>
                        <td className="border border-brand-page-medium p-0">
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            defaultValue={entry.uren}
                            onBlur={e => Number(e.target.value) !== entry.uren && handleCellUpdate(entry.id, 'uren', e.target.value)}
                            className={cellRight + ' font-semibold'}
                          />
                        </td>
                        {tariefMode === 'perRij' && (
                          <td className="border border-brand-page-medium p-0">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              defaultValue={entry.uurtarief}
                              onBlur={e => Number(e.target.value) !== entry.uurtarief && handleCellUpdate(entry.id, 'uurtarief', e.target.value)}
                              className={cellRight + ' text-brand-text-secondary'}
                            />
                          </td>
                        )}
                        <td className="border border-brand-page-medium px-2 py-2 text-right font-semibold whitespace-nowrap bg-brand-page-light/30">
                          {euro(entry.uren * effectiefTarief)}
                        </td>
                        <td className="border border-brand-page-medium px-1 py-1 text-center">
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-brand-text-secondary hover:text-red-500 transition-all"
                            title="Verwijderen"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {/* Nieuwe invoer-rij */}
                  <tr ref={newRowRef} onBlur={handleNewRowBlur} className="bg-brand-lime/10">
                    <td className="border border-brand-lime-accent/40 px-2 py-1"></td>
                    <td className="border border-brand-lime-accent/40 p-0">
                      <input
                        ref={datumInputRef}
                        type="date"
                        value={newRow.datum}
                        onChange={e => setNewRow(r => ({ ...r, datum: e.target.value }))}
                        onKeyDown={handleNewRowKeyDown}
                        className={cellBase}
                      />
                    </td>
                    <td className="border border-brand-lime-accent/40 p-0">
                      <input
                        type="text"
                        value={newRow.omschrijving}
                        onChange={e => setNewRow(r => ({ ...r, omschrijving: e.target.value }))}
                        onKeyDown={handleNewRowKeyDown}
                        placeholder="Wat heb je gedaan?"
                        className={cellBase + ' placeholder:text-brand-text-secondary/50'}
                      />
                    </td>
                    <td className="border border-brand-lime-accent/40 p-0">
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={newRow.uren}
                        onChange={e => setNewRow(r => ({ ...r, uren: e.target.value }))}
                        onKeyDown={handleNewRowKeyDown}
                        placeholder="0"
                        className={cellRight + ' font-semibold placeholder:text-brand-text-secondary/50'}
                      />
                    </td>
                    {tariefMode === 'perRij' && (
                      <td className="border border-brand-lime-accent/40 p-0">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={newRow.uurtarief}
                          onChange={e => setNewRow(r => ({ ...r, uurtarief: e.target.value }))}
                          onKeyDown={handleNewRowKeyDown}
                          placeholder="0"
                          className={cellRight + ' text-brand-text-secondary placeholder:text-brand-text-secondary/50'}
                        />
                      </td>
                    )}
                    <td className="border border-brand-lime-accent/40 px-2 py-2 text-right font-semibold whitespace-nowrap bg-brand-lime/20">
                      {newRow.uren && huidigTarief > 0
                        ? euro(Number(newRow.uren) * huidigTarief)
                        : '–'}
                    </td>
                    <td className="border border-brand-lime-accent/40 px-1 py-1 text-center">
                      <button
                        onClick={handleAddRow}
                        disabled={saving || !newRow.uren}
                        className="p-1 rounded bg-brand-lime-accent text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title="Toevoegen (Enter)"
                      >
                        {saving ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="px-3 py-2 text-caption text-brand-text-secondary/70 bg-brand-page-light/30 border-t border-brand-page-medium">
              Vul de groene rij in en druk <kbd className="px-1.5 py-0.5 rounded bg-white border border-brand-card-border text-[10px]">Enter</kbd> om toe te voegen. Klik op een cel om te bewerken.
            </div>
          </div>

          {/* Totalen uren + genereer factuur knop */}
          {klantUren.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-6 card py-3">
                <div className="text-right">
                  <p className="text-caption text-brand-text-secondary">Registraties</p>
                  <p className="font-semibold text-body">{klantUren.length}</p>
                </div>
                <div className="text-right">
                  <p className="text-caption text-brand-text-secondary">Totaal uren</p>
                  <p className="font-semibold text-body">{totaalUren.toFixed(2)}u</p>
                </div>
                <div className="text-right min-w-[110px]">
                  <p className="text-caption text-brand-text-secondary">Ex. btw</p>
                  <p className="font-uxum text-body text-brand-text-primary">{euro(totaalExBtw)}</p>
                </div>
                <div className="text-right min-w-[110px]">
                  <p className="text-caption text-brand-text-secondary">Incl. btw ({BTW_PERCENTAGE}%)</p>
                  <p className="font-uxum text-body text-brand-text-primary">{euro(totaalInclBtw)}</p>
                </div>
              </div>

              {(someSelected || someProjectSelected) && (
                <button
                  onClick={openFactuurModal}
                  className="btn-primary flex items-center gap-2"
                >
                  <FileText size={15} />
                  Genereer factuur
                  {someSelected && <span className="opacity-80 text-caption">({geselecteerdeUren.length} {geselecteerdeUren.length === 1 ? 'uur' : 'uren'}{someProjectSelected ? ` + ${selectedProjectIds.size} project${selectedProjectIds.size > 1 ? 'en' : ''}` : ''})</span>}
                  {!someSelected && someProjectSelected && <span className="opacity-80 text-caption">({selectedProjectIds.size} project{selectedProjectIds.size > 1 ? 'en' : ''})</span>}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Losse projecten */}
      {activeKlant && (
        <div className="space-y-3">
          <div>
            <h2 className="font-uxum text-body text-brand-text-primary">Losse projecten</h2>
            <p className="text-caption text-brand-text-secondary mt-0.5">
              Vaste tarieven voor {activeKlant.naam}, excl. btw.
            </p>
          </div>

          <div className="bg-white rounded-brand border border-brand-card-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-body border-collapse">
                <thead>
                  <tr className="bg-brand-page-light">
                    <th className="border border-brand-page-medium px-2 py-2 w-8"></th>
                    <th className="text-left text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2 w-36">Datum</th>
                    <th className="text-left text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2">Project</th>
                    <th className="text-left text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2">Omschrijving</th>
                    <th className="text-right text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2 w-20">Aantal</th>
                    <th className="text-right text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2 w-24">Prijs</th>
                    <th className="text-right text-caption text-brand-text-secondary uppercase tracking-wide font-medium border border-brand-page-medium px-2 py-2 w-28">Totaal ex. btw</th>
                    <th className="border border-brand-page-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {klantProjecten.map(project => {
                    const isProjectSelected = selectedProjectIds.has(project.id)
                    return (
                    <tr key={project.id} className={`group ${isProjectSelected ? 'bg-brand-lavender-light/30' : ''}`}>
                      <td className="border border-brand-page-medium px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={isProjectSelected}
                          onChange={() => setSelectedProjectIds(prev => {
                            const next = new Set(prev)
                            if (next.has(project.id)) next.delete(project.id)
                            else next.add(project.id)
                            return next
                          })}
                          className="cursor-pointer accent-brand-text-primary"
                        />
                      </td>
                      <td className="border border-brand-page-medium p-0">
                        <input
                          type="date"
                          defaultValue={project.datum}
                          onBlur={e => e.target.value !== project.datum && handleProjectCellUpdate(project.id, 'datum', e.target.value)}
                          className={cellBase + ' text-brand-text-secondary'}
                        />
                      </td>
                      <td className="border border-brand-page-medium p-0">
                        <input
                          type="text"
                          defaultValue={project.naam}
                          onBlur={e => e.target.value !== project.naam && handleProjectCellUpdate(project.id, 'naam', e.target.value)}
                          className={cellBase + ' font-medium'}
                        />
                      </td>
                      <td className="border border-brand-page-medium p-0">
                        <input
                          type="text"
                          defaultValue={project.omschrijving ?? ''}
                          onBlur={e => e.target.value !== (project.omschrijving ?? '') && handleProjectCellUpdate(project.id, 'omschrijving', e.target.value)}
                          placeholder="–"
                          className={cellBase}
                        />
                      </td>
                      <td className="border border-brand-page-medium p-0">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={project.aantal ?? 1}
                          onBlur={e => Number(e.target.value) !== (project.aantal ?? 1) && handleProjectAantalPrijs(project.id, 'aantal', e.target.value)}
                          className={cellRight}
                        />
                      </td>
                      <td className="border border-brand-page-medium p-0">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={project.prijs ?? project.bedrag}
                          onBlur={e => Number(e.target.value) !== (project.prijs ?? project.bedrag) && handleProjectAantalPrijs(project.id, 'prijs', e.target.value)}
                          className={cellRight}
                        />
                      </td>
                      <td className="border border-brand-page-medium px-2 py-1 text-right font-semibold text-brand-text-primary whitespace-nowrap">
                        {euro(project.bedrag)}
                      </td>
                      <td className="border border-brand-page-medium px-1 py-1 text-center">
                        <button
                          onClick={() => handleProjectDelete(project.id)}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-brand-text-secondary hover:text-red-500 transition-all"
                          title="Verwijderen"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}

                  <tr ref={newProjectRowRef} onBlur={handleProjectRowBlur} className="bg-brand-lime/10">
                    <td className="border border-brand-lime-accent/40 px-2 py-1"></td>
                    <td className="border border-brand-lime-accent/40 p-0">
                      <input
                        type="date"
                        value={newProject.datum}
                        onChange={e => setNewProject(r => ({ ...r, datum: e.target.value }))}
                        onKeyDown={handleProjectKeyDown}
                        className={cellBase}
                      />
                    </td>
                    <td className="border border-brand-lime-accent/40 p-0">
                      <input
                        ref={newProjectNaamRef}
                        type="text"
                        value={newProject.naam}
                        onChange={e => setNewProject(r => ({ ...r, naam: e.target.value }))}
                        onKeyDown={handleProjectKeyDown}
                        placeholder="Projectnaam"
                        className={cellBase + ' placeholder:text-brand-text-secondary/50'}
                      />
                    </td>
                    <td className="border border-brand-lime-accent/40 p-0">
                      <input
                        type="text"
                        value={newProject.omschrijving}
                        onChange={e => setNewProject(r => ({ ...r, omschrijving: e.target.value }))}
                        onKeyDown={handleProjectKeyDown}
                        placeholder="Optioneel"
                        className={cellBase + ' placeholder:text-brand-text-secondary/50'}
                      />
                    </td>
                    <td className="border border-brand-lime-accent/40 p-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newProject.aantal}
                        onChange={e => setNewProject(r => ({ ...r, aantal: e.target.value }))}
                        onKeyDown={handleProjectKeyDown}
                        placeholder="1"
                        className={cellRight + ' placeholder:text-brand-text-secondary/50'}
                      />
                    </td>
                    <td className="border border-brand-lime-accent/40 p-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newProject.prijs}
                        onChange={e => setNewProject(r => ({ ...r, prijs: e.target.value }))}
                        onKeyDown={handleProjectKeyDown}
                        placeholder="0.00"
                        className={cellRight + ' placeholder:text-brand-text-secondary/50'}
                      />
                    </td>
                    <td className="border border-brand-lime-accent/40 px-2 py-1 text-right font-semibold text-brand-text-primary whitespace-nowrap">
                      {euro((Number(newProject.aantal) || 1) * (Number(newProject.prijs) || 0))}
                    </td>
                    <td className="border border-brand-lime-accent/40 px-1 py-1 text-center">
                      <button
                        onClick={handleAddProject}
                        disabled={savingProject || !newProject.naam || !newProject.prijs}
                        className="p-1 rounded bg-brand-lime-accent text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title="Toevoegen (Enter)"
                      >
                        {savingProject ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 text-caption text-brand-text-secondary/70 bg-brand-page-light/30 border-t border-brand-page-medium flex items-center gap-3 flex-wrap">
              <span>Vul de groene rij in en druk <kbd className="px-1.5 py-0.5 rounded bg-white border border-brand-card-border text-[10px]">Enter</kbd> of klik ergens anders om op te slaan.</span>
              <span className="text-brand-text-secondary/50">Sneltoets: <kbd className="px-1.5 py-0.5 rounded bg-white border border-brand-card-border text-[10px]">G</kbd> om direct naar dit veld te springen.</span>
            </div>
          </div>

          {klantProjecten.length > 0 && (
            <div className="flex items-center gap-6 card py-3 w-fit ml-auto">
              <div className="text-right">
                <p className="text-caption text-brand-text-secondary">Projecten</p>
                <p className="font-semibold text-body">{klantProjecten.length}</p>
              </div>
              <div className="text-right min-w-[110px]">
                <p className="text-caption text-brand-text-secondary">Ex. btw</p>
                <p className="font-uxum text-body text-brand-text-primary">
                  {euro(klantProjecten.reduce((s, p) => s + p.bedrag, 0))}
                </p>
              </div>
              <div className="text-right min-w-[110px]">
                <p className="text-caption text-brand-text-secondary">Incl. btw (21%)</p>
                <p className="font-uxum text-body text-brand-text-primary">
                  {euro(klantProjecten.reduce((s, p) => s + p.bedrag, 0) * 1.21)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gecombineerd totaal */}
      {activeKlant && (klantUren.length > 0 || klantProjecten.length > 0) && (
        <div className="card p-4 flex flex-wrap items-center gap-6 justify-between">
          <p className="font-uxum text-body text-brand-text-primary">
            Totaal {activeKlant.naam}
          </p>
          <div className="flex flex-wrap items-center gap-6">
            <div className="text-right">
              <p className="text-caption text-brand-text-secondary">Uren ex. btw</p>
              <p className="text-body font-semibold">{euro(totaalExBtw)}</p>
            </div>
            <div className="text-right">
              <p className="text-caption text-brand-text-secondary">Projecten ex. btw</p>
              <p className="text-body font-semibold">
                {euro(klantProjecten.reduce((s, p) => s + p.bedrag, 0))}
              </p>
            </div>
            <div className="h-8 w-px bg-brand-card-border" />
            <div className="text-right min-w-[120px]">
              <p className="text-caption text-brand-text-secondary">Totaal ex. btw</p>
              <p className="font-uxum text-body text-brand-text-primary font-semibold">
                {euro(totaalExBtw + klantProjecten.reduce((s, p) => s + p.bedrag, 0))}
              </p>
            </div>
            <div className="text-right min-w-[120px]">
              <p className="text-caption text-brand-text-secondary">Totaal incl. btw (21%)</p>
              <p className="font-uxum text-body text-brand-text-primary font-semibold">
                {euro((totaalExBtw + klantProjecten.reduce((s, p) => s + p.bedrag, 0)) * 1.21)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Factuur archief */}
      {activeKlant && klantArchiefUren.length > 0 && (
        <div className="space-y-3 pt-2">
          <button
            onClick={() => setArchiefOpen(o => !o)}
            className="flex items-center gap-2 text-caption text-brand-text-secondary hover:text-brand-text-primary transition-colors"
          >
            <ChevronDown size={14} className={`transition-transform ${archiefOpen ? 'rotate-180' : ''}`} />
            Factuur archief ({archiefGroepen.length} {archiefGroepen.length === 1 ? 'factuur' : 'facturen'}, {klantArchiefUren.length} rijen)
          </button>

          {archiefOpen && archiefGroepen.map(([factuurnummer, groepUren]) => {
            const datums = groepUren.map(u => u.datum).sort()
            const datumVan = new Date(datums[0] + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
            const datumTot = new Date(datums[datums.length - 1] + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
            const totaalUrenGroep = groepUren.reduce((s, u) => s + u.uren, 0)
            const totaalBedragGroep = groepUren.reduce((s, u) => s + u.uren * u.uurtarief, 0)
            const isRestoring = restoringFactuur === factuurnummer

            return (
              <div key={factuurnummer} className="bg-white rounded-brand border border-brand-card-border overflow-hidden opacity-60 hover:opacity-100 transition-opacity">
                <div className="flex items-center justify-between px-4 py-2.5 bg-brand-page-light/60 border-b border-brand-page-medium">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-uxum text-caption text-brand-text-primary font-semibold">{factuurnummer}</span>
                    <span className="text-caption text-brand-text-secondary">{datumVan} – {datumTot}</span>
                    <span className="text-caption text-brand-text-secondary">{totaalUrenGroep.toFixed(2)}u | {euro(totaalBedragGroep)} ex. btw</span>
                  </div>
                  <button
                    onClick={() => handleRestoreFactuur(factuurnummer)}
                    disabled={!!restoringFactuur}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-brand-sm text-caption border border-brand-card-border text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-text-secondary transition-all disabled:opacity-40 ml-4 shrink-0"
                  >
                    {isRestoring
                      ? <><RefreshCw size={12} className="animate-spin" /> Bezig...</>
                      : <><RotateCcw size={12} /> Zet terug</>}
                  </button>
                </div>
                <table className="w-full text-body border-collapse">
                  <tbody>
                    {groepUren
                      .sort((a, b) => a.datum.localeCompare(b.datum))
                      .map(u => (
                        <tr key={u.id} className="border-b border-brand-page-medium last:border-0">
                          <td className="px-3 py-1.5 text-caption text-brand-text-secondary w-36">
                            {new Date(u.datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-1.5 text-caption">
                            {u.omschrijving || <span className="text-brand-text-secondary/50 italic">geen omschrijving</span>}
                          </td>
                          <td className="px-3 py-1.5 text-caption text-right text-brand-text-secondary w-20">{u.uren.toFixed(2)}u</td>
                          <td className="px-3 py-1.5 text-caption text-right font-semibold w-28">{euro(u.uren * u.uurtarief)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* Nieuwe klant modal */}
      {showKlantModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeKlantModal}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-brand border border-brand-card-border shadow-xl p-6 w-full max-w-md space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-uxum text-body text-brand-text-primary">
                {klantModalStap === 'zoeken' ? 'Klant kiezen' : 'Nieuwe klant'}
              </h2>
              <button
                type="button"
                onClick={closeKlantModal}
                className="text-brand-text-secondary hover:text-brand-text-primary"
              >
                <X size={16} />
              </button>
            </div>

            {klantModalStap === 'zoeken' ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary/60 pointer-events-none" />
                  <input
                    type="text"
                    value={klantZoekTerm}
                    onChange={e => setKlantZoekTerm(e.target.value)}
                    placeholder="Zoek in bedrijven..."
                    className="input w-full pl-9"
                    autoFocus
                  />
                </div>

                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {(() => {
                    const term = klantZoekTerm.toLowerCase().trim()
                    const gefilterd = crmBedrijven.filter(cb =>
                      cb.naam.toLowerCase().includes(term) ||
                      (cb.klantnummer ?? '').toLowerCase().includes(term)
                    )
                    if (gefilterd.length === 0 && term) {
                      return (
                        <p className="text-caption text-brand-text-secondary px-1 py-1">
                          Geen bedrijven gevonden voor &quot;{klantZoekTerm}&quot;.
                        </p>
                      )
                    }
                    return gefilterd.map(cb => {
                      const gekoppeldeKlant = klanten.find(k => k.crmBedrijfId === cb.id)
                      return (
                        <button
                          key={cb.id}
                          type="button"
                          onClick={() => {
                            if (gekoppeldeKlant) {
                              // Al actief als uren-klant: direct activeren
                              setActiveKlantId(gekoppeldeKlant.id)
                              closeKlantModal()
                            } else {
                              // Nieuw koppelen: ga naar aanmaak-stap met CRM data
                              setNewKlantNaam(cb.naam)
                              setNewKlantCrmId(cb.id)
                              if (!newKlantNummerManual && cb.naam.length >= 2) {
                                setNewKlantNummer(cb.klantnummer?.slice(0, 10) || deriveKlantnummerLetters(cb.naam))
                              }
                              setKlantModalStap('aanmaken')
                            }
                          }}
                          className="w-full text-left px-3 py-2.5 rounded-brand-sm border border-brand-page-medium hover:border-brand-card-border hover:bg-brand-page-light transition-all flex items-center justify-between gap-3"
                        >
                          <span className="flex flex-col">
                            <span className="text-body font-medium text-brand-text-primary">{cb.naam}</span>
                            {cb.klantnummer && (
                              <span className="text-[10px] font-mono text-brand-text-secondary/60 leading-tight">{cb.klantnummer}</span>
                            )}
                          </span>
                          {gekoppeldeKlant ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-lime text-brand-lime-accent font-medium shrink-0">
                              Actief
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-page-light text-brand-text-secondary font-medium shrink-0">
                              Toevoegen
                            </span>
                          )}
                        </button>
                      )
                    })
                  })()}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const naam = klantZoekTerm.trim()
                    setNewKlantNaam(naam)
                    setNewKlantCrmId(undefined)
                    if (!newKlantNummerManual && naam.length >= 2) {
                      setNewKlantNummer(deriveKlantnummerLetters(naam))
                    }
                    setKlantModalStap('aanmaken')
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-brand-sm border border-dashed border-brand-card-border text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-text-secondary transition-all text-body"
                >
                  <UserPlus size={14} />
                  {klantZoekTerm.trim()
                    ? `"${klantZoekTerm.trim()}" handmatig aanmaken`
                    : 'Handmatig nieuwe klant aanmaken'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddKlant} className="space-y-4">
                <div>
                  <label className="label">Factuur vanuit</label>
                  <div className="flex gap-2">
                    {FACTUUR_BEDRIJVEN.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setNewKlantCompanyId(c.id as CompanyId)}
                        className={`flex-1 border-2 rounded-brand p-2.5 text-left transition-all ${newKlantCompanyId === c.id ? 'border-brand-card-border bg-brand-lavender-light/30' : 'border-brand-page-medium hover:border-brand-lavender-dark'}`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                          <span className="font-semibold text-caption">{c.shortName}</span>
                        </div>
                        <p className="text-caption text-brand-text-secondary leading-tight pl-4">{c.name}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Naam</label>
                  <input
                    type="text"
                    value={newKlantNaam}
                    onChange={e => {
                      const naam = e.target.value
                      setNewKlantNaam(naam)
                      if (!newKlantNummerManual) {
                        setNewKlantNummer(naam.trim().length >= 2 ? deriveKlantnummerLetters(naam) : '')
                      }
                    }}
                    placeholder="Klantnaam"
                    className="input w-full"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="label">
                    Klantnummer
                    <span className="ml-1.5 text-[10px] text-brand-text-secondary/60 font-normal normal-case">
                      automatisch aangevuld, aanpasbaar
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newKlantNummer}
                      onChange={e => {
                        setNewKlantNummer(e.target.value.toUpperCase())
                        setNewKlantNummerManual(true)
                      }}
                      placeholder="bijv. DRI"
                      maxLength={10}
                      className="input w-28 font-mono tracking-widest"
                    />
                    <span className="text-caption text-brand-text-secondary/60">
                      + 001 volgt automatisch
                    </span>
                  </div>
                </div>
                <div>
                  <label className="label">Standaard uurtarief</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newKlantTarief}
                    onChange={e => setNewKlantTarief(e.target.value)}
                    placeholder="0.00"
                    className="input w-full"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={savingKlant} className="btn-primary">
                    {savingKlant ? 'Opslaan...' : <><Check size={15} /> Toevoegen</>}
                  </button>
                  <button type="button" onClick={() => setKlantModalStap('zoeken')} className="btn-secondary">
                    Terug
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Factuur modal */}
      {showFactuurModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={factuurNummer ? closeFactuurModal : undefined}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-brand border border-brand-card-border shadow-xl p-6 w-full max-w-xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-uxum text-body text-brand-text-primary">
                {needsKlantDetails ? `Klantgegevens ${activeKlant?.naam}` : 'Factuur genereren'}
              </h2>
              <button type="button" onClick={closeFactuurModal} className="text-brand-text-secondary hover:text-brand-text-primary">
                <X size={16} />
              </button>
            </div>

            {/* Succes */}
            {factuurNummer && (
              <div className="p-5 rounded-brand bg-green-50 border border-green-200 text-green-800 space-y-2">
                <p className="font-uxum text-body font-semibold">Factuur gegenereerd.</p>
                <p className="text-body"><strong>{factuurNummer}</strong> is aangemaakt en automatisch opgeslagen als PDF.</p>
                <button onClick={closeFactuurModal} className="btn-primary mt-2">Sluiten</button>
              </div>
            )}

            {/* Eenmalig klantgegevens invullen */}
            {!factuurNummer && needsKlantDetails && (
              <form onSubmit={handleSlaKlantDetailsOpEnGenereer} className="space-y-4">
                <p className="text-body text-brand-text-secondary">
                  Vul eenmalig de adresgegevens van <strong>{activeKlant?.naam}</strong> in. Daarna maakt de knop direct facturen zonder te vragen.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">Adres</label>
                    <input type="text" value={klantDetailsForm.adres} onChange={e => setKlantDetailsForm(f => ({ ...f, adres: e.target.value }))} placeholder="Straat + huisnummer" className="input w-full" required autoFocus />
                  </div>
                  <div>
                    <label className="label">Postcode</label>
                    <input type="text" value={klantDetailsForm.postcode} onChange={e => setKlantDetailsForm(f => ({ ...f, postcode: e.target.value }))} placeholder="1234 AB" className="input w-full" required />
                  </div>
                  <div>
                    <label className="label">Stad</label>
                    <input type="text" value={klantDetailsForm.stad} onChange={e => setKlantDetailsForm(f => ({ ...f, stad: e.target.value }))} placeholder="Amsterdam" className="input w-full" required />
                  </div>
                  <div>
                    <label className="label">Contactpersoon</label>
                    <input type="text" value={klantDetailsForm.contactpersoon} onChange={e => setKlantDetailsForm(f => ({ ...f, contactpersoon: e.target.value }))} placeholder="Naam" className="input w-full" />
                  </div>
                  <div>
                    <label className="label">Klantnummer</label>
                    <input type="text" value={klantDetailsForm.klantnummer} onChange={e => setKlantDetailsForm(f => ({ ...f, klantnummer: e.target.value }))} placeholder="Optioneel" className="input w-full" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingKlantDetails || generatingFactuur} className="btn-primary flex items-center gap-2">
                    {(savingKlantDetails || generatingFactuur)
                      ? <><RefreshCw size={15} className="animate-spin" /> Bezig...</>
                      : <><FileText size={15} /> Opslaan & factuur genereren</>}
                  </button>
                  <button type="button" onClick={closeFactuurModal} className="btn-secondary">Annuleren</button>
                </div>
              </form>
            )}

            {/* Standaard: preview + genereer knop */}
            {!factuurNummer && !needsKlantDetails && (
              <>
                <div className="rounded-brand border border-brand-card-border overflow-hidden text-body">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-brand-page-light text-caption text-brand-text-secondary uppercase tracking-wide">
                        <th className="text-left px-3 py-1.5 border-b border-brand-page-medium font-medium">Datum</th>
                        <th className="text-left px-3 py-1.5 border-b border-brand-page-medium font-medium">Omschrijving</th>
                        <th className="text-right px-3 py-1.5 border-b border-brand-page-medium font-medium">Uren</th>
                        <th className="text-right px-3 py-1.5 border-b border-brand-page-medium font-medium">Subtotaal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {factuurRegels.map((regel, i) => (
                        <tr
                          key={regel.id}
                          draggable
                          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setDragId(regel.id) }}
                          onDragEnter={() => verplaatsFactuurRij(i)}
                          onDragOver={e => e.preventDefault()}
                          onDragEnd={() => setDragId(null)}
                          className={`border-b border-brand-page-medium last:border-0 cursor-move ${dragId === regel.id ? 'opacity-40' : ''} ${regel.type === 'handmatig' ? 'bg-brand-lavender-light/20' : ''}`}
                        >
                          {regel.type === 'uur' ? (<>
                            <td className="px-3 py-1.5 text-brand-text-secondary">
                              <span className="inline-flex items-center gap-1.5">
                                <GripVertical size={13} className="text-brand-text-secondary/40 shrink-0" />
                                {new Date(regel.uur.datum).toLocaleDateString('nl-NL')}
                              </span>
                            </td>
                            <td className="px-3 py-1.5">{regel.uur.omschrijving || <span className="text-brand-text-secondary/50 italic">geen omschrijving</span>}</td>
                            <td className="px-3 py-1.5 text-right font-semibold">{regel.uur.uren.toFixed(2)}u</td>
                            <td className="px-3 py-1.5 text-right font-semibold">{euro(regel.uur.uren * (tariefMode === 'vast' ? (Number(vastTarief) || 0) : regel.uur.uurtarief))}</td>
                          </>) : (<>
                            <td className="px-3 py-1.5 text-brand-text-secondary">
                              <span className="inline-flex items-center gap-1.5">
                                <GripVertical size={13} className="text-brand-text-secondary/40 shrink-0" />
                                <span className="text-caption italic text-brand-text-secondary/60">vast bedrag</span>
                              </span>
                            </td>
                            <td className="px-3 py-1.5">
                              <span className="font-medium">{regel.werkzaamheden || <span className="text-brand-text-secondary/50 italic">geen werkzaamheden</span>}</span>
                              {regel.omschrijving && <span className="block text-caption text-brand-text-secondary mt-0.5">{regel.omschrijving}</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right text-brand-text-secondary">{regel.aantal} {regel.aantal !== 1 ? `× ${euro(regel.prijs)}` : ''}</td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="font-semibold">{euro(regel.bedrag)}</span>
                                <button
                                  onClick={() => setFactuurRegels(prev => prev.filter(r => r.id !== regel.id))}
                                  className="text-brand-text-secondary/40 hover:text-brand-status-red transition-colors"
                                  title="Verwijderen"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </>)}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-brand-page-light">
                        <td colSpan={3} className="px-3 py-1.5 text-right text-brand-text-secondary text-caption">Subtotaal ex. btw</td>
                        <td className="px-3 py-1.5 text-right text-brand-text-primary">{euro(modalSubtotaalExBtw)}</td>
                      </tr>
                      <tr className="bg-brand-page-light">
                        <td colSpan={3} className="px-3 py-1.5 text-right text-brand-text-secondary text-caption">{factuurBtwPercentage}% btw</td>
                        <td className="px-3 py-1.5 text-right text-brand-text-primary">{euro(modalBtwBedrag)}</td>
                      </tr>
                      <tr className="bg-brand-page-light border-t border-brand-page-medium">
                        <td colSpan={3} className="px-3 py-1.5 text-right text-brand-text-secondary text-caption">Totaal incl. btw</td>
                        <td className="px-3 py-1.5 text-right font-uxum font-semibold text-brand-text-primary">{euro(modalTotaalInclBtw)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Handmatige regel toevoegen */}
                <div className="flex flex-col gap-2">
                  <label className="label">Handmatige regel toevoegen</label>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 flex flex-col gap-1.5">
                      <input
                        type="text"
                        value={newHandmatigeRegel.werkzaamheden}
                        onChange={e => setNewHandmatigeRegel(r => ({ ...r, werkzaamheden: e.target.value }))}
                        placeholder="Werkzaamheden (bijv. Gezondheidsscan)"
                        className="input w-full"
                      />
                      <input
                        type="text"
                        value={newHandmatigeRegel.omschrijving}
                        onChange={e => setNewHandmatigeRegel(r => ({ ...r, omschrijving: e.target.value }))}
                        placeholder="Omschrijving (optioneel, kleine tekst onder de titel)"
                        className="input w-full text-caption"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHandmatig() } }}
                      />
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newHandmatigeRegel.aantal}
                        onChange={e => setNewHandmatigeRegel(r => ({ ...r, aantal: e.target.value }))}
                        placeholder="Aantal"
                        className="input text-right"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHandmatig() } }}
                      />
                    </div>
                    <div className="w-28">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-secondary text-body">€</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={newHandmatigeRegel.prijs}
                          onChange={e => setNewHandmatigeRegel(r => ({ ...r, prijs: e.target.value }))}
                          placeholder="Prijs"
                          className="input pl-7"
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHandmatig() } }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addHandmatig}
                      disabled={!newHandmatigeRegel.prijs || !newHandmatigeRegel.werkzaamheden}
                      className="btn-secondary disabled:opacity-40 flex items-center gap-1 mt-0.5"
                    >
                      <Plus size={14} /> Toevoegen
                    </button>
                  </div>
                </div>

                {factuurRegels.length > 1 && (
                  <p className="text-caption text-brand-text-secondary">
                    Sleep rijen om de volgorde op de factuur aan te passen. Uren en vaste bedragen zijn vrij te combineren.
                  </p>
                )}

                {activeKlant?.adres && (
                  <p className="text-caption text-brand-text-secondary">
                    Factuur voor <strong>{activeKlant.naam}</strong>, {activeKlant.adres}, {activeKlant.postcode} {activeKlant.stad}
                  </p>
                )}

                {/* Bedrijfskeuze */}
                <div>
                  <label className="label">Factuur vanuit</label>
                  <div className="flex gap-2">
                    {FACTUUR_BEDRIJVEN.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setFactuurCompanyId(c.id as CompanyId)}
                        className={`flex-1 border-2 rounded-brand p-2.5 text-left transition-all ${factuurCompanyId === c.id ? 'border-brand-card-border bg-brand-lavender-light/30' : 'border-brand-page-medium hover:border-brand-lavender-dark'}`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                          <span className="font-semibold text-caption">{c.shortName}</span>
                        </div>
                        <p className="text-caption text-brand-text-secondary leading-tight pl-4">{c.name}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Factuurdatum */}
                <div>
                  <label className="label">Factuurdatum</label>
                  <div className="flex flex-wrap items-center gap-2">
                    {([['vandaag', 'Vandaag'], ['morgen', 'Morgen'], ['custom', 'Custom']] as const).map(([key, lbl]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFactuurDatumKeuze(key)}
                        className={`px-3 py-1.5 rounded-brand-sm text-body border transition-colors ${
                          factuurDatumKeuze === key
                            ? 'bg-brand-text-primary text-white border-brand-text-primary font-medium'
                            : 'bg-white text-brand-text-secondary border-brand-card-border hover:bg-brand-page-light'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                    {factuurDatumKeuze === 'custom' && (
                      <input
                        type="date"
                        value={factuurCustomDatum}
                        onChange={e => setFactuurCustomDatum(e.target.value)}
                        className="input"
                      />
                    )}
                  </div>
                </div>

                {/* Verwacht factuurnummer */}
                <div className="flex items-center gap-2 text-body">
                  <span className="text-brand-text-secondary">Wordt factuurnummer:</span>
                  <span className="font-uxum font-semibold text-brand-text-primary">{factuurNummerPreview ?? '…'}</span>
                </div>

                {/* BTW-percentage */}
                <div>
                  <label className="label">BTW-percentage</label>
                  <div className="flex flex-wrap items-center gap-2">
                    {[21, 9, 0].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setFactuurBtwPercentage(pct)}
                        className={`px-3 py-1.5 rounded-brand-sm text-body border transition-colors ${
                          factuurBtwPercentage === pct
                            ? 'bg-brand-text-primary text-white border-brand-text-primary font-medium'
                            : 'bg-white text-brand-text-secondary border-brand-card-border hover:bg-brand-page-light'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Betaallink */}
                <div>
                  <label className="label">Knab betaallink <span className="text-brand-text-secondary font-normal">(optioneel)</span></label>
                  <input
                    type="url"
                    value={factuurBetaallink}
                    onChange={e => setFactuurBetaallink(e.target.value)}
                    placeholder="https://betaalverzoek.knab.nl/..."
                    className="input w-full"
                  />
                  <p className="text-caption text-brand-text-secondary mt-1">
                    Vul je dit in, dan komt er een iDEAL-knop op de factuur.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={roepFactuurAan}
                    disabled={generatingFactuur || (factuurDatumKeuze === 'custom' && !factuurCustomDatum)}
                    className="btn-primary flex items-center gap-2"
                  >
                    {generatingFactuur
                      ? <><RefreshCw size={15} className="animate-spin" /> Genereren...</>
                      : <><FileText size={15} /> Genereer factuur</>}
                  </button>
                  <button type="button" onClick={closeFactuurModal} className="btn-secondary">Annuleren</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
