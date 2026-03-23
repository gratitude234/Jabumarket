Implement the following fixes to the Jabumarket messaging system. Work through each task in order. Audit the existing code in each file before making any changes.

---

## TASK 1 — Write order_id back to conversations when an order is created

File: `app/api/chat/send/route.ts`

After the order is successfully inserted (after the `if (orderErr)` block), update the conversation's `order_id` field:
```ts
if (order?.id) {
  await admin
    .from('conversations')
    .update({ order_id: order.id })
    .eq('id', body.conversation_id);
}
```

Place this immediately after the `// 3. Update conversation preview` block so order_id is always set when a food order is created through chat.

---

## TASK 2 — Send push notification to buyer when vendor replies

File: `app/inbox/[conversationId]/page.tsx`

The `send()` function already inserts an in-app notification for the other party. It does NOT call any push API. After the `notifications.insert` block inside `send()`, add a fire-and-forget push call:
```ts
// Fire push to other party (vendor→buyer or buyer→vendor)
void fetch('/api/user/push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: otherUserId,
    title: 'New message',
    body: text.length > 80 ? text.slice(0, 80) + '…' : text,
    href: `/inbox/${conversationId}`,
    tag: `msg-${conversationId}`,
  }),
}).catch(() => {});
```

Then check what `app/api/user/push/route.ts` currently does. If it only subscribes/unsubscribes and does not support sending a push to a user_id, create a new route `app/api/internal/push-user/route.ts`:
```ts
// app/api/internal/push-user/route.ts
// Internal-only: send a push notification to a user by user_id
// Called server-to-server or from client send() in conversation view

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

    if (!body.user_id || !body.title) {
      return NextResponse.json({ ok: false, message: 'Missing fields' }, { status: 400 });
    }

    // Security: caller must be a participant in the conversation referenced by href
    // (href format: /inbox/[conversationId])
    const conversationId = body.href?.split('/inbox/')?.[1]?.split('?')?.[0];
    if (conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('buyer_id, vendor_id')
        .eq('id', conversationId)
        .maybeSingle();

      if (!conv) return NextResponse.json({ ok: false }, { status: 403 });

      // Get caller's vendor_id if any
      const { data: vendor } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      const callerVendorId = vendor?.id ?? null;

      const isBuyer = conv.buyer_id === user.id;
      const isVendor = callerVendorId && conv.vendor_id === callerVendorId;
      if (!isBuyer && !isVendor) return NextResponse.json({ ok: false }, { status: 403 });
    }

    await sendUserPush(body.user_id, {
      title: body.title,
      body: body.body,
      href: body.href,
      tag: body.tag ?? `msg-${Date.now()}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message }, { status: 500 });
  }
}
```

Update the `send()` function in `app/inbox/[conversationId]/page.tsx` to call `/api/internal/push-user` instead of `/api/user/push`.

---

## TASK 3 — Notify vendor when buyer confirms payment

File: `app/api/orders/[orderId]/buyer-confirm/route.ts`

Read this file fully before editing. After the payment_status is updated to `buyer_confirmed`, add:

1. An in-app notification for the vendor:
```ts
// Notify vendor that buyer has confirmed payment
try {
  const { data: order } = await admin
    .from('orders')
    .select('vendor_id, total, conversation_id')
    .eq('id', orderId)
    .single();

  if (order) {
    const { data: vendor } = await admin
      .from('vendors')
      .select('user_id, name')
      .eq('id', order.vendor_id)
      .single();

    if (vendor?.user_id) {
      await admin.from('notifications').insert({
        user_id: vendor.user_id,
        type: 'payment_received',
        title: 'Buyer says payment sent',
        body: `₦${order.total.toLocaleString()} — check your account and confirm receipt.`,
        href: order.conversation_id ? `/inbox/${order.conversation_id}` : `/vendor/orders`,
      });

      void sendVendorPush(order.vendor_id, {
        title: 'Payment transfer received',
        body: `Buyer confirmed ₦${order.total.toLocaleString()} sent. Check and confirm.`,
        href: order.conversation_id ? `/inbox/${order.conversation_id}` : `/vendor/orders`,
        tag: `payment-${orderId}`,
      });
    }
  }
} catch (_) {}
```

Import `sendVendorPush` from `@/lib/webPush` at the top if not already imported.

---

## TASK 4 — Marketplace "Finalize deal" order flow

This is the highest-impact change. It extends the food order's OrderBubble + payment flow to non-food marketplace listing conversations.

### 4a — Create a new API route for marketplace orders

Create file: `app/api/orders/create-marketplace/route.ts`

This route creates a simple marketplace order (not food) with server-side validation:
```ts
// app/api/orders/create-marketplace/route.ts
// Buyer finalizes a marketplace deal: creates a lightweight order record
// tied to a conversation. No menu validation — price is user-agreed.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendVendorPush } from '@/lib/webPush';

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated');

    const body = await req.json() as {
      conversation_id: string;
      listing_id: string;
      vendor_id: string;
      agreed_price: number;
      payment_method: 'transfer' | 'cash';
      note?: string;
    };

    const { conversation_id, listing_id, vendor_id, agreed_price, payment_method, note } = body;

    if (!conversation_id || !listing_id || !vendor_id || !agreed_price) {
      return jsonError('Missing required fields', 400, 'bad_request');
    }
    if (!Number.isFinite(agreed_price) || agreed_price <= 0) {
      return jsonError('Invalid price', 400, 'invalid_price');
    }

    const admin = createSupabaseAdminClient();

    // Verify conversation belongs to this buyer
    const { data: conv } = await admin
      .from('conversations')
      .select('buyer_id, vendor_id, order_id')
      .eq('id', conversation_id)
      .single();

    if (!conv) return jsonError('Conversation not found', 404, 'not_found');
    if (conv.buyer_id !== user.id) return jsonError('Forbidden', 403, 'forbidden');
    if (conv.vendor_id !== vendor_id) return jsonError('Vendor mismatch', 400, 'vendor_mismatch');
    if (conv.order_id) return jsonError('This conversation already has an order', 400, 'order_exists');

    // Fetch listing title for the order payload
    const { data: listing } = await admin
      .from('listings')
      .select('title, price, category')
      .eq('id', listing_id)
      .single();

    if (!listing) return jsonError('Listing not found', 404, 'listing_not_found');

    // Fetch vendor bank details for transfer orders
    const { data: vendor } = await admin
      .from('vendors')
      .select('user_id, name, bank_name, bank_account_number, bank_account_name')
      .eq('id', vendor_id)
      .single();

    if (!vendor) return jsonError('Vendor not found', 404, 'vendor_not_found');

    if (payment_method === 'transfer') {
      const hasBank = !!(vendor.bank_account_number && vendor.bank_account_name && vendor.bank_name);
      if (!hasBank) {
        return jsonError(
          'This seller has not set up bank transfer details yet. Ask them to add their bank details in their profile, or use cash payment.',
          400,
          'vendor_no_bank_details'
        );
      }
    }

    // Build a lightweight order payload compatible with OrderBubble
    const orderPayload = {
      lines: [{
        item_id: listing_id,
        name: listing.title ?? 'Item',
        emoji: '🏷️',
        category: listing.category ?? 'Item',
        qty: 1,
        unit_name: 'piece',
        price_per_unit: agreed_price,
        line_total: agreed_price,
      }],
      total: agreed_price,
      order_type: 'pickup' as const,
    };

    const textBody = `🏷️ Marketplace order — ${listing.title ?? 'Item'} — ₦${agreed_price.toLocaleString()}`;

    // Insert order message
    const { data: msg, error: msgErr } = await admin
      .from('messages')
      .insert({
        conversation_id,
        sender_id: user.id,
        body: textBody,
        type: 'order',
        order_payload: orderPayload,
      })
      .select()
      .single();

    if (msgErr) return jsonError(msgErr.message, 500, 'msg_insert_failed');

    // Insert order record
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .insert({
        conversation_id,
        message_id: msg.id,
        buyer_id: user.id,
        vendor_id,
        items: orderPayload,
        total: agreed_price,
        note: note ?? null,
        payment_method,
        order_type: 'pickup',
      })
      .select()
      .single();

    if (orderErr) return jsonError(orderErr.message, 500, 'order_insert_failed');

    // Link order to conversation + update preview
    await admin
      .from('conversations')
      .update({
        order_id: order.id,
        last_message_at: new Date().toISOString(),
        last_message_preview: textBody,
      })
      .eq('id', conversation_id);

    // Notify vendor
    if (vendor.user_id) {
      try {
        await admin.from('notifications').insert({
          user_id: vendor.user_id,
          type: 'new_order',
          title: 'New marketplace order',
          body: `₦${agreed_price.toLocaleString()} — ${listing.title ?? 'Item'}`,
          href: `/inbox/${conversation_id}`,
        });
        void sendVendorPush(vendor_id, {
          title: 'New order from buyer',
          body: `₦${agreed_price.toLocaleString()} — ${listing.title ?? 'Item'}`,
          href: `/inbox/${conversation_id}`,
          tag: `order-${order.id}`,
        });
      } catch (_) {}
    }

    return NextResponse.json({ ok: true, message: msg, order });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}
```

### 4b — Create the FinalizeDealButton component

Create file: `components/chat/FinalizeDealButton.tsx`

This is a client component that renders inside the conversation view for non-food listings. It opens an inline panel where the buyer enters the agreed price and payment method, then calls `/api/orders/create-marketplace`.
```tsx
'use client';
// components/chat/FinalizeDealButton.tsx
// Shown inside a marketplace conversation (non-food vendor) after enough
// messages have been exchanged. Lets the buyer formalize an agreed deal
// as a structured order without leaving the chat.

import { useState } from 'react';
import { Loader2, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  conversationId: string;
  listingId: string;
  vendorId: string;
  listingTitle?: string;
  listingPrice?: number | null;
  onOrderCreated: (orderId: string) => void;
};

function onlyDigits(s: string) {
  return s.replace(/[^\d]/g, '');
}

export default function FinalizeDealButton({
  conversationId,
  listingId,
  vendorId,
  listingTitle,
  listingPrice,
  onOrderCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [priceDigits, setPriceDigits] = useState(listingPrice ? String(listingPrice) : '');
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'cash'>('transfer');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) return null;

  async function handleCreate() {
    const price = parseInt(priceDigits, 10);
    if (!priceDigits || !Number.isFinite(price) || price <= 0) {
      setError('Enter the agreed price');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/orders/create-marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          listing_id: listingId,
          vendor_id: vendorId,
          agreed_price: price,
          payment_method: paymentMethod,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? 'Failed to create order');
      setDone(true);
      onOrderCreated(json.order.id);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="mx-4 mb-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 transition flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Finalize deal
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-2">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-900">Finalize this deal</p>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(null); }}
            className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {listingTitle && (
          <p className="text-xs text-zinc-500 truncate">🏷️ {listingTitle}</p>
        )}

        {/* Agreed price */}
        <div>
          <label className="block text-xs font-semibold text-zinc-500 mb-1">Agreed price</label>
          <div className="flex items-center gap-2 rounded-xl border bg-zinc-50 px-3 py-2.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-zinc-900/10">
            <span className="text-sm font-semibold text-zinc-400">₦</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder={listingPrice ? listingPrice.toLocaleString('en-NG') : '0'}
              value={priceDigits ? parseInt(priceDigits, 10).toLocaleString('en-NG') : ''}
              onChange={(e) => setPriceDigits(onlyDigits(e.target.value))}
              className="w-full bg-transparent text-sm font-semibold text-zinc-900 outline-none placeholder:font-normal placeholder:text-zinc-400"
              autoFocus
            />
          </div>
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-xs font-semibold text-zinc-500 mb-1">Payment method</label>
          <div className="grid grid-cols-2 gap-2">
            {(['transfer', 'cash'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={cn(
                  'rounded-xl border py-2 text-xs font-semibold transition',
                  paymentMethod === m
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                )}
              >
                {m === 'transfer' ? '🏦 Bank transfer' : '💵 Cash on pickup'}
              </button>
            ))}
          </div>
        </div>

        {/* Optional note */}
        <textarea
          placeholder="Add a note — e.g. pickup location, condition agreed…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-xl border bg-zinc-50 px-3 py-2.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400"
        />

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="button"
          onClick={handleCreate}
          disabled={loading || !priceDigits}
          className={cn(
            'w-full rounded-2xl py-3 text-sm font-semibold text-white transition',
            loading || !priceDigits
              ? 'bg-zinc-300 cursor-not-allowed'
              : 'bg-zinc-900 hover:bg-zinc-700'
          )}
        >
          {loading
            ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            : <span className="flex items-center justify-center gap-2"><CheckCircle2 className="h-4 w-4" /> Create order</span>
          }
        </button>

        <p className="text-[11px] text-zinc-400 text-center">
          This creates a formal order record. Both parties will be notified.
        </p>
      </div>
    </div>
  );
}
```

### 4c — Wire FinalizeDealButton into the conversation view

File: `app/inbox/[conversationId]/page.tsx`

1. Add import at the top:
```ts
import FinalizeDealButton from '@/components/chat/FinalizeDealButton';
```

2. Add state for whether to show the button:
```ts
const [hasMarketplaceOrder, setHasMarketplaceOrder] = useState(false);
```

3. In the initial load `useEffect`, after loading messages, detect if the conversation already has an order tied to it:
```ts
// Hide FinalizeDealButton if conversation already has an order
if (conv.order_id) setHasMarketplaceOrder(true);
```

4. Determine whether to show the button. Add this derived value after the `canShowMealButton` declaration:
```ts
// Show Finalize Deal for non-food vendors with no order yet, after 2+ messages
const isNonFoodVendor = vendor?.vendor_type !== 'food';
const canShowFinalizeDeal =
  !isVendorSide &&
  isNonFoodVendor &&
  !hasMarketplaceOrder &&
  messages.filter(m => !m.id.startsWith('opt-')).length >= 2;
```

5. Render the button just above the input bar (before `{/* Input bar */}`):
```tsx
{canShowFinalizeDeal && meta && (
  <FinalizeDealButton
    conversationId={conversationId}
    listingId={meta.listing_id ?? ''}
    vendorId={meta.vendor_id}
    listingTitle={listing?.title ?? undefined}
    listingPrice={null}
    onOrderCreated={() => setHasMarketplaceOrder(true)}
  />
)}
```

6. When the listing price is available in meta, pass it. The listing price is not currently in the conversation meta — the listing join only selects `id, title, image_url, status`. Update the listing select in the conversations query inside the initial load to also fetch `price` and `price_label`:
```ts
listing:listings(id, title, image_url, status, price, price_label)
```
Update `ConversationMeta.listing` type to include `price: number | null; price_label: string | null`.
Pass `listingPrice={listing?.price ?? null}` to FinalizeDealButton.

### 4d — Update OrderBubble header label for non-food orders

File: `components/chat/OrderBubble.tsx`

Add a `orderLabel` prop to OrderBubble:
```ts
orderLabel?: string;
```

Change the hardcoded header from:
```tsx
<span className="text-xs font-semibold text-white">🛒 Meal Order</span>
```
To:
```tsx
<span className="text-xs font-semibold text-white">{props.orderLabel ?? '🛒 Meal Order'}</span>
```

In `app/inbox/[conversationId]/page.tsx`, detect order type when passing to OrderBubble. If `vendor?.vendor_type !== 'food'`, pass `orderLabel="🏷️ Marketplace Order"` to the OrderBubble component.

---

## VERIFICATION CHECKLIST

After implementing all tasks, confirm:

- [ ] `app/api/chat/send/route.ts` — writes `order_id` to conversations after food order creation
- [ ] `app/api/internal/push-user/route.ts` — new file exists, secured with conversation participant check
- [ ] `app/inbox/[conversationId]/page.tsx` — `send()` calls `/api/internal/push-user` after the notifications insert
- [ ] `app/api/orders/[orderId]/buyer-confirm/route.ts` — notifies vendor in-app + push when buyer confirms payment
- [ ] `app/api/orders/create-marketplace/route.ts` — new file exists, creates order + links to conversation + notifies vendor
- [ ] `components/chat/FinalizeDealButton.tsx` — new file exists
- [ ] `app/inbox/[conversationId]/page.tsx` — imports and renders FinalizeDealButton for non-food conversations with 2+ messages
- [ ] `components/chat/OrderBubble.tsx` — accepts `orderLabel` prop, defaults to "🛒 Meal Order"
- [ ] No TypeScript errors in any modified or created file
- [ ] Existing food order flow is completely untouched — MealBuilder, OrderBubble, payment panel all still work as before