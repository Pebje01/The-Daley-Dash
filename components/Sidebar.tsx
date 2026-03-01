'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, FileText, Receipt, Users, Settings,
  CreditCard, Repeat2, RefreshCw, BadgeDollarSign, Building2, ContactRound, BriefcaseBusiness, ScrollText, List,
  ChevronRight, LogOut
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import SettingsModal from '@/components/SettingsModal'
import { useActiveCompany } from '@/components/CompanyContext'

const mainNav = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
]

const financialNav = [
  { label: 'Offertes', href: '/offertes', icon: FileText },
  { label: 'Facturen', href: '/facturen', icon: Receipt },
  { label: 'Betalingen', href: '/betalingen', icon: CreditCard },
  { label: 'Abonnementen', href: '/abonnementen', icon: Repeat2 },
  { label: 'Klanten', href: '/klanten', icon: Users },
]

const crmNav = [
  { label: "Daley Jansen's List", href: '/crm/daley-list', icon: List },
  { label: 'Leads', href: '/crm/leads', icon: BadgeDollarSign },
  { label: 'Bedrijven', href: '/crm/bedrijven', icon: Building2 },
  { label: 'Contacten', href: '/crm/contacten', icon: ContactRound },
  { label: 'Opdrachten', href: '/crm/opdrachten', icon: BriefcaseBusiness },
  { label: 'Facturatie', href: '/crm/facturen', icon: ScrollText },
  { label: 'CRM Sync', href: '/crm-sync', icon: RefreshCw },
]

const companies = [
  { id: 'tde',        name: 'The Daley Edit',  color: '#C8963E' },
  { id: 'wgb',        name: 'We Grow Brands',  color: '#03483A' },
  { id: 'daleyphotography', name: 'Daley Photography', color: '#111827' },
  { id: 'bleijenberg',name: 'Bleijenberg',     color: '#1D4ED8' },
  { id: 'montung',    name: 'Montung',         color: '#7C3AED' },
]

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const { activeCompany, setActiveCompany } = useActiveCompany()

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
    <aside className="w-sidebar-w h-screen bg-gradient-to-b from-brand-lavender-light to-brand-lavender flex flex-col fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="font-uxum text-sidebar-t text-sidebar-text">The Daley Dash</h1>
        <p className="text-pill text-sidebar-muted mt-0.5">
          Jouw werkportaal
        </p>
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
          {financialNav.map(({ label, href, icon: Icon }) => {
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

        {/* Companies — kiezer voor actief bedrijf */}
        <div className="pt-5">
          <p className="px-3 text-[10px] font-semibold text-sidebar-muted/50 uppercase tracking-widest mb-2">Actief bedrijf</p>
          {companies.map(c => {
            const isActive = activeCompany === c.id
            return (
              <button
                key={c.id}
                onClick={() => setActiveCompany(c.id as any)}
                className={`flex items-center gap-3 px-3 py-2 rounded-brand-sm text-body transition-colors w-full text-left ${
                  isActive
                    ? 'bg-sidebar-active/80 text-sidebar-text-active font-medium'
                    : 'text-sidebar-muted hover:bg-sidebar-hover/40'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isActive ? 'ring-2 ring-sidebar-text-active/30' : ''}`}
                  style={{ backgroundColor: c.color }}
                />
                <span className="truncate">{c.name}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-2 py-4 border-t border-sidebar-text/10 space-y-2">
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-3 px-3 py-2 rounded-brand-sm text-body text-sidebar-muted hover:bg-sidebar-hover/40 transition-colors w-full text-left"
        >
          <Settings size={15} />
          Instellingen
        </button>

        {user && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-6 h-6 rounded-full bg-brand-lavender-dark flex items-center justify-center text-[10px] text-sidebar-text font-semibold">
              {user.email?.charAt(0).toUpperCase()}
            </div>
            <span className="text-caption text-sidebar-muted truncate flex-1">
              {user.email}
            </span>
            <button
              onClick={handleLogout}
              className="text-sidebar-muted/50 hover:text-sidebar-text transition-colors"
              title="Uitloggen"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        userEmail={user?.email ?? undefined}
      />
    </aside>
  )
}
