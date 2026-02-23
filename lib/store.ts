'use client'
import { Factuur, CompanyId } from './types'

const FACTUREN_KEY = 'daley_admin_facturen'

// ── Facturen ────────────────────────────────────────────────────────────────

export function getFacturen(): Factuur[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(FACTUREN_KEY) ?? '[]')
  } catch { return [] }
}

export function saveFactuur(factuur: Factuur): void {
  const all = getFacturen()
  const idx = all.findIndex(f => f.id === factuur.id)
  if (idx >= 0) all[idx] = factuur
  else all.unshift(factuur)
  localStorage.setItem(FACTUREN_KEY, JSON.stringify(all))
}

export function deleteFactuur(id: string): void {
  const all = getFacturen().filter(f => f.id !== id)
  localStorage.setItem(FACTUREN_KEY, JSON.stringify(all))
}

// ── Auto-numbering ───────────────────────────────────────────────────────────

function datePrefix(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

export function nextFactuurNumber(companyId: CompanyId, prefix: string): string {
  const today = datePrefix()
  const all = getFacturen().filter(f => f.companyId === companyId)
  const todayNumbers = all
    .map(f => f.number)
    .filter(n => n.includes(today))
    .map(n => {
      const m = n.match(/-(\d{2})$/)
      return m ? parseInt(m[1]) : 0
    })
  const next = todayNumbers.length > 0 ? Math.max(...todayNumbers) + 1 : 1
  return `${prefix}-${today}-${String(next).padStart(2, '0')}`
}

// ── Stats (facturen only — offerte stats come from Supabase API) ─────────

export function getDashboardStats() {
  const facturen = getFacturen()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  return {
    openFacturen: facturen.filter(f => f.status === 'verzonden' || f.status === 'te-laat').length,
    totalOpenAmount: facturen
      .filter(f => f.status === 'verzonden' || f.status === 'te-laat')
      .reduce((sum, f) => sum + f.total, 0),
    totalPaidThisMonth: facturen
      .filter(f => f.status === 'betaald' && f.paidAt && f.paidAt >= monthStart)
      .reduce((sum, f) => sum + f.total, 0),
    recentFacturen: facturen.slice(0, 5),
  }
}
