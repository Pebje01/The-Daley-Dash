'use client'

/** Pulse-skeleton die getoond wordt terwijl drawer content laadt */
export default function DrawerSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Titel + status balk */}
      <div className="flex items-center gap-4">
        <div className="h-7 w-48 bg-brand-card-border/10 rounded-brand-sm" />
        <div className="h-6 w-20 bg-brand-card-border/10 rounded-full" />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-16 bg-brand-card-border/10 rounded" />
            <div className="h-5 w-32 bg-brand-card-border/10 rounded" />
          </div>
        ))}
      </div>

      {/* Tabel skeleton */}
      <div className="space-y-3">
        <div className="h-4 w-24 bg-brand-card-border/10 rounded" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-full bg-brand-card-border/10 rounded" />
            <div className="h-4 w-20 bg-brand-card-border/10 rounded" />
            <div className="h-4 w-20 bg-brand-card-border/10 rounded" />
          </div>
        ))}
      </div>

      {/* Totalen */}
      <div className="flex justify-end">
        <div className="space-y-2 w-48">
          <div className="h-4 w-full bg-brand-card-border/10 rounded" />
          <div className="h-4 w-full bg-brand-card-border/10 rounded" />
          <div className="h-5 w-full bg-brand-card-border/10 rounded" />
        </div>
      </div>
    </div>
  )
}
