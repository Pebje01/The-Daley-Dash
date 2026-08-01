import Link from 'next/link'
import { Compass, Home } from 'lucide-react'

/**
 * 404 in de huisstijl. Zonder dit kreeg je de standaard Next-pagina, die niets
 * met de rest van de Dash te maken heeft.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-b from-brand-page-light to-brand-page-medium">
      <div className="card max-w-lg text-center">
        <Compass size={22} className="text-brand-lav-accent mx-auto" />
        <h1 className="font-uxum text-headline text-brand-text-primary mt-3">Deze pagina bestaat niet</h1>
        <p className="text-body text-brand-text-secondary mt-1">
          Misschien is de link verouderd, of is het document intussen verplaatst.
        </p>
        <Link href="/" className="btn-primary mt-5 inline-flex">
          <Home size={15} /> Terug naar het dashboard
        </Link>
      </div>
    </div>
  )
}
