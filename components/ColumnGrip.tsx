import { GripVertical } from 'lucide-react'

// Stippel-greepje (⠿) dat verschijnt bij hover over een kolomkop,
// zodat zichtbaar is dat de kolom verschuifbaar is. Gebruik op een
// element met de Tailwind-groep `group/col`.
export function ColumnGrip({ className = '' }: { className?: string }) {
  return (
    <GripVertical
      size={12}
      aria-hidden
      className={`shrink-0 -ml-1 text-brand-text-secondary/40 opacity-0 group-hover/col:opacity-100 transition-opacity duration-150 ${className}`}
    />
  )
}
