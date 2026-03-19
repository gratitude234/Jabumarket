// app/api/orders/[orderId]/cancel/route.ts
// Authenticated buyer endpoint — self-cancel a pending order.
// Only allowed while status === 'pending' (vendor hasn't acted yet).
// Once the vendor accepts (status moves to 'preparing'), this returns 409
// and the student must request cancellation via chat.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function jsonError(msg: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, code, message: msg }, { status });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    // ── Auth ──────────────────────────────────────────────────────────────────
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated');

    const admin = createSupabaseAdminClient();

    // ── Fetch order ───────────────────────────────────────────────────────────
    const { data: order, error: fetchErr } = await admin
      .from('orders')
      .select('id, buyer_id, vendor_id, status, conversation_id, total')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) return jsonError('Order not found', 404, 'not_found');

    // ── Authorise: only the buyer can self-cancel ─────────────────────────────
    if (order.buyer_id !== user.id) {
      return jsonError('Forbidden', 403, 'forbidden');
    }

    // ── Guard: only pending orders can be self-cancelled ──────────────────────
    if (order.status !== 'pending') {
      const msg = ['preparing', 'ready'].includes(order.status)
        ? 'The vendor has already started your order. Message them to request a cancellation.'
        : order.status === 'delivered'
        ? 'This order has already been delivered.'
        : order.status === 'cancelled'
        ? 'This order is already cancelled.'
        : `Cannot cancel an order with status: ${order.status}`;
      return jsonError(msg, 409, 'not_cancellable');
    }

    // ── Cancel ────────────────────────────────────────────────────────────────
    const { error: cancelErr } = await admin
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'pending'); // double-check in DB to prevent race with vendor accept

    if (cancelErr) return jsonError(cancelErr.message, 500, 'cancel_failed');

    // ── Post cancellation message in conversation ─────────────────────────────
    if (order.conversation_id) {
      await admin.from('messages').insert({
        conversation_id: order.conversation_id,
        sender_id: user.id,
        body: '❌ Order cancelled by customer',
        type: 'text',
      }).catch(() => {});

      await admin.from('conversations')
        .update({
          last_message_preview: '❌ Order cancelled by customer',
          last_message_at: new Date().toISOString(),
        })
        .eq('id', order.conversation_id)
        .catch(() => {});

      // Increment vendor unread so they see the cancellation
      await admin.rpc('increment_vendor_unread' as any, { convo_id: order.conversation_id }).catch(() => {});
    }

    // ── Notify vendor ─────────────────────────────────────────────────────────
    const { data: vendor } = await admin
      .from('vendors')
      .select('user_id')
      .eq('id', order.vendor_id)
      .single();

    if (vendor?.user_id) {
      await admin.from('notifications').insert({
        user_id: vendor.user_id,
        type: 'order_cancelled',
        title: 'Order cancelled',
        body: `A ₦${order.total.toLocaleString()} order was cancelled before you accepted it.`,
        href: '/vendor/orders',
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });

  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}