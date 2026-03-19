
**"You are a senior full-stack engineer implementing a delivery system overhaul on Jabu Market — a Next.js + Supabase campus super-app. You have a full audit report. Your job is to implement every fix in order, surgically, without breaking anything.**

**Before touching a single file:**
1. Read `CLAUDE.md` fully
2. Scan every file related to delivery — `/delivery`, `/my-orders`, `/rider`, `/vendor/orders`, `MealBuilder.tsx`, `orders/create/route.ts`, `delivery_requests`, `riders`, `couriers`
3. List every file you'll touch across all fixes before starting
4. Flag any file that doesn't exist yet — confirm you'll create it
5. Confirm you understand the Supabase client rules — browser vs server vs admin — before writing a single query

---

## 🔴 CRITICAL — Implement These First

**FIX 1 — Schema migration: add `order_id` FK to `delivery_requests`**
Create file: `supabase/migrations/[timestamp]_delivery_requests_order_id.sql`

```sql
ALTER TABLE public.delivery_requests
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id);

CREATE INDEX IF NOT EXISTS delivery_requests_order_id_idx
  ON public.delivery_requests(order_id);
```

Tell me when this is ready so I can run it manually in the Supabase SQL editor before you proceed.

---

**FIX 2 — Wire food delivery orders to auto-create a `delivery_requests` row**
File: `app/api/orders/create/route.ts`

After the `orders` insert succeeds and `order_type === 'delivery'`, insert a corresponding row into `delivery_requests` using the admin client:
```ts
if (order_type === 'delivery') {
  await admin.from('delivery_requests').insert({
    order_id: newOrder.id,
    listing_id: null,
    buyer_id: user.id,
    vendor_id: vendor_id,
    dropoff: delivery_address,
    status: 'open',
  });
}
```
Wrap in try/catch — a delivery_request creation failure must never roll back or crash the order creation response. Log the error but return the order success.

---

**FIX 3 — Fix all hardcoded pickup strings to be delivery-aware**

File 1: `app/api/orders/[orderId]/status/route.ts`
Find every hardcoded notification string mentioning "pickup." Make them conditional on `order_type`:
```ts
case 'ready':
  return order_type === 'delivery'
    ? '🛵 Your order is ready — rider is on the way!'
    : '🔔 Your order is ready for pickup!';
```
Fetch `order_type` from the orders row before building the message. Apply the same pattern to every status case that references pickup.

File 2: `app/vendor/orders/page.tsx`
Pass `order_type` to the action buttons. Change button labels conditionally:
- `order_type === 'delivery'` → "Mark ready for delivery"
- `order_type === 'pickup'` → "Mark ready for pickup"
Show the delivery address prominently on the order card when `order_type === 'delivery'` — large text, clearly labeled, with a copy-to-clipboard button.

---

**FIX 4 — Add `delivery_fee` to vendor setup and order flow**

Step 1 — File: `app/vendor/setup/page.tsx`
Add a `delivery_fee` numeric input field to the vendor setup form. Label: "Delivery fee (₦)". Save it to the `vendors` table — add the column if it doesn't exist or use `description` as a fallback until schema is updated. Minimum value: 0.

Step 2 — File: `components/chat/MealBuilder.tsx` (FulfillmentStep)
Fetch the vendor's `delivery_fee` from the vendor row. Display it as a line item on the ReviewStep:
```
Delivery fee: ₦{delivery_fee}
```
Include it in the order total calculation. Pass it to `orders/create` as `delivery_fee` instead of hardcoded `0`.

Step 3 — File: `app/api/orders/create/route.ts`
Accept `delivery_fee` from the request body. Validate it's a non-negative integer. Store it in the `orders` row.

---

**FIX 5 — Add `accepts_delivery` toggle to vendor setup**

Step 1 — Create migration: `supabase/migrations/[timestamp]_vendors_accepts_delivery.sql`
```sql
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS accepts_delivery boolean NOT NULL DEFAULT true;
```

Step 2 — File: `app/vendor/setup/page.tsx`
Add a toggle switch: "Accept delivery orders". Default on. Save to `vendors.accepts_delivery`.

Step 3 — File: `components/chat/MealBuilder.tsx` (FulfillmentStep)
Fetch `accepts_delivery` from the vendor row. If `accepts_delivery === false`, hide the delivery option entirely. Only show pickup.

---

**FIX 6 — Fix unauthenticated cancel on delivery requests**
File: `app/delivery/requests/page.tsx`

Move the cancel action to a new API route: `app/api/delivery/requests/[requestId]/cancel/route.ts`
- Authenticate the user server-side
- Verify `delivery_requests.buyer_id === user.id` before updating
- Update `status` to `cancelled` only if ownership check passes
- Return 403 if check fails
Remove the direct client-side Supabase update from the page component. Call the new API route instead.

---

**FIX 7 — Add `accepts_delivery` to vendor schema migration**
Already covered in Fix 5 Step 1. Confirm it runs before Fix 5 Step 3.

---

## 🟡 IMPORTANT — Implement After Criticals

**FIX 8 — Create rider dashboard: `/rider/my-deliveries`**
Create file: `app/rider/my-deliveries/page.tsx`

This is a client component. Flow:
- Ask the rider to enter their phone number (same lookup pattern as `/rider/status/page.tsx`)
- Fetch all `delivery_requests` where `rider_id` matches their rider row
- Show each delivery card with: dropoff address, order_id, current status
- Render one-tap status update buttons:
  - If `status === 'accepted'` → show "Mark as Picked Up" button → updates to `picked_up`
  - If `status === 'picked_up'` → show "Mark as Delivered" button → updates to `delivered`
- Use the browser Supabase client — this is client-side
- Match the existing card/button design system in the codebase exactly
- Add a link to this page from `/rider/status/page.tsx`: "View my deliveries →"

---

**FIX 9 — Add vendor rider assignment UI to order card**
File: `app/vendor/orders/page.tsx`

For delivery orders where `status === 'ready'` and no `rider_id` is assigned on the linked `delivery_request`:
- Show a compact "Assign a rider" section below the order details
- Fetch available riders in any zone (`is_available === true`, `verified === true`) — max 5 results
- Show each as a pill with name, zone, and a WhatsApp button (pre-filled message: "Hi [name], I have a delivery at Jabumarket. Dropoff: [delivery_address]. Can you take it?")
- After vendor contacts a rider off-app, show a simple "Confirm rider" dropdown to select which rider picked it up
- On confirm, update `delivery_requests.rider_id` and `delivery_requests.status` to `accepted`
- Use the admin client in an API route for this update — not client-side

---

**FIX 10 — Add delivery status chain to buyer order card**
File: `app/my-orders/page.tsx` or its order card component

For `order_type === 'delivery'` orders:
- Fetch the linked `delivery_requests` row via `order_id`
- Show an additional status chain below the order status:
  - Open → Rider assigned → Picked up → Delivered
- Map `delivery_requests.status` values to plain English:
  - `open` → "Looking for a rider"
  - `accepted` → "Rider assigned"
  - `picked_up` → "Rider picked up your order"
  - `delivered` → "Delivered ✓"
- Set up a Realtime subscription on the `delivery_requests` row for live updates
- For `order_type === 'pickup'` orders, hide this section entirely

---

**FIX 11 — Add delivery availability badge to food vendor cards**
File: `app/food/FoodVendorGrid.tsx` or the vendor card component

Fetch `accepts_delivery` alongside existing vendor fields. When `accepts_delivery === true` and vendor is open, show a small delivery badge on the vendor card:
```tsx
<span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
  Delivery available
</span>
```
When `accepts_delivery === false`, show nothing — don't show a "no delivery" badge, just absence of the green one.

---

**FIX 12 — Add rider authentication to availability toggle**
File: `app/rider/status/page.tsx`

The phone-number lookup currently has no auth. Add a simple PIN step:
- After finding the rider by phone, show a PIN input (4 digits)
- Store a hashed PIN on the `riders` table — add column: `pin_hash text`
- On first login (no PIN set), prompt rider to create a PIN
- Validate PIN before allowing any status changes
- This doesn't need full Supabase auth — a bcrypt-hashed PIN stored on the row is sufficient for now
- Create migration: `supabase/migrations/[timestamp]_riders_pin_hash.sql`

---

## 🟢 POLISH — Do These Last

**FIX 13 — Clarify "Delivery Agents" vs "Transport" in explore tabs**
File: wherever the `/explore` tabs are rendered

Add a subtitle or tooltip under each tab label:
- "Delivery Agents" → subtitle: "For food and marketplace item delivery on campus"
- "Transport" → subtitle: "For moving goods off-campus or between locations"

---

**FIX 14 — Make delivery address copyable on vendor order card**
File: `app/vendor/orders/page.tsx`

Wrap the delivery address text in a button that copies to clipboard on tap. Show a "Copied!" toast on success. Use the existing toast library.

---

**FIX 15 — Add empty state for buyer when no rider is assigned yet**
File: `app/my-orders/page.tsx`

When `order_type === 'delivery'` and `delivery_requests.status === 'open'`, show a coaching message below the order card:
```
"Your vendor is arranging a rider. You'll see updates here once one is assigned."
```
Style it as an amber info banner matching the existing design system.

---

## IMPLEMENTATION RULES:
1. Read `CLAUDE.md` before starting
2. Read every file before editing it — never assume structure
3. Use the correct Supabase client — browser for client components, server for RSCs, admin for privileged writes
4. Never use `any` for new TypeScript code — define proper types for all new data shapes
5. All new `Link` hrefs must point to pages that actually exist or that you're creating in this sprint
6. After each fix confirm: which files were changed, what was added, what was removed
7. Do not combine unrelated edits into a single file change
8. Migrations go in `supabase/migrations/` with timestamp prefix — list them all at the start so I can run them in order before you implement the UI changes that depend on them
9. Never touch RLS policies, existing DB schema beyond the specified migrations, or any system outside the delivery scope
10. If a component you need to edit doesn't exist yet, create it — don't skip

**Implement in order 1–15. Run all migrations first. Confirm each fix before moving to the next.**

**The goal: A student orders jollof rice, selects delivery, pays the correct fee, and can track their order from 'Preparing' all the way to 'Delivered' — entirely inside Jabu Market."**