'use client'

import { useEffect, useRef } from 'react'
import { X, Building2, Mail, Phone, MapPin, Hash, CreditCard } from 'lucide-react'
import { COMPANIES } from '@/lib/companies'
import { useTheme } from '@/components/ThemeProvider'
import { Sun, Moon, Monitor } from 'lucide-react'

const themeOptions = [
  { value: 'light' as const, icon: Sun, label: 'Licht' },
  { value: 'dark' as const, icon: Moon, label: 'Donker' },
  { value: 'system' as const, icon: Monitor, label: 'Systeem' },
]

export default function SettingsModal({ open, onClose, userEmail }: {
  open: boolean
  onClose: () => void
  userEmail?: string
}) {
  const { theme, setTheme } = useTheme()
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-brand-card-bg border-brand border-brand-card-border rounded-brand w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-card-border/20">
          <h2 className="font-uxum text-lg text-brand-text-primary">Instellingen</h2>
          <button onClick={onClose} className="text-brand-text-secondary hover:text-brand-text-primary transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Account */}
          {userEmail && (
            <div>
              <p className="text-[10px] font-semibold text-brand-text-secondary/50 uppercase tracking-widest mb-3">Account</p>
              <div className="flex items-center gap-3 p-3 rounded-brand-sm bg-brand-page-light">
                <div className="w-8 h-8 rounded-full bg-brand-lavender-dark flex items-center justify-center text-xs text-brand-text-primary font-semibold">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-body font-medium text-brand-text-primary">{userEmail}</p>
                  <p className="text-caption text-brand-text-secondary">Ingelogd</p>
                </div>
              </div>
            </div>
          )}

          {/* Thema */}
          <div>
            <p className="text-[10px] font-semibold text-brand-text-secondary/50 uppercase tracking-widest mb-3">Thema</p>
            <div className="flex gap-1 bg-brand-page-light rounded-brand-sm p-1">
              {themeOptions.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-brand-sm text-caption transition-colors ${
                    theme === value
                      ? 'bg-brand-card-bg text-brand-text-primary font-medium shadow-sm'
                      : 'text-brand-text-secondary hover:text-brand-text-primary'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Bedrijven */}
          <div>
            <p className="text-[10px] font-semibold text-brand-text-secondary/50 uppercase tracking-widest mb-3">Bedrijven</p>
            <div className="space-y-2">
              {COMPANIES.map(c => (
                <details key={c.id} className="group rounded-brand-sm border border-brand-card-border/20 overflow-hidden">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-brand-page-light transition-colors list-none">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-body font-medium text-brand-text-primary flex-1">{c.name}</span>
                    <span className="text-caption text-brand-text-secondary">{c.shortName}</span>
                  </summary>
                  <div className="px-4 pb-4 pt-1 border-t border-brand-card-border/10 space-y-2 text-caption">
                    <div className="flex items-center gap-2 text-brand-text-secondary">
                      <Mail size={12} /> {c.email}
                    </div>
                    <div className="flex items-center gap-2 text-brand-text-secondary">
                      <Phone size={12} /> {c.phone}
                    </div>
                    <div className="flex items-center gap-2 text-brand-text-secondary">
                      <MapPin size={12} /> {c.address}
                    </div>
                    <div className="flex items-center gap-2 text-brand-text-secondary">
                      <Hash size={12} /> KVK: {c.kvk} &middot; BTW: {c.btw}
                    </div>
                    <div className="flex items-center gap-2 text-brand-text-secondary">
                      <CreditCard size={12} /> {c.iban}
                    </div>
                    <div className="flex items-center gap-2 text-brand-text-secondary">
                      <Building2 size={12} /> Prefix: {c.prefix.offerte} / {c.prefix.factuur}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>

          {/* Integraties */}
          <div>
            <p className="text-[10px] font-semibold text-brand-text-secondary/50 uppercase tracking-widest mb-3">Integraties</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-brand-sm bg-brand-page-light">
                <p className="text-body font-medium text-brand-text-primary">Supabase</p>
                <p className="text-caption text-brand-status-green">Verbonden</p>
              </div>
              <div className="p-3 rounded-brand-sm bg-brand-page-light">
                <p className="text-body font-medium text-brand-text-primary">ClickUp</p>
                <p className="text-caption text-brand-text-secondary">CRM Sync actief</p>
              </div>
              <div className="p-3 rounded-brand-sm bg-brand-page-light">
                <p className="text-body font-medium text-brand-text-primary">Mollie</p>
                <p className="text-caption text-brand-text-secondary">Nog niet gekoppeld</p>
              </div>
              <div className="p-3 rounded-brand-sm bg-brand-page-light">
                <p className="text-body font-medium text-brand-text-primary">Vercel</p>
                <p className="text-caption text-brand-status-green">Gedeployd</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
