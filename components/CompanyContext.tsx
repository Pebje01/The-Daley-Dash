'use client'
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { CompanyId } from '@/lib/types'

/** Waar de data op gefilterd wordt. 'alle' is de overkoepelende weergave. */
export type BedrijfScope = CompanyId | 'alle'

interface CompanyContextValue {
  activeCompany: CompanyId
  setActiveCompany: (id: CompanyId) => void
  /**
   * The Daley Edit is het moederbedrijf: daar zie je alles bij elkaar, dus ook
   * We Grow Brands en Daley Photography. Die twee hebben hun eigen, gescheiden
   * administratie en tonen alleen hun eigen data.
   */
  scope: BedrijfScope
  /**
   * False zolang de opgeslagen keuze nog uit localStorage moet komen. Pagina's
   * wachten daarop met laden, anders haal je eerst alles op en meteen daarna
   * nog eens het gekozen bedrijf.
   */
  scopeGeladen: boolean
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

const STORAGE_KEY = 'activeCompany'
const DEFAULT_COMPANY: CompanyId = 'tde'
const GELDIGE_IDS: CompanyId[] = ['tde', 'wgb', 'daleyphotography']

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [activeCompany, setActiveCompanyState] = useState<CompanyId>(DEFAULT_COMPANY)
  const [scopeGeladen, setScopeGeladen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && GELDIGE_IDS.includes(stored as CompanyId)) {
      setActiveCompanyState(stored as CompanyId)
    }
    setScopeGeladen(true)
  }, [])

  const setActiveCompany = (id: CompanyId) => {
    setActiveCompanyState(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  const scope: BedrijfScope = activeCompany === 'tde' ? 'alle' : activeCompany

  return (
    <CompanyContext.Provider value={{ activeCompany, setActiveCompany, scope, scopeGeladen }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useActiveCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useActiveCompany moet binnen CompanyProvider gebruikt worden')
  return ctx
}
