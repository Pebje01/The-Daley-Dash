'use client'
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { CompanyId } from '@/lib/types'

interface CompanyContextValue {
  activeCompany: CompanyId
  setActiveCompany: (id: CompanyId) => void
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

const STORAGE_KEY = 'activeCompany'
const DEFAULT_COMPANY: CompanyId = 'wgb'

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [activeCompany, setActiveCompanyState] = useState<CompanyId>(DEFAULT_COMPANY)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && ['tde', 'wgb', 'daleyphotography', 'bleijenberg', 'montung'].includes(stored)) {
      setActiveCompanyState(stored as CompanyId)
    }
  }, [])

  const setActiveCompany = (id: CompanyId) => {
    setActiveCompanyState(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  return (
    <CompanyContext.Provider value={{ activeCompany, setActiveCompany }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useActiveCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useActiveCompany moet binnen CompanyProvider gebruikt worden')
  return ctx
}
