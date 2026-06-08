import { redirect } from 'next/navigation'

export default function AangifteRedirectPage() {
  const huidigJaar = new Date().getFullYear()
  const laatstAfgeslotenJaar = huidigJaar - 1
  redirect(`/belasting/aangifte/${laatstAfgeslotenJaar}`)
}
