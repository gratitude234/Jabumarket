// app/api/internal/push-user/route.ts
// Internal-only: send a push notification to a user by user_id
// Called server-to-server or from client send() in conversation view

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sendUserPush } from '@/lib/webPush';

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await req.json() as {
      user_id: string;
      title: string;
      body: string;
      href: string;
      tag?: string;
    };

    if (!body.user_id || !body.title) {
      return NextResponse.json({ ok: false, message: 'Missing fields' }, { status: 400 });
    }

    // Security: caller must be a participant in the conversation referenced by href
    // (href format: /inbox/[conversationId])
    const conversationId = body.href?.split('/inbox/')?.[1]?.split('?')?.[0];
    if (conversationId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('buyer_id, vendor_id')
        .eq('id', conversationId)
        .maybeSingle();

      if (!conv) return NextResponse.json({ ok: false }, { status: 403 });

      // Get caller's vendor_id if any
      const { data: vendor } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      const callerVendorId = vendor?.id ?? null;

      const isBuyer = conv.buyer_id === user.id;
      const isVendor = callerVendorId && conv.vendor_id === callerVendorId;
      if (!isBuyer && !isVendor) return NextResponse.json({ ok: false }, { status: 403 });
    }

    await sendUserPush(body.user_id, {
      title: body.title,
      body: body.body,
      href: body.href,
      tag: body.tag ?? `msg-${Date.now()}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message }, { status: 500 });
  }
}
