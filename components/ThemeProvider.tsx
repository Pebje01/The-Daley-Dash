'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'
export type Palette = 'lila' | 'sage'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  palette: Palette
  setTheme: (theme: Theme) => void // eslint-disable-line no-unused-vars
  setPalette: (palette: Palette) => void // eslint-disable-line no-unused-vars
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  resolvedTheme: 'light',
  palette: 'lila',
  setTheme: () => {},
  setPalette: () => {},
})

export const useTheme = () => useContext(ThemeContext)

const THEME_KEY = 'daley_dash_theme'
const PALETTE_KEY = 'daley_dash_palette'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const [palette, setPaletteState] = useState<Palette>('lila')

  // Lees opgeslagen voorkeuren bij mount
  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_KEY) as Theme | null
    if (storedTheme && ['light', 'dark', 'system'].includes(storedTheme)) {
      setThemeState(storedTheme)
    }
    const storedPalette = localStorage.getItem(PALETTE_KEY) as Palette | null
    if (storedPalette && ['lila', 'sage'].includes(storedPalette)) {
      setPaletteState(storedPalette)
    }
  }, [])

  // Pas theme class toe op <html>
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
    mediaQuery.addEventListener('change', apply)
    return () => mediaQuery.removeEventListener('change', apply)
  }, [theme])

  // Pas palette data-attribuut toe op <html>
  useEffect(() => {
    const root = document.documentElement
    if (palette === 'lila') {
      root.removeAttribute('data-palette')
    } else {
      root.setAttribute('data-palette', palette)
    }
  }, [palette])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem(THEME_KEY, t)
  }

  const setPalette = (p: Palette) => {
    setPaletteState(p)
    localStorage.setItem(PALETTE_KEY, p)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, palette, setTheme, setPalette }}>
      {children}
    </ThemeContext.Provider>
  )
}
