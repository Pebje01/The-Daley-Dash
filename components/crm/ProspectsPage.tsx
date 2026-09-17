'use client'

/**
 * Prospects: bedrijven die je nog wil benaderen, los van het Leads-bord.
 *
 * Bewust een lijst, geen pipeline. Een lead op het bord is een gesprek dat
 * loopt en krijgt een opvolgdatum; een prospect is een naam op je lijst en
 * hoort daar dus vóór, niet als eerste kolom in. Anders zou een groslijst van
 * vijftig bedrijven meteen vijftig opvolgacties opleveren.
 *
 * Hier komen zowel kandidaten uit onderzoek binnen als bedrijven die je zelf
 * hebt uitgekozen. Je hebt drie keuzes: goedkeuren zet entity_type om naar
 * `lead` (komt dan op het bord bij "Nieuwe kans"), afwijzen gebruikt de
 * bestaande contactstatus-blokkade, dezelfde die ook leads en bedrijven
 * blokkeert, en later parkeert hem hier zonder oordeel. Alles daarna hoort op
 * het leadbord thuis, niet hier.
 *
 * De vier tabs bovenaan zijn de vier uitkomsten van diezelfde triage, zodat je
 * een beslissing kunt terugzien en terugdraaien zonder de pagina te verlaten:
 * te beoordelen, later, goedgekeurd (die staan nu op het leadbord) en
 * afgewezen (die staan op de blocklist).
 *
 * In de database heet dit entity_type nog `ruwe_lead` en heten de kolommen
 * `ruwe_*`. Dat is bewust niet meegehernoemd: puur interne namen, en een
 * migratie levert niets zichtbaars op.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Inbox, RefreshCw, Star, Mail, Globe, Check, Ban, Sparkles, Plus, X, Phone, User, Search,
  ChevronDown, Clock, Undo2, ArrowRight,
} from 'lucide-react'
import { useMelding } from '@/components/MeldingProvider'
import { AiScoreBadge } from '@/components/crm/AiKwalificatie'
import { useActiveCompany } from '@/components/CompanyContext'
import { COMPANIES } from '@/lib/companies'
import { faseDef } from '@/lib/crm/pipeline'
import Link from 'next/link'

interface Prospect {
  id: string
  name: string
  /** Voor welk eigen bedrijf deze prospect is. Leeg = nog niet toegewezen. */
  company_id?: string | null
  status?: string | null
  contact_status?: string | null
  ruwe_contact_email?: string | null
  ruwe_website?: string | null
  ruwe_bron?: string | null
  ruwe_fit_reden?: string | null
  ruwe_prioriteit?: 'ster' | 'normaal' | 'laag' | null
  ruwe_contactpersoon?: string | null
  ruwe_telefoon?: string | null
  ruwe_contact_status?: string | null
  ruwe_contact_toelichting?: string | null
  ruwe_contact_fout?: string | null
  contact_status_reden?: string | null
  ai_status?: string | null
  ai_score?: number | null
  ai_prioriteit?: string | null
  ai_branche?: string | null
  ai_website?: string | null
  ai_samenvatting?: string | null
  ai_volgende_stap?: string | null
}

// Hier stond een statusrij (Nog beoordelen, Te benaderen, Gemaild, Gereageerd)
// met een knop om een prospect een stap verder te zetten. Die is eruit: een
// prospect is een oordeel, geen traject. Je keurt hem goed, en dan gaat hij als
// lead het bord op waar de opvolging thuishoort, of je wijst hem af.
//
// De kolom `status` draagt daarvan nog één ding: `later`. Dat is geen fase maar
// een parkeerplek voor twijfelgevallen, zodat de lijst "te beoordelen" leeg te
// werken valt. Bewust deze bestaande kolom en geen nieuwe: het is één waarde,
// en een migratie zou hier niets extra's opleveren.
const LATER = 'later'

type Tab = 'beoordelen' | 'later' | 'goedgekeurd' | 'afgewezen'

/**
 * Een lead die uit deze lijst is voortgekomen draagt zijn prospect-velden mee:
 * die blijven staan als entity_type omklapt. Alleen hier worden ze gevuld, dus
 * dit is de manier om terug te zien wat je hebt goedgekeurd.
 */
function kwamUitProspects(item: Prospect): boolean {
  return Boolean(
    item.ruwe_bron || item.ruwe_fit_reden || item.ruwe_contactpersoon ||
    item.ruwe_telefoon || item.ruwe_contact_status
  )
}

interface NieuwFormState {
  name: string
  ruwe_bron: string
  ruwe_contact_email: string
  ruwe_website: string
  ruwe_fit_reden: string
  company_id: string
}

const LEEG_FORM: NieuwFormState = {
  name: '', ruwe_bron: '', ruwe_contact_email: '', ruwe_website: '', ruwe_fit_reden: '',
  company_id: 'tde',
}

/** Een prospect zonder mailadres of nummer kun je niet benaderen: daar valt nog wat te halen. */
function isOnvolledig(item: Prospect): boolean {
  return !item.ruwe_contact_email || !item.ruwe_telefoon
}

function zoektNog(item: Prospect): boolean {
  return item.ruwe_contact_status === 'bezig' || item.ruwe_contact_status === 'wachtend'
}

export default function ProspectsPage() {
  const { scope, scopeGeladen } = useActiveCompany()
  const melding = useMelding()
  const [items, setItems] = useState<Prospect[]>([])
  const [goedgekeurd, setGoedgekeurd] = useState<Prospect[]>([])
  const [tab, setTab] = useState<Tab>('beoordelen')
  const [state, setState] = useState<'loading' | 'error' | 'done'>('loading')
  const [bezig, setBezig] = useState<string | null>(null)
  const [redenPerRij, setRedenPerRij] = useState<Record<string, string>>({})
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<NieuwFormState>(LEEG_FORM)
  // Binnen WGB of Daley Photography hoort een nieuwe prospect vanzelf bij dat
  // bedrijf; onder The Daley Edit kies je het zelf, met TDE als standaard.
  const standaardBedrijf = scope === 'alle' ? 'tde' : scope
  useEffect(() => {
    setForm((f) => ({ ...f, company_id: standaardBedrijf }))
  }, [standaardBedrijf])
  const [opslaan, setOpslaan] = useState(false)
  const [contactBezig, setContactBezig] = useState(false)
  // Welke rijen hun onderbouwing open hebben staan. Dichtgeklapt is elke rij
  // even hoog, en dat is wat de lijst leesbaar houdt.
  const [open, setOpen] = useState<Set<string>>(new Set())

  const klapUit = (id: string) =>
    setOpen((vorige) => {
      const volgende = new Set(vorige)
      if (volgende.has(id)) volgende.delete(id)
      else volgende.add(id)
      return volgende
    })

  /**
   * Twee vragen in één keer: de prospects zelf, en de leads die hier ooit uit
   * zijn goedgekeurd. Die tweede lijst hoort bij de tabs, en door hem meteen op
   * te halen kloppen de tellers op alle tabs vanaf het eerste beeld.
   */
  const load = useCallback((stil = false) => {
    if (!scopeGeladen) return
    // Stil verversen laat de lijst staan. Het laadscherm vervangt alles en
    // schiet je daarmee terug naar boven, precies waar je net aan het werk was.
    if (!stil) setState('loading')
    const bedrijf = scope === 'alle' ? '' : `&company=${scope}`
    const haal = (entity: string) =>
      fetch(`/api/crm/records?entity=${entity}&limit=500${bedrijf}`, { cache: 'no-store' })
        .then((r) => { if (!r.ok) throw new Error(); return r.json() })
        .then((d): Prospect[] => (Array.isArray(d.items) ? d.items : []))

    Promise.all([haal('ruwe_lead'), haal('lead')])
      .then(([prospects, leads]) => {
        setItems(prospects)
        setGoedgekeurd(leads.filter((i) => kwamUitProspects(i) && i.contact_status !== 'blokkade'))
        setState('done')
      })
      .catch(() => setState('error'))
  }, [scope, scopeGeladen])

  useEffect(() => { load() }, [load])

  // Zolang er nog een AI-beoordeling of een contactzoektocht loopt, elke 8
  // seconden verversen. Zo druppelen nummers en adressen vanzelf binnen.
  useEffect(() => {
    const draait = items.some(
      (i) =>
        i.contact_status !== 'blokkade' &&
        (i.ai_status === 'bezig' || i.ai_status === 'wachtend' || zoektNog(i))
    )
    if (!draait) return
    const timer = setInterval(load, 8000)
    return () => clearInterval(timer)
  }, [items, load])

  /**
   * Volgorde: sterren eerst, dan de hoogste AI-score. Zo staat bovenaan wat je
   * als eerste wil beoordelen, in plaats van wat toevallig het laatst is
   * bijgewerkt. Nog niet beoordeelde prospects zakken naar onderen, die kun je
   * toch nog niet wegen.
   */
  const sorteer = (lijst: Prospect[]) => {
    const rang = (i: Prospect) => (i.ruwe_prioriteit === 'ster' ? 0 : 1)
    return [...lijst].sort((a, b) => {
      if (rang(a) !== rang(b)) return rang(a) - rang(b)
      const sa = a.ai_score ?? -1
      const sb = b.ai_score ?? -1
      if (sa !== sb) return sb - sa
      return a.name.localeCompare(b.name)
    })
  }

  // De vier bakjes komen uit dezelfde opgehaalde lijst, zodat een oordeel
  // meteen op de goede tab landt zonder extra ronde langs de server.
  const teBeoordelen = useMemo(
    () => sorteer(items.filter((i) => i.contact_status !== 'blokkade' && i.status !== LATER)),
    [items]
  )
  const laterLijst = useMemo(
    () => sorteer(items.filter((i) => i.contact_status !== 'blokkade' && i.status === LATER)),
    [items]
  )
  const afgewezen = useMemo(
    () => items.filter((i) => i.contact_status === 'blokkade'),
    [items]
  )

  const onvolledig = teBeoordelen.filter(isOnvolledig).length

  const TABS: Array<{ id: Tab; label: string; aantal: number }> = [
    { id: 'beoordelen', label: 'Te beoordelen', aantal: teBeoordelen.length },
    { id: 'later', label: 'Later opvolgen', aantal: laterLijst.length },
    { id: 'goedgekeurd', label: 'Goedgekeurd', aantal: goedgekeurd.length },
    { id: 'afgewezen', label: 'Afgewezen', aantal: afgewezen.length },
  ]

  const zichtbaar = tab === 'beoordelen' ? teBeoordelen
    : tab === 'later' ? laterLijst
    : tab === 'goedgekeurd' ? goedgekeurd
    : afgewezen

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBezig(id)
    try {
      const res = await fetch(`/api/crm/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      await load(true)
    } catch {
      melding.fout('Bijwerken mislukt, probeer opnieuw.')
    } finally {
      setBezig(null)
    }
  }

  const toggleSter = (item: Prospect) => {
    patch(item.id, { ruwe_prioriteit: item.ruwe_prioriteit === 'ster' ? 'normaal' : 'ster' })
  }

  const beoordeelMetAi = async (item: Prospect) => {
    setBezig(item.id)
    try {
      const res = await fetch('/api/crm/leads/kwalificeer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      if (!res.ok) throw new Error()
      await load(true)
    } catch {
      melding.fout('Inplannen bij de AI mislukt.')
      setBezig(null)
    }
  }

  /** Voor alles wat nog geen mailadres of nummer heeft. Losse knoppen per rij
   * stonden hier ook, maar die maakten van een oordeelslijst een knoppenkast. */
  const zoekContactAllemaal = async () => {
    setContactBezig(true)
    try {
      const res = await fetch('/api/crm/leads/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alleOnvolledige: true, limiet: 10 }),
      })
      const uitslag = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(uitslag?.error)
      melding.gelukt(
        uitslag.ingepland
          ? `${uitslag.ingepland} ${uitslag.ingepland === 1 ? 'prospect' : 'prospects'} in de rij gezet. De gegevens komen er vanzelf bij te staan.`
          : 'Alles heeft al een mailadres en een nummer.'
      )
      await load(true)
    } catch {
      melding.fout('Contactgegevens opzoeken kon niet worden gestart.')
    } finally {
      setContactBezig(false)
    }
  }

  const promoveer = async (item: Prospect) => {
    const akkoord = await melding.bevestig({
      titel: `${item.name} goedkeuren?`,
      tekst: 'Komt als lead op het bord te staan bij "Nieuwe kans", inclusief opvolgdatum. De gegevens gaan mee als notitie.',
      bevestigLabel: 'Goedkeuren',
    })
    if (!akkoord) return

    const notitieDelen = [
      item.ruwe_bron ? `Bron: ${item.ruwe_bron}` : null,
      item.ruwe_contactpersoon ? `Contactpersoon: ${item.ruwe_contactpersoon}` : null,
      item.ruwe_contact_email ? `E-mail: ${item.ruwe_contact_email}` : null,
      item.ruwe_telefoon ? `Telefoon: ${item.ruwe_telefoon}` : null,
      item.ruwe_website || item.ai_website ? `Website: ${item.ruwe_website || item.ai_website}` : null,
      item.ruwe_fit_reden ? `Waarom relevant: ${item.ruwe_fit_reden}` : null,
    ].filter(Boolean)

    await patch(item.id, {
      entity_type: 'lead',
      status: 'nieuwe kans',
      ...(notitieDelen.length ? { notes: notitieDelen.join('\n') } : {}),
    })
    melding.gelukt(`${item.name} staat nu op het Leads-bord.`)
  }

  /**
   * Parkeren. Geen bevestiging: het is een lichte, omkeerbare zet, en juist die
   * moet snel gaan als je een lijst aan het leegwerken bent.
   */
  const zetLater = (item: Prospect) => patch(item.id, { status: LATER })

  const terugNaarBeoordelen = (item: Prospect) => patch(item.id, { status: 'nieuw' })

  const deblokkeer = async (item: Prospect) => {
    const akkoord = await melding.bevestig({
      titel: `${item.name} terughalen?`,
      tekst: 'De blokkade gaat eraf en hij komt weer bij "Te beoordelen" te staan.',
      bevestigLabel: 'Terughalen',
    })
    if (!akkoord) return
    await patch(item.id, { contact_status: 'open', contact_status_reden: null, status: 'nieuw' })
  }

  const wijs = async (item: Prospect) => {
    const reden = redenPerRij[item.id]?.trim()
    const akkoord = await melding.bevestig({
      titel: `${item.name} afwijzen?`,
      tekst: 'Komt op de blocklist en verdwijnt uit deze lijst.',
      bevestigLabel: 'Afwijzen',
      gevaarlijk: true,
    })
    if (!akkoord) return
    await patch(item.id, { contact_status: 'blokkade', contact_status_reden: reden || 'Afgewezen als prospect' })
  }

  /**
   * Toevoegen, met de dubbelcheck ertussen. Staat het bedrijf er al, dan mag
   * je alsnog doorzetten; staat het op de blocklist, dan niet. Die beslissing
   * heb je eerder bewust genomen.
   */
  const voegToe = async (negeerDubbel = false) => {
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
          company_id: form.company_id || null,
          ...(negeerDubbel ? { negeerDubbel: true } : {}),
        }),
      })
      const uitslag = await res.json().catch(() => ({}))

      if (res.status === 409) {
        if (uitslag?.botsing?.soort === 'blokkade') {
          melding.fout(uitslag.error)
          return
        }
        const toch = await melding.bevestig({
          titel: 'Dit bedrijf staat er al',
          tekst: `${uitslag.error} Toch toevoegen als nieuwe prospect?`,
          bevestigLabel: 'Toch toevoegen',
        })
        if (toch) await voegToe(true)
        return
      }

      if (!res.ok) throw new Error(uitslag?.error)
      setForm(LEEG_FORM)
      setFormOpen(false)
      await load(true)
    } catch {
      melding.fout('Toevoegen mislukt, probeer opnieuw.')
    } finally {
      setOpslaan(false)
    }
  }

  /**
   * Goedgekeurd: dit zijn geen prospects meer maar leads. Daarom geen knoppen
   * die hier iets veranderen, alleen zien waar hij nu staat en de weg erheen.
   */
  const goedgekeurdRij = (item: Prospect) => {
    const fase = faseDef(item.status)
    return (
      <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-page-light transition-colors">
        <Check size={14} className="text-emerald-600 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-brand-text-primary">{item.name}</span>
            {fase && (
              <span
                className="pill text-[11px]"
                style={{ backgroundColor: `${fase.kleur}1a`, color: fase.kleur }}
              >
                {fase.label}
              </span>
            )}
            <AiScoreBadge record={item} />
            {item.ai_branche && (
              <span className="text-xs text-brand-text-secondary">{item.ai_branche}</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs text-brand-text-secondary">
            {item.ruwe_contact_email && (
              <a href={`mailto:${item.ruwe_contact_email}`} className="flex items-center gap-1 hover:text-brand-lav-accent hover:underline">
                <Mail size={11} /> {item.ruwe_contact_email}
              </a>
            )}
            {item.ruwe_bron && <span className="opacity-70">via {item.ruwe_bron}</span>}
          </div>
        </div>
        <Link
          href="/crm/leads"
          className="text-xs text-brand-lav-accent hover:underline flex items-center gap-1 shrink-0"
        >
          Op het bord <ArrowRight size={12} />
        </Link>
      </div>
    )
  }

  /** Afgewezen: de reden erbij, en één knop om die beslissing terug te draaien. */
  const afgewezenRij = (item: Prospect) => (
    <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-page-light transition-colors">
      <Ban size={14} className="text-red-500 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <span className="text-sm font-medium text-brand-text-primary">{item.name}</span>
        <p className="text-xs text-brand-text-secondary">
          {item.contact_status_reden || 'Afgewezen als prospect'}
        </p>
      </div>
      <button
        onClick={() => deblokkeer(item)}
        disabled={bezig === item.id}
        title="Blokkade eraf, komt terug bij Te beoordelen"
        className="text-xs px-2.5 py-1 rounded-brand-btn border-brand border-brand-card-border text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-50 flex items-center gap-1 shrink-0 transition-colors"
      >
        <Undo2 size={11} /> Terughalen
      </button>
    </div>
  )

  /** Een rij in "Te beoordelen" of "Later opvolgen": alles wat je nodig hebt om te kiezen. */
  const prospectRij = (item: Prospect) => {
    const isBezig = bezig === item.id
    const isOpen = open.has(item.id)
    return (
      <div key={item.id} className="flex items-start gap-3 px-5 py-3 hover:bg-brand-page-light transition-colors">
        <button
          onClick={() => toggleSter(item)}
          disabled={isBezig}
          title="Ster erbij: twijfelgeval of goede kandidaat. Blijft bovenaan staan tot je kiest."
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
            <select
              value={item.company_id || ''}
              onChange={(e) => patch(item.id, { company_id: e.target.value || null })}
              disabled={isBezig}
              title="Voor welk bedrijf"
              className="text-[11px] rounded-full border border-brand-card-border bg-white px-2 py-0.5 text-brand-text-secondary"
            >
              <option value="">Geen bedrijf</option>
              {COMPANIES.map((c) => (
                <option key={c.id} value={c.id}>{c.shortName}</option>
              ))}
            </select>
            <AiScoreBadge record={item} />
            {/* Alleen zichtbaar als er iets te herstellen valt. De
                beoordeling loopt normaal vanzelf bij het aanmaken. */}
            {(item.ai_status === 'mislukt' || (item.ai_score == null && item.ai_status !== 'bezig' && item.ai_status !== 'wachtend')) && (
              <button
                onClick={() => beoordeelMetAi(item)}
                disabled={isBezig}
                className="text-[11px] text-brand-lav-accent hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                <Sparkles size={10} /> beoordelen
              </button>
            )}
            {item.ruwe_bron && (
              <span className="text-xs text-brand-text-secondary opacity-70">via {item.ruwe_bron}</span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-brand-text-secondary">
            {item.ruwe_contactpersoon && (
              <span className="flex items-center gap-1">
                <User size={11} /> {item.ruwe_contactpersoon}
              </span>
            )}
            {item.ruwe_contact_email && (
              <a href={`mailto:${item.ruwe_contact_email}`} className="flex items-center gap-1 hover:text-brand-lav-accent hover:underline">
                <Mail size={11} /> {item.ruwe_contact_email}
              </a>
            )}
            {item.ruwe_telefoon && (
              <a href={`tel:${item.ruwe_telefoon.replace(/[^\d+]/g, '')}`} className="flex items-center gap-1 hover:text-brand-lav-accent hover:underline">
                <Phone size={11} /> {item.ruwe_telefoon}
              </a>
            )}
            {(item.ruwe_website || item.ai_website) && (
              <a href={item.ruwe_website || item.ai_website || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-brand-lav-accent hover:underline">
                <Globe size={11} /> {(item.ruwe_website || item.ai_website || '').replace(/^https?:\/\//, '')}
              </a>
            )}
            {zoektNog(item) ? (
              <span className="flex items-center gap-1 text-brand-text-secondary animate-pulse">
                <Search size={11} /> contactgegevens zoeken...
              </span>
            ) : (
              isOnvolledig(item) && (
                <span className="text-amber-700/80">
                  {item.ruwe_contact_status === 'mislukt'
                    ? 'zoeken mislukt'
                    : item.ruwe_contact_status === 'klaar'
                      ? 'niets gevonden'
                      : 'nog geen contactgegevens'}
                </span>
              )
            )}
          </div>

          {/* Dichtgeklapt één regel, zodat elke rij even hoog is en de
              lijst te scannen valt. Uitgeklapt het hele verhaal. */}
          {(item.ruwe_fit_reden || item.ai_samenvatting) && (
            <div className="text-xs text-brand-text-secondary/80 leading-relaxed space-y-1">
              {item.ruwe_fit_reden && (
                <p className={isOpen ? '' : 'line-clamp-1'}>{item.ruwe_fit_reden}</p>
              )}
              {item.ai_samenvatting && (isOpen || !item.ruwe_fit_reden) && (
                <p className={`italic ${isOpen ? '' : 'line-clamp-1'}`}>{item.ai_samenvatting}</p>
              )}
            </div>
          )}

          {isOpen && (
            <div className="pt-1">
              <input
                className="input !py-1 !text-xs w-full max-w-sm"
                placeholder="Reden afwijzen (optioneel)"
                value={redenPerRij[item.id] || ''}
                onChange={(e) => setRedenPerRij({ ...redenPerRij, [item.id]: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* Groen zet hem als lead op het bord, rood op de blocklist, en er
            tussenin de parkeerplek voor twijfel. De kleur doet het werk, zodat
            je een lange lijst op stand kunt afwerken zonder te lezen wat er op
            de knop staat. In de tab "Later opvolgen" wordt die middelste knop
            de weg terug. */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => promoveer(item)}
            disabled={isBezig}
            title="Goedkeuren, komt als lead op het bord"
            className="text-xs px-2.5 py-1 rounded-brand-btn bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1 transition-colors"
          >
            <Check size={11} /> Goedkeuren
          </button>
          {tab === 'later' ? (
            <button
              onClick={() => terugNaarBeoordelen(item)}
              disabled={isBezig}
              title="Terug naar de lijst om te beoordelen"
              className="text-xs px-2.5 py-1 rounded-brand-btn border-brand border-brand-card-border text-brand-text-secondary hover:text-brand-text-primary disabled:opacity-50 flex items-center gap-1 transition-colors"
            >
              <Undo2 size={11} /> Terug
            </button>
          ) : (
            <button
              onClick={() => zetLater(item)}
              disabled={isBezig}
              title="Parkeren: blijft staan, maar uit de lijst die je nu beoordeelt"
              className="text-xs px-2.5 py-1 rounded-brand-btn bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1 transition-colors"
            >
              <Clock size={11} /> Later
            </button>
          )}
          <button
            onClick={() => wijs(item)}
            disabled={isBezig}
            title="Afwijzen, komt op de blocklist"
            className="text-xs px-2.5 py-1 rounded-brand-btn bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1 transition-colors"
          >
            <Ban size={11} /> Afwijzen
          </button>
          <button
            onClick={() => klapUit(item.id)}
            title={isOpen ? 'Inklappen' : 'Onderbouwing en reden afwijzen'}
            aria-expanded={isOpen}
            className="p-1 rounded-brand-sm text-brand-text-secondary hover:bg-brand-page-light"
          >
            <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6 lg:h-[calc(100dvh-var(--dash-topbar))] lg:overflow-hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap shrink-0">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">Prospects</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            {teBeoordelen.length} {teBeoordelen.length === 1 ? 'prospect' : 'prospects'} te beoordelen
            {onvolledig > 0 && `, ${onvolledig} zonder mailadres of nummer`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={zoekContactAllemaal}
            disabled={contactBezig || onvolledig === 0}
            title="Zoekt website, contactpersoon, mailadres en telefoonnummer op bij prospects die die nog missen."
            className="btn-secondary text-sm disabled:opacity-50"
          >
            <Search size={13} className={contactBezig ? 'animate-pulse' : ''} />
            {contactBezig ? 'Bezig...' : 'Contactgegevens zoeken'}
          </button>
          <button onClick={() => setFormOpen((v) => !v)} className="btn-primary text-sm">
            {formOpen ? <X size={13} /> : <Plus size={13} />} {formOpen ? 'Sluiten' : 'Prospect toevoegen'}
          </button>
          <button onClick={() => load()} className="btn-secondary text-sm" disabled={state === 'loading'}>
            <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} /> Ververs
          </button>
        </div>
      </div>

      {/* De vier uitkomsten van de triage naast elkaar. Bewust tabs en geen vier
          pagina's: het is dezelfde lijst, alleen een ander bakje, en je wil een
          oordeel kunnen terugdraaien zonder weg te navigeren. */}
      <div className="flex flex-wrap gap-2 shrink-0 -mt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-brand-btn text-caption font-medium transition-colors border flex items-center gap-1.5 ${
              tab === t.id
                ? 'bg-brand-purple text-white border-brand-purple'
                : 'border-brand-card-border text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            {t.label}
            <span className={tab === t.id ? 'opacity-80' : 'opacity-60'}>{t.aantal}</span>
          </button>
        ))}
        {tab === 'afgewezen' && (
          <Link
            href="/crm/blocklist"
            className="px-3 py-1.5 text-caption text-brand-text-secondary hover:text-brand-lav-accent hover:underline flex items-center gap-1"
          >
            Hele blocklist <ArrowRight size={12} />
          </Link>
        )}
        {tab === 'goedgekeurd' && (
          <Link
            href="/crm/leads"
            className="px-3 py-1.5 text-caption text-brand-text-secondary hover:text-brand-lav-accent hover:underline flex items-center gap-1"
          >
            Naar het leadbord <ArrowRight size={12} />
          </Link>
        )}
      </div>

      {formOpen && (
        <div className="card space-y-3 shrink-0">
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
            <div>
              <label className="label">Voor welk bedrijf</label>
              <select className="input" value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">Geen bedrijf</option>
                {COMPANIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Waarom relevant</label>
            <textarea className="input" rows={2} value={form.ruwe_fit_reden} onChange={(e) => setForm({ ...form, ruwe_fit_reden: e.target.value })} placeholder="Korte context, voedt ook de AI-kwalificatie" />
          </div>
          <div className="flex justify-end">
            <button onClick={() => voegToe()} disabled={opslaan} className="btn-primary text-sm disabled:opacity-50">
              {opslaan ? 'Bezig...' : 'Toevoegen'}
            </button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden lg:flex-1 lg:min-h-0 lg:overflow-auto">
        {state === 'loading' && items.length === 0 ? (
          <div className="text-center py-16 text-brand-text-secondary text-sm">
            <RefreshCw size={16} className="animate-spin inline mr-2" /> Laden…
          </div>
        ) : state === 'error' ? (
          <div className="text-center py-16">
            <p className="text-sm text-red-500 mb-3">Prospects laden mislukt.</p>
            <button onClick={() => load()} className="btn-secondary text-sm">
              <RefreshCw size={13} /> Opnieuw proberen
            </button>
          </div>
        ) : zichtbaar.length === 0 ? (
          <div className="text-center py-16">
            <Inbox size={28} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-brand-text-secondary">
              {tab === 'beoordelen' ? 'Niets te beoordelen.'
                : tab === 'later' ? 'Niets geparkeerd. Twijfel je bij een prospect, zet hem op "Later".'
                : tab === 'goedgekeurd' ? 'Nog niets goedgekeurd.'
                : 'Nog niemand afgewezen.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-brand-card-border">
            {zichtbaar.map((item) =>
              tab === 'afgewezen' ? afgewezenRij(item)
                : tab === 'goedgekeurd' ? goedgekeurdRij(item)
                : prospectRij(item)
            )}
          </div>
        )}
      </div>
    </div>
  )
}
