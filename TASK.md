# Jabumarket — Mandatory Receipt Upload
# Claude Code Implementation Prompt
#
# Context: Receipt upload is currently optional (labelled "optional but recommended").
# This makes it too easy for buyers to falsely claim payment. Making it mandatory
# means the vendor always has proof before confirming — every transfer dispute
# has a paper trail. Cash orders are completely unaffected.

---

## PHASE 1 — READ THESE FILES FIRST (do not write any code yet)

Read every file listed. After reading, write one line per file summarising the
current receipt/payment flow and flag anything relevant to the tasks below.

- `components/chat/OrderBubble.tsx` — full file. Focus on: BuyerPaymentPanel
  component, the receiptUploaded state, the handleConfirm function, the
  "I've paid" button, and the upload label text
- `app/my-orders/page.tsx` — full file. Focus on: the payment section inside
  the order card (around the unpaid → bank details → receipt upload → "I've
  paid" block), the uploadingReceipt state, the confirming state, and the
  buyer-confirm fetch call

Only proceed to Phase 2 after reading both files.

---

## PHASE 2 — IMPLEMENT

Work through every task in order. Do not skip any.

---

### TASK 1 — Make receipt mandatory in OrderBubble (in-chat payment flow)

File: `components/chat/OrderBubble.tsx`

Inside `BuyerPaymentPanel`, find the section that renders the receipt upload
area and the "I've paid" button.

**Change 1 — Update the upload label from optional to required:**

Find:
```
Upload receipt (optional but recommended)
```
Replace with:
```
Upload transfer receipt (required)
```

**Change 2 — Update the instruction text:**

Find:
```
Transfer {fmt(total)} to the account above, then upload your receipt and tap "I've paid".
```
Replace with:
```
Transfer {fmt(total)} to the account above. Upload your receipt — the vendor needs proof before confirming.
```

**Change 3 — Lock the "I've paid" button until receipt is uploaded:**

Find the "I've paid" button:
```tsx
<button
  type="button"
  onClick={handleConfirm}
  disabled={loading}
  className={cn(
    'w-full rounded-xl py-2 text-xs font-semibold text-white transition-all',
    loading ? 'bg-zinc-400' : 'bg-zinc-900 hover:bg-zinc-700'
  )}
>
  {loading ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "I've paid"}
</button>
```

Replace with:
```tsx
<button
  type="button"
  onClick={handleConfirm}
  disabled={loading || !receiptUploaded}
  className={cn(
    'w-full rounded-xl py-2 text-xs font-semibold transition-all',
    loading
      ? 'bg-zinc-400 text-white cursor-wait'
      : !receiptUploaded
      ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200'
      : 'bg-zinc-900 text-white hover:bg-zinc-700'
  )}
>
  {loading
    ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
    : !receiptUploaded
    ? 'Upload receipt to confirm'
    : "I've paid"}
</button>
```

**Change 4 — Make the upload area visually step-like:**

Replace the existing upload label:
```tsx
<label className="block text-[11px] font-semibold text-amber-800 mb-1">
  Upload transfer receipt (required)
</label>
```
With:
```tsx
<div className="flex items-center gap-2 mb-1">
  <span className={cn(
    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
    receiptUploaded
      ? 'bg-emerald-500 text-white'
      : 'bg-amber-400 text-white'
  )}>
    {receiptUploaded ? '✓' : '2'}
  </span>
  <label className="text-[11px] font-semibold text-amber-800">
    Upload transfer receipt (required)
  </label>
</div>
```

Also add a step 1 indicator to the bank details heading. Find the "Pay for
your order" heading and replace it:
```tsx
<p className="text-xs font-semibold text-amber-900">Pay for your order</p>
```
With:
```tsx
<div className="flex items-center gap-2">
  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">
    1
  </span>
  <p className="text-xs font-semibold text-amber-900">Transfer to this account</p>
</div>
```

---

### TASK 2 — Handle existing receipt_url on OrderBubble mount

File: `components/chat/OrderBubble.tsx`

The `receiptUploaded` state is currently initialised as `false` on every mount.
If a buyer already uploaded a receipt in a previous session, the button would
wrongly appear locked when they reopen the chat.

**Add `initialReceiptUploaded` prop to BuyerPaymentPanel:**

Add to the BuyerPaymentPanel props type:
```ts
initialReceiptUploaded?: boolean;
```

Update the state initialisation inside BuyerPaymentPanel:
```ts
const [receiptUploaded, setReceiptUploaded] = useState(initialReceiptUploaded ?? false);
```

**Pass it from the main OrderBubble component:**

Find where BuyerPaymentPanel is rendered inside OrderBubble and add the prop:
```tsx
<BuyerPaymentPanel
  ...
  initialReceiptUploaded={!!receiptUrl}
  ...
/>
```

The `receiptUrl` prop is already available on OrderBubble — if it's non-null,
a receipt was previously uploaded, so the button should be unlocked on mount.

---

### TASK 3 — Make receipt mandatory in /my-orders (order tracking page)

File: `app/my-orders/page.tsx`

This page has its own independent payment UI. Find the section that renders
the unpaid transfer flow (bank details + receipt upload + "I've paid" button).

**Add per-order receipt-uploaded tracking state:**

Near the top of the component, with the other useState declarations, add:
```ts
const [receiptUploadedOrders, setReceiptUploadedOrders] = useState<Set<string>>(new Set());
```

**Update the receipt upload success handler:**

Find where the receipt upload fetch fires — it calls
`/api/orders/${order.id}/receipt`. After a successful upload (where the
response is `json.ok`), add:
```ts
setReceiptUploadedOrders(prev => {
  const next = new Set(prev);
  next.add(order.id);
  return next;
});
```

**Update the upload label:**

Find:
```
📎 Attach transfer receipt (optional)
```
Replace with:
```
📎 Attach transfer receipt (required)
```

**Lock the "I've paid" button until receipt is uploaded:**

Find the "I've paid" button in the unpaid section. It currently has
`disabled={confirming === order.id}`. Replace the button with:

```tsx
<button
  type="button"
  disabled={confirming === order.id || !receiptUploadedOrders.has(order.id)}
  onClick={async () => {
    /* keep existing confirm handler logic exactly as-is */
  }}
  className={cn(
    'w-full rounded-2xl py-2.5 text-sm font-semibold transition',
    confirming === order.id
      ? 'bg-zinc-400 text-white cursor-wait'
      : !receiptUploadedOrders.has(order.id)
      ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200'
      : 'bg-zinc-900 text-white hover:bg-zinc-700'
  )}
>
  {confirming === order.id
    ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
    : !receiptUploadedOrders.has(order.id)
    ? 'Upload receipt to confirm'
    : "I've paid"}
</button>
```

Keep the existing onClick handler body exactly as-is — only the disabled
condition, className, and label text change.

**Add step indicators to the my-orders payment UI:**

Before the bank details card, add:
```tsx
<div className="flex items-center gap-2 mb-2">
  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">
    1
  </span>
  <p className="text-xs font-semibold text-zinc-700">Transfer to this account</p>
</div>
```

Before the receipt upload input, add:
```tsx
<div className="flex items-center gap-2 mb-1">
  <span className={cn(
    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
    receiptUploadedOrders.has(order.id) ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-white'
  )}>
    {receiptUploadedOrders.has(order.id) ? '✓' : '2'}
  </span>
  <label className="text-xs font-semibold text-zinc-700">
    Upload transfer receipt (required)
  </label>
</div>
```

---

### TASK 4 — Seed receiptUploadedOrders from existing receipt_url on load

File: `app/my-orders/page.tsx`

When orders are fetched from Supabase, some may already have `receipt_url`
set (buyer uploaded in a previous session). Seed the Set so the button is
already unlocked for those orders.

Find where orders are loaded and set in state. After the `setOrders(...)` or
equivalent call, add:

```ts
setReceiptUploadedOrders(new Set(
  loadedOrders
    .filter((o: any) => !!o.receipt_url)
    .map((o: any) => o.id)
));
```

Where `loadedOrders` is whatever variable holds the fetched order array before
it's set in state. Adjust the variable name to match what exists in the file.

---

### TASK 5 — Remove all remaining "optional" copy near receipts

Both files may still contain the word "optional" in other receipt-related
places. Search both files for any remaining instance of "optional" near
receipt text and remove or update it:

- Any `(optional)` in upload labels → remove the qualifier
- Any "optional but recommended" → replace with "required"
- Any placeholder or hint text calling receipt optional → update to "required"

---

## VERIFICATION CHECKLIST

After all tasks are complete:

- [ ] `components/chat/OrderBubble.tsx` — "I've paid" button is disabled and
      shows "Upload receipt to confirm" when receiptUploaded is false
- [ ] `components/chat/OrderBubble.tsx` — "I've paid" button is active and
      shows "I've paid" once receipt is uploaded
- [ ] `components/chat/OrderBubble.tsx` — upload label says "required" not
      "optional"
- [ ] `components/chat/OrderBubble.tsx` — step 1 / step 2 indicators visible
      in the payment panel
- [ ] `components/chat/OrderBubble.tsx` — `initialReceiptUploaded` prop seeds
      the state; if receiptUrl prop is already set, button is unlocked on mount
- [ ] `app/my-orders/page.tsx` — `receiptUploadedOrders` Set state exists
- [ ] `app/my-orders/page.tsx` — receipt upload success handler adds order.id
      to the Set
- [ ] `app/my-orders/page.tsx` — "I've paid" button is disabled and shows
      "Upload receipt to confirm" when order.id not in Set
- [ ] `app/my-orders/page.tsx` — orders with existing receipt_url seed the Set
      on load so the button is already unlocked
- [ ] `app/my-orders/page.tsx` — upload label says "required" not "optional"
- [ ] `app/my-orders/page.tsx` — step 1 / step 2 indicators visible
- [ ] Cash orders (payment_method === 'cash') are completely untouched — no
      receipt required, no changes to that branch
- [ ] No TypeScript errors in either file
- [ ] No DB migration required — receipt_url column already exists on orders