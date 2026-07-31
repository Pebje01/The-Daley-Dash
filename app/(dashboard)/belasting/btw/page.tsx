import { redirect } from 'next/navigation'

// Stuur door naar het laatst afgesloten kwartaal (dat is meestal het kwartaal
// waarvoor de aangifte openstaat).
export default function BtwIndexPage() {
  const now = new Date()
  let jaar = now.getFullYear()
  let kw = Math.floor(now.getMonth() / 3) + 1 - 1
  if (kw === 0) { kw = 4; jaar -= 1 }
  redirect(`/belasting/btw/${jaar}-Q${kw}`)
}
