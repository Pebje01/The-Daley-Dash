'use client'

/**
 * Foutscherm voor het hele dashboard.
 *
 * Hiervoor bestond er geen enkele error boundary: één fout in een component gaf
 * de kale Next-foutpagina, en in productie een leeg scherm zonder uitleg. Nu zie
 * je wat er mis is, kun je het opnieuw proberen, en blijft de sidebar staan.
 */
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard-fout:', error)
  }, [error])

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="card max-w-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-brand-status-orange mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-uxum text-headline text-brand-text-primary">Er ging iets mis</h1>
            <p className="text-body text-brand-text-secondary mt-1">
              Deze pagina kon niet geladen worden. Je gegevens in Supabase zijn hier niet door geraakt.
            </p>

            {error.message && (
              <p className="text-caption text-brand-text-secondary mt-4 font-mono break-words bg-brand-page-light rounded-brand-sm p-3">
                {error.message}
                {error.digest && <span className="block mt-1 opacity-70">Referentie: {error.digest}</span>}
              </p>
            )}

            <div className="flex gap-2 mt-5">
              <button onClick={reset} className="btn-primary">
                <RefreshCw size={15} /> Opnieuw proberen
              </button>
              <Link href="/" className="btn-secondary">
                <Home size={15} /> Naar het dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
