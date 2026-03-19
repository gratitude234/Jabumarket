// app/api/orders/my/route.ts
// Authenticated endpoint — returns the current buyer's orders

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated');

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') ?? 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);

    const admin = createSupabaseAdminClient();

    let query = admin
      .from('orders')
      .select('id, conversation_id, vendor_id, items, total, status, order_type, delivery_address, pickup_note, created_at, updated_at, eta_ready_at')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filter === 'active') {
      query = query.in('status', ['pending', 'confirmed', 'preparing', 'ready']);
    } else if (filter === 'done') {
      query = query.in('status', ['delivered', 'cancelled']);
    }

    const { data: orders, error: ordersErr } = await query;
    if (ordersErr) return jsonError(ordersErr.message, 500, 'fetch_failed');

    const vendorIds = [...new Set((orders ?? []).map((o) => o.vendor_id))];
    const { data: vendors } = await admin
      .from('vendors')
      .select('id, name, avatar_url')
      .in('id', vendorIds);

    const vendorMap: Record<string, { name: string; avatar_url: string | null }> = {};
    for (const v of vendors ?? []) vendorMap[v.id] = { name: v.name, avatar_url: v.avatar_url };

    const enriched = (orders ?? []).map((o) => ({
      ...o,
      vendor: vendorMap[o.vendor_id] ?? { name: 'Vendor', avatar_url: null },
    }));

    return NextResponse.json({ ok: true, orders: enriched });

  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}