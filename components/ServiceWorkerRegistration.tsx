'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registratie niet gelukt, geen probleem, app werkt gewoon zonder
      })
    }
  }, [])

  return null
}
