// app/api/vendor/orders/[orderId]/assign-rider/route.ts
// POST { rider_id } — vendor assigns a rider to the delivery_request for this order

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

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

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}
