// app/api/orders/[orderId]/status/route.ts
// Authenticated endpoint — vendor updates order status, optionally with ETA

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ['preparing', 'cancelled'],   // merged: Accept → preparing directly
  confirmed: ['preparing', 'ready', 'cancelled'],   // kept for backward compat
  preparing: ['ready'],
  ready:     ['delivered'],
};

function buildStatusMessage(newStatus: string, orderType: string, eta?: number): string {
  switch (newStatus) {
    case 'confirmed':
      return eta
        ? `✅ Order confirmed! Ready in about ${eta} minute${eta === 1 ? '' : 's'}`
        : "✅ Order confirmed — we're on it!";
    case 'preparing':
      return eta
        ? `👨‍🍳 Order accepted — ready in ~${eta} mins`
        : '👨‍🍳 Order accepted and being prepared';
    case 'ready':
      return orderType === 'delivery'
        ? '🛵 Your order is ready — rider is on the way!'
        : '🔔 Your order is ready for pickup!';
    case 'delivered': return '✅ Order delivered. Enjoy your meal!';
    case 'cancelled': return '❌ Order cancelled';
    default:          return `Order status updated: ${newStatus}`;
  }
}

const STATUS_TITLES: Record<string, string> = {
  confirmed: 'Order confirmed',
  preparing: 'Your meal is being prepared',
  ready:     'Order ready!',
  delivered: 'Order delivered',
  cancelled: 'Order cancelled',
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated');

    const body = (await req.json().catch(() => null)) as {
      status?: string;
      eta_minutes?: number;
    } | null;

    const newStatus = body?.status;
    const eta = typeof body?.eta_minutes === 'number' && body.eta_minutes > 0 ? body.eta_minutes : undefined;

    if (!newStatus || !['confirmed', 'preparing', 'ready', 'delivered', 'cancelled'].includes(newStatus)) {
      return jsonError('Invalid status', 400, 'invalid_status');
    }

    const admin = createSupabaseAdminClient();

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, vendor_id, buyer_id, conversation_id, status, order_type')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) return jsonError('Order not found', 404, 'order_not_found');

    // Verify caller is this vendor
    const { data: vendor } = await admin
      .from('vendors')
      .select('id, user_id')
      .eq('id', order.vendor_id)
      .eq('user_id', user.id)
      .single();

    if (!vendor) return jsonError('You are not the vendor for this order', 403, 'forbidden');

    // Validate transition
    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return jsonError(`Cannot transition from ${order.status} to ${newStatus}`, 400, 'invalid_transition');
    }

    // Update order status
    const { data: updatedOrder, error: updateErr } = await admin
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    if (updateErr) return jsonError(updateErr.message, 500, 'update_failed');

    // Store ETA as a timestamp so the buyer can see a countdown.
    // Requires eta_ready_at TIMESTAMPTZ column on orders table.
    // Wrapped separately so a missing column never breaks the main update.
    if (eta && newStatus === 'preparing') {
      try {
        await admin
          .from('orders')
          .update({ eta_ready_at: new Date(Date.now() + eta * 60 * 1000).toISOString() })
          .eq('id', orderId);
      } catch (_) {}
    }

    const msgBody = buildStatusMessage(newStatus, order.order_type ?? 'pickup', eta);

    // Post status message in conversation
    if (order.conversation_id) {
      try {
        await admin.from('messages').insert({
          conversation_id: order.conversation_id,
          sender_id: user.id,
          body: msgBody,
          type: 'text',
        });
      } catch (_) {}

      try {
        await admin.from('conversations')
          .update({ last_message_at: new Date().toISOString(), last_message_preview: msgBody })
          .eq('id', order.conversation_id);
      } catch (_) {}

      try {
        await admin.rpc('increment_buyer_unread' as any, { convo_id: order.conversation_id });
      } catch (_) {}
    }

    // Notify buyer — href goes to /my-orders so they see order tracking, not just chat
    try {
      await admin.from('notifications').insert({
        user_id: order.buyer_id,
        type: 'order_status',
        title: STATUS_TITLES[newStatus] ?? `Order ${newStatus}`,
        body: msgBody,
        href: `/my-orders`,
      });
    } catch (_) {}

    // When delivered: send a second notification prompting the buyer to leave a review.
    // Fire-and-forget — a review failure must never break the status update.
    if (newStatus === 'delivered') {
      let vendorName = 'the vendor';
      try {
        const { data: vendorRow } = await admin
          .from('vendors')
          .select('name')
          .eq('id', order.vendor_id)
          .maybeSingle();
        vendorName = vendorRow?.name ?? vendorName;
      } catch (_) {}

      try {
        await admin.from('notifications').insert({
          user_id: order.buyer_id,
          type: 'review_prompt',
          title: 'How was your order?',
          body: `Leave a quick rating for ${vendorName} — it helps other students.`,
          href: `/vendors/${order.vendor_id}?review=1`,
        });
      } catch (_) {}
    }

    return NextResponse.json({ ok: true, order: updatedOrder });

  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}