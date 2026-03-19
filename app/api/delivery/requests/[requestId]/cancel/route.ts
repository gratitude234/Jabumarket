// app/api/delivery/requests/[requestId]/cancel/route.ts
// POST — auth required, verifies buyer_id ownership before cancelling

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Unauthenticated' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: request } = await admin
    .from('delivery_requests')
    .select('id, buyer_id, status')
    .eq('id', requestId)
    .single();

  if (!request) return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 });
  if (request.buyer_id !== user.id) return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 });
  if (request.status !== 'open') return NextResponse.json({ ok: false, message: 'Cannot cancel — request is not open' }, { status: 400 });

  await admin.from('delivery_requests').update({ status: 'cancelled' }).eq('id', requestId);

  return NextResponse.json({ ok: true });
}
