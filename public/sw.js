// public/sw.js
// Service worker for Jabumarket
// — Caching (PWA offline support)
// — Web Push notifications

const params = new URLSearchParams(self.location.search)
const CACHE_NAME = 'jabumarket-' + (params.get('v') ?? 'dev')

// Only precache the offline fallback — it's static and safe to cache
const PRECACHE_URLS = ['/offline']

// Routes that must always go to the network (never cached)
const NETWORK_ONLY = [
  '/api/',
  '/auth/',
  '/me',
  '/me/',
  '/inbox',
  '/inbox/',
  '/my-orders',
  '/my-listings',
  '/saved',
  '/notifications',
  '/vendor/',
  '/vendor',
  '/rider/',
  '/study-admin/',
  '/admin/',
]

// ── Install: pre-cache static fallback ───────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Cache size helper ─────────────────────────────────────────────────────────
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length > maxItems) {
    await cache.delete(keys[0])
    await trimCache(cacheName, maxItems)
  }
}

// ── Fetch: network-first for pages, cache-first for static assets ─────────────
self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  const isNetworkOnly = NETWORK_ONLY.some(p =>
    url.pathname === p ||
    url.pathname.startsWith(p)
  ) || url.searchParams.has('_rsc')

  if (request.method !== 'GET' ||
      url.origin !== self.location.origin ||
      isNetworkOnly) return

  // Cache-first for static assets (_next/static)
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone)
            trimCache(CACHE_NAME, 60)
          })
          return res
        })
      })
    )
    return
  }

  // Network-first for pages — fall back to cache, then /offline
  e.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone)
          trimCache(CACHE_NAME, 60)
        })
        return res
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/offline'))
      )
  )
})

// ── Push event ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'New notification', body: '', data: {} }

  try {
    if (event.data) {
      const parsed = event.data.json()
      data = { ...data, ...parsed }
    }
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:     data.body,
      icon:     data.icon  ?? '/icon-192.png',
      badge:    data.badge ?? '/icon-192.png',
      tag:      data.tag   ?? `jabu-${Date.now()}`,
      renotify: true,
      vibrate:  [200, 100, 200],
      data:     data.data ?? {},
    })
  )
})

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.href ?? '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find(c => c.url.startsWith(self.location.origin))
        if (existing) {
          existing.focus()
          return existing.navigate(targetUrl)
        }
        return self.clients.openWindow(targetUrl)
      })
  )
})

// ── Message handler (SW updates) ─────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
