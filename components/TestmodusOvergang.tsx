'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, FlaskConical, Loader2 } from 'lucide-react'
import { IS_TEST } from '@/lib/dashModus'
import { wachtTotTestversieDraait, wisselVersieUrl, zetTestversieAan, zetTestversieUit } from '@/lib/dashModusClient'

/**
 * Doet het aan- en uitzetten van de testversie in de live Dash.
 *
 * De testversie kan zichzelf niet afsluiten, want dan verdwijnt de server die
 * het antwoord moet sturen. Het schuifje daar stuurt je daarom eerst hierheen,
 * met testUit=1 in de adresbalk, en dit vangt dat op. Andersom werkt ook:
 * testAan=1 komt van de knop "Weer aanzetten" op een afgesloten testversie.
 */
export default function TestmodusOvergang() {
  const [stand, setStand] = useState<null | 'aan' | 'uit'>(null)
  const [fout, setFout] = useState<string | null>(null)
  const gedaan = useRef(false)

  useEffect(() => {
    if (IS_TEST || gedaan.current) return

    const params = new URLSearchParams(window.location.search)
    const uit = params.get('testUit') === '1'
    const aan = params.get('testAan') === '1'
    if (!uit && !aan) return
    gedaan.current = true

    // Meteen uit de adresbalk halen, anders gebeurt het nog eens bij herladen.
    params.delete('testUit')
    params.delete('testAan')
    const query = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''))

    void (async () => {
      try {
        if (uit) {
          setStand('uit')
          await zetTestversieUit()
          setStand(null)
        } else {
          setStand('aan')
          await zetTestversieAan()
          await wachtTotTestversieDraait()
          window.location.href = wisselVersieUrl(true)
        }
      } catch (e) {
        setFout(e instanceof Error ? e.message : 'Er ging iets mis')
        setStand(null)
      }
    })()
  }, [])

  if (fout) {
    return (
      <div className="fixed bottom-4 right-4 z-[100] card max-w-sm flex items-start gap-2">
        <AlertCircle size={16} className="text-brand-status-red shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-body text-brand-text-primary">{fout}</p>
          <button className="text-caption text-brand-text-secondary underline mt-1" onClick={() => setFout(null)}>
            Sluiten
          </button>
        </div>
      </div>
    )
  }

  if (stand === 'uit') {
    return (
      <div className="fixed bottom-4 right-4 z-[100] card flex items-center gap-2">
        <Loader2 size={15} className="animate-spin text-brand-text-secondary" />
        <p className="text-body text-brand-text-primary">Testversie wordt afgesloten...</p>
      </div>
    )
  }

  if (stand === 'aan') {
    return (
      <div className="fixed inset-0 z-[100] bg-brand-text-primary/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="card max-w-sm text-center">
          <FlaskConical size={22} className="text-brand-status-orange mx-auto" />
          <h2 className="font-uxum text-h2 text-brand-text-primary mt-3">Testversie starten</h2>
          <p className="text-body text-brand-text-secondary mt-2">
            De testdatabase en de tweede server komen op gang. Dat duurt een halve tot anderhalve minuut.
          </p>
          <Loader2 size={18} className="animate-spin text-brand-text-secondary mx-auto mt-4" />
        </div>
      </div>
    )
  }

  return null
}
