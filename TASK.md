## PHASE 1 — READ THESE FILES FIRST (do not write any code yet)

Read every file listed below fully before touching anything. After reading, write one line per file summarising what it currently does and flag anything relevant to payment handling.

- `app/vendor/page.tsx` — focus on: where BankDetailsCard is rendered, what vendor_type check gates it, what the vendor select query fetches
- `app/vendor/setup/page.tsx` — full file: what fields it manages, what it saves
- `app/api/vendor/setup/route.ts` — full file: note the `.eq('vendor_type', 'food')` guard
- `app/api/vendor/bank-details/route.ts` — full file
- `app/api/orders/[orderId]/status/route.ts` — focus on: VALID_TRANSITIONS, the payment guard block, the `preparing` status messages, the `building StatusMessage` function
- `app/api/orders/[orderId]/vendor-confirm-payment/route.ts` — full file: note where it hardcodes `status: 'preparing'`
- `app/api/orders/create-marketplace/route.ts` — full file (created in previous task)
- `components/chat/FinalizeDealButton.tsx` — full file (created in previous task)
- `components/chat/OrderBubble.tsx` — focus on: the hardcoded "Meal Order" header, BuyerPaymentPanel, VendorPaymentPanel
- `app/my-orders/page.tsx` — focus on: the payment panel section, the bank details display, the "Pay cash" button logic
- `lib/types.ts` — focus on: VendorRow type definition

Only proceed to Phase 2 after reading all files above.

---

## PHASE 2 — IMPLEMENT

Work through each task in order. Do not skip ahead.

---

### TASK 1 — Remove the food-only guard from `/api/vendor/setup`

File: `app/api/vendor/setup/route.ts`

The `getVendor()` helper has `.eq('vendor_type', 'food')` — this means non-food vendors who call this endpoint get a 403 "Not a food vendor" error. They can never save bank details through this route.

Remove the `.eq('vendor_type', 'food')` line from the `getVendor()` query so it fetches any vendor belonging to the authenticated user regardless of type.

Keep everything else in the file identical.

---

### TASK 2 — Add bank details + payment_note to the non-food vendor settings page

File: `app/vendor/setup/page.tsx`

This page currently handles food vendor settings (hours, delivery, menu). Non-food vendors also land here from `/vendor/setup`. They need to be able to set their bank details and an optional payment note so buyers can pay them.

1. Read the current state fields at the top of the component. Add these new state variables:
```ts
const [bankName, setBankName]       = useState('');
const [accountNumber, setAccountNumber] = useState('');
const [accountName, setAccountName] = useState('');
const [paymentNote, setPaymentNote] = useState('');
```

2. In the `useEffect` that loads the vendor data, after setting existing fields, also populate the bank state:
```ts
setBankName((v as any).bank_name ?? '');
setAccountNumber((v as any).bank_account_number ?? '');
setAccountName((v as any).bank_account_name ?? '');
setPaymentNote((v as any).payment_note ?? '');
```

3. In the save handler (the function that calls `PATCH /api/vendor/setup`), include these fields in the patch body:
```ts
bank_name: bankName.trim() || null,
bank_account_number: accountNumber.trim() || null,
bank_account_name: accountName.trim() || null,
payment_note: paymentNote.trim() || null,
```

4. Add a "Payment details" section to the form JSX. Place it after the existing profile fields (name, description, location) and before any food-specific sections. Gate the food-specific sections (hours, delivery fee, accepts_delivery) behind `{vendor?.vendor_type === 'food' && (...)}` so they only show for food vendors.

The payment section JSX:
```tsx
{/* ── Payment details ─────────────────────────────────────────────── */}
<div className="space-y-3">
  <div>
    <p className="text-sm font-semibold text-zinc-900">Payment details</p>
    <p className="text-xs text-zinc-500 mt-0.5">
      Buyers will see these details when finalizing a deal with you.
    </p>
  </div>

  <input
    type="text"
    placeholder="Bank name (e.g. GTBank, Opay, Palmpay)"
    value={bankName}
    onChange={(e) => setBankName(e.target.value)}
    className="w-full rounded-2xl border bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400"
  />
  <input
    type="text"
    inputMode="numeric"
    placeholder="Account number (10 digits)"
    value={accountNumber}
    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
    className="w-full rounded-2xl border bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400"
  />
  <input
    type="text"
    placeholder="Account name (as it appears on your bank)"
    value={accountName}
    onChange={(e) => setAccountName(e.target.value)}
    className="w-full rounded-2xl border bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400"
  />
  <input
    type="text"
    placeholder="Payment note (optional) — e.g. 'Send exact amount, add your name as ref'"
    value={paymentNote}
    maxLength={120}
    onChange={(e) => setPaymentNote(e.target.value)}
    className="w-full rounded-2xl border bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400"
  />
</div>
```

---

### TASK 3 — Show bank details setup prompt on the non-food vendor dashboard

File: `app/vendor/page.tsx`

Currently `BankDetailsCard` is rendered inside the food vendor dashboard view. Non-food vendors (student, mall, other) also have a vendor dashboard but their bank details are never surfaced.

1. Check the vendor select query — ensure it includes `bank_name, bank_account_number, bank_account_name, payment_note`. It currently does. Good.

2. The `BankDetailsCard` component is already in this file. Find where it renders (around line 1034) and check whether it is inside a food-vendor-only block. If it is, move it outside so it renders for all vendor types.

3. Add a warning banner above the bank details card that only shows when all three bank fields are null/empty:
```tsx
{!(vendor as any).bank_account_number && (
  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
    <p className="font-semibold text-amber-900">⚠️ Bank details missing</p>
    <p className="mt-0.5 text-xs text-amber-700">
      Buyers cannot finalize deals with you until you add your bank account. Add it below.
    </p>
  </div>
)}
```

Place this banner immediately above the `<BankDetailsCard ... />` render.

---

### TASK 4 — Fix `vendor-confirm-payment` hardcoded `preparing` status for non-food orders

File: `app/api/orders/[orderId]/vendor-confirm-payment/route.ts`

Currently when a vendor confirms payment, the route always sets `status: 'preparing'`. For food orders this is correct — the kitchen starts cooking. For marketplace orders (student/mall/other vendor selling a product), `preparing` makes no sense — the item already exists, payment was the last step before handover. The correct next status is `ready`.

1. In the route, after fetching the order, also fetch the vendor type:
```ts
const { data: vendorData } = await admin
  .from('vendors')
  .select('id, user_id, vendor_type')
  .eq('id', order.vendor_id)
  .single()
```

2. Determine the next status based on vendor type:
```ts
const isFood = vendorData?.vendor_type === 'food';
const nextStatus = isFood ? 'preparing' : 'ready';
```

3. Use `nextStatus` in the update:
```ts
await admin
  .from('orders')
  .update({
    payment_status: 'vendor_confirmed',
    status: nextStatus,
  })
  .eq('id', orderId)
```

4. Update the notification body to reflect the correct next step:
```ts
const notifBody = isFood
  ? 'Vendor confirmed your transfer. Your order is now being prepared.'
  : 'Vendor confirmed your transfer. Your item is ready for pickup.';
```

5. Update the chat message body the same way:
```ts
const msgBody = isFood
  ? '✅ Payment received! Your order is being prepared.'
  : '✅ Payment received! Your item is ready for collection.';
```

---

### TASK 5 — Fix status route messages and transitions for marketplace orders

File: `app/api/orders/[orderId]/status/route.ts`

The `buildStatusMessage` function returns food-specific copy ("Your meal is being prepared", "ready for pickup") for all order types. Non-food orders need neutral language.

1. The route already fetches `order_type` from the order. Also fetch `vendor_id` and then vendor type. Add to the select:
```ts
.select('id, vendor_id, buyer_id, conversation_id, status, order_type, payment_status, payment_method')
```
Then after fetching the order, fetch vendor type:
```ts
const { data: vendorData } = await admin
  .from('vendors')
  .select('vendor_type')
  .eq('id', order.vendor_id)
  .maybeSingle();
const isFood = vendorData?.vendor_type === 'food';
```

2. Update `buildStatusMessage` to accept an `isFood` boolean parameter and return appropriate copy:
```ts
function buildStatusMessage(newStatus: string, orderType: string, isFood: boolean, eta?: number): string {
  switch (newStatus) {
    case 'preparing':
      if (!isFood) return eta
        ? `✅ Order confirmed — item ready in ~${eta} mins`
        : '✅ Order confirmed — your item is being arranged';
      return eta
        ? `👨‍🍳 Order accepted — ready in ~${eta} mins`
        : '👨‍🍳 Order accepted and being prepared';
    case 'ready':
      if (!isFood) return orderType === 'delivery'
        ? '🛵 Your item is ready — rider is on the way!'
        : '🔔 Your item is ready for collection!';
      return orderType === 'delivery'
        ? '🛵 Your order is ready — rider is on the way!'
        : '🔔 Your order is ready for pickup!';
    case 'delivered': return isFood
      ? '✅ Order delivered. Enjoy your meal!'
      : '✅ Item delivered. Enjoy!';
    case 'cancelled': return '❌ Order cancelled';
    default: return `Order status updated: ${newStatus}`;
  }
}
```

3. Pass `isFood` wherever `buildStatusMessage` is called in the route.

4. Update `STATUS_TITLES` to use neutral language where it currently says "meal":
```ts
const STATUS_TITLES: Record<string, string> = {
  confirmed: 'Order confirmed',
  preparing: 'Order in progress',
  ready:     'Ready!',
  delivered: 'Order delivered',
  cancelled: 'Order cancelled',
};
```

---

### TASK 6 — Surface payment details for non-food vendors in the buyer's order card

File: `app/my-orders/page.tsx`

The payment panel in this file already handles the bank transfer flow for food vendors. Non-food orders created via `create-marketplace` will have `payment_method: 'transfer'` and the same `vendor.bank_account_number` fields — so the existing UI will mostly work. But there are two fixes needed:

1. The "Pay cash" button currently shows for all non-food orders. Find the button (around the `confirming === order.id` section) and check — if `order.items` contains a `lines[0]` with an emoji of `🏷️` (marketplace order indicator), it came from `create-marketplace`. The cash button should still show for marketplace orders since `create-marketplace` allows `payment_method: 'cash'`. So leave the cash button visible for both.

2. The status label "Preparing" makes no sense for marketplace orders. Find where `STATUS_STYLES` is defined and add a helper that returns the right label based on vendor type:
```ts
function getStatusLabel(status: string, vendorType: string | null): string {
  if (status === 'preparing' && vendorType !== 'food') return 'Confirmed';
  if (status === 'ready' && vendorType !== 'food') return 'Ready for collection';
  return STATUS_STYLES[status]?.label ?? status;
}
```
Use this helper wherever status labels are rendered on order cards, passing `order.vendor?.vendor_type`.

3. Ensure the vendor join in the orders query includes `vendor_type`. Check the select — if `vendor_type` is missing from the vendor join, add it:
```ts
vendor:vendors(name, avatar_url, bank_name, bank_account_number, bank_account_name, vendor_type, payment_note)
```

---

### TASK 7 — Add bank details setup prompt in FinalizeDealButton

File: `components/chat/FinalizeDealButton.tsx`

When a buyer attempts to finalize a deal with `payment_method: 'transfer'` and the API returns `vendor_no_bank_details` error code, show a clear, helpful message rather than a generic error string.

In the `handleCreate` catch block, check for this specific error:
```ts
} catch (err: any) {
  if (err.message?.includes('bank transfer details')) {
    setError("This seller hasn't added their bank account yet. Ask them to add it in their vendor profile, or choose cash payment instead.");
  } else {
    setError(err.message ?? 'Something went wrong');
  }
}
```

Also: when `paymentMethod === 'transfer'` is selected, show a small info note below the payment method buttons:
```tsx
{paymentMethod === 'transfer' && (
  <p className="text-[11px] text-zinc-400">
    You'll see their bank details after creating the order.
  </p>
)}
```

---

## VERIFICATION CHECKLIST

After all tasks are complete:

- [ ] `app/api/vendor/setup/route.ts` — `.eq('vendor_type', 'food')` guard is removed from `getVendor()`
- [ ] `app/vendor/setup/page.tsx` — bank fields (bankName, accountNumber, accountName, paymentNote) are in state, loaded on mount, saved on submit, and rendered in the form for all vendor types
- [ ] `app/vendor/setup/page.tsx` — food-specific sections (hours, delivery fee, accepts_delivery toggle) are gated behind `vendor?.vendor_type === 'food'`
- [ ] `app/vendor/page.tsx` — `BankDetailsCard` renders for all vendor types, with a missing-bank warning banner above it
- [ ] `app/api/orders/[orderId]/vendor-confirm-payment/route.ts` — food vendors transition to `preparing`, non-food vendors transition to `ready`
- [ ] `app/api/orders/[orderId]/status/route.ts` — `buildStatusMessage` uses food-neutral copy for non-food vendors
- [ ] `app/my-orders/page.tsx` — vendor join includes `vendor_type`, status labels are correct for marketplace orders
- [ ] `components/chat/FinalizeDealButton.tsx` — handles `vendor_no_bank_details` error with a helpful message
- [ ] No TypeScript errors in any modified file
- [ ] Food vendor order flow is completely untouched — test mentally: MealBuilder → order → payment → preparing still works as before