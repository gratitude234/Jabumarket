# Jabumarket — Vendor & Delivery Audit Fixes
# Claude Code Implementation Prompt
#
# Source: Full vendor/delivery/rider audit — 23 issues across 3 systems.
# This prompt implements all 10 top-priority fixes in exact severity order.
# Scope: Critical (6) + High (8) issues. Medium/polish are separate pass.

---

## PHASE 1 — READ THESE FILES FIRST (do not write any code yet)

Read every file listed. After reading, write one line per file summarising
what it currently does and confirming you understand the gap to be fixed.

- `app/api/orders/create/route.ts`
  — Focus: delivery_fee source, accepts_delivery guard, listing_id null insert,
    delivery_address validation, day_schedule check
- `app/api/marketplace/notify-seller/route.ts`
  — Focus: is sendVendorPush called anywhere in this file?
- `app/vendor/orders/page.tsx`
  — Focus: OrderItem component — the rider panel block with the WhatsApp link;
    loadOrders() — what status filter exists (or doesn't)
- `app/vendor/page.tsx`
  — Focus: vendor fetch on mount, pause_until / accepts_orders logic
- `app/api/delivery/requests/[requestId]/cancel/route.ts`
  — Focus: does it notify the rider after cancellation?
- `components/listing/AskSellerButton.tsx`
  — Focus: onClick handler — is listing_stats_increment called for contact_click?
- `components/listing/RequestCallbackButton.tsx`
  — Focus: same — is listing_stats_increment called? Does success state return
    conversation_id to the user?
- `lib/vendorSchedule.ts`
  — Focus: isOpenNow() signature and what it expects
- `lib/webPush.ts`
  — Focus: sendVendorPush signature; confirm sendRiderPush also exists
- `lib/types.ts`
  — Focus: VendorRow — does it include delivery_fee, accepts_delivery,
    opens_at, closes_at, day_schedule, pause_until?

Only proceed to Phase 2 after reading all files.

---

## PHASE 2 — DB MIGRATION

Create file: `supabase/migrations/20260325_listing_id_nullable.sql`

```sql
-- Fix: delivery_requests.listing_id must be nullable so that food delivery
-- orders (which have no listing) can create a delivery_request row.
-- Without this, every food delivery order silently fails to create a
-- delivery_request — the entire food delivery loop is dead.

ALTER TABLE public.delivery_requests
  ALTER COLUMN listing_id DROP NOT NULL;
```

This is the single highest-priority fix in the codebase. Do not skip it.

---

## PHASE 3 — IMPLEMENT IN ORDER

Work through each task sequentially. Do not skip any. Do not reorder.

---

### TASK 1 — Fix delivery_fee, accepts_delivery, delivery_address, and day_schedule in orders/create

File: `app/api/orders/create/route.ts`

Four independent guard failures in the same file. Fix all four in one pass.

**1a — Read delivery_fee from DB, not client body**

Current broken code (around line 36):
```ts
const { ..., delivery_fee: rawDeliveryFee } = body;
const serverDeliveryFee = order_type === 'delivery'
  ? Math.max(0, Math.round(rawDeliveryFee ?? 0))
  : 0;
```

The vendor SELECT already exists. Expand it to include the fields we need:
```ts
const { data: vendor, error: vendorErr } = await admin
  .from('vendors')
  .select('id, user_id, vendor_type, accepts_orders, accepts_delivery,
           delivery_fee, opens_at, closes_at, day_schedule,
           bank_account_number, bank_account_name, bank_name')
  .eq('id', vendor_id)
  .single();
```

Then replace the rawDeliveryFee line:
```ts
// Always read from DB — never trust client-supplied delivery_fee
const serverDeliveryFee = order_type === 'delivery'
  ? Math.max(0, vendor.delivery_fee ?? 0)
  : 0;
```

Remove `delivery_fee` from body destructuring since it's no longer used.

**1b — Guard: accepts_delivery**

Immediately after the existing `!vendor.accepts_orders` guard, add:
```ts
if (order_type === 'delivery' && !vendor.accepts_delivery) {
  return jsonError(
    'This vendor does not accept delivery orders',
    400,
    'delivery_not_accepted'
  );
}
```

**1c — Guard: delivery_address required for delivery orders**

Immediately after the 1b guard:
```ts
if (order_type === 'delivery' && !delivery_address?.trim()) {
  return jsonError('Delivery address is required', 400, 'missing_address');
}
```

**1d — Guard: stall hours check**

Import isOpenNow at the top of the file:
```ts
import { isOpenNow } from '@/lib/vendorSchedule';
```

After the accepts_delivery guard (after 1c), add:
```ts
// Reject orders when the stall is outside its operating hours.
// isOpenNow returns true | false | null (null = no schedule set = allow).
const stallOpen = isOpenNow({
  opens_at: vendor.opens_at ?? null,
  closes_at: vendor.closes_at ?? null,
  day_schedule: (vendor.day_schedule as any) ?? null,
});
if (stallOpen === false) {
  return jsonError(
    'This stall is currently closed. Check their hours and try again.',
    400,
    'stall_closed'
  );
}
```

**Verify after all four changes:** The vendor SELECT now includes the new
fields, delivery_fee is read from DB, accepts_delivery is guarded,
delivery_address is validated, and stall hours are enforced.

---

### TASK 2 — Add sendVendorPush to notify-seller route

File: `app/api/marketplace/notify-seller/route.ts`

After the `await admin.from('notifications').insert(...)` call that already
exists, add a push notification:

```ts
// Push so vendor is alerted even when the browser tab is closed
try {
  const { sendVendorPush } = await import('@/lib/webPush');
  void sendVendorPush(vendor_id, {
    title: 'New inquiry',
    body: `Someone messaged you about "${listingTitle}"`,
    href: `/inbox/${conversation_id}`,
    tag: `inquiry-${conversation_id}`,
  });
} catch { /* push failure must never crash the notification */ }
```

Note: the `vendor_id` and `conversation_id` are already in scope from the
existing destructure at the top of the POST handler. `listingTitle` is
already computed from the listing fetch.

---

### TASK 3 — Remove WhatsApp link from vendor orders rider panel

File: `app/vendor/orders/page.tsx`

Find the RiderOption card inside the `OrderItem` component. It currently
renders a green WhatsApp anchor for each rider:

```tsx
{r.whatsapp && (
  <a
    href={`https://wa.me/${r.whatsapp.replace(/[^\d]/g, '')}`}
    target="_blank"
    rel="noreferrer"
    className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 no-underline hover:bg-emerald-100"
  >
    WhatsApp
  </a>
)}
```

Delete this entire block. Replace with nothing — the rider name and zone
are sufficient for selection. The rider will be notified in-app when assigned.

Also, remove `whatsapp` from the RiderOption type at the top of the file:
```ts
type RiderOption = { id: string; name: string | null; zone: string | null; whatsapp: string | null };
```
Change to:
```ts
type RiderOption = { id: string; name: string | null; zone: string | null; zones_covered: string[] };
```

Update the `loadRiders()` query to fetch `zones_covered` instead of
`whatsapp`:
```ts
const { data } = await supabase
  .from('riders')
  .select('id, name, zone, zones_covered')
  .eq('is_available', true)
  .eq('verified', true)
  .limit(5);
```

In the rider card, show zones_covered as a subtitle line below the name
and zone:
```tsx
{(r.zones_covered?.length > 0 || r.zone) && (
  <p className="text-[11px] text-zinc-500">
    Covers: {r.zones_covered?.length > 0
      ? r.zones_covered.join(', ')
      : r.zone}
  </p>
)}
```

---

### TASK 4 — Filter live orders to active statuses only

File: `app/vendor/orders/page.tsx`

Find `loadOrders()`. Currently:
```ts
const { data } = await supabase
  .from('orders')
  .select('...')
  .eq('vendor_id', vid)
  .order('created_at', { ascending: false })
  .limit(200);
```

Add a status filter so only active orders are fetched into the live queue:
```ts
const { data } = await supabase
  .from('orders')
  .select('id, conversation_id, buyer_id, items, total, status, payment_status,
           payment_method, receipt_url, pickup_note, order_type, delivery_address,
           created_at')
  .eq('vendor_id', vid)
  .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
  .order('created_at', { ascending: false });
```

Remove the `.limit(200)` — with the status filter it's bounded naturally.
History tab has its own `loadHistory()` — do not change that function.

---

### TASK 5 — Auto-resume vendor when pause_until elapses

File: `app/vendor/page.tsx`

Find the `useEffect` where the vendor row is fetched on mount. After the
vendor data is set in state (`setVendor(vendor)` or equivalent), add:

```ts
// Auto-resume if pause_until has elapsed — vendor forgot to un-pause
if (
  vendor.pause_until &&
  new Date(vendor.pause_until) < new Date() &&
  !vendor.accepts_orders
) {
  try {
    await supabase
      .from('vendors')
      .update({
        accepts_orders: true,
        pause_until: null,
        pause_reason: null,
      })
      .eq('id', vendor.id);
    // Update local state so UI reflects resumed state immediately
    setVendor((v: any) => v ? {
      ...v,
      accepts_orders: true,
      pause_until: null,
      pause_reason: null,
    } : v);
  } catch { /* non-critical — vendor can resume manually */ }
}
```

Read the actual vendor state variable name and setter before writing this —
they may differ from `vendor` / `setVendor`. Match whatever is in the file.

---

### TASK 6 — Notify rider when delivery is cancelled

File: `app/api/delivery/requests/[requestId]/cancel/route.ts`

After the `await admin.from('delivery_requests').update({ status: 'cancelled' })` call,
add rider notification:

```ts
// Notify the assigned rider if one exists
try {
  if (request.rider_id) {
    const { data: rider } = await admin
      .from('riders')
      .select('id, user_id')
      .eq('id', request.rider_id)
      .maybeSingle();

    if (rider?.user_id) {
      await admin.from('notifications').insert({
        user_id: rider.user_id,
        type: 'delivery_cancelled',
        title: 'Delivery cancelled',
        body: 'The buyer cancelled this delivery request.',
        href: '/rider/dashboard',
      });

      const { sendRiderPush } = await import('@/lib/webPush');
      void sendRiderPush(rider.id, {
        title: 'Delivery cancelled',
        body: 'The buyer cancelled this delivery request.',
        href: '/rider/dashboard',
        tag: `cancel-${requestId}`,
      });
    }
  }
} catch { /* non-critical */ }
```

Note: the `request` object is already fetched at the top of this route —
confirm it selects `rider_id` in its SELECT. If not, add `rider_id` to
the existing `admin.from('delivery_requests').select(...)` call.

---

### TASK 7 — Track contact_clicks in AskSellerButton

File: `components/listing/AskSellerButton.tsx`

Find the onClick/action handler that creates or opens a conversation
(this is the action that constitutes a contact click).

After the conversation is successfully created or fetched, add:

```ts
// Track contact_click for listing engagement stats and ranking
try {
  void supabase.rpc('listing_stats_increment', {
    p_listing_id: listingId,
    p_event: 'contact_click',
    p_amount: 1,
  });
} catch { /* non-critical */ }
```

Read the full file to find the right insertion point — it must fire once
per user intent, not on every render. Look for where the conversation is
created or the user is navigated to the inbox.

---

### TASK 8 — Track contact_clicks and return conversation_id in RequestCallbackButton

File: `components/listing/RequestCallbackButton.tsx`

**8a — Track the click:**

After a successful POST to `/api/marketplace/request-callback`, add the
same contact_click tracking as TASK 7:

```ts
void supabase.rpc('listing_stats_increment', {
  p_listing_id: listingId,
  p_event: 'contact_click',
  p_amount: 1,
});
```

**8b — Return conversation_id from the route and link buyer to it:**

First, update the API route `app/api/marketplace/request-callback/route.ts`
to return the conversation_id:

Find the section that inserts or finds the conversation:
```ts
let conversationId: string | null = null;

if (!existing) {
  const { data: newConvo } = await admin
    .from('conversations')
    .insert({ listing_id, buyer_id: user.id, vendor_id })
    .select('id')
    .single();
  conversationId = newConvo?.id ?? null;
} else {
  conversationId = existing.id;
}
```

Then update the success response:
```ts
return NextResponse.json({ ok: true, conversation_id: conversationId });
```

Back in `RequestCallbackButton.tsx`, after the fetch succeeds, read
`json.conversation_id` and update the success UI to show a chat link:

```tsx
// After: setSuccess(true) or equivalent
setConversationId(json.conversation_id ?? null);
```

Add `conversationId` to state and render in the success message:
```tsx
{success && (
  <div className="...">
    <p className="text-sm font-semibold text-emerald-700">
      Seller notified ✓
    </p>
    {conversationId && (
      <Link
        href={`/inbox/${conversationId}`}
        className="mt-1 text-xs font-medium text-zinc-600 underline"
      >
        Open chat →
      </Link>
    )}
  </div>
)}
```

Read the existing success state structure in the file before writing —
adapt to whatever pattern is already there.

---

### TASK 9 — Allow rider assignment from 'preparing' status, not just 'ready'

File: `app/vendor/orders/page.tsx`

Find the JSX block that conditionally renders the rider assignment panel.
Currently gated to:
```tsx
{order.order_type === 'delivery' && order.status === 'ready' && !assigned && (
```

Change `order.status === 'ready'` to include 'preparing':
```tsx
{order.order_type === 'delivery' &&
 ['preparing', 'ready'].includes(order.status) &&
 !assigned && (
```

No API changes needed — the assign-rider route has no status restriction.

---

### TASK 10 — Show suspension_reason and rejection_reason on vendor dashboard

File: `app/vendor/page.tsx`

Find where the vendor's pending/suspended/rejected state is displayed in
the dashboard. Currently the vendor sees a generic "suspended" or "under
review" message.

After reading the vendor row (which already includes `suspension_reason`,
`rejection_reason`, and `verification_status`), add contextual messages:

For suspended vendors, show the reason if available:
```tsx
{vendor.suspended_at && (
  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
    <p className="text-sm font-semibold text-red-800">Your account is suspended</p>
    {vendor.suspension_reason && (
      <p className="mt-1 text-xs text-red-700">{vendor.suspension_reason}</p>
    )}
    <p className="mt-2 text-xs text-red-600">
      Contact support to resolve this.
    </p>
  </div>
)}
```

For rejected food vendor applicants, show the rejection reason so they
know what to fix before resubmitting:
```tsx
{vendor.verification_status === 'rejected' && (
  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <p className="text-sm font-semibold text-amber-900">Application rejected</p>
    {vendor.rejection_reason && (
      <p className="mt-1 text-xs text-amber-800">{vendor.rejection_reason}</p>
    )}
    <p className="mt-2 text-xs text-amber-700">
      Fix the issues above and resubmit from the register page.
    </p>
  </div>
)}
```

Read the existing pending state UI carefully before inserting — match the
surrounding card/layout pattern exactly.

---

## PHASE 4 — MIGRATION DEPLOYMENT CHECKLIST

After all code changes are complete, present these steps as a checklist:

```
DB MIGRATIONS — run in Supabase SQL editor in this exact order:

[ ] supabase/migrations/20260325_listing_id_nullable.sql
    ALTER TABLE public.delivery_requests
      ALTER COLUMN listing_id DROP NOT NULL;

    Verify: INSERT INTO delivery_requests (order_id, buyer_id, vendor_id,
    dropoff, status) VALUES (...) — should succeed with listing_id absent.

[ ] Confirm REPLICA IDENTITY FULL on orders table (already in a previous
    migration but verify it's been run):
    SELECT relreplident FROM pg_class
    WHERE relname = 'orders';
    — should return 'f'. If not: ALTER TABLE public.orders REPLICA IDENTITY FULL;
```

---

## VERIFICATION CHECKLIST

After all tasks are complete, verify each item:

- [ ] `supabase/migrations/20260325_listing_id_nullable.sql` — created
- [ ] `app/api/orders/create/route.ts` — vendor SELECT includes `delivery_fee`,
      `accepts_delivery`, `opens_at`, `closes_at`, `day_schedule`; serverDeliveryFee
      reads from `vendor.delivery_fee`; accepts_delivery guard present;
      delivery_address guard present; isOpenNow check present
- [ ] `app/api/marketplace/notify-seller/route.ts` — `sendVendorPush` called
      after notification insert
- [ ] `app/vendor/orders/page.tsx` — WhatsApp anchor removed from rider card;
      loadRiders fetches `zones_covered`; loadOrders filters to active statuses;
      rider assignment panel shows from `preparing` onward
- [ ] `app/vendor/page.tsx` — auto-resume logic on mount; suspension_reason
      and rejection_reason displayed in UI
- [ ] `app/api/delivery/requests/[requestId]/cancel/route.ts` — rider
      notified after cancellation
- [ ] `components/listing/AskSellerButton.tsx` — `listing_stats_increment`
      called with `contact_click` on conversation open
- [ ] `components/listing/RequestCallbackButton.tsx` — `listing_stats_increment`
      called; route returns `conversation_id`; success UI shows "Open chat →" link
- [ ] `app/api/marketplace/request-callback/route.ts` — returns
      `conversation_id` in success response
- [ ] No TypeScript errors in any modified file
- [ ] Existing food order flow (pickup) still works — no regressions
- [ ] Existing marketplace order + payment flow still works
- [ ] Existing rider phone + PIN flow (`/rider/status`) still works

---

## FILES MODIFIED SUMMARY

```
supabase/migrations/20260325_listing_id_nullable.sql   (new)
app/api/orders/create/route.ts                         (modified)
app/api/marketplace/notify-seller/route.ts             (modified)
app/api/marketplace/request-callback/route.ts          (modified)
app/api/delivery/requests/[requestId]/cancel/route.ts  (modified)
app/vendor/orders/page.tsx                             (modified)
app/vendor/page.tsx                                    (modified)
components/listing/AskSellerButton.tsx                 (modified)
components/listing/RequestCallbackButton.tsx           (modified)
```