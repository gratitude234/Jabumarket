// app/api/marketplace/request-callback/route.ts
// Sends a callback-request notification to the seller and ensures a conversation
// exists so the seller can reach the buyer through the inbox.

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: 'Unauthenticated' }, { status: 401 });
    }

    const body = await req.json() as { vendor_id: string; listing_id: string };
    const { vendor_id, listing_id } = body;

    if (!vendor_id || !listing_id) {
      return NextResponse.json({ ok: false, message: 'Missing fields' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const [listingRes, vendorRes, profileRes] = await Promise.all([
      admin.from('listings').select('title').eq('id', listing_id).maybeSingle(),
      admin.from('vendors').select('user_id, name').eq('id', vendor_id).single(),
      admin.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle(),
    ]);

    const listingTitle = (listingRes.data?.title ?? 'a listing').trim();
    const vendorUserId = vendorRes.data?.user_id;
    const profile = profileRes.data as { full_name: string | null; email: string | null } | null;
    const buyerName =
      profile?.full_name ||
      (profile?.email ? profile.email.split('@')[0] : null) ||
      'A buyer';

    // Ensure a conversation exists so seller can open the chat and find the buyer
    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .eq('listing_id', listing_id)
      .eq('buyer_id', user.id)
      .maybeSingle();

    if (!existing) {
      await admin
        .from('conversations')
        .insert({ listing_id, buyer_id: user.id, vendor_id })
        .select('id')
        .single();
    }

    if (vendorUserId && vendorUserId !== user.id) {
      await admin.from('notifications').insert({
        user_id: vendorUserId,
        type: 'callback_request',
        title: 'A buyer wants you to call them',
        body: `${buyerName} is interested in "${listingTitle}" and requested a callback. Open their chat to get their contact.`,
        href: `/inbox`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { message?: string };
    return NextResponse.json({ ok: false, message: err?.message ?? 'Error' });
  }
}
