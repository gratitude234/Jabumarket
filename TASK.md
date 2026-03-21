Read CLAUDE.md first. Then read these files before touching anything:
- app/api/orders/create/route.ts
- app/api/orders/[orderId]/status/route.ts
- app/my-orders/page.tsx
- app/vendor/orders/page.tsx
- app/vendor/setup/page.tsx
- app/api/vendor/setup/route.ts
- components/chat/OrderBubble.tsx
- lib/types.ts

List ALL files you will modify or create before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MIGRATION — Present as standalone file first.
Stop and wait for confirmation before any other task.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create: supabase/migrations/[timestamp]_manual_payment.sql

-- Payment fields on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IN ('transfer', 'cash')),
  ADD COLUMN IF NOT EXISTS payment_status text
    NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN (
      'unpaid', 'buyer_confirmed', 'vendor_confirmed'
    )),
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_note text;

-- Account details on vendors
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_account_name text;

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 1 — Add bank account fields to vendor setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Files: app/vendor/setup/page.tsx,
       app/api/vendor/setup/route.ts

Read both files fully before editing.

In the vendor setup form (page.tsx), add a new section
after the existing fields titled "Payment details":

  <div className="space-y-3">
    <p className="text-sm font-semibold text-zinc-900">
      Payment details
    </p>
    <p className="text-xs text-zinc-500">
      Students will transfer to this account when they order.
      Make sure it's correct.
    </p>

    {/* Bank name */}
    <input
      placeholder="Bank name (e.g. GTBank, Access, Opay)"
      value={bankName}
      onChange={e => setBankName(e.target.value)}
      className="w-full rounded-2xl border bg-zinc-50 px-4
        py-3 text-sm outline-none focus:ring-2
        focus:ring-zinc-900/10"
    />

    {/* Account number */}
    <input
      placeholder="Account number (10 digits)"
      inputMode="numeric"
      maxLength={10}
      value={accountNumber}
      onChange={e => setAccountNumber(
        e.target.value.replace(/\D/g, '').slice(0, 10)
      )}
      className="w-full rounded-2xl border bg-zinc-50 px-4
        py-3 text-sm outline-none focus:ring-2
        focus:ring-zinc-900/10"
    />

    {/* Account name */}
    <input
      placeholder="Account name (as it appears on your bank)"
      value={accountName}
      onChange={e => setAccountName(e.target.value)}
      className="w-full rounded-2xl border bg-zinc-50 px-4
        py-3 text-sm outline-none focus:ring-2
        focus:ring-zinc-900/10"
    />
  </div>

Add state: bankName, accountNumber, accountName
These fields are optional — vendor can skip and add later.
If provided, validate account number is exactly 10 digits.

In app/api/vendor/setup/route.ts:
Add bank_name, bank_account_number, bank_account_name
to the vendor UPDATE payload if provided in the body.

Also add a standalone edit endpoint for updating bank
details later without going through the full setup:

Create: app/api/vendor/bank-details/route.ts
PATCH handler:
- Require auth, resolve vendor by user_id
- Body: { bank_name, bank_account_number, bank_account_name }
- Validate account_number is 10 digits if provided
- UPDATE vendors SET bank_name, bank_account_number,
  bank_account_name WHERE id = vendor.id
- Return { ok: true }

Add a "Payment details" card to the vendor dashboard
(app/vendor/page.tsx — read first) showing current
bank details with an "Edit" button that opens an
inline edit form calling this endpoint.
If bank details are not set, show a banner:
  "Add your account number so students can pay you →"
  with an inline form to fill it in.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 2 — Show account number to buyer after ordering
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Files: app/my-orders/page.tsx,
       components/chat/OrderBubble.tsx

In my-orders/page.tsx:
Fetch orders with vendor bank details:
  .select(`
    ...,
    vendor:vendors(
      name, avatar_url,
      bank_name, bank_account_number, bank_account_name
    )
  `)

For orders where:
  payment_status = 'unpaid' AND
  payment_method IS NULL OR payment_method = 'transfer' AND
  status NOT IN ('cancelled', 'delivered')

Show a payment card below the order summary:

  <div className="mt-3 rounded-2xl border border-blue-200
    bg-blue-50 p-4 space-y-3">

    <p className="text-sm font-semibold text-blue-900">
      Transfer payment details
    </p>

    {vendor.bank_account_number ? (
      <>
        <div className="rounded-xl bg-white border p-3
          space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Bank</span>
            <span className="text-sm font-semibold
              text-zinc-900">{vendor.bank_name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              Account
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold
                text-zinc-900 font-mono">
                {vendor.bank_account_number}
              </span>
              {/* Copy button */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    vendor.bank_account_number
                  )
                  setCopied(order.id)
                  setTimeout(() => setCopied(null), 2000)
                }}
                className="rounded-lg border bg-white px-2
                  py-1 text-xs font-semibold text-zinc-700"
              >
                {copied === order.id ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Name</span>
            <span className="text-sm font-semibold
              text-zinc-900">{vendor.bank_account_name}</span>
          </div>
          <div className="flex items-center justify-between
            border-t pt-2">
            <span className="text-xs text-zinc-500">
              Amount
            </span>
            <span className="text-base font-bold
              text-zinc-900">
              ₦{order.total.toLocaleString('en-NG')}
            </span>
          </div>
        </div>

        <p className="text-xs text-blue-700">
          Transfer exactly ₦{order.total.toLocaleString()}
          then tap "I've paid" below.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => handleBuyerConfirm(order.id)}
            disabled={confirming === order.id}
            className="flex-1 rounded-xl bg-zinc-900 py-2.5
              text-sm font-bold text-white disabled:opacity-50"
          >
            {confirming === order.id
              ? 'Confirming…'
              : "I've paid ✓"}
          </button>
          <button
            onClick={() => handleMarkCash(order.id)}
            className="rounded-xl border px-3 py-2.5
              text-xs font-semibold text-zinc-600"
          >
            Pay cash
          </button>
        </div>
      </>
    ) : (
      <p className="text-sm text-blue-700">
        This vendor hasn't added their account details yet.
        Message them to get their account number.
      </p>
    )}
  </div>

Add state: copied (string | null), confirming (string | null)

handleBuyerConfirm(orderId):
  POST /api/orders/[orderId]/buyer-confirm
  On success: update local order payment_status
    to 'buyer_confirmed'
  Show: "Payment submitted — waiting for vendor to confirm"

handleMarkCash(orderId):
  PATCH to new endpoint /api/orders/[orderId]/payment-method
  Body: { payment_method: 'cash' }
  On success: hide the payment card entirely

For orders where payment_status = 'buyer_confirmed':
Show a pending state instead of the payment card:
  <div className="mt-3 rounded-2xl border border-amber-200
    bg-amber-50 p-3 flex items-center gap-2">
    <span className="text-amber-600">⏳</span>
    <p className="text-sm text-amber-800">
      Payment submitted — waiting for vendor to confirm
      receipt.
    </p>
  </div>

For orders where payment_status = 'vendor_confirmed':
Show confirmed state:
  <div className="mt-3 rounded-2xl border border-emerald-200
    bg-emerald-50 p-3 flex items-center gap-2">
    <span>✅</span>
    <p className="text-sm text-emerald-800 font-semibold">
      Payment confirmed by vendor
    </p>
  </div>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 3 — API: Buyer confirms payment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create: app/api/orders/[orderId]/buyer-confirm/route.ts

POST handler:
- Require auth. Verify caller is order.buyer_id.
- Fetch order. Validate:
  - payment_status = 'unpaid'
  - status NOT IN ('cancelled', 'delivered')
- UPDATE orders SET
    payment_status = 'buyer_confirmed',
    payment_method = 'transfer',
    paid_at = now()
  WHERE id = orderId
- Notify vendor:
    INSERT into notifications:
    {
      user_id: vendor.user_id,
      type: 'payment_submitted',
      title: '💸 Payment submitted',
      body: 'A buyer says they've transferred payment.
             Check your account and confirm.',
      href: '/vendor/orders',
    }
- Post a message in the conversation (if conversation_id exists):
    INSERT into messages:
    {
      conversation_id: order.conversation_id,
      sender_id: caller_user_id,
      body: '💸 I have transferred ₦{order.total}. Please
             confirm once you receive it.',
      type: 'text',
    }
    Update conversation last_message_preview accordingly.
- Return { ok: true }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 4 — API: Set payment method to cash
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Create: app/api/orders/[orderId]/payment-method/route.ts

PATCH handler:
- Require auth. Verify caller is order.buyer_id.
- Body: { payment_method: 'cash' }
- Validate payment_method is 'cash' only (transfer is
  set via buyer-confirm, not here)
- UPDATE orders SET payment_method = 'cash'
  WHERE id = orderId
- Notify vendor:
    {
      type: 'payment_cash',
      title: 'Cash payment',
      body: 'Buyer will pay cash on pickup/delivery.',
      href: '/vendor/orders',
    }
- Post message in conversation:
    '🤝 I'll pay cash on pickup.'
- Return { ok: true }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 5 — Vendor confirms payment received
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/vendor/orders/page.tsx (read first)

For orders where payment_status = 'buyer_confirmed':
Show a prominent "Confirm payment received" action
on the order card — amber/warning color to draw
attention:

  <div className="mt-3 rounded-2xl border border-amber-300
    bg-amber-50 p-3 space-y-2">
    <p className="text-sm font-semibold text-amber-900">
      Buyer says they've paid
    </p>
    <p className="text-xs text-amber-700">
      Check your {vendor.bank_name} account for
      ₦{order.total.toLocaleString()} then confirm below.
    </p>
    <button
      onClick={() => handleVendorConfirm(order.id)}
      disabled={confirming === order.id}
      className="w-full rounded-xl bg-emerald-600 py-2.5
        text-sm font-bold text-white disabled:opacity-50"
    >
      {confirming === order.id
        ? 'Confirming…'
        : '✓ Payment received — start preparing'}
    </button>
  </div>

handleVendorConfirm(orderId):
  POST /api/orders/[orderId]/vendor-confirm-payment
  On success: update local order:
    payment_status → 'vendor_confirmed'
    status → 'preparing'

Create: app/api/orders/[orderId]/vendor-confirm-payment/route.ts

POST handler:
- Require auth. Verify caller is the vendor
  (vendors.user_id = caller, vendors.id = order.vendor_id)
- Fetch order. Validate payment_status = 'buyer_confirmed'
- UPDATE orders SET
    payment_status = 'vendor_confirmed',
    status = 'preparing'
  WHERE id = orderId
- Notify buyer:
    {
      type: 'payment_confirmed',
      title: '✅ Payment confirmed!',
      body: 'Vendor confirmed your transfer.
             Your order is now being prepared.',
      href: '/my-orders',
    }
- Post message in conversation:
    '✅ Payment received! Your order is being prepared.'
- Return { ok: true }

Also handle the dispute case — add a "Payment not
received" button next to the confirm button:

Create: app/api/orders/[orderId]/payment-dispute/route.ts

POST handler (vendor only):
- UPDATE orders SET payment_status = 'unpaid'
  (resets to unpaid — buyer sees the payment card again)
- Notify buyer:
    {
      type: 'payment_dispute',
      title: 'Payment not confirmed',
      body: 'Vendor could not confirm your transfer.
             Please check and resend, or contact them
             in chat.',
      href: '/my-orders',
    }
- Post message in conversation:
    '⚠️ I could not confirm your transfer. Please
     check and resend, or message me if you need help.'
- Return { ok: true }

Show "Payment not received" as a small secondary text
button below the confirm button on vendor orders page.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 6 — Update OrderBubble to show payment status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: components/chat/OrderBubble.tsx

Add payment_status to Props:
  payment_status?: string

In the footer section of the bubble (below total),
add a payment status line:

  {payment_status && payment_status !== 'unpaid' && (
    <div className="flex items-center justify-between
      border-t border-zinc-100 px-4 py-2">
      <span className="text-xs text-zinc-500">Payment</span>
      <span className={cn(
        'text-xs font-semibold',
        payment_status === 'vendor_confirmed'
          ? 'text-emerald-600'
          : payment_status === 'buyer_confirmed'
          ? 'text-amber-600'
          : 'text-zinc-500'
      )}>
        {payment_status === 'vendor_confirmed'
          ? '✅ Confirmed'
          : payment_status === 'buyer_confirmed'
          ? '⏳ Awaiting vendor confirmation'
          : payment_status}
      </span>
    </div>
  )}

In the conversation page
(app/inbox/[conversationId]/page.tsx — read first),
pass payment_status to OrderBubble from the order
data already fetched via orderStatus state.
You'll need to also fetch payment_status alongside
the existing status query.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 7 — Realtime payment status updates
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/my-orders/page.tsx

The existing Realtime subscription on orders already
handles status updates. Extend it to also handle
payment_status changes:

In the Realtime UPDATE handler, when payload.new
includes payment_status, update the local order:

  setOrders(prev => prev.map(o =>
    o.id === payload.new.id
      ? {
          ...o,
          status: payload.new.status ?? o.status,
          payment_status:
            payload.new.payment_status ?? o.payment_status,
        }
      : o
  ))

This means when vendor confirms payment, the buyer's
screen updates instantly without a reload.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Present migration first. Wait for confirmation.
- Implement tasks in order 1→7
- Read every file fully before editing
- No `any` types on new code
- All new API routes: { ok: true } or
  { ok: false, message, code }
- All notifications wrapped in try/catch —
  never block the main action
- All conversation message inserts wrapped in try/catch
- After all tasks: list every file created or changed,
  confirm each task number done