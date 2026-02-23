'use client'

import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const options = [
    { value: 'light' as const, icon: Sun, label: 'Licht' },
    { value: 'dark' as const, icon: Moon, label: 'Donker' },
    { value: 'system' as const, icon: Monitor, label: 'Systeem' },
  ]

  return (
    <div className="flex gap-0.5 bg-sidebar-active/20 rounded-brand-sm p-0.5 mx-3">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-brand-sm text-pill transition-colors ${
            theme === value
              ? 'bg-sidebar-active/80 text-brand-text-primary font-medium'
              : 'text-brand-text-secondary hover:text-brand-text-primary'
          }`}
          title={label}
        >
          <Icon size={12} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
