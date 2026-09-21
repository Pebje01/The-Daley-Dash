'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useMelding } from '@/components/MeldingProvider'
import { VELD_INPUT } from '@/lib/crm/stijl'
import { Profiel, profielVan, schoonProfiel, initialen, volledigeNaam } from '@/lib/profiel'

/**
 * Het profiel achter het bolletje onderin de sidebar: je persoonlijke
 * gegevens, los van de bedrijfsgegevens in Instellingen. Opslaan gaat naar de
 * user_metadata van de login, zie lib/profiel.ts.
 */
export default function ProfielModal({ open, onClose, user, onOpgeslagen }: {
  open: boolean
  onClose: () => void
  user: User | null
  onOpgeslagen: (user: User) => void
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const melding = useMelding()
  const [p, setP] = useState<Profiel>({})
  const [bezig, setBezig] = useState(false)

  // Bij elke keer openen opnieuw vullen, zodat Annuleren echt niets bewaart
  useEffect(() => {
    if (open) setP(profielVan(user))
  }, [open, user])

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  if (!open || !user) return null

  const zet = (k: keyof Profiel) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setP(prev => ({ ...prev, [k]: e.target.value }))

  async function opslaan() {
    setBezig(true)
    const { data, error } = await createClient().auth.updateUser({ data: { profiel: schoonProfiel(p) } })
    setBezig(false)
    if (error || !data.user) {
      melding.fout(error?.message ?? 'Opslaan mislukt')
      return
    }
    onOpgeslagen(data.user)
    melding.gelukt('Profiel opgeslagen')
    onClose()
  }

  const naam = volledigeNaam(p)

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-brand-card-bg border-brand border-brand-card-border rounded-t-brand sm:rounded-brand w-full max-w-xl max-h-[90dvh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-card-border/20">
          <h2 className="font-uxum text-lg text-brand-text-primary">Profiel</h2>
          <button onClick={onClose} className="text-brand-text-secondary hover:text-brand-text-primary transition-colors" aria-label="Sluiten">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-brand-lavender-dark flex items-center justify-center text-lg text-brand-text-primary font-semibold shrink-0">
              {initialen(p, user.email)}
            </div>
            <div className="min-w-0">
              <p className="text-body font-medium text-brand-text-primary truncate">{naam || 'Nog geen naam'}</p>
              <p className="text-caption text-brand-text-secondary truncate">{user.email}</p>
            </div>
          </div>

          <Sectie titel="Over jou">
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Voornaam"><input className={VELD_INPUT} value={p.voornaam ?? ''} onChange={zet('voornaam')} autoComplete="given-name" /></Veld>
              <Veld label="Achternaam"><input className={VELD_INPUT} value={p.achternaam ?? ''} onChange={zet('achternaam')} autoComplete="family-name" /></Veld>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Veld label="Hoe mag de assistent je noemen?"><input className={VELD_INPUT} value={p.roepnaam ?? ''} onChange={zet('roepnaam')} placeholder={p.voornaam || 'Daley'} /></Veld>
              <Veld label="Wat je doet"><input className={VELD_INPUT} value={p.functie ?? ''} onChange={zet('functie')} placeholder="Brand designer en fotograaf" /></Veld>
            </div>
          </Sectie>

          <Sectie titel="Contact">
            <Veld label="E-mailadres (login)">
              <input className={`${VELD_INPUT} opacity-60 cursor-not-allowed`} value={user.email ?? ''} disabled />
            </Veld>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Veld label="Telefoon"><input className={VELD_INPUT} value={p.telefoon ?? ''} onChange={zet('telefoon')} type="tel" autoComplete="tel" /></Veld>
              <Veld label="Geboortedatum"><input className={VELD_INPUT} value={p.geboortedatum ?? ''} onChange={zet('geboortedatum')} type="date" /></Veld>
            </div>
          </Sectie>

          <Sectie titel="Adres">
            <Veld label="Straat en huisnummer"><input className={VELD_INPUT} value={p.straat ?? ''} onChange={zet('straat')} autoComplete="street-address" /></Veld>
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Postcode"><input className={VELD_INPUT} value={p.postcode ?? ''} onChange={zet('postcode')} autoComplete="postal-code" /></Veld>
              <Veld label="Plaats"><input className={VELD_INPUT} value={p.plaats ?? ''} onChange={zet('plaats')} autoComplete="address-level2" /></Veld>
            </div>
            <Veld label="Land"><input className={VELD_INPUT} value={p.land ?? ''} onChange={zet('land')} placeholder="Nederland" autoComplete="country-name" /></Veld>
          </Sectie>

          <Sectie titel="Online">
            <Veld label="Website"><input className={VELD_INPUT} value={p.website ?? ''} onChange={zet('website')} placeholder="thedaleyedit.nl" /></Veld>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Veld label="LinkedIn"><input className={VELD_INPUT} value={p.linkedin ?? ''} onChange={zet('linkedin')} /></Veld>
              <Veld label="Instagram"><input className={VELD_INPUT} value={p.instagram ?? ''} onChange={zet('instagram')} placeholder="@" /></Veld>
            </div>
          </Sectie>

          <Sectie titel="Voor de assistent">
            <Veld label="Waar moet de assistent rekening mee houden?">
              <textarea
                className={`${VELD_INPUT} min-h-[88px] resize-y`}
                value={p.voorkeuren ?? ''}
                onChange={zet('voorkeuren')}
                placeholder="Bijvoorbeeld: antwoord kort, en vraag altijd even na voordat je een factuur op een andere datum zet."
              />
            </Veld>
            <p className="text-caption text-brand-text-secondary">Je roepnaam en dit veld gaan mee met elk bericht aan de assistent rechtsonder.</p>
          </Sectie>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-brand-card-border/20">
          <button onClick={onClose} className="btn-secondary">Annuleren</button>
          <button onClick={opslaan} disabled={bezig} className="btn-primary disabled:opacity-50">
            {bezig && <Loader2 size={14} className="animate-spin" />}
            Opslaan
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold text-brand-text-secondary/50 uppercase tracking-widest">{titel}</p>
      {children}
    </div>
  )
}

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-caption text-brand-text-secondary mb-1">{label}</span>
      {children}
    </label>
  )
}
