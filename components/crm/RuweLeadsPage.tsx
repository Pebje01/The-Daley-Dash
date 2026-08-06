'use client'

/**
 * Triagelaag voor ongekwalificeerde leads, los van het Leads-bord.
 *
 * Bewust een lijst, geen pipeline: dit is de plek waar kandidaten uit
 * onderzoek binnenkomen voordat ze een "echte" lead worden. Promoveren zet
 * entity_type om naar `lead` (komt dan op het bord te staan bij "Nieuwe
 * kans"); afwijzen gebruikt de bestaande contactstatus-blokkade, dezelfde
 * die ook leads en bedrijven blokkeert.
 */
import { useCallback, useEffect, useState } from 'react'
import { Inbox, RefreshCw, Star, Mail, Globe, Check, Ban, Sparkles, Plus, X } from 'lucide-react'
import { useMelding } from '@/components/MeldingProvider'
import { AiScoreBadge } from '@/components/crm/AiKwalificatie'

interface RuweLead {
  id: string
  name: string
  status?: string | null
  contact_status?: string | null
  ruwe_contact_email?: string | null
  ruwe_website?: string | null
  ruwe_bron?: string | null
  ruwe_fit_reden?: string | null
  ruwe_prioriteit?: 'ster' | 'normaal' | 'laag' | null
  ai_status?: string | null
  ai_score?: number | null
  ai_prioriteit?: string | null
  ai_branche?: string | null
  ai_samenvatting?: string | null
  ai_volgende_stap?: string | null
}

const STATUSSEN: Array<{ status: string; label: string; volgende?: string }> = [
  { status: 'nieuw', label: 'Nieuw', volgende: 'te_benaderen' },
  { status: 'te_benaderen', label: 'Te benaderen', volgende: 'gemaild' },
  { status: 'gemaild', label: 'Gemaild', volgende: 'gereageerd' },
  { status: 'gereageerd', label: 'Gereageerd' },
]

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUSSEN.map((s) => [s.status, s.label])
)

function volgendeStatus(status?: string | null): string | undefined {
  return STATUSSEN.find((s) => s.status === (status || 'nieuw'))?.volgende
}

interface NieuwFormState {
  name: string
  ruwe_bron: string
  ruwe_contact_email: string
  ruwe_website: string
  ruwe_fit_reden: string
}

const LEEG_FORM: NieuwFormState = {
  name: '', ruwe_bron: '', ruwe_contact_email: '', ruwe_website: '', ruwe_fit_reden: '',
}

export default function RuweLeadsPage() {
  const melding = useMelding()
  const [items, setItems] = useState<RuweLead[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'done'>('loading')
  const [filter, setFilter] = useState<string>('alle')
  const [bezig, setBezig] = useState<string | null>(null)
  const [redenPerRij, setRedenPerRij] = useState<Record<string, string>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<NieuwFormState>(LEEG_FORM)
  const [opslaan, setOpslaan] = useState(false)

  const load = useCallback(() => {
    setState('loading')
    fetch('/api/crm/records?entity=ruwe_lead&limit=500', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        const alle: RuweLead[] = Array.isArray(d.items) ? d.items : []
        setItems(alle.filter((i) => i.contact_status !== 'blokkade'))
        setState('done')
      })
      .catch(() => setState('error'))
  }, [])

  useEffect(() => { load() }, [load])

  // Zolang er nog een AI-beoordeling loopt, elke 8 seconden verversen.
  useEffect(() => {
    const draait = items.some((i) => i.ai_status === 'bezig' || i.ai_status === 'wachtend')
    if (!draait) return
    const timer = setInterval(load, 8000)
    return () => clearInterval(timer)
  }, [items, load])

  const zichtbaar = filter === 'alle' ? items : items.filter((i) => (i.status || 'nieuw') === filter)

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBezig(id)
    try {
      const res = await fetch(`/api/crm/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      await load()
    } catch {
      melding.fout('Bijwerken mislukt, probeer opnieuw.')
    } finally {
      setBezig(null)
    }
  }

  const zetStatusVerder = (item: RuweLead) => {
    const volgende = volgendeStatus(item.status)
    if (!volgende) return
    patch(item.id, { status: volgende })
  }

  const toggleSter = (item: RuweLead) => {
    patch(item.id, { ruwe_prioriteit: item.ruwe_prioriteit === 'ster' ? 'normaal' : 'ster' })
  }

  const beoordeelMetAi = async (item: RuweLead) => {
    setBezig(item.id)
    try {
      const res = await fetch('/api/crm/leads/kwalificeer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      if (!res.ok) throw new Error()
      await load()
    } catch {
      melding.fout('Inplannen bij de AI mislukt.')
      setBezig(null)
    }
  }

  const promoveer = async (item: RuweLead) => {
    const akkoord = await melding.bevestig({
      titel: `${item.name} promoveren naar een echte lead?`,
      tekst: 'Komt op het Leads-bord te staan bij "Nieuwe kans". De ruwe gegevens gaan mee als notitie.',
      bevestigLabel: 'Promoveren',
    })
    if (!akkoord) return

    const notitieDelen = [
      item.ruwe_bron ? `Bron: ${item.ruwe_bron}` : null,
      item.ruwe_contact_email ? `Contact: ${item.ruwe_contact_email}` : null,
      item.ruwe_website ? `Website: ${item.ruwe_website}` : null,
      item.ruwe_fit_reden ? `Waarom relevant: ${item.ruwe_fit_reden}` : null,
    ].filter(Boolean)

    await patch(item.id, {
      entity_type: 'lead',
      status: 'nieuwe kans',
      ...(notitieDelen.length ? { notes: notitieDelen.join('\n') } : {}),
    })
    melding.gelukt(`${item.name} staat nu op het Leads-bord.`)
  }

  const wijs = async (item: RuweLead) => {
    const reden = redenPerRij[item.id]?.trim()
    const akkoord = await melding.bevestig({
      titel: `${item.name} afwijzen?`,
      tekst: 'Komt op de blocklist en verdwijnt uit deze lijst.',
      bevestigLabel: 'Afwijzen',
      gevaarlijk: true,
    })
    if (!akkoord) return
    await patch(item.id, { contact_status: 'blokkade', contact_status_reden: reden || 'Afgewezen als ruwe lead' })
  }

  const voegToe = async () => {
    if (!form.name.trim()) {
      melding.fout('Naam is verplicht.')
      return
    }
    setOpslaan(true)
    try {
      const res = await fetch('/api/crm/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'ruwe_lead',
          name: form.name.trim(),
          status: 'nieuw',
          ruwe_bron: form.ruwe_bron.trim() || undefined,
          ruwe_contact_email: form.ruwe_contact_email.trim() || undefined,
          ruwe_website: form.ruwe_website.trim() || undefined,
          ruwe_fit_reden: form.ruwe_fit_reden.trim() || undefined,
          description: form.ruwe_fit_reden.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      setForm(LEEG_FORM)
      setFormOpen(false)
      await load()
    } catch {
      melding.fout('Toevoegen mislukt, probeer opnieuw.')
    } finally {
      setOpslaan(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary flex items-center gap-2">
            <Inbox size={22} className="text-gray-700" /> Ruwe leads
          </h1>
          <p className="text-sm text-brand-text-secondary mt-0.5">
            {items.length} {items.length === 1 ? 'kandidaat' : 'kandidaten'} nog te beoordelen
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFormOpen((v) => !v)} className="btn-primary text-sm">
            {formOpen ? <X size={13} /> : <Plus size={13} />} {formOpen ? 'Sluiten' : 'Lead toevoegen'}
          </button>
          <button onClick={load} className="btn-secondary text-sm" disabled={state === 'loading'}>
            <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} /> Ververs
          </button>
        </div>
      </div>

      {formOpen && (
        <div className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Naam *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bedrijfsnaam" />
            </div>
            <div>
              <label className="label">Bron</label>
              <input className="input" value={form.ruwe_bron} onChange={(e) => setForm({ ...form, ruwe_bron: e.target.value })} placeholder="Waar kom je dit tegen" />
            </div>
            <div>
              <label className="label">Contact e-mail</label>
              <input className="input" value={form.ruwe_contact_email} onChange={(e) => setForm({ ...form, ruwe_contact_email: e.target.value })} placeholder="info@bedrijf.nl" />
            </div>
            <div>
              <label className="label">Website</label>
              <input className="input" value={form.ruwe_website} onChange={(e) => setForm({ ...form, ruwe_website: e.target.value })} placeholder="https://" />
            </div>
          </div>
          <div>
            <label className="label">Waarom relevant</label>
            <textarea className="input" rows={2} value={form.ruwe_fit_reden} onChange={(e) => setForm({ ...form, ruwe_fit_reden: e.target.value })} placeholder="Korte context, voedt ook de AI-kwalificatie" />
          </div>
          <div className="flex justify-end">
            <button onClick={voegToe} disabled={opslaan} className="btn-primary text-sm disabled:opacity-50">
              {opslaan ? 'Bezig...' : 'Toevoegen'}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('alle')}
          className={`pill border-brand border-brand-card-border ${filter === 'alle' ? 'bg-brand-lime' : 'bg-brand-card-bg'}`}
        >
          Alle ({items.length})
        </button>
        {STATUSSEN.map((s) => {
          const aantal = items.filter((i) => (i.status || 'nieuw') === s.status).length
          return (
            <button
              key={s.status}
              onClick={() => setFilter(s.status)}
              className={`pill border-brand border-brand-card-border ${filter === s.status ? 'bg-brand-lime' : 'bg-brand-card-bg'}`}
            >
              {s.label} ({aantal})
            </button>
          )
        })}
      </div>

      <div className="card p-0 overflow-hidden">
        {state === 'loading' && items.length === 0 ? (
          <div className="text-center py-16 text-brand-text-secondary text-sm">
            <RefreshCw size={16} className="animate-spin inline mr-2" /> Laden…
          </div>
        ) : state === 'error' ? (
          <div className="text-center py-16">
            <p className="text-sm text-red-500 mb-3">Ruwe leads laden mislukt.</p>
            <button onClick={load} className="btn-secondary text-sm">
              <RefreshCw size={13} /> Opnieuw proberen
            </button>
          </div>
        ) : zichtbaar.length === 0 ? (
          <div className="text-center py-16">
            <Inbox size={28} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-brand-text-secondary">Niets te beoordelen.</p>
          </div>
        ) : (
          <div className="divide-y divide-brand-card-border">
            {zichtbaar.map((item) => {
              const volgende = volgendeStatus(item.status)
              const isBezig = bezig === item.id
              return (
                <div key={item.id} className="flex items-start gap-3 px-5 py-3 hover:bg-brand-page-light transition-colors">
                  <button
                    onClick={() => toggleSter(item)}
                    disabled={isBezig}
                    title="Prioriteit"
                    className="mt-0.5 shrink-0"
                  >
                    <Star
                      size={16}
                      className={item.ruwe_prioriteit === 'ster' ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
                    />
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-brand-text-primary">{item.name}</span>
                      <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                        {STATUS_LABEL[item.status || 'nieuw'] || item.status}
                      </span>
                      <AiScoreBadge record={item} />
                      {item.ruwe_bron && (
                        <span className="text-xs text-brand-text-secondary opacity-70">via {item.ruwe_bron}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-wrap text-xs text-brand-text-secondary">
                      {item.ruwe_contact_email && (
                        <a href={`mailto:${item.ruwe_contact_email}`} className="flex items-center gap-1 hover:text-brand-lav-accent hover:underline">
                          <Mail size={11} /> {item.ruwe_contact_email}
                        </a>
                      )}
                      {item.ruwe_website && (
                        <a href={item.ruwe_website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-brand-lav-accent hover:underline">
                          <Globe size={11} /> {item.ruwe_website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>

                    {item.ruwe_fit_reden && (
                      <p className="text-xs text-brand-text-secondary leading-relaxed">{item.ruwe_fit_reden}</p>
                    )}
                    {item.ai_samenvatting && (
                      <p className="text-xs text-brand-text-secondary/80 leading-relaxed italic">{item.ai_samenvatting}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      <button
                        onClick={() => beoordeelMetAi(item)}
                        disabled={isBezig || item.ai_status === 'bezig' || item.ai_status === 'wachtend'}
                        className="btn-secondary text-xs !px-2.5 !py-1 disabled:opacity-50"
                      >
                        <Sparkles size={11} /> {item.ai_score != null ? 'Opnieuw' : 'Beoordeel'}
                      </button>
                      {volgende && (
                        <button
                          onClick={() => zetStatusVerder(item)}
                          disabled={isBezig}
                          className="btn-secondary text-xs !px-2.5 !py-1 disabled:opacity-50"
                        >
                          {STATUS_LABEL[volgende]}
                        </button>
                      )}
                      <button
                        onClick={() => promoveer(item)}
                        disabled={isBezig}
                        className="btn-primary text-xs !px-2.5 !py-1 disabled:opacity-50"
                      >
                        <Check size={11} /> Promoveren
                      </button>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <input
                        className="input !py-1 !text-xs w-40"
                        placeholder="Reden afwijzen (optioneel)"
                        value={redenPerRij[item.id] || ''}
                        onChange={(e) => setRedenPerRij({ ...redenPerRij, [item.id]: e.target.value })}
                      />
                      <button
                        onClick={() => wijs(item)}
                        disabled={isBezig}
                        title="Afwijzen"
                        className="text-xs !px-2.5 !py-1 rounded-brand-btn border-brand border-brand-card-border text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Ban size={11} /> Afwijzen
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
