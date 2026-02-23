// Service Worker voor The Daley Dash PWA
// Zorgt voor basis caching en maakt de app installeerbaar

const CACHE_NAME = 'daley-dash-v1'

// Bestanden die altijd gecacht moeten worden
const PRECACHE_URLS = [
  '/',
  '/offertes',
  '/facturen',
  '/klanten',
]

// Install: cache belangrijke pagina's
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS)
    })
  )
  // Direct activeren, niet wachten op oude tabs
  self.skipWaiting()
})

// Activate: verwijder oude caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  // Neem direct controle over alle open tabs
  self.clients.claim()
})

// Fetch: network-first strategie (altijd verse data, cache als fallback)
self.addEventListener('fetch', (event) => {
  // Alleen GET requests cachen
  if (event.request.method !== 'GET') return

  // Geen externe requests cachen
  if (!event.request.url.startsWith(self.location.origin)) return

  // API calls niet cachen (Supabase, etc.)
  if (event.request.url.includes('/api/') || event.request.url.includes('supabase')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Sla een kopie op in de cache
        const responseClone = response.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone)
        })
        return response
      })
      .catch(() => {
        // Netwerk faalt: probeer uit cache
        return caches.match(event.request)
      })
  )
})
