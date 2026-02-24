import { OfferteStatus, FactuurStatus } from '@/lib/types'

const offerteColors: Record<OfferteStatus, string> = {
  concept:      'bg-brand-page-medium text-brand-text-secondary',
  opgeslagen:   'bg-brand-lavender-accent text-brand-lav-accent',
  verstuurd:    'bg-brand-light-blue text-brand-blue-accent',
  akkoord:      'bg-brand-lime text-brand-lime-accent',
  afgewezen:    'bg-brand-pink text-brand-pink-accent',
  verlopen:     'bg-brand-pink text-brand-status-orange',
}

const factuurColors: Record<FactuurStatus, string> = {
  concept:     'bg-brand-page-medium text-brand-text-secondary',
  verzonden:   'bg-brand-light-blue text-brand-blue-accent',
  betaald:     'bg-brand-lime text-brand-lime-accent',
  'te-laat':   'bg-brand-pink text-brand-pink-accent',
  geannuleerd: 'bg-brand-page-medium text-brand-text-secondary',
}

const labels: Record<string, string> = {
  concept:      'Concept',
  opgeslagen:   'Opgeslagen',
  verstuurd:    'Verstuurd',
  akkoord:      'Akkoord',
  afgewezen:    'Afgewezen',
  verlopen:     'Verlopen',
  betaald:      'Betaald',
  'te-laat':    'Te laat',
  geannuleerd:  'Geannuleerd',
}

export function OfferteStatusBadge({ status }: { status: OfferteStatus }) {
  return (
    <span className={`pill ${offerteColors[status]}`}>
      {labels[status]}
    </span>
  )
}

export function FactuurStatusBadge({ status }: { status: FactuurStatus }) {
  return (
    <span className={`pill ${factuurColors[status]}`}>
      {labels[status]}
    </span>
  )
}
