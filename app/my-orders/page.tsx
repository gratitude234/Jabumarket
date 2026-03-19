'use client';
// app/my-orders/page.tsx
// Buyer order history — Realtime status updates, ETA countdown, ready banner
//
// REQUIRED DB MIGRATION (run once in Supabase SQL editor):
//   ALTER TABLE public.orders REPLICA IDENTITY FULL;
//
// Without REPLICA IDENTITY FULL, Supabase Realtime UPDATE events do not
// include buyer_id in the WAL payload, so the filter buyer_id=eq.{userId}
// never matches — updates are silently dropped on the client.
//
// Also ensure this RLS SELECT policy exists:
//   CREATE POLICY "buyers can view own orders" ON public.orders
//   FOR SELECT USING (auth.uid() = buyer_id);

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { summarizeOrderLines } from '@/types/meal-builder';
import type { OrderPayload, OrderLine } from '@/types/meal-builder';
import MealBuilder from '@/components/chat/MealBuilder';
import {
  Loader2, MessageCircle, UtensilsCrossed, ArrowLeft, Bell, X, RefreshCw, RotateCcw, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderEntry = {
  id: string;
  conversation_id: string | null;
  vendor_id: string;
  items: OrderPayload;
  total: number;
  status: string;
  order_type: string;
  delivery_address: string | null;
  pickup_note: string | null;
  created_at: string;
  updated_at: string;
  eta_ready_at: string | null;
  vendor: { name: string; avatar_url: string | null };
};

// Realtime payload shape — no vendor join
type OrderRow = Omit<OrderEntry, 'vendor'>;

const STATUS_STYLES: Record<string, {
  label: string; dotClass: string; textClass: string; ringClass: string;
}> = {
  pending:   { label: 'Pending',   dotClass: 'bg-amber-400',   textClass: 'text-amber-700',   ringClass: 'ring-amber-200' },
  confirmed: { label: 'Confirmed', dotClass: 'bg-blue-500',    textClass: 'text-blue-700',    ringClass: 'ring-blue-100' },
  preparing: { label: 'Preparing', dotClass: 'bg-purple-500',  textClass: 'text-purple-700',  ringClass: 'ring-purple-100' },
  ready:     { label: 'Ready!',    dotClass: 'bg-emerald-500', textClass: 'text-emerald-700', ringClass: 'ring-emerald-200' },
  delivered: { label: 'Delivered', dotClass: 'bg-emerald-600', textClass: 'text-emerald-800', ringClass: '' },
  cancelled: { label: 'Cancelled', dotClass: 'bg-zinc-400',    textClass: 'text-zinc-500',    ringClass: '' },
};

const ACTIVE = ['pending', 'confirmed', 'preparing', 'ready'];

const TABS = [
  { key: 'all',    label: 'All orders' },
  { key: 'active', label: 'Active' },
  { key: 'done',   label: 'Completed' },
] as const;
type Tab = (typeof TABS)[number]['key'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
}

function etaLabel(etaReadyAt: string | null | undefined): string | null {
  if (!etaReadyAt) return null;
  const mins = Math.round((new Date(etaReadyAt).getTime() - Date.now()) / 60000);
  if (mins <= 0) return null;
  return `~${mins} min`;
}

// ── Component ─────────────────────────────────────────────────────────────────

// ── Inline review card ────────────────────────────────────────────────────────

function ReviewCard({
  vendorId,
  userId,
  onReviewed,
}: {
  vendorId: string;
  userId: string;
  onReviewed: () => void;
}) {
  const [rating, setRating]     = useState(0);
  const [comment, setComment]   = useState('');
  const [submitting, setSubmit] = useState(false);
  const [done, setDone]         = useState(false);

  async function submit() {
    if (rating === 0) return;
    setSubmit(true);
    try {
      await supabase.from('vendor_reviews').insert({
        vendor_id: vendorId,
        reviewer_id: userId,
        rating,
        comment: comment.trim() || null,
      });
      setDone(true);
      onReviewed();
    } catch {
      // silently ignore — non-critical
    } finally {
      setSubmit(false);
    }
  }

  if (done) {
    return (
      <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-700">
        Thanks for your review ✓
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
      <p className="text-xs font-semibold text-zinc-700">Rate this order</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            className={cn(
              'text-xl leading-none transition-transform hover:scale-110',
              star <= rating ? 'text-amber-400' : 'text-zinc-300'
            )}
            aria-label={`${star} star`}
          >
            ★
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Add a comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={200}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
      />
      <button
        type="button"
        onClick={submit}
        disabled={rating === 0 || submitting}
        className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        Submit review
      </button>
    </div>
  );
}

// ── Self-cancellation button ──────────────────────────────────────────────────
// Visible only on pending orders. Asks for a single confirmation tap before
// calling the cancel endpoint. Handles the vendor-already-accepted race.

function CancelButton({
  orderId,
  onCancelled,
}: {
  orderId: string;
  onCancelled: () => void;
}) {
  const [step, setStep]     = useState<'idle' | 'confirm' | 'cancelling'>('idle');
  const [error, setError]   = useState<string | null>(null);

  async function confirm() {
    setStep('cancelling');
    setError(null);
    try {
      const res  = await fetch(`/api/orders/${orderId}/cancel`, { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        onCancelled();
      } else {
        // 409 = vendor already accepted — surface the helpful message
        setError(json.message ?? 'Could not cancel order.');
        setStep('idle');
      }
    } catch {
      setError('Something went wrong. Try again.');
      setStep('idle');
    }
  }

  if (step === 'confirm') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5">
        <p className="flex-1 text-xs font-medium text-red-800">Cancel this order?</p>
        <button
          type="button"
          onClick={() => setStep('idle')}
          className="rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={confirm}
          className="rounded-xl bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
        >
          Yes, cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1.5">
      <button
        type="button"
        onClick={() => setStep('confirm')}
        disabled={step === 'cancelling'}
        className="inline-flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 transition-colors"
      >
        {step === 'cancelling'
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <XCircle className="h-3.5 w-3.5" />}
        Cancel order
      </button>
      {error && (
        <p className="text-[11px] text-red-600 leading-snug max-w-xs">{error}</p>
      )}
    </div>
  );
}

// ── Reorder flow ──────────────────────────────────────────────────────────────
// Validates items are still active, then opens MealBuilder pre-filled.

type ReorderState = 'idle' | 'validating' | 'ready' | 'partial' | 'unavailable';

function ReorderFlow({
  order,
  onDone,
}: {
  order: OrderEntry;
  onDone: () => void;
}) {
  const [state, setState]         = useState<ReorderState>('idle');
  const [validLines, setValid]    = useState<OrderLine[]>([]);
  const [badItems, setBad]        = useState<string[]>([]);
  const [showBuilder, setBuilder] = useState(false);

  async function start() {
    setState('validating');
    const lines: OrderLine[] = order.items?.lines ?? [];
    if (lines.length === 0) { setState('unavailable'); return; }

    try {
      // Ask the menu API for the vendor's current active items
      const res  = await fetch(`/api/vendors/${order.vendor_id}/menu`);
      const json = await res.json();
      const activeIds = new Set<string>(
        (json.categories ?? []).flatMap((c: any) => c.items.map((i: any) => i.id))
      );

      const good: OrderLine[] = [];
      const bad:  string[]    = [];
      for (const line of lines) {
        if (activeIds.has(line.item_id)) good.push(line);
        else bad.push(line.name);
      }

      setBad(bad);
      setValid(good);

      if (good.length === 0)   { setState('unavailable'); return; }
      if (bad.length > 0)      { setState('partial'); return; }
      setState('ready');
      setBuilder(true); // all items OK — open directly
    } catch {
      setState('idle');
    }
  }

  if (showBuilder) {
    return (
      <div className="mt-3 rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 border-b border-zinc-100">
          <p className="text-xs font-semibold text-zinc-700">Reorder from {order.vendor.name}</p>
          <button type="button" onClick={() => { setBuilder(false); setState('idle'); onDone(); }}
            className="grid h-6 w-6 place-items-center rounded-lg hover:bg-zinc-200">
            <X className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
        <MealBuilder
          vendorId={order.vendor_id}
          vendorName={order.vendor.name}
          prefillLines={validLines}
          onClose={() => { setBuilder(false); setState('idle'); }}
          onOrderSent={onDone}
        />
      </div>
    );
  }

  if (state === 'partial') {
    return (
      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-2">
        <p className="text-xs font-semibold text-amber-800">
          {badItems.length} item{badItems.length > 1 ? 's' : ''} no longer available
        </p>
        <p className="text-xs text-amber-700">
          {badItems.join(', ')} {badItems.length > 1 ? 'are' : 'is'} sold out or removed.
          The rest will be pre-filled.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setState('idle')}
            className="flex-1 rounded-xl border border-amber-300 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100">
            Cancel
          </button>
          <button type="button" onClick={() => setBuilder(true)}
            className="flex-1 rounded-xl bg-zinc-900 py-2 text-xs font-semibold text-white hover:bg-zinc-700">
            Continue anyway
          </button>
        </div>
      </div>
    );
  }

  if (state === 'unavailable') {
    return (
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
        <p className="text-xs text-zinc-500">All items from this order are no longer available.</p>
        <button type="button" onClick={() => setState('idle')}
          className="ml-2 text-xs font-medium text-zinc-600 hover:text-zinc-900">
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={state === 'validating'}
      className="mt-3 inline-flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
    >
      {state === 'validating'
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <RotateCcw className="h-3.5 w-3.5" />}
      Reorder
    </button>
  );
}

export default function MyOrdersPage() {
  const router = useRouter();

  const [userId, setUserId]               = useState<string | null>(null);
  const [orders, setOrders]               = useState<OrderEntry[]>([]);
  const [loading, setLoading]             = useState(true);
  const [tab, setTab]                     = useState<Tab>('all');
  const [error, setError]                 = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk]       = useState<boolean | null>(null);
  const [readyAlert, setReadyAlert]       = useState<{ orderId: string; vendorName: string } | null>(null);
  const [reviewedVendors, setReviewed]    = useState<Set<string>>(new Set());
  // deliveryStatuses: order_id → delivery_request status
  const [deliveryStatuses, setDeliveryStatuses] = useState<Record<string, string>>({});
  // Tick every 30s so ETA chips re-compute without a full data refetch
  const [tick, setTick]             = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Vendor data is not in realtime payloads — preserve it from REST responses
  const vendorCacheRef = useRef<Record<string, { name: string; avatar_url: string | null }>>({});
  // Keep tab accessible inside the realtime callback without re-subscribing
  const tabRef = useRef<Tab>('all');

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadOrders = useCallback(async (filterTab: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/orders/my?filter=${filterTab}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.message ?? 'Failed to load orders');
      const loadedOrders: OrderEntry[] = json.orders;
      for (const o of loadedOrders) {
        vendorCacheRef.current[o.vendor_id] = o.vendor;
      }
      setOrders(loadedOrders);

      // Fetch delivery_request status for delivery orders
      const deliveryOrderIds = loadedOrders
        .filter((o) => o.order_type === 'delivery')
        .map((o) => o.id);
      if (deliveryOrderIds.length > 0) {
        const { data: drs } = await supabase
          .from('delivery_requests')
          .select('order_id, status')
          .in('order_id', deliveryOrderIds);
        if (drs && drs.length > 0) {
          const map: Record<string, string> = {};
          for (const dr of drs) if (dr.order_id) map[dr.order_id] = dr.status;
          setDeliveryStatuses((prev) => ({ ...prev, ...map }));
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Auth + initial load ─────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/login'); return; }
      setUserId(data.user.id);
      loadOrders('all');
      // Pre-load vendor IDs the user has already reviewed
      supabase
        .from('vendor_reviews')
        .select('vendor_id')
        .eq('reviewer_id', data.user.id)
        .then(({ data: rows }) => {
          if (rows && rows.length > 0) {
            setReviewed(new Set(rows.map((r) => r.vendor_id)));
          }
        });
    });
  }, [loadOrders, router]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  //
  // Requires: ALTER TABLE public.orders REPLICA IDENTITY FULL;
  //
  // Postgres UPDATE WAL records only include changed columns + PK by default.
  // buyer_id never changes on a status update, so without FULL identity it is
  // absent from the WAL diff — Supabase's filter can't match it and drops the event.
  //
  // The subscribe() callback receives the channel status:
  //   'SUBSCRIBED'         → realtime is live, update the indicator to green
  //   'CHANNEL_ERROR'      → something went wrong (missing policy, bad filter)
  //   'TIMED_OUT'          → network issue
  //   'CLOSED'             → channel was explicitly closed

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`buyer-orders:${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'orders',
          filter: `buyer_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as OrderRow;

          setOrders((prev) => {
            const exists = prev.some((o) => o.id === row.id);
            if (!exists) return prev; // not visible in this tab — skip

            return prev.map((o): OrderEntry => {
              if (o.id !== row.id) return o;
              return {
                ...o,
                status:       row.status,
                updated_at:   row.updated_at,
                eta_ready_at: row.eta_ready_at,
                vendor:       vendorCacheRef.current[o.vendor_id] ?? o.vendor,
              };
            });
          });

          // Remove from active tab when order completes
          if (tabRef.current === 'active' && ['delivered', 'cancelled'].includes(row.status)) {
            setOrders((prev) => prev.filter((o) => o.id !== row.id));
          }

          // Ready banner
          if (row.status === 'ready') {
            const vendor = vendorCacheRef.current[row.vendor_id];
            setReadyAlert({
              orderId:    row.id,
              vendorName: vendor?.name ?? 'the vendor',
            });
          }
        }
      )
      .subscribe((status) => {
        setRealtimeOk(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // ── Delivery request Realtime ────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`buyer-delivery-requests:${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'delivery_requests',
          filter: `buyer_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { order_id?: string; status?: string };
          if (row.order_id && row.status) {
            setDeliveryStatuses((prev) => ({ ...prev, [row.order_id!]: row.status! }));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Auto-dismiss ready alert after 8s
  useEffect(() => {
    if (!readyAlert) return;
    const t = setTimeout(() => setReadyAlert(null), 8000);
    return () => clearTimeout(t);
  }, [readyAlert]);

  // ── Tab switching ───────────────────────────────────────────────────────────

  function switchTab(t: Tab) {
    tabRef.current = t;
    setTab(t);
    loadOrders(t);
  }

  const activeCount = orders.filter((o) => ACTIVE.includes(o.status)).length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-24">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()}
          className="grid h-9 w-9 place-items-center rounded-2xl border bg-white hover:bg-zinc-50">
          <ArrowLeft className="h-4 w-4 text-zinc-700" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-zinc-900">My Orders</h1>
          {activeCount > 0 && (
            <p className="text-xs font-semibold text-amber-600">
              {activeCount} order{activeCount > 1 ? 's' : ''} in progress
            </p>
          )}
        </div>

        {/* Live / offline indicator */}
        {realtimeOk !== null && (
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
            realtimeOk
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-zinc-200 bg-zinc-50 text-zinc-500'
          )}>
            <span className={cn(
              'h-1.5 w-1.5 rounded-full',
              realtimeOk ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
            )} />
            {realtimeOk ? 'Live' : 'Offline'}
          </span>
        )}

        {/* Manual refresh fallback when realtime is down */}
        {realtimeOk === false && (
          <button type="button" onClick={() => loadOrders(tab)}
            title="Refresh orders"
            className="grid h-9 w-9 place-items-center rounded-2xl border bg-white hover:bg-zinc-50">
            <RefreshCw className="h-4 w-4 text-zinc-600" />
          </button>
        )}
      </div>

      {/* Ready banner */}
      {readyAlert && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <Bell className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800">
              Your order from {readyAlert.vendorName} is ready!
            </p>
            <p className="text-xs text-emerald-700">Go pick it up now.</p>
          </div>
          <button type="button" onClick={() => setReadyAlert(null)}
            className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border bg-zinc-50 p-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => switchTab(t.key)}
            className={cn(
              'flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all',
              tab === t.key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Orders */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700 mb-3">{error}</p>
          <button type="button" onClick={() => loadOrders(tab)}
            className="inline-flex items-center gap-1.5 rounded-2xl border px-4 py-2 text-sm font-medium hover:bg-zinc-50">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-3xl border bg-white p-10 text-center">
          <UtensilsCrossed className="mx-auto mb-3 h-10 w-10 text-zinc-200" />
          <p className="font-semibold text-zinc-900">No orders yet</p>
          <p className="mt-1 text-sm text-zinc-500">Your food orders will appear here.</p>
          <Link href="/food"
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white no-underline hover:bg-zinc-700">
            <UtensilsCrossed className="h-4 w-4" />
            Order food
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const st       = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;
            const isActive = ACTIVE.includes(order.status);
            const isReady  = order.status === 'ready';
            // tick is a dependency so this recomputes every 30s
            // eslint-disable-next-line react-hooks/exhaustive-deps
            const eta      = order.status === 'preparing' ? etaLabel(order.eta_ready_at) : null;
            const deliveryStatus = order.order_type === 'delivery' ? (deliveryStatuses[order.id] ?? null) : null;

            return (
              <div key={order.id}
                className={cn(
                  'rounded-3xl border bg-white p-4 shadow-sm transition-all',
                  isActive && `ring-1 ${st.ringClass}`,
                  isReady  && 'border-emerald-300'
                )}>

                {/* Vendor row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {order.vendor.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={order.vendor.avatar_url} alt=""
                        className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-lg">🍽</div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900">{order.vendor.name}</p>
                      <p className="text-xs text-zinc-400">{timeAgo(order.created_at)}</p>
                    </div>
                  </div>
                  <span className={cn('flex shrink-0 items-center gap-1.5 text-xs font-semibold', st.textClass)}>
                    <span className={cn('h-2 w-2 rounded-full', st.dotClass, isActive && 'animate-pulse')} />
                    {st.label}
                  </span>
                </div>

                {/* Items */}
                <p className="mt-3 text-sm text-zinc-700">{summarizeOrderLines(order.items)}</p>

                {/* ETA chip */}
                {eta && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                    Ready in {eta}
                  </div>
                )}

                {/* Ready prompt */}
                {isReady && (
                  <div className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                    🔔 Your order is ready — go pick it up!
                  </div>
                )}

                {/* Fulfillment */}
                <p className="mt-2 text-xs text-zinc-500">
                  {order.order_type === 'delivery'
                    ? `🛵 Delivery${order.delivery_address ? ` → ${order.delivery_address}` : ''}`
                    : '🏃 Pickup'}
                </p>
                {order.pickup_note && (
                  <p className="mt-1 text-xs italic text-zinc-400">"{order.pickup_note}"</p>
                )}

                {/* FIX 15 — Coaching message when rider not yet assigned */}
                {deliveryStatus === 'open' && (
                  <div className="mt-2 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                    <p className="text-xs text-amber-800">
                      Your vendor is arranging a rider. You'll see updates here once one is assigned.
                    </p>
                  </div>
                )}

                {/* FIX 10 — Delivery status chain */}
                {deliveryStatus && deliveryStatus !== 'cancelled' && (
                  <div className="mt-2 space-y-1">
                    {(
                      [
                        { key: 'open',      label: 'Looking for a rider' },
                        { key: 'accepted',  label: 'Rider assigned' },
                        { key: 'picked_up', label: 'Rider picked up your order' },
                        { key: 'delivered', label: 'Delivered ✓' },
                      ] as const
                    ).map(({ key, label }) => {
                      const ORDER = ['open', 'accepted', 'picked_up', 'delivered'];
                      const reached = ORDER.indexOf(deliveryStatus) >= ORDER.indexOf(key);
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            reached ? 'bg-emerald-500' : 'bg-zinc-200'
                          )} />
                          <p className={cn(
                            'text-xs',
                            reached ? 'font-medium text-zinc-800' : 'text-zinc-400'
                          )}>
                            {label}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm font-bold text-zinc-900">₦{order.total.toLocaleString()}</p>
                  {order.conversation_id && (
                    <Link href={`/inbox/${order.conversation_id}`}
                      className="inline-flex items-center gap-1.5 rounded-2xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-700 no-underline hover:bg-zinc-50">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {isActive ? 'Chat with vendor' : 'View chat'}
                    </Link>
                  )}
                </div>

                {/* Cancel — self-service while order is still pending */}
                {order.status === 'pending' && (
                  <CancelButton
                    orderId={order.id}
                    onCancelled={() => {
                      // Optimistic: flip status locally so the card updates instantly
                      // The Realtime subscription will also push the DB change
                      setOrders((prev) =>
                        prev.map((o) => o.id === order.id ? { ...o, status: 'cancelled' } : o)
                      );
                    }}
                  />
                )}

                {/* Reorder — shown on delivered orders only */}
                {order.status === 'delivered' && (
                  <ReorderFlow
                    order={order}
                    onDone={() => switchTab('active')}
                  />
                )}

                {/* Inline review prompt — delivered orders not yet reviewed */}
                {order.status === 'delivered' && userId && !reviewedVendors.has(order.vendor_id) && (
                  <ReviewCard
                    vendorId={order.vendor_id}
                    userId={userId}
                    onReviewed={() =>
                      setReviewed((prev) => new Set([...prev, order.vendor_id]))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}