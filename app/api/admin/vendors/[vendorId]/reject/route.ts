// app/api/admin/vendors/[vendorId]/reject/route.ts
// Admin-only endpoint — rejects a food vendor application

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  try {
    const { vendorId } = await params;

    // ── Admin auth ────────────────────────────────────────────
    let adminUser: { userId: string };
    try {
      adminUser = await requireAdmin();
    } catch (e: any) {
      return jsonError(e?.message ?? 'Forbidden', e?.status ?? 403, 'forbidden');
    }

    const body = (await req.json().catch(() => null)) as { reason?: string } | null;
    const reason = body?.reason?.trim();
    if (!reason) return jsonError('Rejection reason is required', 400, 'missing_reason');

    const admin = createSupabaseAdminClient();

    // ── Fetch vendor ──────────────────────────────────────────
    const { data: vendor, error: vendorErr } = await admin
      .from('vendors')
      .select('id, user_id, name, verification_status')
      .eq('id', vendorId)
      .single();

    if (vendorErr || !vendor) return jsonError('Vendor not found', 404, 'not_found');

    // ── Reject vendor ─────────────────────────────────────────
    const { error: updateErr } = await admin
      .from('vendors')
      .update({
        verification_status: 'rejected',
        accepts_orders: false,
        verified: false,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        reviewed_by: adminUser.userId,
      })
      .eq('id', vendorId);

    if (updateErr) return jsonError(updateErr.message, 500, 'update_failed');

    // ── Notify vendor user ────────────────────────────────────
    if (vendor.user_id) {
      await admin.from('notifications').insert({
        user_id: vendor.user_id,
        type: 'vendor_rejected',
        title: 'Vendor application update',
        body: `Your vendor application was not approved. Reason: ${reason}`,
        href: '/vendor',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}
