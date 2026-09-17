'use client'

import { useEffect, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { IS_TEST } from '@/lib/dashModus'
import { wisselVersieUrl } from '@/lib/dashModusClient'

/** Elke minuut een teken van leven, zolang het tabblad in beeld is. */
const INTERVAL = 60_000

/**
 * Houdt de testversie in de lucht zolang je er echt naar kijkt.
 *
 * Staat het tabblad op de achtergrond, dan slaan we de klop over. De stempel
 * veroudert dan vanzelf en scripts/test-wachtdienst.sh sluit de boel na 15
 * minuten af. Dat is met opzet: een vergeten tabblad hoort geen 2,6 GB bezet te
 * houden. Komt de klop niet aan, dan is de server al weg en zeggen we dat, in
 * plaats van de gebruiker op een pagina te laten zitten die niets meer doet.
 */
export default function TestHartslag() {
  const [gestopt, setGestopt] = useState(false)

  useEffect(() => {
    if (!IS_TEST) return
    let actief = true

    async function klop() {
      if (document.visibilityState !== 'visible') return
      try {
        await fetch('/api/test/heartbeat', { method: 'POST', cache: 'no-store' })
      } catch {
        // Geen verbinding betekent hier: de testserver bestaat niet meer.
        if (actief) setGestopt(true)
      }
    }

    klop()
    const timer = setInterval(klop, INTERVAL)
    document.addEventListener('visibilitychange', klop)
    return () => {
      actief = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', klop)
    }
  }, [])

  if (!IS_TEST || !gestopt) return null

  return (
    <div className="fixed inset-0 z-[100] bg-brand-text-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card max-w-sm text-center">
        <FlaskConical size={22} className="text-brand-status-orange mx-auto" />
        <h2 className="font-uxum text-h2 text-brand-text-primary mt-3">Testversie is afgesloten</h2>
        <p className="text-body text-brand-text-secondary mt-2">
          Hij stond een kwartier ongebruikt en is daarom vanzelf gestopt. Dat scheelt geheugen.
          Je kunt hem zo weer aanzetten.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <button className="btn-primary flex-1" onClick={() => { window.location.href = wisselVersieUrl(false, 'testAan') }}>
            Weer aanzetten
          </button>
          <button className="btn-secondary flex-1" onClick={() => { window.location.href = wisselVersieUrl(false) }}>
            Naar de echte Dash
          </button>
        </div>
      </div>
    </div>
  )
}
