// app/api/vendor/orders/[orderId]/assign-rider/route.ts
// POST { rider_id } — vendor assigns a rider to the delivery_request for this order

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendRiderPush } from '@/lib/webPush';

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated');

    const body = (await req.json().catch(() => null)) as { rider_id?: string } | null;
    if (!body?.rider_id) return jsonError('Missing rider_id', 400, 'bad_request');

    const admin = createSupabaseAdminClient();

    // Verify caller is the vendor for this order
    const { data: order } = await admin
      .from('orders')
      .select('id, vendor_id')
      .eq('id', orderId)
      .single();

    if (!order) return jsonError('Order not found', 404, 'order_not_found');

    const { data: vendor } = await admin
      .from('vendors')
      .select('id')
      .eq('id', order.vendor_id)
      .eq('user_id', user.id)
      .single();

    if (!vendor) return jsonError('Forbidden', 403, 'forbidden');

    // Update the delivery_request row
    const { error } = await admin
      .from('delivery_requests')
      .update({ rider_id: body.rider_id, status: 'accepted' })
      .eq('order_id', orderId);

    if (error) return jsonError(error.message, 500, 'update_failed');

    // Notify the assigned rider
    try {
      const { data: delivery } = await admin
        .from('delivery_requests')
        .select('id, dropoff, note')
        .eq('order_id', orderId)
        .maybeSingle();

      const { data: rider } = await admin
        .from('riders')
        .select('id, name, user_id')
        .eq('id', body.rider_id)
        .maybeSingle();

      const { data: orderDetails } = await admin
        .from('orders')
        .select('total, items')
        .eq('id', orderId)
        .single();

      const dropoff = delivery?.dropoff ?? 'See delivery details';
      const fee = orderDetails?.total
        ? `₦${Number(orderDetails.total).toLocaleString()}`
        : '';

      const notifTitle = 'New delivery job assigned to you';
      const notifBody  = `Drop-off: ${dropoff}${fee ? ` · Fee: ${fee}` : ''}`;
      const href       = '/rider/dashboard';

      if (rider?.user_id) {
        await admin.from('notifications').insert({
          user_id: rider.user_id,
          type:    'delivery_assigned',
          title:   notifTitle,
          body:    notifBody,
          href,
        });

        void sendRiderPush(rider.id, {
          title: notifTitle,
          body:  notifBody,
          href,
          tag:   `delivery-${orderId}`,
        });
      }
    } catch { /* non-critical — assignment already succeeded */ }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}
