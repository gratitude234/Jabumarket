# Jabumarket — Buy Flow UX Improvements
# Claude Code Implementation Prompt

---

## PHASE 1 — READ THESE FILES FIRST (do not write any code yet)

Read every file listed fully. After reading, write one line per file summarising what it does and flag anything relevant to the tasks below.

- `app/listing/[id]/page.tsx` — full file. Note: where AskSellerButton renders (mobile bottom bar + desktop), the isSold/isActive/negotiable flags, vendor_type usage, and the listing data shape
- `app/inbox/[conversationId]/page.tsx` — full file. Note: the canShowFinalizeDeal logic, the 2-message gate, the quick reply chips section, the hasMarketplaceOrder state, and where FinalizeDealButton renders
- `components/chat/FinalizeDealButton.tsx` — full file. Note: all props, the open/closed panel state, the handleCreate function and what it calls
- `components/listing/AskSellerButton.tsx` — full file. Note: openConversation(), handleMessage(), handleOffer(), the authWall inline state
- `app/explore/page.tsx` — focus on: the ListingCard component at the bottom, how it links to listings, its vendor/stats props
- `app/api/orders/create-marketplace/route.ts` — full file. Note: required body fields, the conversation_id check, vendor bank guard

Only proceed to Phase 2 after reading all files.

---

## PHASE 2 — IMPLEMENT

Work through every task in order. Do not skip any.

---

### TASK 1 — Remove the 2-message gate on FinalizeDealButton

File: `app/inbox/[conversationId]/page.tsx`

Find this block:
```ts
const canShowFinalizeDeal =
  !isVendorSide &&
  isNonFoodVendor &&
  !hasMarketplaceOrder &&
  messages.filter(m => !m.id.startsWith('opt-')).length >= 2;
```

Remove the `.filter(...).length >= 2` condition entirely. Replace with:
```ts
const canShowFinalizeDeal =
  !isVendorSide &&
  isNonFoodVendor &&
  !hasMarketplaceOrder;
```

The buyer should be able to finalize immediately — they shouldn't have to send fake messages just to unlock the purchase button.

---

### TASK 2 — Replace passive quick reply chips with action-oriented chips

File: `app/inbox/[conversationId]/page.tsx`

Find the quick reply chips section:
```tsx
{messages.length === 0 ? (
  <div className="bg-white px-4 pt-3 pb-0">
    <div className="flex flex-wrap gap-2">
      {["Is this still available?", "Can you do lower?", "Where can we meet?"].map((chip) => (
        ...
      ))}
    </div>
  </div>
) : null}
```

Replace the entire block with this new version. The chips must be context-aware: if the vendor is non-food and no order exists yet, show transactional chips. Always show the passive chips below as secondary options.

```tsx
{messages.length === 0 && !isVendorSide ? (
  <div className="bg-white px-4 pt-3 pb-0 space-y-2">
    {/* Primary action chips — non-food only */}
    {isNonFoodVendor && !hasMarketplaceOrder && (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowFinalizePanelFromChip(true)}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          I'll take it — sort payment
        </button>
        {listing?.price && (
          <button
            type="button"
            onClick={() => send(`I'd like to make an offer on "${listing?.title ?? 'this item'}"`)}
            disabled={sending}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Make an offer
          </button>
        )}
      </div>
    )}
    {/* Passive chips */}
    <div className="flex flex-wrap gap-2">
      {["Is this still available?", "Where can we meet?"].map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => send(chip)}
          disabled={sending}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {chip}
        </button>
      ))}
    </div>
  </div>
) : null}
```

Add a new state variable at the top of the component (near the other useState declarations):
```ts
const [showFinalizePanelFromChip, setShowFinalizePanelFromChip] = useState(false);
```

Then update the FinalizeDealButton render to pass this state so tapping "I'll take it" opens the panel immediately:

Find the FinalizeDealButton render block and update:
```tsx
{canShowFinalizeDeal && meta && (
  <FinalizeDealButton
    conversationId={conversationId}
    listingId={meta.listing_id ?? ''}
    vendorId={meta.vendor_id}
    listingTitle={listing?.title ?? undefined}
    listingPrice={listing?.price ?? null}
    openOnMount={showFinalizePanelFromChip}
    onOrderCreated={() => setHasMarketplaceOrder(true)}
  />
)}
```

---

### TASK 3 — Update FinalizeDealButton to support openOnMount prop

File: `components/chat/FinalizeDealButton.tsx`

Add `openOnMount?: boolean` to the Props type:
```ts
type Props = {
  conversationId: string;
  listingId: string;
  vendorId: string;
  listingTitle?: string;
  listingPrice?: number | null;
  openOnMount?: boolean;
  onOrderCreated: (orderId: string) => void;
};
```

Update the component to accept and use it:
```tsx
export default function FinalizeDealButton({
  conversationId,
  listingId,
  vendorId,
  listingTitle,
  listingPrice,
  openOnMount = false,
  onOrderCreated,
}: Props) {
  const [open, setOpen] = useState(openOnMount);
  ...
```

Change `const [open, setOpen] = useState(false)` to `const [open, setOpen] = useState(openOnMount)`.

Also, after a successful order creation, show a success banner instead of just hiding the button. Replace the `setDone(true)` section in `handleCreate`:

After `onOrderCreated(json.order.id)` fires, show:
```tsx
if (done) {
  return (
    <div className="mx-4 mb-2">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold text-emerald-800">Order created!</p>
        </div>
        <a
          href="/my-orders"
          className="shrink-0 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 no-underline"
        >
          Track order →
        </a>
      </div>
    </div>
  );
}
```

Replace the existing `if (done) return null;` with this JSX block above.

---

### TASK 4 — Add "Buy now" button to listing detail page

File: `app/listing/[id]/page.tsx`

Add a new import at the top:
```ts
import BuyNowButton from '@/components/listing/BuyNowButton';
```

**Where to show it:**
- Only for non-food vendors (`vendor?.vendor_type !== 'food'`)
- Only when `isActive && !isSold`
- Show it prominently — as the PRIMARY action, with "Message seller" becoming secondary

**Mobile bottom bar** — find the mobile sticky bottom bar section and update it:

Replace:
```tsx
<div className="flex-1">
  <AskSellerButton
    listingId={listing.id}
    vendorId={listing.vendor_id}
    ...
  />
</div>
<SaveButton listingId={listing.id} variant="icon" className="shrink-0" />
```

With:
```tsx
{vendor?.vendor_type !== 'food' ? (
  <>
    <div className="flex-1">
      <BuyNowButton
        listingId={listing.id}
        vendorId={listing.vendor_id}
        listingTitle={listing.title ?? undefined}
        listingPrice={listing.price}
      />
    </div>
    <AskSellerButton
      listingId={listing.id}
      vendorId={listing.vendor_id}
      listingTitle={listing.title ?? undefined}
      listingPrice={listing.price}
      negotiable={listing.negotiable ?? false}
      isSold={isSold}
      variant="icon"
    />
    <SaveButton listingId={listing.id} variant="icon" className="shrink-0" />
  </>
) : (
  <>
    <div className="flex-1">
      <AskSellerButton
        listingId={listing.id}
        vendorId={listing.vendor_id}
        listingTitle={listing.title ?? undefined}
        listingPrice={listing.price}
        negotiable={listing.negotiable ?? false}
        isSold={isSold}
      />
    </div>
    <SaveButton listingId={listing.id} variant="icon" className="shrink-0" />
  </>
)}
```

**Desktop CTAs** — inside `{/* Desktop CTAs — hidden on mobile (bottom bar handles it) */}`, prepend the BuyNowButton before AskSellerButton for non-food vendors:

```tsx
{listing.vendor_id ? (
  <div className="hidden lg:block space-y-2 pt-1">
    {vendor?.vendor_type !== 'food' && isActive && !isSold && (
      <BuyNowButton
        listingId={listing.id}
        vendorId={listing.vendor_id}
        listingTitle={listing.title ?? undefined}
        listingPrice={listing.price}
        size="full"
      />
    )}
    <AskSellerButton ... />
    ...
  </div>
) : null}
```

---

### TASK 5 — Create the BuyNowButton component

Create file: `components/listing/BuyNowButton.tsx`

This component does everything FinalizeDealButton does, but it works from the listing page before a conversation exists. When tapped:
1. Opens an inline panel (same design as FinalizeDealButton)
2. On submit: first creates/finds a conversation, then calls `/api/orders/create-marketplace`
3. On success: redirects to `/inbox/[conversationId]` where the OrderBubble is already visible

```tsx
'use client';
// components/listing/BuyNowButton.tsx
// Primary purchase CTA on listing detail pages for non-food vendors.
// Creates a conversation + marketplace order in one tap, then navigates to inbox.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShoppingBag, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

type Props = {
  listingId: string;
  vendorId: string;
  listingTitle?: string;
  listingPrice?: number | null;
  size?: 'full' | 'compact';
};

function onlyDigits(s: string) {
  return s.replace(/[^\d]/g, '');
}

export default function BuyNowButton({
  listingId,
  vendorId,
  listingTitle,
  listingPrice,
  size = 'full',
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [priceDigits, setPriceDigits] = useState(listingPrice ? String(listingPrice) : '');
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'cash'>('transfer');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authWall, setAuthWall] = useState(false);

  async function getOrCreateConversation(userId: string): Promise<string | null> {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('listing_id', listingId)
      .eq('buyer_id', userId)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error: insertErr } = await supabase
      .from('conversations')
      .insert({ listing_id: listingId, buyer_id: userId, vendor_id: vendorId })
      .select('id')
      .single();

    if (insertErr || !created) {
      // Race: try fetching again
      const { data: retry } = await supabase
        .from('conversations')
        .select('id')
        .eq('listing_id', listingId)
        .eq('buyer_id', userId)
        .maybeSingle();
      return retry?.id ?? null;
    }

    return created.id;
  }

  async function handleBuyNow() {
    const price = parseInt(priceDigits, 10);
    if (!priceDigits || !Number.isFinite(price) || price <= 0) {
      setError('Enter the price');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user) {
        setAuthWall(true);
        setLoading(false);
        return;
      }

      const conversationId = await getOrCreateConversation(user.id);
      if (!conversationId) throw new Error('Could not open conversation');

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

      // Navigate to inbox where the OrderBubble + payment flow is ready
      router.push(`/inbox/${conversationId}`);
    } catch (err: any) {
      if (err.message?.includes('bank transfer details')) {
        setError("This seller hasn't added their bank account yet. Try cash payment or message them instead.");
      } else if (err.message?.includes('already has an order')) {
        setError('You already have an active order for this item. Check your inbox.');
      } else {
        setError(err.message ?? 'Something went wrong. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  // Auth wall
  if (authWall) {
    return (
      <div className="rounded-2xl border bg-zinc-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-900">Sign in to buy</p>
          <button type="button" onClick={() => setAuthWall(false)}>
            <X className="h-4 w-4 text-zinc-400" />
          </button>
        </div>
        <p className="text-xs text-zinc-600">Create a free account in under a minute.</p>
        <div className="flex gap-2">
          <a
            href={`/signup?next=/listing/${listingId}`}
            className="flex-1 rounded-2xl bg-zinc-900 px-4 py-2.5 text-center text-sm font-semibold text-white no-underline hover:bg-zinc-800"
          >
            Sign up free
          </a>
          <a
            href={`/login?next=/listing/${listingId}`}
            className="flex-1 rounded-2xl border bg-white px-4 py-2.5 text-center text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
          >
            Log in
          </a>
        </div>
      </div>
    );
  }

  // Closed state — just the button
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition',
          size === 'full'
            ? 'w-full px-4 py-3 text-sm bg-zinc-900 text-white hover:bg-zinc-700'
            : 'px-4 py-2.5 text-sm bg-zinc-900 text-white hover:bg-zinc-700'
        )}
      >
        <ShoppingBag className="h-4 w-4" />
        Buy now
      </button>
    );
  }

  // Open panel
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900">
          {listingTitle ? `Buy: ${listingTitle.slice(0, 40)}${listingTitle.length > 40 ? '…' : ''}` : 'Complete purchase'}
        </p>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Price */}
      <div>
        <label className="block text-xs font-semibold text-zinc-500 mb-1">
          {listingPrice ? 'Confirm price' : 'Agreed price'}
        </label>
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
        <label className="block text-xs font-semibold text-zinc-500 mb-1">Payment</label>
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
        {paymentMethod === 'transfer' && (
          <p className="mt-1 text-[11px] text-zinc-400">
            Seller's bank details will appear in chat after ordering.
          </p>
        )}
      </div>

      {/* Note */}
      <textarea
        placeholder="Add a note — e.g. pickup location, condition question…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="w-full resize-none rounded-xl border bg-zinc-50 px-3 py-2.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400"
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="button"
        onClick={handleBuyNow}
        disabled={loading || !priceDigits}
        className={cn(
          'w-full rounded-2xl py-3 text-sm font-semibold text-white transition',
          loading || !priceDigits
            ? 'bg-zinc-300 cursor-not-allowed'
            : 'bg-zinc-900 hover:bg-zinc-700'
        )}
      >
        {loading ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        ) : (
          <span className="flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Confirm order
          </span>
        )}
      </button>

      <p className="text-[11px] text-zinc-400 text-center">
        Creates an order and opens chat. No payment taken yet.
      </p>
    </div>
  );
}
```

---

### TASK 6 — Add listing context strip inside conversation

File: `app/inbox/[conversationId]/page.tsx`

The conversation header currently shows a 40×40px thumbnail with just the listing title. Add a collapsible listing context card that shows below the header — visible by default, collapsible so it doesn't crowd the chat on small screens.

Find the top bar section. After the role context strip (the green/indigo banner that says "You're the seller/buyer in this chat"), add:

```tsx
{/* Listing context strip — collapsible */}
{listing && !loading && (
  <ListingContextStrip listing={listing} />
)}
```

Create the `ListingContextStrip` component inside the same file (or as a separate file — your choice based on size):

```tsx
function ListingContextStrip({
  listing,
}: {
  listing: { id: string; title: string | null; image_url: string | null; status: string | null; price?: number | null; price_label?: string | null };
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="w-full border-t bg-zinc-50 px-4 py-1.5 text-left text-[11px] text-zinc-400 hover:bg-zinc-100 flex items-center justify-between"
      >
        <span className="truncate">{listing.title ?? 'Listing'}</span>
        <span className="shrink-0 ml-2">▾ Show details</span>
      </button>
    );
  }

  const isSold = listing.status === 'sold';
  const priceText = (listing as any).price != null
    ? `₦${Number((listing as any).price).toLocaleString('en-NG')}`
    : (listing as any).price_label?.trim() || null;

  return (
    <div className="border-t bg-zinc-50 px-4 py-2.5 flex items-center gap-3">
      {listing.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.image_url}
          alt=""
          className="h-10 w-10 shrink-0 rounded-xl object-cover border border-zinc-200"
        />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-xl bg-zinc-200 border border-zinc-200" />
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate text-xs font-semibold text-zinc-900">{listing.title ?? 'Listing'}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {priceText && (
            <span className="text-xs font-bold text-zinc-900">{priceText}</span>
          )}
          {isSold && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">SOLD</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a
          href={`/listing/${listing.id}`}
          className="text-[11px] text-zinc-500 hover:text-zinc-900 no-underline"
        >
          View →
        </a>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-zinc-400 hover:text-zinc-600"
          aria-label="Hide listing details"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
```

For this to work, the listing data in the conversation meta needs `price` and `price_label`. The current query only selects `id, title, image_url, status`. Update the listing join in the conversation query inside the initial load `useEffect`:

Find:
```ts
listing:listings(id, title, image_url, status),
```
Replace with:
```ts
listing:listings(id, title, image_url, status, price, price_label),
```

Also update the `ConversationMeta.listing` type to include these fields:
```ts
listing: {
  id: string;
  title: string | null;
  image_url: string | null;
  status: string | null;
  price: number | null;
  price_label: string | null;
} | null;
```

Add `useState` import for collapsed state (it's already imported — just use it in the component).

---

### TASK 7 — Fix auth redirect on AskSellerButton (replace inline auth wall with redirect)

File: `components/listing/AskSellerButton.tsx`

The current auth wall shows an inline panel when a user is not logged in. This breaks intent — the user was mid-flow on the listing page and now has to complete sign-up inside a small inline component, then re-tap.

In `openConversation()`, when there's no user, instead of `setAuthWall(true)`, redirect to login with the listing page as the return destination:

Find:
```ts
if (!user) {
  setAuthWall(true);
  return null;
}
```

Replace with:
```ts
if (!user) {
  // Redirect to login with return destination so buyer comes back to the listing
  window.location.href = `/login?next=/listing/${listingId}`;
  return null;
}
```

Do the same in `handleOffer()` where `setAuthWall(true)` also appears.

Remove the `authWall` state variable and the entire `{authWall && (...)}` JSX block at the bottom of the component since it's no longer needed.

---

### TASK 8 — Add a quick "message seller" icon to listing cards on /explore

File: `app/explore/page.tsx`

The `ListingCard` component renders as a plain `<Link>` — the whole card is tappable. Add a small chat icon button in the bottom-right of the card body that opens a conversation without navigating to the listing detail.

This requires the card to know the vendor's user context. The card already receives `vendor` as a prop which includes `vendor_id` on the listing. Add a chat icon that calls a minimal `openConversation` (same logic as AskSellerButton but inline).

Find the `ListingCard` component. In the bottom row (where location and timeAgo are shown), add a chat button to the right:

```tsx
{/* Quick contact button — only for active, non-food listings */}
{!isSold && !isInactive && listing.vendor_id && vendor?.vendor_type !== 'food' && (
  <QuickMessageButton
    listingId={listing.id}
    vendorId={listing.vendor_id}
  />
)}
```

Add the `QuickMessageButton` component just above the `ListingCard` function:

```tsx
function QuickMessageButton({ listingId, vendorId }: { listingId: string; vendorId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;
    setLoading(true);

    const { createClient } = await import('@supabase/supabase-js');
    const { supabase } = await import('@/lib/supabase');
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;

    if (!user) {
      window.location.href = `/login?next=/listing/${listingId}`;
      return;
    }

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('listing_id', listingId)
      .eq('buyer_id', user.id)
      .maybeSingle();

    if (existing?.id) {
      router.push(`/inbox/${existing.id}`);
      return;
    }

    const { data: created } = await supabase
      .from('conversations')
      .insert({ listing_id: listingId, buyer_id: user.id, vendor_id: vendorId })
      .select('id')
      .single();

    if (created?.id) {
      router.push(`/inbox/${created.id}`);
    } else {
      router.push(`/listing/${listingId}`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-label="Message seller"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-40 transition"
    >
      {loading
        ? <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
        : <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      }
    </button>
  );
}
```

Add `useRouter` to the imports from `next/navigation` at the top of explore/page.tsx if not already imported.

Add `useState` usage — check if it's already imported and add `useState` if not.

Place the `QuickMessageButton` render inside the existing stats row in ListingCard. Find the line that renders timeAgo and the saves badge, and add the button to the right of the timestamp:

```tsx
<div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
  <span className="truncate">{listing.location ?? "—"}</span>
  <div className="flex shrink-0 items-center gap-2">
    {stats && stats.saves > 0 && (
      <span ...>🔖 {stats.saves}</span>
    )}
    <span>{listing.created_at ? timeAgo(listing.created_at) : ""}</span>
    {/* Quick message button */}
    {!isSold && !isInactive && listing.vendor_id && vendor?.vendor_type !== 'food' && (
      <QuickMessageButton
        listingId={listing.id}
        vendorId={listing.vendor_id as string}
      />
    )}
  </div>
</div>
```

---

## VERIFICATION CHECKLIST

After all tasks are complete:

- [ ] `app/inbox/[conversationId]/page.tsx` — `canShowFinalizeDeal` has NO `messages.length >= 2` gate
- [ ] `app/inbox/[conversationId]/page.tsx` — quick reply chips show "I'll take it — sort payment" and "Make an offer" as primary chips for non-food vendors, with "Is this still available?" and "Where can we meet?" as secondary chips
- [ ] `app/inbox/[conversationId]/page.tsx` — `showFinalizePanelFromChip` state exists; tapping "I'll take it" chip opens the FinalizeDealButton panel immediately
- [ ] `app/inbox/[conversationId]/page.tsx` — listing context strip (image, title, price) is visible below the role banner, collapsible with X button
- [ ] `app/inbox/[conversationId]/page.tsx` — listing query includes `price, price_label`; `ConversationMeta.listing` type includes these fields
- [ ] `components/chat/FinalizeDealButton.tsx` — accepts `openOnMount` prop, defaults to `false`; panel opens immediately when `openOnMount={true}`
- [ ] `components/chat/FinalizeDealButton.tsx` — after successful order, shows "Order created! Track order →" banner instead of returning null
- [ ] `components/listing/BuyNowButton.tsx` — new file exists; creates conversation + marketplace order in one flow; redirects to `/inbox/[conversationId]` on success; handles auth redirect; handles vendor_no_bank_details error gracefully
- [ ] `app/listing/[id]/page.tsx` — imports BuyNowButton; mobile bottom bar shows BuyNowButton as primary CTA for non-food vendors with AskSellerButton as icon; desktop CTAs show BuyNowButton first for non-food active listings
- [ ] `components/listing/AskSellerButton.tsx` — auth wall replaced with `window.location.href = /login?next=/listing/[id]` redirect; `authWall` state and inline JSX removed
- [ ] `app/explore/page.tsx` — `QuickMessageButton` component exists above `ListingCard`; chat icon appears on active non-food listing cards; tapping it opens/creates a conversation and navigates to inbox; tapping does NOT navigate to listing detail
- [ ] No TypeScript errors in any modified file
- [ ] Food vendor listing flow (MealBuilder, food order) is completely untouched
- [ ] Existing offer flow in AskSellerButton still works correctly