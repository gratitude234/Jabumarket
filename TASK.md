Read CLAUDE.md first. Then read every file listed before touching anything.
List ALL files you will modify or create before starting.

FILES TO READ BEFORE STARTING:
- public/sw.js
- public/manifest.json
- app/layout.tsx
- components/ServiceWorkerRegister.tsx
- app/api/vendor/push/route.ts
- lib/webPush.ts
- lib/supabase.ts (browser client — for client-side subscribe flow)
- next.config.ts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 1 — SERVICE WORKER (public/sw.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIX 1 — Dynamic cache name via injected build ID
The cache name must change on each deploy so old caches get evicted.

In next.config.ts, inject the build timestamp as an env variable:

  import type { NextConfig } from 'next'

  const nextConfig: NextConfig = {
    env: {
      NEXT_PUBLIC_BUILD_ID: Date.now().toString(),
    },
  }

  export default nextConfig

In public/sw.js, replace:
  const CACHE_NAME = 'jabumarket-v1';
With:
  const CACHE_NAME = 'jabumarket-' + (self.JABU_BUILD_ID || 'dev');

In app/layout.tsx, inject the build ID into the SW scope by adding
a <script> tag in <head> that sets window.JABU_BUILD_ID before the
SW registers. But since sw.js runs in a separate scope, pass it via
a query param instead:

In components/ServiceWorkerRegister.tsx, change the registration to:
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'
  navigator.serviceWorker.register(
    `/sw.js?v=${buildId}`
  )

In sw.js, read the cache version from the script URL:
  const params = new URLSearchParams(
    self.location.search
  )
  const CACHE_NAME = 'jabumarket-' + (params.get('v') ?? 'dev')

This ensures every new deploy creates a new cache key and the
activate handler evicts the old one.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 2 — Remove dangerous page precaching
In public/sw.js, remove ALL page URLs from PRECACHE_URLS.
App Router pages are dynamic server responses — precaching them
caches auth-specific HTML that goes stale immediately.

Change PRECACHE_URLS to only:
  const PRECACHE_URLS = ['/offline'];

Nothing else. The /offline page is a static fallback and safe
to precache.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 3 — Never cache authenticated/private pages
In public/sw.js, in the fetch handler, extend the network-only
list to include all private routes. Replace the existing
network-only condition with:

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

  const isNetworkOnly = NETWORK_ONLY.some(p =>
    url.pathname === p ||
    url.pathname.startsWith(p)
  ) || url.searchParams.has('_rsc')

  if (request.method !== 'GET' ||
      url.origin !== self.location.origin ||
      isNetworkOnly) return;

These routes are never cached — always network-only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 4 — Cache size limit (max 60 pages)
In public/sw.js, add a helper that trims the cache after
each new entry is added:

  async function trimCache(cacheName, maxItems) {
    const cache = await caches.open(cacheName)
    const keys = await cache.keys()
    if (keys.length > maxItems) {
      await cache.delete(keys[0])
      await trimCache(cacheName, maxItems)
    }
  }

After every cache.put() call in the fetch handler, call:
  trimCache(CACHE_NAME, 60)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 5 — Fix push notification tag + icon + badge
In public/sw.js, in the push event handler:

1. Change the notification tag:
  tag: data.tag ?? `jabu-${Date.now()}`,

2. Change icon and badge to use the actual app icon:
  icon:  data.icon  ?? '/icon-192.png',
  badge: data.badge ?? '/icon-192.png',

3. Remove the hardcoded fallback '/favicon.ico' — it doesn't exist.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 6 — Fix notification click routing
In public/sw.js, replace the notificationclick handler entirely:

  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const targetUrl = event.notification.data?.href ?? '/'

    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => {
          // Focus existing window if open, navigate it
          const existing = clients.find(c => c.url.startsWith(
            self.location.origin
          ))
          if (existing) {
            existing.focus()
            return existing.navigate(targetUrl)
          }
          // Otherwise open new window
          return self.clients.openWindow(targetUrl)
        })
    )
  })

No URL pattern matching. No vendor-specific logic.
targetUrl from notification data handles all routing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 2 — MANIFEST (public/manifest.json)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIX 7 — Add "id" field
Add as the second field in manifest.json:
  "id": "/",

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 8 — Split icon purpose: any vs maskable
Currently both icons say "purpose": "any maskable" — wrong.
Replace the icons array with 4 entries (2 sizes × 2 purposes):

  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-192-maskable.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]

NOTE: The maskable variants (icon-192-maskable.png and
icon-512-maskable.png) need to be created separately — they need
the logo centered within 80% of the image with padding around it.
For now, copy the existing icons as placeholders with the correct
names so the manifest is valid:

  cp public/icon-192.png public/icon-192-maskable.png
  cp public/icon-512.png public/icon-512-maskable.png

Add a comment in the manifest (as a note in CLAUDE.md or README):
"Maskable icon variants need safe-zone padding added via
https://maskable.app before production launch."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 9 — Add display_override + screenshots placeholder
In manifest.json, add after "display":

  "display_override": ["window-controls-overlay", "standalone",
                       "minimal-ui"],

Add a screenshots array (leave empty for now with a comment —
actual screenshots need to be taken from the live app):

  "screenshots": []

Add a note in CLAUDE.md:
"To boost PWA install conversion on Android, add 2-3 app
screenshots to public/screenshots/ and update manifest.json
screenshots array with form_factor: narrow entries."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 3 — LAYOUT (app/layout.tsx)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIX 10 — Add all Apple icon sizes
In app/layout.tsx, replace the single apple-touch-icon link with:

  <link rel="apple-touch-icon" sizes="180x180"
    href="/icon-192.png" />
  <link rel="apple-touch-icon" sizes="167x167"
    href="/icon-192.png" />
  <link rel="apple-touch-icon" sizes="152x152"
    href="/icon-192.png" />
  <link rel="apple-touch-icon" sizes="120x120"
    href="/icon-192.png" />

All pointing to icon-192.png for now — it will be downscaled
by the OS, which is fine until properly sized variants are made.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 11 — Light/dark theme_color
In app/layout.tsx, update the viewport export:

  export const viewport: Viewport = {
    themeColor: [
      { media: '(prefers-color-scheme: light)',
        color: '#fafafa' },
      { media: '(prefers-color-scheme: dark)',
        color: '#18181b' },
    ],
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 12 — Add layout to offline page
File: app/offline/page.tsx

The offline page currently renders with no navigation.
When a student lands on /offline, the app looks broken —
no bottom nav, no top bar.

Add an app/offline/layout.tsx:

  import AppChrome from '@/components/layout/AppChrome'

  export default function OfflineLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return <AppChrome>{children}</AppChrome>
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 4 — PUSH SUBSCRIPTION SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIX 13 — Create universal push subscription table + API route
The existing push system only works for food vendors. We need
push for ALL authenticated users so marketplace sellers get
notified when buyers message them.

STEP A — Create the API route
Create: app/api/user/push/route.ts

  POST { endpoint, p256dh, auth } → upserts subscription
  DELETE { endpoint } → removes subscription

  - Auth: require authenticated user (server Supabase client)
  - Use the admin client for DB writes
  - Insert into a new table: user_push_subscriptions
    Columns: id, user_id, endpoint, p256dh, auth,
             created_at, updated_at
  - Upsert on endpoint (conflict key)
  - Return { ok: true }

STEP B — Create the migration
Create: supabase/migrations/[timestamp]_user_push_subscriptions.sql

  CREATE TABLE public.user_push_subscriptions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT user_push_subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT user_push_subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id)
      ON DELETE CASCADE
  );

  CREATE INDEX idx_user_push_subscriptions_user_id
    ON public.user_push_subscriptions(user_id);

  ALTER TABLE public.user_push_subscriptions
    ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Users manage own push subscriptions"
    ON public.user_push_subscriptions
    FOR ALL USING (auth.uid() = user_id);

STEP C — Create a sendUserPush helper
In lib/webPush.ts, add an exported helper:

  import { createSupabaseAdminClient } from './supabase/admin'

  export async function sendUserPush(
    userId: string,
    payload: PushPayload & { tag?: string; href?: string }
  ): Promise<void> {
    try {
      const admin = createSupabaseAdminClient()
      const { data: subs } = await admin
        .from('user_push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId)

      if (!subs?.length) return

      const results = await Promise.allSettled(
        subs.map(sub =>
          sendPush(
            { endpoint: sub.endpoint,
              p256dh: sub.p256dh,
              auth: sub.auth },
            { ...payload,
              data: {
                href: payload.href ?? '/',
                tag: payload.tag,
              }
            }
          )
        )
      )

      // Remove expired subscriptions (sendPush returns false for 410/404)
      const expired = subs.filter((_, i) => {
        const r = results[i]
        return r.status === 'fulfilled' && r.value === false
      })

      if (expired.length) {
        await admin
          .from('user_push_subscriptions')
          .delete()
          .in('endpoint', expired.map(s => s.endpoint))
      }
    } catch {
      // Never throw — push is fire-and-forget
    }
  }

STEP D — Wire sendUserPush into the message notification flow
File: app/api/chat/send/route.ts (read before editing)

After inserting the in-app notification row for the vendor/seller,
also call sendUserPush:

  import { sendUserPush } from '@/lib/webPush'

  // After the notifications.insert() call:
  void sendUserPush(vendor.user_id, {
    title: 'New message',
    body: body.body.trim().slice(0, 80),
    href: `/inbox/${body.conversation_id}`,
    tag: `msg-${body.conversation_id}`,
  })

Wrap in try/catch. Never await in a way that blocks the response.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 14 — Complete the client-side push subscribe flow
File: components/ServiceWorkerRegister.tsx

Rewrite the entire component:

  'use client'

  import { useEffect } from 'react'
  import { supabase } from '@/lib/supabase'

  const VAPID_PUBLIC_KEY =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat(
      (4 - (base64String.length % 4)) % 4
    )
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    const rawData = atob(base64)
    return Uint8Array.from(
      [...rawData], c => c.charCodeAt(0)
    )
  }

  async function subscribeToPush(
    registration: ServiceWorkerRegistration
  ) {
    try {
      if (!VAPID_PUBLIC_KEY) return

      // Check if already subscribed
      let sub = await registration.pushManager
        .getSubscription()

      if (!sub) {
        // Only subscribe if permission already granted —
        // don't prompt here; prompting is done elsewhere
        if (Notification.permission !== 'granted') return

        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      if (!sub) return

      const { endpoint, keys } = sub.toJSON() as {
        endpoint: string
        keys: { p256dh: string; auth: string }
      }

      // POST to universal user push route
      await fetch('/api/user/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        }),
      })
    } catch {
      // Silent — push is not critical
    }
  }

  export default function ServiceWorkerRegister() {
    useEffect(() => {
      if (!('serviceWorker' in navigator)) return

      const buildId =
        process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'

      navigator.serviceWorker
        .register(`/sw.js?v=${buildId}`)
        .then(async (registration) => {
          // Handle SW updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (!newWorker) return

            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                // New SW waiting — show update toast
                const event = new CustomEvent(
                  'sw-update-available',
                  { detail: { worker: newWorker } }
                )
                window.dispatchEvent(event)
              }
            })
          })

          // Subscribe to push if already have permission
          if (Notification.permission === 'granted') {
            await subscribeToPush(registration)
          }
        })
        .catch(() => {
          // SW registration failed — not critical
        })
    }, [])

    return null
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 15 — Add notification permission request + update toast
File: components/layout/AppChrome.tsx (read first)

Add two features to AppChrome:

FEATURE A — SW update toast
Listen for the 'sw-update-available' event dispatched by
ServiceWorkerRegister. When it fires, show a small fixed
toast at the bottom of the screen (above BottomNav):

  <div className="fixed bottom-20 left-0 right-0 z-50
    flex justify-center px-4 pointer-events-none">
    <div className="pointer-events-auto flex items-center
      gap-3 rounded-2xl border border-border bg-card px-4
      py-3 shadow-lg">
      <p className="text-sm font-semibold text-foreground">
        App updated
      </p>
      <button
        onClick={() => {
          updateWorker?.postMessage({ type: 'SKIP_WAITING' })
          window.location.reload()
        }}
        className="rounded-xl bg-zinc-900 px-3 py-1.5
          text-xs font-bold text-white"
      >
        Reload
      </button>
    </div>
  </div>

Store the waiting worker in state: useState<ServiceWorker | null>

In sw.js, add a message handler to support SKIP_WAITING:
  self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
      self.skipWaiting()
    }
  })

FEATURE B — Notification permission prompt
After a user posts their first listing (detect via a
localStorage flag 'jm_has_listed') OR after 3 page loads
(track in localStorage 'jm_visit_count'):

If Notification.permission === 'default', show a dismissible
banner:

  <div className="fixed bottom-20 left-0 right-0 z-50
    flex justify-center px-4">
    <div className="flex w-full max-w-sm items-start gap-3
      rounded-2xl border border-border bg-card p-3 shadow-lg">
      <div className="text-xl">🔔</div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">
          Get notified instantly
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Know when buyers message you or prices drop.
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={dismissNotificationPrompt}
          className="text-xs text-muted-foreground"
        >
          Not now
        </button>
        <button
          onClick={requestNotificationPermission}
          className="rounded-xl bg-zinc-900 px-3 py-1.5
            text-xs font-bold text-white"
        >
          Enable
        </button>
      </div>
    </div>
  </div>

requestNotificationPermission:
  const permission = await Notification.requestPermission()
  if (permission === 'granted') {
    // Subscribe to push immediately
    const reg = await navigator.serviceWorker.ready
    await subscribeToPush(reg)
    // subscribeToPush is imported from a shared module or
    // re-implemented inline here
  }
  setShowNotifPrompt(false)
  localStorage.setItem('jm_notif_dismissed', '1')

dismissNotificationPrompt:
  localStorage.setItem('jm_notif_dismissed', '1')
  setShowNotifPrompt(false)

Only show the prompt if:
  Notification.permission === 'default' AND
  localStorage.getItem('jm_notif_dismissed') !== '1' AND
  (visitCount >= 3 OR localStorage.getItem('jm_has_listed'))

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIX 16 — Set jm_has_listed flag after posting
File: app/post/page.tsx (read first)

After a successful listing publish, add:
  localStorage.setItem('jm_has_listed', '1')

This triggers the notification prompt on the seller's next visit.
One line addition in the publish success handler.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Implement in order: Part 1 → Part 2 → Part 3 → Part 4
- Run the SQL migration separately — provide it as a
  standalone file, do NOT auto-run it
- Read every file fully before editing
- No `any` types on new TypeScript code
- All push operations wrapped in try/catch — never throw,
  never block main flows
- NEXT_PUBLIC_VAPID_PUBLIC_KEY must be added to .env.local —
  note this in a comment in ServiceWorkerRegister.tsx:
  "Add NEXT_PUBLIC_VAPID_PUBLIC_KEY=[same value as VAPID_PUBLIC_KEY]
  to .env.local"
- After all fixes: list every file created or changed,
  confirm each fix number done, flag any skipped with reason