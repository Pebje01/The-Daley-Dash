import { redirect } from 'next/navigation'

// Stuur door naar het huidige kwartaal, zodat de pagina altijd het lopende
// kwartaal toont (live BTW-opzij-te-zetten-bedrag). Oudere kwartalen (bijv.
// om een aangifte te controleren of in te dienen) blijf je bereiken via de
// kwartaal-selector op de aangiftepagina zelf.
export default function BtwIndexPage() {
  const now = new Date()
  const jaar = now.getFullYear()
  const kw = Math.floor(now.getMonth() / 3) + 1
  redirect(`/belasting/btw/${jaar}-Q${kw}`)
}
