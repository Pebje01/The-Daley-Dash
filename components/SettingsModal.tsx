'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Building2, Mail, Phone, MapPin, Hash, CreditCard } from 'lucide-react'
import { COMPANIES } from '@/lib/companies'
import { useTheme, Palette } from '@/components/ThemeProvider'
import { Sun, Moon, Monitor, FlaskConical, RotateCcw, Loader2 } from 'lucide-react'
import { IS_TEST } from '@/lib/dashModus'
import { wachtTotTestversieDraait, wisselVersieUrl, zetTestversieAan } from '@/lib/dashModusClient'
import { useMelding } from '@/components/MeldingProvider'

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
  const { theme, setTheme, palette, setPalette } = useTheme()
  const overlayRef = useRef<HTMLDivElement>(null)
  const melding = useMelding()
  const [bezigMetVullen, setBezigMetVullen] = useState(false)
  const [bezigMetTest, setBezigMetTest] = useState(false)

  /**
   * Het schuifje zet de testversie echt aan en uit, hij springt niet alleen
   * naar de andere poort. Uitzetten kan alleen vanuit de live Dash: de
   * testversie kan niet de server zijn die zichzelf afsluit, want dan komt er
   * nooit een antwoord terug. Daarom eerst overschakelen met testUit=1, en
   * doet TestmodusOvergang daar de rest.
   */
  async function wisselTestmodus() {
    if (IS_TEST) {
      window.location.href = wisselVersieUrl(false, 'testUit')
      return
    }
    setBezigMetTest(true)
    try {
      await zetTestversieAan()
      await wachtTotTestversieDraait()
      window.location.href = wisselVersieUrl(true)
    } catch (e) {
      setBezigMetTest(false)
      melding.fout(e instanceof Error ? e.message : 'Testversie starten mislukt')
    }
  }

  async function vulTestdataOpnieuw() {
    const ok = await melding.bevestig({
      titel: 'Testdata opnieuw vullen?',
      tekst: 'Alles wat je in de testversie hebt aangemaakt of veranderd verdwijnt, en de nepdata komt terug zoals hij begon. Je echte Dash blijft onaangeroerd.',
      bevestigLabel: 'Opnieuw vullen',
    })
    if (!ok) return
    setBezigMetVullen(true)
    const res = await fetch('/api/test/reset', { method: 'POST' }).catch(() => null)
    const data = await res?.json().catch(() => ({}))
    setBezigMetVullen(false)
    if (!res?.ok) {
      melding.fout(data?.error || 'Vullen mislukt')
      return
    }
    // Volledig herladen: elke pagina heeft nog de oude data in zijn state
    window.location.reload()
  }

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  if (!open) return null

  // Via een portal naar body: de sidebar maakt een eigen stapelcontext
  // (backdrop/transform), waardoor `fixed inset-0` anders binnen de sidebar
  // van 220px bleef hangen in plaats van over het hele scherm.
  return createPortal(
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

          {/* Testversie: een losse Dash op poort 3004 met nepdata, zie lib/dashModus.ts */}
          <div>
            <p className="text-[10px] font-semibold text-brand-text-secondary/50 uppercase tracking-widest mb-3">Testmodus</p>
            <div className={`p-3 rounded-brand-sm ${IS_TEST ? 'bg-brand-status-orange/10' : 'bg-brand-page-light'}`}>
              <div className="flex items-center gap-3">
                <FlaskConical size={16} className={IS_TEST ? 'text-brand-status-orange' : 'text-brand-text-secondary'} />
                <div className="flex-1 min-w-0">
                  <p className="text-body font-medium text-brand-text-primary">Testversie met nepdata</p>
                  <p className="text-caption text-brand-text-secondary">
                    {bezigMetTest
                      ? 'Testdatabase en tweede server komen op gang, even geduld.'
                      : IS_TEST
                        ? 'Staat aan. Alles wat je hier doet komt niet in je echte administratie. Na een kwartier zonder gebruik gaat hij vanzelf uit.'
                        : 'Om iets te laten zien of uit te proberen zonder je echte administratie te raken.'}
                  </p>
                </div>
                {bezigMetTest ? (
                  <Loader2 size={18} className="animate-spin text-brand-status-orange shrink-0" />
                ) : (
                  <button
                    role="switch"
                    aria-checked={IS_TEST}
                    aria-label="Testmodus"
                    onClick={wisselTestmodus}
                    className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${IS_TEST ? 'bg-brand-status-orange' : 'bg-brand-card-border/40'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${IS_TEST ? 'left-5' : 'left-1'}`} />
                  </button>
                )}
              </div>
              {IS_TEST && (
                <button
                  onClick={vulTestdataOpnieuw}
                  disabled={bezigMetVullen}
                  className="btn-secondary mt-3 text-caption disabled:opacity-50"
                >
                  <RotateCcw size={13} className={bezigMetVullen ? 'animate-spin' : ''} />
                  {bezigMetVullen ? 'Bezig met vullen...' : 'Testdata opnieuw vullen'}
                </button>
              )}
            </div>
          </div>

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

          {/* Kleurenpalet */}
          <div>
            <p className="text-[10px] font-semibold text-brand-text-secondary/50 uppercase tracking-widest mb-3">Kleurenpalet</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'lila' as Palette, label: 'Lila', desc: 'Zacht & editorial', colors: ['#DDD6EC', '#ECE7F4', '#CDE873', '#EAD6DB'] },
                { value: 'sage' as Palette, label: 'Sage', desc: 'Strak & neutraal', colors: ['#242826', '#E0E2DC', '#EEFA93', '#DEE2DC'] },
              ]).map(p => (
                <button
                  key={p.value}
                  onClick={() => setPalette(p.value)}
                  className={`p-3 rounded-brand-sm border-2 text-left transition-all ${
                    palette === p.value
                      ? 'border-brand-card-border shadow-sm'
                      : 'border-transparent hover:border-brand-card-border/20'
                  }`}
                >
                  <div className="flex gap-1 mb-2">
                    {p.colors.map((c, i) => (
                      <span key={i} className="w-5 h-5 rounded-full border border-black/10" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <p className="text-body font-medium text-brand-text-primary">{p.label}</p>
                  <p className="text-caption text-brand-text-secondary">{p.desc}</p>
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
    </div>,
    document.body
  )
}
