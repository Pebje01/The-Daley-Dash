'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  TrendingUp,
  LayoutDashboard, FileText, Receipt, Settings,
  CreditCard, Repeat2, BadgeDollarSign, Building2, ContactRound, BriefcaseBusiness, ScrollText,
  LogOut, Landmark, CheckSquare, Clock, FileBarChart, Percent, Menu, X, Ban, Inbox,
  ChevronDown, ChevronsUpDown, Check, BookOpen, UserRound,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import SettingsModal from '@/components/SettingsModal'
import ProfielModal from '@/components/ProfielModal'
import { profielVan, weergaveNaam, initialen } from '@/lib/profiel'
import { useActiveCompany } from '@/components/CompanyContext'
import { COMPANIES, getCompany } from '@/lib/companies'

const mainNav = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
]

const financialNav = [
  // Omzet, verwachte omzet, betalingen en btw bij elkaar. Stond eerst op het dashboard.
  { label: 'Overzicht', href: '/financieel', icon: TrendingUp },
  { label: 'Offertes', href: '/offertes', icon: FileText },
  { label: 'Facturen', href: '/facturen', icon: Receipt },
  { label: 'Betalingen', href: '/betalingen', icon: CreditCard },
  { label: 'Abonnementen', href: '/abonnementen', icon: Repeat2 },
  // Klanten staat niet meer los: een klant is een bedrijf in het CRM, met zijn
  // uren- en factuurgegevens in de detailkaart (september 2026).
  // De aangifte loopt over alle drie de bedrijven samen (één KVK, één
  // BTW-nummer), dus die hoort thuis in de overkoepelende weergave. Binnen
  // WGB of Daley Photography valt er niets apart aan te geven.
  { label: 'Belasting', href: '/belasting', icon: Landmark, alleenTde: true },
  { label: 'BTW-aangifte', href: '/belasting/btw', icon: Percent, sub: true, alleenTde: true },
  { label: 'Aangifte inkomstenbelasting', href: '/belasting/aangifte', icon: FileBarChart, sub: true, alleenTde: true },
]

const crmNav = [
  { label: 'Prospects', href: '/crm/prospects', icon: Inbox },
  { label: 'Leads', href: '/crm/leads', icon: BadgeDollarSign },
  { label: 'Bedrijven', href: '/crm/bedrijven', icon: Building2 },
  { label: 'Contacten', href: '/crm/contacten', icon: ContactRound },
  { label: 'Opdrachten', href: '/crm/opdrachten', icon: BriefcaseBusiness },
  { label: 'Facturatie', href: '/crm/facturen', icon: ScrollText },
  { label: 'Blocklist', href: '/crm/blocklist', icon: Ban },
]

// The Daley Edit is de overkoepelende weergave: daar zie je alles bij elkaar.
// We Grow Brands en Daley Photography hebben hun eigen, gescheiden administratie.
const BEDRIJF_TOELICHTING: Record<string, string> = {
  tde: 'Alles bij elkaar',
  wgb: 'Eigen administratie',
  daleyphotography: 'Eigen administratie',
}

function BedrijfKiezer() {
  const { activeCompany, setActiveCompany } = useActiveCompany()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const huidig = getCompany(activeCompany)

  // Een klik naast de lijst sluit hem weer
  useEffect(() => {
    if (!open) return
    const sluit = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', sluit)
    return () => document.removeEventListener('mousedown', sluit)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-brand-sm bg-sidebar-active/70 hover:bg-sidebar-active transition-colors text-left"
      >
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: huidig.color }} />
        <span className="flex-1 min-w-0">
          <span className="block truncate text-body font-medium text-sidebar-text-active">{huidig.name}</span>
          <span className="block truncate text-[10px] text-sidebar-muted">{BEDRIJF_TOELICHTING[huidig.id]}</span>
        </span>
        <ChevronDown size={14} className={`flex-shrink-0 text-sidebar-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-brand-sm bg-sidebar-active border border-sidebar-text/10 shadow-lg p-1"
        >
          {COMPANIES.map(c => {
            const gekozen = c.id === activeCompany
            return (
              <button
                key={c.id}
                role="option"
                aria-selected={gekozen}
                onClick={() => { setActiveCompany(c.id); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-brand-sm text-left transition-colors ${
                  gekozen ? 'bg-brand-lavender/40' : 'hover:bg-brand-lavender/25'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-caption font-medium text-sidebar-text-active">{c.name}</span>
                  <span className="block truncate text-[10px] text-sidebar-muted">{BEDRIJF_TOELICHTING[c.id]}</span>
                </span>
                {gekozen && <Check size={13} className="flex-shrink-0 text-sidebar-text-active" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Het bolletje met je naam onderin de sidebar. Klik opent een menu naar
 * boven met je profiel, de instellingen en uitloggen.
 */
function ProfielMenu({ user, onProfiel, onInstellingen, onUitloggen }: {
  user: User
  onProfiel: () => void
  onInstellingen: () => void
  onUitloggen: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const profiel = profielVan(user)
  const naam = weergaveNaam(profiel, user.email)
  const heeftNaam = naam !== user.email

  useEffect(() => {
    if (!open) return
    const klik = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', klik)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', klik); document.removeEventListener('keydown', esc) }
  }, [open])

  const kies = (actie: () => void) => () => { setOpen(false); actie() }
  const item = 'flex items-center gap-2.5 w-full px-3 py-2 rounded-brand-sm text-body text-brand-text-primary hover:bg-brand-page-light transition-colors text-left'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-brand-sm text-left transition-colors ${open ? 'bg-sidebar-hover/40' : 'hover:bg-sidebar-hover/40'}`}
      >
        <span className="w-8 h-8 rounded-full bg-brand-lavender-dark flex items-center justify-center text-caption text-sidebar-text font-semibold shrink-0">
          {initialen(profiel, user.email)}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-body text-sidebar-text font-medium truncate">{naam}</span>
          {heeftNaam && <span className="block text-pill text-sidebar-muted truncate">{user.email}</span>}
        </span>
        <ChevronsUpDown size={14} className="text-sidebar-muted shrink-0" />
      </button>

      {open && (
        <div role="menu" className="absolute bottom-full left-0 right-0 mb-2 bg-brand-card-bg border border-brand-card-border/20 rounded-brand-sm shadow-xl p-1 z-50">
          <p className="px-3 pt-2 pb-2 text-caption text-brand-text-secondary truncate border-b border-brand-card-border/10 mb-1">{user.email}</p>
          <button role="menuitem" onClick={kies(onProfiel)} className={item}><UserRound size={15} /> Profiel</button>
          <button role="menuitem" onClick={kies(onInstellingen)} className={item}><Settings size={15} /> Instellingen</button>
          <div className="border-t border-brand-card-border/10 my-1" />
          <button role="menuitem" onClick={kies(onUitloggen)} className={item}><LogOut size={15} /> Uitloggen</button>
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { scope } = useActiveCompany()
  const path = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showProfiel, setShowProfiel] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Sluit het mobiele menu zodra je naar een andere pagina navigeert
  useEffect(() => { setMobileOpen(false) }, [path])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Hamburger knop, alleen op mobiel */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-2.5 left-3 z-30 md:hidden bg-brand-lavender text-sidebar-text rounded-brand-sm p-2 shadow-sm"
        aria-label="Menu openen"
      >
        <Menu size={20} />
      </button>

      {/* Donkere overlay achter het mobiele menu */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`w-sidebar-w h-screen bg-gradient-to-b from-brand-lavender-light to-brand-lavender flex flex-col fixed left-0 top-0 z-40 transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      {/* Logo */}
      <div className="px-5 pt-6 pb-3 flex items-start justify-between">
        <div>
          <h1 className="font-uxum text-sidebar-t text-sidebar-text">The Daley Dash</h1>
          <p className="text-pill text-sidebar-muted mt-0.5">
            Jouw werkportaal
          </p>
        </div>
        <button onClick={() => setMobileOpen(false)} className="md:hidden text-sidebar-text/70 hover:text-sidebar-text p-1 -mr-1" aria-label="Menu sluiten">
          <X size={20} />
        </button>
      </div>

      {/* Bedrijfskiezer: bepaalt welke data je in de hele Dash ziet */}
      <div className="px-3 pb-4">
        <BedrijfKiezer />
      </div>

      <hr className="border-sidebar-text/10 mx-4" />

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {mainNav.map(({ label, href, icon: Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-brand-sm text-body transition-colors ${
                active
                  ? 'bg-sidebar-active/80 text-sidebar-text-active font-medium'
                  : 'text-sidebar-muted hover:bg-sidebar-hover/40'
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          )
        })}

        <div className="pt-4">
          <p className="px-3 text-[10px] font-semibold text-sidebar-muted/50 uppercase tracking-widest mb-2">Financieel</p>
          {financialNav.filter(item => scope === 'alle' || !item.alleenTde).map(({ label, href, icon: Icon, sub }) => {
            const active = href === '/belasting' ? path === '/belasting' : path.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-brand-sm text-body transition-colors ${
                  sub ? 'px-3 pl-7 py-1.5 text-caption' : 'px-3 py-2'
                } ${
                  active
                    ? 'bg-sidebar-active/80 text-sidebar-text-active font-medium'
                    : 'text-sidebar-muted hover:bg-sidebar-hover/40'
                }`}
              >
                <Icon size={sub ? 13 : 15} />
                {label}
              </Link>
            )
          })}
        </div>

        <div className="pt-4">
          <p className="px-3 text-[10px] font-semibold text-sidebar-muted/50 uppercase tracking-widest mb-2">Planning</p>
          {[{ label: 'To-do list', href: '/taken', icon: CheckSquare }, { label: 'Urenregistratie', href: '/uren', icon: Clock }].map(({ label, href, icon: Icon }) => {
            const active = path.startsWith(href)
            return (
              <Link key={href} href={href} className={`flex items-center gap-3 px-3 py-2 rounded-brand-sm text-body transition-colors ${active ? 'bg-sidebar-active/80 text-sidebar-text-active font-medium' : 'text-sidebar-muted hover:bg-sidebar-hover/40'}`}>
                <Icon size={15} />
                {label}
              </Link>
            )
          })}
        </div>

        <div className="pt-4">
          <p className="px-3 text-[10px] font-semibold text-sidebar-muted/50 uppercase tracking-widest mb-2">CRM</p>
          {crmNav.map(({ label, href, icon: Icon }) => {
            const active = path.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-brand-sm text-body transition-colors ${
                  active
                    ? 'bg-sidebar-active/80 text-sidebar-text-active font-medium'
                    : 'text-sidebar-muted hover:bg-sidebar-hover/40'
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            )
          })}
        </div>

        <div className="pt-4">
          <p className="px-3 text-[10px] font-semibold text-sidebar-muted/50 uppercase tracking-widest mb-2">Intern</p>
          {[{ label: 'Werkbank', href: '/bedrijfsinfo', icon: BookOpen }].map(({ label, href, icon: Icon }) => {
            const active = path.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-brand-sm text-body transition-colors ${
                  active
                    ? 'bg-sidebar-active/80 text-sidebar-text-active font-medium'
                    : 'text-sidebar-muted hover:bg-sidebar-hover/40'
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            )
          })}
        </div>

      </nav>

      {/* Profiel: het bolletje onderin, net als bij Claude en ChatGPT */}
      <div className="px-2 py-3 border-t border-sidebar-text/10">
        {user && (
          <ProfielMenu
            user={user}
            onProfiel={() => setShowProfiel(true)}
            onInstellingen={() => setShowSettings(true)}
            onUitloggen={handleLogout}
          />
        )}
      </div>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        userEmail={user?.email ?? undefined}
      />
      <ProfielModal
        open={showProfiel}
        onClose={() => setShowProfiel(false)}
        user={user}
        onOpgeslagen={setUser}
      />
    </aside>
    </>
  )
}
