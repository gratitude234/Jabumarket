# Jabumarket — Rider Auth + Full In-App Delivery Loop
# Claude Code Implementation Prompt
#
# Context: Riders currently have no auth accounts. They identify via
# phone + PIN lookup. This means the app cannot push notifications to
# them, they cannot receive in-app messages, and every vendor-rider
# and rider-buyer touchpoint exits to WhatsApp. This prompt implements
# proper rider accounts and a complete in-app delivery communication loop.

---

## PHASE 1 — READ THESE FILES FIRST (do not write any code yet)

Read every file listed. After reading, write one line per file summarising
what it does and flag anything relevant to the tasks below.

- `lib/types.ts` — focus on: RiderRow type, DeliveryRequestRow type
- `lib/webPush.ts` — full file. Note: sendUserPush, sendVendorPush signatures
  and the fanOut helper pattern
- `app/rider/apply/page.tsx` — full file
- `app/rider/status/page.tsx` — full file. Note: PIN flow, phone lookup
- `app/rider/my-deliveries/page.tsx` — full file
- `app/api/vendor/orders/[orderId]/assign-rider/route.ts` — full file
- `app/api/rider/pin/set/route.ts` — full file
- `app/api/rider/pin/verify/route.ts` — full file
- `app/delivery/DeliveryClient.tsx` — full file
- `app/delivery/requests/page.tsx` — full file
- `lib/supabase.ts` — note the browser client export name
- `lib/supabase/server.ts` — note the server client factory name
- `lib/supabase/admin.ts` — note the admin client factory name
- `components/ServiceWorkerRegister.tsx` — note the subscribeToPush export

Only proceed to Phase 2 after reading all files.

---

## PHASE 2 — DB MIGRATION

Create file: `supabase/migrations/20260325_rider_auth.sql`

```sql
-- Add user_id to riders so they can have proper auth accounts
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS riders_user_id_unique
  ON public.riders (user_id)
  WHERE user_id IS NOT NULL;

-- Push subscription table for riders (same pattern as vendor_push_subscriptions)
CREATE TABLE IF NOT EXISTS public.rider_push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rider_push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT rider_push_subscriptions_rider_id_fkey
    FOREIGN KEY (rider_id) REFERENCES public.riders(id)
);

-- Notifications for riders reuse the existing notifications table
-- (notifications.user_id references auth.users, which riders will now have)

-- RLS: riders can read their own push subscriptions
ALTER TABLE public.rider_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "riders can manage own push subscriptions"
  ON public.rider_push_subscriptions
  FOR ALL
  USING (
    rider_id IN (
      SELECT id FROM public.riders WHERE user_id = auth.uid()
    )
  );
```

---

## PHASE 3 — IMPLEMENT

Work through every task in order. Do not skip any.

---

### TASK 1 — Add sendRiderPush to webPush.ts

File: `lib/webPush.ts`

Following the exact same pattern as `sendVendorPush`, add a new export at
the bottom of the file:

```ts
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
```

---

### TASK 2 — Update RiderRow type

File: `lib/types.ts`

Add `user_id` and `zones_covered` to `RiderRow`:

```ts
export type RiderRow = {
  id: string;
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  zone: string | null;
  zones_covered: string[];
  fee_note: string | null;
  is_available: boolean | null;
  verified: boolean;
  created_at: string | null;
  user_id: string | null;
  pin_hash: string | null;
  response_time_note: string | null;
  availability_note: string | null;
};
```

---

### TASK 3 — Create rider push subscription API route

Create file: `app/api/rider/push/route.ts`

This follows the exact same pattern as `app/api/vendor/push/route.ts`.
Read that file first to understand the pattern, then implement for riders:

```ts
// app/api/rider/push/route.ts
// POST — subscribe rider device to push notifications
// DELETE — unsubscribe

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function jsonError(msg: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, code, message: msg }, { status });
}

async function getRiderForUser(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('riders')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated');

    const body = await req.json().catch(() => null) as {
      endpoint?: string; p256dh?: string; auth?: string;
    } | null;

    if (!body?.endpoint || !body?.p256dh || !body?.auth) {
      return jsonError('Missing subscription fields', 400, 'bad_request');
    }

    const riderId = await getRiderForUser(user.id);
    if (!riderId) return jsonError('Not a rider', 403, 'not_rider');

    const admin = createSupabaseAdminClient();
    await admin
      .from('rider_push_subscriptions')
      .upsert(
        { rider_id: riderId, endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth, updated_at: new Date().toISOString() },
        { onConflict: 'endpoint' }
      );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated');

    const body = await req.json().catch(() => null) as { endpoint?: string } | null;
    if (!body?.endpoint) return jsonError('Missing endpoint', 400, 'bad_request');

    const riderId = await getRiderForUser(user.id);
    if (!riderId) return jsonError('Not a rider', 403, 'not_rider');

    const admin = createSupabaseAdminClient();
    await admin
      .from('rider_push_subscriptions')
      .delete()
      .eq('rider_id', riderId)
      .eq('endpoint', body.endpoint);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}
```

---

### TASK 4 — Create rider account link API route

This route links an existing `riders` row to an authenticated Supabase user.
A rider signs up with their email/phone via Supabase auth, then calls this
endpoint with their registered phone number to claim their rider profile.

Create file: `app/api/rider/link-account/route.ts`

```ts
// app/api/rider/link-account/route.ts
// POST { phone } — links the authenticated user to their existing rider row.
// Called once after a rider signs up for the first time.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function jsonError(msg: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, code, message: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated');

    const body = await req.json().catch(() => null) as { phone?: string } | null;
    const phone = (body?.phone ?? '').replace(/[^\d]/g, '');
    if (!phone || phone.length < 10) {
      return jsonError('Valid phone number required', 400, 'bad_phone');
    }

    const admin = createSupabaseAdminClient();

    // Check if this user already has a rider row linked
    const { data: existing } = await admin
      .from('riders')
      .select('id, name')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, rider: existing, already_linked: true });
    }

    // Find rider row by phone number
    const { data: rider, error: findErr } = await admin
      .from('riders')
      .select('id, name, user_id')
      .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
      .maybeSingle();

    if (findErr || !rider) {
      return jsonError(
        'No rider profile found for that phone number. Make sure you use the same number you registered with.',
        404,
        'rider_not_found'
      );
    }

    if (rider.user_id && rider.user_id !== user.id) {
      return jsonError(
        'This phone number is already linked to another account.',
        409,
        'already_claimed'
      );
    }

    // Link
    const { error: updateErr } = await admin
      .from('riders')
      .update({ user_id: user.id })
      .eq('id', rider.id);

    if (updateErr) return jsonError(updateErr.message, 500, 'link_failed');

    return NextResponse.json({ ok: true, rider: { id: rider.id, name: rider.name } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}
```

---

### TASK 5 — Create authenticated rider delivery status update route

Create file: `app/api/rider/delivery/[deliveryId]/status/route.ts`

This replaces the direct Supabase client call in `rider/my-deliveries`. It
validates auth, validates the rider owns this delivery, updates status, and
sends push notifications to the buyer.

```ts
// app/api/rider/delivery/[deliveryId]/status/route.ts
// PATCH { status } — authenticated rider updates delivery status.
// Notifies buyer at each step.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendUserPush } from '@/lib/webPush';

function jsonError(msg: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, code, message: msg }, { status });
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  accepted:  ['picked_up', 'cancelled'],
  picked_up: ['delivered'],
};

const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  picked_up: {
    title: 'Your order has been picked up',
    body:  'Your rider has collected the item and is on the way.',
  },
  delivered: {
    title: 'Order delivered!',
    body:  'Your item has been delivered. Enjoy!',
  },
  cancelled: {
    title: 'Delivery cancelled',
    body:  'Your rider had to cancel. Contact support if needed.',
  },
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ deliveryId: string }> }
) {
  try {
    const { deliveryId } = await params;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated');

    const body = await req.json().catch(() => null) as { status?: string } | null;
    const newStatus = body?.status;

    if (!newStatus || !['picked_up', 'delivered', 'cancelled'].includes(newStatus)) {
      return jsonError('Invalid status', 400, 'invalid_status');
    }

    const admin = createSupabaseAdminClient();

    // Verify caller is the assigned rider
    const { data: rider } = await admin
      .from('riders')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!rider) return jsonError('Not a rider', 403, 'not_rider');

    const { data: delivery, error: fetchErr } = await admin
      .from('delivery_requests')
      .select('id, rider_id, buyer_id, status, order_id, dropoff')
      .eq('id', deliveryId)
      .single();

    if (fetchErr || !delivery) return jsonError('Delivery not found', 404, 'not_found');
    if (delivery.rider_id !== rider.id) return jsonError('Forbidden', 403, 'forbidden');

    // Validate transition
    const allowed = VALID_TRANSITIONS[delivery.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return jsonError(
        `Cannot move from ${delivery.status} to ${newStatus}`,
        400,
        'invalid_transition'
      );
    }

    const { error: updateErr } = await admin
      .from('delivery_requests')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', deliveryId);

    if (updateErr) return jsonError(updateErr.message, 500, 'update_failed');

    // Notify buyer
    const msg = STATUS_MESSAGES[newStatus];
    if (msg && delivery.buyer_id) {
      try {
        await admin.from('notifications').insert({
          user_id: delivery.buyer_id,
          type:    'delivery_status',
          title:   msg.title,
          body:    msg.body,
          href:    '/delivery/requests',
        });
        await sendUserPush(delivery.buyer_id, {
          title: msg.title,
          body:  msg.body,
          href:  '/delivery/requests',
          tag:   `delivery-${deliveryId}`,
        });
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}
```

---

### TASK 6 — Update assign-rider route to notify the rider

File: `app/api/vendor/orders/[orderId]/assign-rider/route.ts`

After the successful `delivery_requests` update, add rider notification:

```ts
import { sendRiderPush } from '@/lib/webPush';
```

Add this block after `if (error) return jsonError(...)`:

```ts
// Notify the assigned rider
try {
  // Get delivery details for the notification
  const { data: delivery } = await admin
    .from('delivery_requests')
    .select('id, dropoff, note')
    .eq('order_id', orderId)
    .maybeSingle();

  // Get rider's user_id (if they have an account)
  const { data: rider } = await admin
    .from('riders')
    .select('id, name, user_id')
    .eq('id', body.rider_id)
    .maybeSingle();

  // Get order total and item summary for the notification body
  const { data: orderDetails } = await admin
    .from('orders')
    .select('total, items')
    .eq('id', orderId)
    .single();

  const dropoff = delivery?.dropoff ?? 'See delivery details';
  const fee = orderDetails?.total
    ? `₦${Number(orderDetails.total).toLocaleString()}`
    : '';

  const notifTitle = 'New delivery job assigned to you';
  const notifBody  = `Drop-off: ${dropoff}${fee ? ` · Fee: ${fee}` : ''}`;
  const href       = '/rider/dashboard';

  if (rider?.user_id) {
    // In-app notification
    await admin.from('notifications').insert({
      user_id: rider.user_id,
      type:    'delivery_assigned',
      title:   notifTitle,
      body:    notifBody,
      href,
    });

    // Push notification
    void sendRiderPush(rider.id, {
      title: notifTitle,
      body:  notifBody,
      href,
      tag:   `delivery-${orderId}`,
    });
  }
} catch { /* non-critical — assignment already succeeded */ }
```

---

### TASK 7 — Create the rider login/link page

Create file: `app/rider/login/page.tsx`

This is a two-step page:
1. Rider signs up or logs in via Supabase auth (email or phone OTP)
2. After auth, they enter their registered phone number to link their
   existing rider profile

```tsx
'use client';
// app/rider/login/page.tsx
// Rider authentication — sign up / log in, then link to existing rider profile

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Loader2, Truck, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'auth' | 'link' | 'done';

function normalizePhone(s: string) {
  return s.replace(/[^\d]/g, '');
}

export default function RiderLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('auth');

  // Auth step
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError]     = useState<string | null>(null);

  // Link step
  const [phone, setPhone]         = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError]     = useState<string | null>(null);
  const [riderName, setRiderName]     = useState<string | null>(null);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }

      // Check if already linked to a rider
      const { data: existingRider } = await supabase
        .from('riders')
        .select('id, name')
        .maybeSingle();  // RLS will scope this to user_id

      // Actually we need admin to check — redirect to link step
      setStep('link');
    } catch (err: any) {
      setAuthError(err.message ?? 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLinkError(null);
    setLinkLoading(true);

    try {
      const res = await fetch('/api/rider/link-account', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: normalizePhone(phone) }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? 'Failed to link account');

      setRiderName(json.rider?.name ?? 'Rider');
      setStep('done');
    } catch (err: any) {
      setLinkError(err.message ?? 'Something went wrong');
    } finally {
      setLinkLoading(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-8 pb-28">
        <div className="rounded-3xl border bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
          <h1 className="text-xl font-bold text-zinc-900">
            Welcome, {riderName}!
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Your account is linked. You'll now receive push notifications for new
            delivery jobs.
          </p>
          <button
            type="button"
            onClick={() => router.replace('/rider/dashboard')}
            className="mt-6 w-full rounded-2xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
          >
            Go to dashboard →
          </button>
        </div>
      </div>
    );
  }

  if (step === 'link') {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-8 pb-28">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setStep('auth')}
            className="grid h-10 w-10 place-items-center rounded-full border bg-white hover:bg-zinc-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Link your rider profile</h1>
            <p className="text-xs text-zinc-500">Enter the phone number you registered with</p>
          </div>
        </div>

        <form onSubmit={handleLink} className="rounded-3xl border bg-white p-5 shadow-sm space-y-4">
          <p className="text-sm text-zinc-600">
            Enter the phone number that was used when you applied to become a rider.
            This links your new account to your existing profile.
          </p>

          <input
            type="tel"
            inputMode="tel"
            placeholder="e.g. 08012345678"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setLinkError(null); }}
            className="w-full rounded-2xl border bg-zinc-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            required
          />

          {linkError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {linkError}
            </p>
          )}

          <button
            type="submit"
            disabled={linkLoading || normalizePhone(phone).length < 10}
            className={cn(
              'w-full rounded-2xl py-3 text-sm font-semibold transition',
              linkLoading || normalizePhone(phone).length < 10
                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                : 'bg-zinc-900 text-white hover:bg-zinc-700'
            )}
          >
            {linkLoading
              ? <span className="inline-flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Linking…</span>
              : 'Link my profile'}
          </button>
        </form>
      </div>
    );
  }

  // Auth step
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-8 pb-28">
      <div className="flex items-center gap-3">
        <Link
          href="/delivery"
          className="grid h-10 w-10 place-items-center rounded-full border bg-white hover:bg-zinc-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Rider account</h1>
          <p className="text-xs text-zinc-500">Sign in to manage your deliveries</p>
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-100">
            <Truck className="h-5 w-5 text-zinc-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              {authMode === 'login' ? 'Sign in to your rider account' : 'Create a rider account'}
            </p>
            <p className="text-xs text-zinc-500">
              {authMode === 'login'
                ? 'Use the email you signed up with'
                : 'Use your email to create an account'}
            </p>
          </div>
        </div>

        <form onSubmit={handleAuth} className="space-y-3">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setAuthError(null); }}
            className="w-full rounded-2xl border bg-zinc-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
            className="w-full rounded-2xl border bg-zinc-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            required
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
          />

          {authError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {authError}
            </p>
          )}

          <button
            type="submit"
            disabled={authLoading || !email.trim() || password.length < 6}
            className={cn(
              'w-full rounded-2xl py-3 text-sm font-semibold transition',
              authLoading || !email.trim() || password.length < 6
                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                : 'bg-zinc-900 text-white hover:bg-zinc-700'
            )}
          >
            {authLoading
              ? <span className="inline-flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {authMode === 'login' ? 'Signing in…' : 'Creating account…'}</span>
              : authMode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setAuthMode(m => m === 'login' ? 'signup' : 'login'); setAuthError(null); }}
          className="mt-4 w-full text-center text-xs text-zinc-500 hover:text-zinc-900"
        >
          {authMode === 'login'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in'}
        </button>
      </div>

      <div className="rounded-3xl border bg-zinc-50 p-4">
        <p className="text-xs font-semibold text-zinc-700">Not a rider yet?</p>
        <p className="mt-1 text-xs text-zinc-500">
          Apply to join the delivery team — admin will review and add you.
        </p>
        <Link
          href="/rider/apply"
          className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white no-underline hover:bg-zinc-800"
        >
          <Truck className="h-3.5 w-3.5" />
          Apply as a rider
        </Link>
      </div>
    </div>
  );
}
```

---

### TASK 8 — Create the authenticated rider dashboard

Create file: `app/rider/dashboard/page.tsx`

This is the main home screen for logged-in riders. It shows:
- Availability toggle (one tap, prominent)
- Active/new jobs list with full details
- Push notification subscription
- Link to job history

```tsx
'use client';
// app/rider/dashboard/page.tsx
// Authenticated rider home — availability toggle, active jobs, push notifications

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { subscribeToPush } from '@/components/ServiceWorkerRegister';
import {
  Loader2, Truck, CheckCircle2, MapPin, Package,
  Bell, BellOff, ToggleLeft, ToggleRight, ArrowRight, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type RiderProfile = {
  id: string;
  name: string | null;
  zone: string | null;
  is_available: boolean;
  verified: boolean;
};

type DeliveryJob = {
  id: string;
  order_id: string | null;
  dropoff: string | null;
  note: string | null;
  status: string;
  created_at: string;
  listing?: { title: string | null } | null;
  order?: { total: number; items: any } | null;
  vendor?: { name: string | null; location: string | null } | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  accepted:  { label: 'Awaiting pickup',  cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  picked_up: { label: 'Out for delivery', cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  delivered: { label: 'Delivered',        cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Cancelled',        cls: 'bg-zinc-50 text-zinc-500 border-zinc-200' },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function RiderDashboardPage() {
  const router = useRouter();
  const [rider, setRider]       = useState<RiderProfile | null>(null);
  const [jobs, setJobs]         = useState<DeliveryJob[]>([]);
  const [loading, setLoading]   = useState(true);
  const [toggling, setToggling] = useState(false);
  const [acting, setActing]     = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);

  const loadJobs = useCallback(async (riderId: string) => {
    const { data } = await supabase
      .from('delivery_requests')
      .select(`
        id, order_id, dropoff, note, status, created_at,
        listing:listings(title),
        order:orders(total, items),
        vendor:vendors(name, location)
      `)
      .eq('rider_id', riderId)
      .in('status', ['accepted', 'picked_up'])
      .order('created_at', { ascending: false });
    setJobs((data as any[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) { router.replace('/rider/login'); return; }

      const { data: riderData } = await supabase
        .from('riders')
        .select('id, name, zone, is_available, verified')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!riderData) {
        // Logged in but not linked yet
        router.replace('/rider/login');
        return;
      }

      setRider(riderData as RiderProfile);
      await loadJobs(riderData.id);
      setLoading(false);
    })();
  }, [router, loadJobs]);

  // Real-time: new delivery assignments
  useEffect(() => {
    if (!rider) return;
    const channel = supabase
      .channel(`rider-jobs:${rider.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'delivery_requests',
        filter: `rider_id=eq.${rider.id}`,
      }, () => loadJobs(rider.id))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'delivery_requests',
        filter: `rider_id=eq.${rider.id}`,
      }, () => loadJobs(rider.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [rider, loadJobs]);

  async function toggleAvailability() {
    if (!rider) return;
    setToggling(true);
    const next = !rider.is_available;
    const { error } = await supabase
      .from('riders')
      .update({ is_available: next })
      .eq('id', rider.id);
    if (!error) setRider({ ...rider, is_available: next });
    setToggling(false);
  }

  async function updateJobStatus(jobId: string, newStatus: string) {
    setActing(jobId);
    try {
      const res = await fetch(`/api/rider/delivery/${jobId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setJobs(prev => prev.map(j =>
          j.id === jobId ? { ...j, status: newStatus } : j
        ).filter(j => !['delivered', 'cancelled'].includes(j.status)));
      }
    } finally {
      setActing(null);
    }
  }

  async function enablePush() {
    if (!rider) return;
    try {
      await subscribeToPush('/api/rider/push');
      setPushEnabled(true);
    } catch { /* user denied */ }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!rider) return null;

  const activeJobs = jobs.filter(j => ['accepted', 'picked_up'].includes(j.status));

  return (
    <div className="mx-auto max-w-md space-y-4 pb-28 px-4 pt-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900">
          {rider.name ?? 'Rider dashboard'}
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          {rider.zone ?? 'Campus'} · {rider.verified ? '✓ Verified' : 'Unverified'}
        </p>
      </div>

      {/* Availability toggle — most prominent element */}
      <button
        type="button"
        onClick={toggleAvailability}
        disabled={toggling}
        className={cn(
          'w-full flex items-center justify-between rounded-3xl border p-5 text-left transition-all shadow-sm disabled:opacity-70',
          rider.is_available
            ? 'border-emerald-300 bg-emerald-50'
            : 'border-zinc-200 bg-white'
        )}
      >
        <div>
          <p className={cn(
            'text-base font-bold',
            rider.is_available ? 'text-emerald-900' : 'text-zinc-900'
          )}>
            {rider.is_available ? '✅ Available for jobs' : '⏸ Not available'}
          </p>
          <p className={cn(
            'mt-0.5 text-sm',
            rider.is_available ? 'text-emerald-700' : 'text-zinc-500'
          )}>
            {rider.is_available
              ? 'Vendors can assign deliveries to you'
              : 'Tap to go available'}
          </p>
        </div>
        {toggling
          ? <Loader2 className="h-5 w-5 animate-spin text-zinc-400 shrink-0" />
          : rider.is_available
          ? <ToggleRight className="h-8 w-8 text-emerald-600 shrink-0" />
          : <ToggleLeft className="h-8 w-8 text-zinc-400 shrink-0" />}
      </button>

      {/* Push notification prompt */}
      {!pushEnabled && (
        <button
          type="button"
          onClick={enablePush}
          className="w-full flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 transition"
        >
          <Bell className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Enable notifications</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Get alerted instantly when a delivery is assigned to you
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-500 shrink-0" />
        </button>
      )}

      {/* Active jobs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-zinc-900">
            Active jobs {activeJobs.length > 0 && `(${activeJobs.length})`}
          </p>
          <Link
            href="/rider/my-deliveries"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900 no-underline"
          >
            History →
          </Link>
        </div>

        {activeJobs.length === 0 ? (
          <div className="rounded-3xl border bg-white p-8 text-center shadow-sm">
            <Truck className="mx-auto mb-3 h-8 w-8 text-zinc-200" />
            <p className="text-sm font-semibold text-zinc-900">No active jobs</p>
            <p className="mt-1 text-xs text-zinc-500">
              {rider.is_available
                ? 'New jobs will appear here when assigned.'
                : 'Go available to start receiving jobs.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeJobs.map((job) => {
              const listing = Array.isArray(job.listing) ? job.listing[0] : job.listing;
              const order   = Array.isArray(job.order)   ? job.order[0]   : job.order;
              const vendor  = Array.isArray(job.vendor)  ? job.vendor[0]  : job.vendor;
              const meta    = STATUS_META[job.status] ?? STATUS_META.accepted;

              return (
                <div key={job.id} className="rounded-3xl border bg-white p-4 shadow-sm space-y-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 truncate">
                        {listing?.title ?? `Job #${job.id.slice(-6).toUpperCase()}`}
                      </p>
                      {vendor?.name && (
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Pickup from: {vendor.name}
                          {vendor.location ? ` · ${vendor.location}` : ''}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-zinc-400">
                      {timeAgo(job.created_at)}
                    </span>
                  </div>

                  {/* Drop-off */}
                  {job.dropoff && (
                    <div className="flex items-start gap-2 rounded-2xl bg-zinc-50 px-3 py-2.5">
                      <MapPin className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-zinc-700">{job.dropoff}</p>
                    </div>
                  )}

                  {/* Fee */}
                  {order?.total && (
                    <p className="text-sm font-bold text-zinc-900">
                      Delivery fee: ₦{Number(order.total).toLocaleString()}
                    </p>
                  )}

                  {/* Note */}
                  {job.note && (
                    <p className="text-xs italic text-zinc-400">Note: {job.note}</p>
                  )}

                  {/* Status badge */}
                  <span className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
                    meta.cls
                  )}>
                    <Truck className="h-3 w-3" />
                    {meta.label}
                  </span>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {job.status === 'accepted' && (
                      <button
                        type="button"
                        disabled={acting === job.id}
                        onClick={() => updateJobStatus(job.id, 'picked_up')}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {acting === job.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Package className="h-4 w-4" />}
                        Picked up
                      </button>
                    )}
                    {job.status === 'picked_up' && (
                      <button
                        type="button"
                        disabled={acting === job.id}
                        onClick={() => updateJobStatus(job.id, 'delivered')}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {acting === job.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <CheckCircle2 className="h-4 w-4" />}
                        Delivered
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/rider/my-deliveries"
          className="flex items-center gap-2 rounded-2xl border bg-white p-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50 shadow-sm"
        >
          <Clock className="h-4 w-4 text-zinc-500" />
          Job history
        </Link>
        <Link
          href="/rider/status"
          className="flex items-center gap-2 rounded-2xl border bg-white p-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50 shadow-sm"
        >
          <Truck className="h-4 w-4 text-zinc-500" />
          Old status page
        </Link>
      </div>
    </div>
  );
}
```

---

### TASK 9 — Update /rider/my-deliveries to use auth + the new status route

File: `app/rider/my-deliveries/page.tsx`

Replace the phone-lookup-based flow with an auth-based flow. Read the full
current file first.

1. Remove the phone state, lookup function, and phone input form entirely
2. On mount, call `supabase.auth.getUser()` — if no user, redirect to
   `/rider/login`. If user, query `riders` table for their row using
   `.eq('user_id', user.id)`
3. Replace the direct `supabase.from('delivery_requests').update()` call
   in `updateStatus()` with a fetch to
   `/api/rider/delivery/${deliveryId}/status` using PATCH
4. Expand the delivery query to include listing title and vendor name:
   ```ts
   .select(`
     id, order_id, dropoff, note, status, created_at,
     listing:listings(title),
     vendor:vendors(name, location)
   `)
   ```
5. Show listing title and vendor name in each delivery card
6. Add a "Go to dashboard" link at the top pointing to `/rider/dashboard`
7. Keep the status action buttons exactly as they are (accepted → picked_up,
   picked_up → delivered)

---

### TASK 10 — Show assigned rider details to buyer after assignment

File: `app/delivery/requests/page.tsx`

When a delivery request has `status: 'accepted'` and a `rider` row is joined,
show the rider's name prominently so the buyer knows who is handling it.

Find where the rider data is used in the request card. Currently it shows
rider name and phone with WhatsApp links. Keep the display but add:
- A clear "Your rider" label
- The rider's zone/area if available
- A note that says "Tap to refresh for live updates" with a refresh button
  (the page doesn't have real-time yet — this is a short-term UX patch)

Also add a real-time subscription to refresh when the delivery_request status
changes. In the main `useEffect`, after loading requests, add:

```ts
// Real-time status updates
const channel = supabase
  .channel(`delivery-requests:${userId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'delivery_requests',
    filter: `buyer_id=eq.${userId}`,
  }, () => { /* reload */ loadRequests(); })
  .subscribe();
return () => { supabase.removeChannel(channel); };
```

Where `loadRequests` is whatever function fetches the requests. Add it to
the existing `useEffect` cleanup or as a separate subscription effect.

---

### TASK 11 — Update /delivery/DeliveryClient.tsx — remove WhatsApp from post-submit

File: `app/delivery/DeliveryClient.tsx`

After submission succeeds (in `submitRequest()`), find the block that opens
WhatsApp for the selected rider:

```ts
// If a rider was selected, open WhatsApp for them
if (selectedRider) {
  const wa = selectedRider.whatsapp ?? selectedRider.phone ?? "";
  ...
  window.open(waLink, "_blank", "noopener");
}
```

Replace this entire block with a note that the rider will be notified
in-app. Since the rider may or may not have an account yet, keep a fallback:

```ts
// Rider will be notified in-app if they have an account linked.
// No WhatsApp fallback — all communication is in-app.
```

Also update the "done" step confirmation copy:

Find:
```
"We've opened WhatsApp with [rider]. Confirm the delivery details with them directly."
```
Replace with:
```
`${selectedRider.name ?? 'Your rider'} has been notified in-app. You'll get updates as the delivery progresses.`
```

And remove the "Still show riders so they can WhatsApp one if none selected"
section entirely from the `done` step.

---

### TASK 12 — Add "Rider dashboard" link to BottomNav for authenticated riders

File: `components/layout/BottomNav.tsx`

Read this file first. The bottom nav shows links based on the current route.
Add a "Rider" nav item that only shows when the user is a rider (i.e. has a
linked rider row).

This requires a small check: on mount, query `riders` where
`user_id = auth.uid()`. If a row exists, show a Truck icon linking to
`/rider/dashboard`. This check should be done lazily (no blocking render).

Add the Truck icon import and a new nav item:
```tsx
{ href: '/rider/dashboard', icon: <Truck className="h-5 w-5" />, label: 'Rider' }
```

Only render this item when `isRider === true`. Keep the check lightweight —
a single `.maybeSingle()` query in a useEffect.

---

## VERIFICATION CHECKLIST

- [ ] `supabase/migrations/20260325_rider_auth.sql` — adds `user_id` to riders,
      creates `rider_push_subscriptions` table with RLS
- [ ] `lib/webPush.ts` — exports `sendRiderPush(riderId, payload)`
- [ ] `lib/types.ts` — `RiderRow` includes `user_id` and `pin_hash`
- [ ] `app/api/rider/push/route.ts` — POST subscribes, DELETE unsubscribes;
      requires auth; looks up rider by user_id
- [ ] `app/api/rider/link-account/route.ts` — links auth user to existing
      rider row by phone; handles already-linked and not-found cases
- [ ] `app/api/rider/delivery/[deliveryId]/status/route.ts` — PATCH validates
      auth, validates rider owns delivery, updates status, notifies buyer
      via in-app notification + sendUserPush
- [ ] `app/api/vendor/orders/[orderId]/assign-rider/route.ts` — after
      assignment, sends in-app notification + sendRiderPush to rider if
      they have a user_id linked
- [ ] `app/rider/login/page.tsx` — new file; two-step: auth then phone-link;
      redirects to `/rider/dashboard` on success
- [ ] `app/rider/dashboard/page.tsx` — new file; auth-based; shows
      availability toggle, active jobs with full details (item, pickup,
      dropoff, fee), Picked up / Delivered action buttons, push prompt,
      real-time job updates
- [ ] `app/rider/my-deliveries/page.tsx` — auth-based (no phone lookup);
      uses `/api/rider/delivery/[id]/status` for updates; shows listing
      title and vendor name
- [ ] `app/delivery/requests/page.tsx` — real-time subscription added;
      rider details shown prominently after assignment
- [ ] `app/delivery/DeliveryClient.tsx` — WhatsApp fallback removed from
      post-submit flow; confirmation copy updated
- [ ] `components/layout/BottomNav.tsx` — "Rider" nav item appears for
      authenticated riders
- [ ] No TypeScript errors in any modified or created file
- [ ] Existing phone + PIN rider flow (`/rider/status`) still works for
      riders who haven't linked an account — backward compatible
- [ ] Existing vendor assign-rider flow in `/vendor/orders` still works —
      only change is that rider is now also notified in-app