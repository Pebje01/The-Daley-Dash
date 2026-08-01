'use client'

/**
 * Laatste vangnet: fouten in de root layout komen hier terecht. Deze pagina
 * rendert zijn eigen html en body, want de layout waar de rest in hangt is op
 * dat moment juist het probleem. Daarom ook geen huisstijlklassen, die komen uit
 * een stylesheet die dan misschien niet geladen is.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="nl">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', color: '#1e1b3a' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>De Dash kon niet starten</h1>
        <p style={{ marginTop: '0.75rem', color: '#565377' }}>
          Er ging iets mis bij het laden van de applicatie zelf. Je gegevens in Supabase zijn hier niet door geraakt.
        </p>
        {error.message && (
          <pre style={{
            marginTop: '1.5rem', padding: '1rem', background: '#f4f2fb',
            borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: '0.85rem',
          }}>
            {error.message}
          </pre>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: '1.5rem', padding: '0.6rem 1.1rem', borderRadius: 8,
            border: 'none', background: '#6c5ce7', color: 'white', cursor: 'pointer',
          }}
        >
          Opnieuw proberen
        </button>
      </body>
    </html>
  )
}
