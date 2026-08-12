/*
 * Minimal service worker for the installable PWA.
 *
 * Scope: WEB ONLY. It is never registered inside the Capacitor native shell
 * (main.tsx guards registration behind `!Capacitor.isNativePlatform()`), so it
 * cannot interfere with native push or the native webview.
 *
 * Strategy: a small app-shell cache for offline resilience of the shell, and a
 * network-first pass-through for navigations (so parents always get fresh
 * content when online but still see the shell offline). API requests are never
 * cached — they must always hit the network and honour auth.
 *
 * NOTE: this is the foundation for future Web Push (installed PWA, iOS 16.4+).
 * A `push` handler can be added here later; it is intentionally omitted now so
 * the primary push channel remains native (APNs/FCM via Capacitor).
 */
const CACHE = 'vhps-connect-shell-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Never cache API/auth traffic.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return

  // Navigations: network-first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    )
    return
  }

  // Static assets: cache-first with a background refresh.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
        }
        return res
      }).catch(() => cached)
      return cached || network
    }),
  )
})
