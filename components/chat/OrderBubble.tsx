'use client';
// components/chat/OrderBubble.tsx
// Renders a structured order card inside the chat thread (handles both new lines format + legacy)

import { cn } from '@/lib/utils';
import type { OrderPayload } from '@/types/meal-builder';

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'border-amber-200 bg-amber-50 text-amber-800' },
  confirmed: { label: 'Confirmed', className: 'border-blue-200 bg-blue-50 text-blue-800' },
  preparing: { label: 'Preparing', className: 'border-purple-200 bg-purple-50 text-purple-800' },
  ready:     { label: 'Ready!',    className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  delivered: { label: 'Delivered', className: 'border-emerald-300 bg-emerald-100 text-emerald-900' },
  cancelled: { label: 'Cancelled', className: 'border-red-200 bg-red-50 text-red-700' },
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid:           '⏳ Awaiting payment',
  buyer_confirmed:  '💸 Payment sent (unconfirmed)',
  vendor_confirmed: '✅ Payment confirmed',
};

type Props = {
  payload: OrderPayload;
  isSender: boolean;
  status?: string;
  paymentStatus?: string;
  createdAt: string;
};

function fmt(n: number) { return `₦${n.toLocaleString()}`; }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

// ── Render line items from new OR legacy format ────────────────────────────────

function LineItems({ payload }: { payload: OrderPayload }) {
  // New format: lines array
  if (Array.isArray(payload.lines) && payload.lines.length > 0) {
    // Group by category for clean display
    const byCategory: Record<string, typeof payload.lines> = {};
    for (const l of payload.lines) {
      const cat = l.category || 'Items';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(l);
    }

    return (
      <>
        {Object.entries(byCategory).map(([cat, lines]) => (
          <div key={cat} className="flex items-start justify-between gap-4 px-4 py-2">
            <span className="shrink-0 text-sm capitalize text-zinc-500">{cat}</span>
            <div className="flex flex-col items-end gap-0.5">
              {lines.map((l) => (
                <span key={l.item_id} className="text-sm font-medium text-zinc-900">
                  {l.emoji} {l.name}{l.qty > 1 ? ` ×${l.qty}` : ''}{' '}
                  <span className="text-zinc-400">{fmt(l.line_total)}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </>
    );
  }

  // Legacy format
  return (
    <>
      {payload.swallow && (
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm text-zinc-500">Swallow</span>
          <span className="text-sm font-medium text-zinc-900">
            {payload.swallow.emoji} {payload.swallow.name}{' '}
            <span className="text-zinc-400">× {payload.swallow.qty} {payload.swallow.unit_name}{payload.swallow.qty > 1 ? 's' : ''}</span>
          </span>
        </div>
      )}
      {payload.soup && (
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm text-zinc-500">Soup</span>
          <span className="text-sm font-medium text-zinc-900">{payload.soup.emoji} {payload.soup.name}</span>
        </div>
      )}
      {(payload.proteins ?? []).length > 0 && (
        <div className="flex items-start justify-between gap-4 px-4 py-2">
          <span className="shrink-0 text-sm text-zinc-500">Protein</span>
          <div className="flex flex-col items-end gap-0.5">
            {(payload.proteins ?? []).map((p) => (
              <span key={p.item_id} className="text-sm font-medium text-zinc-900">
                {p.emoji} {p.name} <span className="text-zinc-400">× {p.qty}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {payload.drink && (
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm text-zinc-500">Drink</span>
          <span className="text-sm font-medium text-zinc-900">{payload.drink.emoji} {payload.drink.name}</span>
        </div>
      )}
      {(payload.extras ?? []).length > 0 && (
        <div className="flex items-start justify-between gap-4 px-4 py-2">
          <span className="shrink-0 text-sm text-zinc-500">Extras</span>
          <span className="text-right text-sm font-medium text-zinc-900">
            {(payload.extras ?? []).map((e) => `${e.emoji} ${e.name}`).join(' · ')}
          </span>
        </div>
      )}
    </>
  );
}

export default function OrderBubble({ payload, isSender, status, paymentStatus, createdAt }: Props) {
  const st = status && STATUS_STYLES[status] ? STATUS_STYLES[status] : STATUS_STYLES.pending;

  return (
    <div className={cn('flex', isSender ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'w-full max-w-[85%] overflow-hidden rounded-3xl border shadow-sm',
        isSender ? 'rounded-br-md border-zinc-200 bg-white' : 'rounded-bl-md border-zinc-200 bg-white'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between bg-zinc-900 px-4 py-2.5">
          <span className="text-xs font-semibold text-white">🛒 Meal Order</span>
          <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', st.className)}>
            {st.label}
          </span>
        </div>

        {/* Line items */}
        <div className="divide-y divide-zinc-100">
          <LineItems payload={payload} />
        </div>

        {/* Fulfillment */}
        {payload.order_type && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2">
            <span className="text-sm text-zinc-500">Fulfillment</span>
            <span className="text-sm font-medium text-zinc-900">
              {payload.order_type === 'delivery'
                ? `🛵 Delivery${payload.delivery_address ? ` to ${payload.delivery_address}` : ''}`
                : '🏃 Pickup'}
            </span>
          </div>
        )}

        {/* Total */}
        <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2.5">
          <span className="text-xs font-semibold text-zinc-500">Total</span>
          <span className="text-base font-bold text-zinc-900">{fmt(payload.total)}</span>
        </div>

        {/* Payment status */}
        {paymentStatus && PAYMENT_STATUS_LABELS[paymentStatus] && (
          <div className="border-t border-zinc-100 px-4 py-2">
            <span className="text-xs text-zinc-500">{PAYMENT_STATUS_LABELS[paymentStatus]}</span>
          </div>
        )}

        {/* Timestamp */}
        <div className="px-4 pb-2 text-right">
          <span className="text-[10px] text-zinc-400">{fmtTime(createdAt)}</span>
        </div>
      </div>
    </div>
  );
}