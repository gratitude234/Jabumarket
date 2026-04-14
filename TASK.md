# Push Notification System — Full Fix Prompt for Claude Code

Apply all 10 fixes below to the Jabumarket push notification system. Each fix
is self-contained. Make **only** the changes described — do not refactor
unrelated code or rename anything outside the scope of each fix.

---

## Fix 1 — `lib/webPush.ts`: tri-state return + lazy VAPID init

**Problems being fixed:**
- `sendPush` returns `false` for BOTH expired subscriptions (410/404) AND
  transient errors. `fanOut` then deletes every `false` result, wiping valid
  subscriptions on network blips.
- `configureVapid()` calls `webpush.setVapidDetails()` on every single send
  (once per device in every fan-out). It should run once at module level.

**Replace the entire file `lib/webPush.ts` with the following:**

```typescript
// lib/webPush.ts
// Sends Web Push notifications using the `web-push` npm package with VAPID.
//
// Required env vars:
//   VAPID_PUBLIC_KEY             — base64url EC P-256 public key
//   VAPID_PRIVATE_KEY            — base64url EC P-256 private key
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY — same value as VAPID_PUBLIC_KEY (client-exposed)
//   VAPID_SUBJECT                — mailto: or https: URI identifying the sender
//
// Server-only — never import this file in client components.

import webpush from 'web-push'
import { createSupabaseAdminClient } from './supabase/admin'

export type PushPayload = {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  href?: string
  data?: Record<string, unknown>
}

// Tri-state result: 'ok' | 'expired' (410/404 — delete sub) | 'error' (transient — keep sub)
type SendResult = 'ok' | 'expired' | 'error'

// ── VAPID config — lazy singleton ─────────────────────────────────────────────

let _vapidConfigured = false

function ensureVapid() {
  if (_vapidConfigured) return
  const pub  = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const sub  = process.env.VAPID_SUBJECT ?? 'mailto:admin@jabumarket.com'
  if (!pub || !priv) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set')
  webpush.setVapidDetails(sub, pub, priv)
  _vapidConfigured = true
}

// ── Core send ─────────────────────────────────────────────────────────────────

/**
 * Send a Web Push notification to a single device subscription.
 * Returns:
 *   'ok'      — delivered successfully
 *   'expired' — subscription is gone (410/404) — caller should delete it
 *   'error'   — transient failure — caller should NOT delete the subscription
 * Never throws.
 */
export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<SendResult> {
  try {
    ensureVapid()

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify({
        title: payload.title,
        body:  payload.body,
        icon:  payload.icon  ?? '/icon-192.png',
        badge: payload.badge ?? '/icon-192.png',
        tag:   payload.tag,
        data:  { href: payload.href ?? '/', ...payload.data },
      }),
    )

    return 'ok'
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      const code = (err as { statusCode: number }).statusCode
      // 410 Gone / 404 = subscription expired — safe to delete
      if (code === 410 || code === 404) return 'expired'
    }
    // Transient error (network, 429, 5xx) — keep the subscription
    console.error('[webPush] sendPush error:', err)
    return 'error'
  }
}

// ── Fan-out helpers ───────────────────────────────────────────────────────────

async function fanOut(
  subs: { endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
  table: 'user_push_subscriptions' | 'vendor_push_subscriptions' | 'rider_push_subscriptions',
): Promise<void> {
  if (!subs.length) return

  const results = await Promise.allSettled(subs.map(s => sendPush(s, payload)))

  // Only delete subscriptions confirmed expired (410/404) — never delete on transient errors
  const expiredEndpoints = subs
    .filter((_, i) => {
      const r = results[i]
      return r.status === 'fulfilled' && r.value === 'expired'
    })
    .map(s => s.endpoint)

  if (expiredEndpoints.length) {
    const admin = createSupabaseAdminClient()
    await admin.from(table).delete().in('endpoint', expiredEndpoints)
  }
}

/**
 * Send a Web Push notification to all devices of a given user (buyer/student).
 * Auto-removes expired subscriptions. Never throws.
 */
export async function sendUserPush(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient()
    const { data: subs } = await admin
      .from('user_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)

    await fanOut(subs ?? [], payload, 'user_push_subscriptions')
  } catch {
    // Never throw — push is fire-and-forget
  }
}

/**
 * Send a Web Push notification to all devices of a given rider.
 * Auto-removes expired subscriptions. Never throws.
 */
export async function sendRiderPush(
  riderId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient()
    const { data: subs } = await admin
      .from('rider_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('rider_id', riderId)

    await fanOut(subs ?? [], payload, 'rider_push_subscriptions')
  } catch {
    // Never throw — push is fire-and-forget
  }
}

/**
 * Send a Web Push notification to all devices of a given vendor.
 * Auto-removes expired subscriptions. Never throws.
 */
export async function sendVendorPush(
  vendorId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient()
    const { data: subs } = await admin
      .from('vendor_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('vendor_id', vendorId)

    await fanOut(subs ?? [], payload, 'vendor_push_subscriptions')
  } catch {
    // Never throw — push is fire-and-forget
  }
}
```

---

## Fix 2 — `app/api/internal/push-user/route.ts`: close the auth bypass

**Problem being fixed:**
The conversation-participant check only runs when `href` contains `/inbox/`.
Any authenticated user can skip it by passing a non-inbox `href` (or no href),
and send a push to any arbitrary `user_id`. This is a spam/abuse vector.

**Replace the entire file `app/api/internal/push-user/route.ts` with:**

```typescript
// app/api/internal/push-user/route.ts
// Internal-only: send a push notification to a user by user_id.
// The caller MUST be a verified participant in the conversation.
// Requires: href is always /inbox/[conversationId] and caller owns one side.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sendUserPush } from '@/lib/webPush';

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await req.json() as {
      user_id: string;
      title: string;
      body: string;
      href: string;
      tag?: string;
    };

    if (!body.user_id || !body.title || !body.href) {
      return NextResponse.json(
        { ok: false, message: 'user_id, title, and href are required' },
        { status: 400 },
      );
    }

    // ── Authorization: href MUST be /inbox/[conversationId] ───────────────────
    // Extract conversationId — if href doesn't match this format, reject.
    const conversationId = body.href.split('/inbox/')?.[1]?.split('?')?.[0];
    if (!conversationId) {
      return NextResponse.json(
        { ok: false, message: 'href must be /inbox/[conversationId]' },
        { status: 403 },
      );
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('buyer_id, vendor_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (!conv) return NextResponse.json({ ok: false }, { status: 403 });

    const { data: vendor } = await supabase
      .from('vendors')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const callerVendorId = vendor?.id ?? null;

    const isBuyer  = conv.buyer_id === user.id;
    const isVendor = callerVendorId && conv.vendor_id === callerVendorId;
    if (!isBuyer && !isVendor) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    // ── End authorization ─────────────────────────────────────────────────────

    await sendUserPush(body.user_id, {
      title: body.title,
      body:  body.body,
      href:  body.href,
      tag:   body.tag ?? `msg-${Date.now()}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
```

---

## Fix 3 — `components/ServiceWorkerRegister.tsx`: register vendors and riders to their correct tables

**Problem being fixed:**
`subscribeToPush` always POSTs only to `/api/user/push`, storing the
subscription in `user_push_subscriptions`. But `sendVendorPush` reads from
`vendor_push_subscriptions` and `sendRiderPush` reads from
`rider_push_subscriptions`. Vendor and rider push notifications are therefore
silently broken — none of their devices ever receive pushes.

**Fix:** accept an optional `role` prop on `ServiceWorkerRegister`. When role
is `'vendor'` or `'rider'`, also POST to the role-specific endpoint in addition
to `/api/user/push` (so in-app bell notifications still work for all roles).

**Replace the entire file `components/ServiceWorkerRegister.tsx` with:**

```typescript
'use client'

// Add NEXT_PUBLIC_VAPID_PUBLIC_KEY=[same value as VAPID_PUBLIC_KEY] to .env.local

import { useEffect } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData], c => c.charCodeAt(0))
}

async function registerEndpoint(
  endpoint: string,
  p256dh: string,
  auth: string,
  route: string,
) {
  await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, p256dh, auth }),
  })
}

export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  role?: 'vendor' | 'rider',
) {
  try {
    if (!VAPID_PUBLIC_KEY) return

    let sub = await registration.pushManager.getSubscription()

    if (!sub) {
      // Only subscribe if permission already granted —
      // prompting is handled elsewhere
      if (Notification.permission !== 'granted') return

      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    if (!sub) return

    const { endpoint, keys } = sub.toJSON() as {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }

    // Always register to user_push_subscriptions (drives in-app bell count)
    await registerEndpoint(endpoint, keys.p256dh, keys.auth, '/api/user/push')

    // Also register to the role-specific table so role push helpers work
    if (role === 'vendor') {
      await registerEndpoint(endpoint, keys.p256dh, keys.auth, '/api/vendor/push')
    } else if (role === 'rider') {
      await registerEndpoint(endpoint, keys.p256dh, keys.auth, '/api/rider/push')
    }
  } catch {
    // Silent — push is not critical
  }
}

type Props = {
  /** Pass 'vendor' in the vendor layout, 'rider' in the rider layout. */
  role?: 'vendor' | 'rider'
}

export default function ServiceWorkerRegister({ role }: Props = {}) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'

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
              const event = new CustomEvent('sw-update-available', {
                detail: { worker: newWorker },
              })
              window.dispatchEvent(event)
            }
          })
        })

        // Subscribe to push if already have permission
        if (Notification.permission === 'granted') {
          await subscribeToPush(registration, role)
        }
      })
      .catch(() => {
        // SW registration failed — not critical
      })
  }, [role])

  return null
}
```

**Then update every layout that renders `<ServiceWorkerRegister />` to pass
the correct role:**
- Vendor layout (e.g. `app/vendor/layout.tsx`): `<ServiceWorkerRegister role="vendor" />`
- Rider layout (e.g. `app/rider/layout.tsx`): `<ServiceWorkerRegister role="rider" />`
- All other layouts: `<ServiceWorkerRegister />` (no prop needed)

---

## Fix 4 — `public/sw.js`: add `pushsubscriptionchange` + fix recursive `trimCache`

**Problems being fixed:**
- No `pushsubscriptionchange` handler: browsers silently rotate push
  subscriptions (especially Firefox/Android). When this happens the server
  still holds the old endpoint and push breaks permanently for that device.
- `trimCache` is unbounded-recursive — a single stuck entry causes infinite
  recursion. It should be iterative.

**Replace the entire file `public/sw.js` with:**

```javascript
// public/sw.js
// Service worker for Jabumarket
// — Caching (PWA offline support)
// — Web Push notifications

const params = new URLSearchParams(self.location.search)
const CACHE_NAME = 'jabumarket-' + (params.get('v') ?? 'dev')

// Store VAPID key in SW scope for pushsubscriptionchange re-subscription
const VAPID_PUBLIC_KEY = params.get('vapid') ?? ''

const PRECACHE_URLS = ['/offline']

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

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Cache size helper — iterative, not recursive ──────────────────────────────
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  const toDelete = keys.slice(0, Math.max(0, keys.length - maxItems))
  await Promise.all(toDelete.map((k) => cache.delete(k)))
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  const isNetworkOnly =
    NETWORK_ONLY.some((p) => url.pathname === p || url.pathname.startsWith(p)) ||
    url.searchParams.has('_rsc')

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    isNetworkOnly
  ) return

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

// ── Push subscription change — re-register silently rotated subscriptions ─────
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const appServerKey = VAPID_PUBLIC_KEY
          ? Uint8Array.from(atob(
              VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/') +
              '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4)
            ), c => c.charCodeAt(0))
          : undefined

        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          ...(appServerKey ? { applicationServerKey: appServerKey } : {}),
        })

        const json = newSub.toJSON()
        const { endpoint, keys } = json

        // Re-register the new subscription on the server
        await fetch('/api/user/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint,
            p256dh: keys?.p256dh,
            auth:   keys?.auth,
          }),
        })
      } catch (err) {
        console.error('[SW] pushsubscriptionchange failed:', err)
      }
    })()
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
        const existing = clients.find((c) => c.url.startsWith(self.location.origin))
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
```

**Also update the SW registration call in `ServiceWorkerRegister.tsx`** to
pass the VAPID key as a query param so the SW can use it for
`pushsubscriptionchange` re-subscription:

In the `navigator.serviceWorker.register(...)` call, change:
```typescript
// BEFORE
navigator.serviceWorker.register(`/sw.js?v=${buildId}`)

// AFTER
const vapidKey = encodeURIComponent(VAPID_PUBLIC_KEY)
navigator.serviceWorker.register(`/sw.js?v=${buildId}&vapid=${vapidKey}`)
```

---

## Fix 5 — Push route files: add per-user subscription cap (max 10 devices)

**Problem being fixed:**
A user can register unlimited push subscriptions, causing `user_push_subscriptions`
(and the vendor/rider equivalents) to grow forever, and `fanOut` to send to
every row indefinitely.

**In `app/api/user/push/route.ts`**, after the `.upsert(...)` call in the POST
handler, add this trim block. Insert it between the upsert and the
`return NextResponse.json({ ok: true })`:

```typescript
    // Trim to the 10 most-recent subscriptions for this user
    const { data: allSubs } = await admin
      .from('user_push_subscriptions')
      .select('id, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    const toDelete = (allSubs ?? []).slice(10).map((s: { id: string }) => s.id)
    if (toDelete.length) {
      await admin.from('user_push_subscriptions').delete().in('id', toDelete)
    }
```

**Apply the same pattern to `app/api/vendor/push/route.ts`** after its upsert
in POST, querying `vendor_push_subscriptions` filtered by `vendor_id`:

```typescript
    // Trim to the 10 most-recent subscriptions for this vendor
    const { data: allSubs } = await admin
      .from('vendor_push_subscriptions')
      .select('id, updated_at')
      .eq('vendor_id', vendor.id)
      .order('updated_at', { ascending: false })

    const toDelete = (allSubs ?? []).slice(10).map((s: { id: string }) => s.id)
    if (toDelete.length) {
      await admin.from('vendor_push_subscriptions').delete().in('id', toDelete)
    }
```

**Apply the same pattern to `app/api/rider/push/route.ts`** after its upsert
in POST, querying `rider_push_subscriptions` filtered by `rider_id`:

```typescript
    // Trim to the 10 most-recent subscriptions for this rider
    const { data: allSubs } = await admin
      .from('rider_push_subscriptions')
      .select('id, updated_at')
      .eq('rider_id', riderId)
      .order('updated_at', { ascending: false })

    const toDelete = (allSubs ?? []).slice(10).map((s: { id: string }) => s.id)
    if (toDelete.length) {
      await admin.from('rider_push_subscriptions').delete().in('id', toDelete)
    }
```

---

## Fix 6 — New migration: `vendor_push_subscriptions` and `rider_push_subscriptions`

**Problem being fixed:**
Only `user_push_subscriptions` has a tracked migration. The vendor and rider
tables are referenced everywhere but their DDL is missing — new environments
will fail silently or crash on deploy.

**Create a new file `supabase/migrations/20260320_vendor_rider_push_subscriptions.sql`**
with the following content:

```sql
-- vendor_push_subscriptions
CREATE TABLE IF NOT EXISTS public.vendor_push_subscriptions (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  vendor_id  uuid NOT NULL,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT vendor_push_subscriptions_vendor_id_fkey
    FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vendor_push_subscriptions_vendor_id
  ON public.vendor_push_subscriptions(vendor_id);

ALTER TABLE public.vendor_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendors manage own push subscriptions"
  ON public.vendor_push_subscriptions
  FOR ALL USING (
    vendor_id IN (
      SELECT id FROM public.vendors WHERE user_id = auth.uid()
    )
  );

-- rider_push_subscriptions
CREATE TABLE IF NOT EXISTS public.rider_push_subscriptions (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id   uuid NOT NULL,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT rider_push_subscriptions_rider_id_fkey
    FOREIGN KEY (rider_id) REFERENCES public.riders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rider_push_subscriptions_rider_id
  ON public.rider_push_subscriptions(rider_id);

ALTER TABLE public.rider_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Riders manage own push subscriptions"
  ON public.rider_push_subscriptions
  FOR ALL USING (
    rider_id IN (
      SELECT id FROM public.riders WHERE user_id = auth.uid()
    )
  );
```

---

## Fix 7 — New migration: `updated_at` auto-trigger for all three push tables

**Problem being fixed:**
`updated_at` is set manually in every push route. Any future code path that
skips the manual assignment will silently have a stale timestamp.

**Create a new file
`supabase/migrations/20260320_push_subscriptions_updated_at_trigger.sql`**
with the following content:

```sql
-- Shared trigger function (skip if already exists from another migration)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- user_push_subscriptions
DROP TRIGGER IF EXISTS trg_user_push_subs_updated_at ON public.user_push_subscriptions;
CREATE TRIGGER trg_user_push_subs_updated_at
  BEFORE UPDATE ON public.user_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- vendor_push_subscriptions
DROP TRIGGER IF EXISTS trg_vendor_push_subs_updated_at ON public.vendor_push_subscriptions;
CREATE TRIGGER trg_vendor_push_subs_updated_at
  BEFORE UPDATE ON public.vendor_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- rider_push_subscriptions
DROP TRIGGER IF EXISTS trg_rider_push_subs_updated_at ON public.rider_push_subscriptions;
CREATE TRIGGER trg_rider_push_subs_updated_at
  BEFORE UPDATE ON public.rider_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

## Summary of all files changed / created

| File | Action |
|------|--------|
| `lib/webPush.ts` | Full replace (Fix 1) |
| `app/api/internal/push-user/route.ts` | Full replace (Fix 2) |
| `components/ServiceWorkerRegister.tsx` | Full replace (Fix 3) |
| `public/sw.js` | Full replace (Fix 4) |
| `app/api/user/push/route.ts` | Add trim block after upsert (Fix 5) |
| `app/api/vendor/push/route.ts` | Add trim block after upsert (Fix 5) |
| `app/api/rider/push/route.ts` | Add trim block after upsert (Fix 5) |
| `supabase/migrations/20260320_vendor_rider_push_subscriptions.sql` | New file (Fix 6) |
| `supabase/migrations/20260320_push_subscriptions_updated_at_trigger.sql` | New file (Fix 7) |
| Vendor layout file (e.g. `app/vendor/layout.tsx`) | Add `role="vendor"` prop (Fix 3) |
| Rider layout file (e.g. `app/rider/layout.tsx`) | Add `role="rider"` prop (Fix 3) |

After applying all changes, run `npx tsc --noEmit` to confirm no type errors.