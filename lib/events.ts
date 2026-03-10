// Lichtgewicht event-bus voor cross-page data synchronisatie
// Dispatcht CustomEvents op window zodat alle gemounte pagina's mee-luisteren

export type DataType = 'offertes' | 'facturen' | 'abonnementen'

const EVENT_NAME = 'daley-data-changed'

/** Dispatch een data-changed event — roep aan na elke succesvolle PATCH/POST/DELETE */
export function dataChanged(type: DataType) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { type } }))
}

/** Luister naar data-changed events. Retourneert cleanup functie voor useEffect. */
export function onDataChanged(callback: (type: DataType) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ type: DataType }>).detail
    callback(detail.type)
  }
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}
