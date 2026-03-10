'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type DrawerType = 'offerte-detail' | 'factuur-detail' | 'offerte-nieuw' | 'factuur-nieuw' | null

export interface DrawerState {
  type: DrawerType
  id?: string
}

interface DrawerContextValue {
  drawerState: DrawerState
  openDrawer: (state: DrawerState) => void
  closeDrawer: () => void
  isOpen: boolean
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [drawerState, setDrawerState] = useState<DrawerState>({ type: null })

  const openDrawer = useCallback((state: DrawerState) => {
    setDrawerState(state)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerState({ type: null })
  }, [])

  return (
    <DrawerContext.Provider
      value={{
        drawerState,
        openDrawer,
        closeDrawer,
        isOpen: drawerState.type !== null,
      }}
    >
      {children}
    </DrawerContext.Provider>
  )
}

export function useDrawer() {
  const ctx = useContext(DrawerContext)
  if (!ctx) throw new Error('useDrawer moet binnen DrawerProvider gebruikt worden')
  return ctx
}
