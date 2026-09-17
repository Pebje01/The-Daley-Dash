/**
 * Laadscherm tussen dashboardpagina's. Zonder dit bleef de vorige pagina staan
 * tot de nieuwe klaar was, waardoor een trage pagina aanvoelde als een klik die
 * niet aankwam.
 */
export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="animate-pulse">
        <div className="h-7 w-56 bg-brand-page-medium rounded-brand-sm" />
        <div className="h-4 w-40 bg-brand-page-medium rounded-brand-sm mt-3 opacity-70" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-8">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-brand-page-medium rounded-brand-md opacity-60" />
          ))}
        </div>
        <div className="h-64 bg-brand-page-medium rounded-brand-md mt-6 opacity-40" />
      </div>
      <span className="sr-only">Bezig met laden</span>
    </div>
  )
}
