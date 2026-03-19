// app/api/admin/vendors/[vendorId]/approve/route.ts
// Admin-only endpoint — approves a food vendor application

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(
  _req: Request,
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

    const admin = createSupabaseAdminClient();

    // ── Fetch vendor ──────────────────────────────────────────
    const { data: vendor, error: vendorErr } = await admin
      .from('vendors')
      .select('id, user_id, name, verification_status')
      .eq('id', vendorId)
      .single();

    if (vendorErr || !vendor) return jsonError('Vendor not found', 404, 'not_found');
    if (vendor.verification_status === 'approved') {
      return jsonError('Already approved', 409, 'already_approved');
    }

    // ── Approve vendor ────────────────────────────────────────
    const { error: updateErr } = await admin
      .from('vendors')
      .update({
        verification_status: 'approved',
        accepts_orders: true,
        verified: true,
        verified_at: new Date().toISOString(),
        reviewed_by: adminUser.userId,
        rejection_reason: null,
        rejected_at: null,
      })
      .eq('id', vendorId);

    if (updateErr) return jsonError(updateErr.message, 500, 'update_failed');

    // ── Notify vendor user ────────────────────────────────────
    if (vendor.user_id) {
      await admin.from('notifications').insert({
        user_id: vendor.user_id,
        type: 'vendor_approved',
        title: 'Vendor account approved!',
        body: 'Your vendor account has been approved! You can now set up your menu and start receiving orders.',
        href: '/vendor',
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Server error' }, { status: 500 });
  }
}
