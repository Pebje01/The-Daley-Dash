import { Plus, Repeat2 } from 'lucide-react'

function euro(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function AbonnementenPage() {
  const activeSubscriptions = 0
  const monthlyTotal = 0

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-uxum text-headline text-brand-text-primary">Abonnementen</h1>
          <p className="text-body text-brand-text-secondary mt-1">
            Fase 1: structuur voor lopende abonnementen, bedragen en voorwaarden.
          </p>
        </div>
        <button className="btn-secondary">
          <Plus size={14} /> Abonnement toevoegen
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Lopende abonnementen</p>
          <p className="font-uxum text-stat text-brand-text-primary">{activeSubscriptions}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Terugkerend per maand</p>
          <p className="font-uxum text-stat text-brand-text-primary">{euro(monthlyTotal)}</p>
        </div>
        <div className="card">
          <p className="text-caption text-brand-text-secondary mb-2">Status</p>
          <p className="font-semibold text-body">Structuur klaar, inhoud volgt</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Repeat2 size={15} />
          <h2 className="font-semibold text-body">Abonnementenlijst</h2>
        </div>
        <div className="rounded-brand border-brand border-brand-card-border bg-brand-page-light p-5">
          <p className="text-body text-brand-text-primary mb-2">Nog geen abonnementen toegevoegd</p>
          <p className="text-caption text-brand-text-secondary">
            Hier komen straks per abonnement o.a. klant, bedrag, interval, status, volgende factuurdatum en voorwaarden te staan.
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-body mb-4">Velden die alvast klaarstaan (fase 1)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            'Klant',
            'Status (actief / gepauzeerd / gestopt)',
            'Bedrag per maand',
            'Type (maand / kwartaal / jaar)',
            'Volgende factuurdatum',
            'Startdatum',
            'Voorwaarden (later invullen)',
            'Opmerkingen / contractdetails',
          ].map((field) => (
            <div key={field} className="rounded-brand border-brand border-brand-card-border bg-brand-card-bg p-3">
              <p className="text-body text-brand-text-primary">{field}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
