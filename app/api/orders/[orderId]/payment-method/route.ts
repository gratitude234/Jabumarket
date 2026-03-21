// app/api/orders/[orderId]/payment-method/route.ts
// PATCH — buyer sets payment method to cash

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

function jsonError(msg: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, code, message: msg }, { status })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated')

    const body = await req.json().catch(() => null) as { payment_method?: string } | null
    if (body?.payment_method !== 'cash') {
      return jsonError('payment_method must be "cash"', 400, 'bad_payment_method')
    }

    const admin = createSupabaseAdminClient()

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, buyer_id, vendor_id, conversation_id, total')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) return jsonError('Order not found', 404, 'order_not_found')
    if (order.buyer_id !== user.id) return jsonError('Forbidden', 403, 'forbidden')

    await admin
      .from('orders')
      .update({ payment_method: 'cash' })
      .eq('id', orderId)

    const { data: vendor } = await admin
      .from('vendors')
      .select('user_id')
      .eq('id', order.vendor_id)
      .single()

    if (vendor?.user_id) {
      try {
        await admin.from('notifications').insert({
          user_id: vendor.user_id,
          type: 'payment_cash',
          title: 'Cash payment',
          body: 'Buyer will pay cash on pickup/delivery.',
          href: '/vendor/orders',
        })
      } catch { /* non-critical */ }
    }

    if (order.conversation_id) {
      try {
        const msgBody = "🤝 I'll pay cash on pickup."
        await admin.from('messages').insert({
          conversation_id: order.conversation_id,
          sender_id: user.id,
          body: msgBody,
          type: 'text',
        })
        await admin
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: msgBody,
          })
          .eq('id', order.conversation_id)
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
