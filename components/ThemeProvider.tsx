'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void // eslint-disable-line no-unused-vars
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

const STORAGE_KEY = 'daley_dash_theme'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  // Lees opgeslagen voorkeur bij mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeState(stored)
    }
  }, [])

  // Pas theme class toe op <html> wanneer theme verandert
  useEffect(() => {
    const root = document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    function apply() {
      const isDark =
        theme === 'dark' || (theme === 'system' && mediaQuery.matches)

      if (isDark) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
      setResolvedTheme(isDark ? 'dark' : 'light')

      // Update theme-color meta tag
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) {
        meta.setAttribute('content', isDark ? '#16122B' : '#7F719D')
      }
    }

    apply()

    // Luister naar systeemvoorkeur wijzigingen
    mediaQuery.addEventListener('change', apply)
    return () => mediaQuery.removeEventListener('change', apply)
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem(STORAGE_KEY, t)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
