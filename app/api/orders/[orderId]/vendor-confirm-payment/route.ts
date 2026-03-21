// app/api/orders/[orderId]/vendor-confirm-payment/route.ts
// POST — vendor confirms they received the buyer's transfer

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

function jsonError(msg: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, code, message: msg }, { status })
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated')

    const admin = createSupabaseAdminClient()

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, buyer_id, vendor_id, conversation_id, payment_status')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) return jsonError('Order not found', 404, 'order_not_found')
    if (order.payment_status !== 'buyer_confirmed') {
      return jsonError('No pending payment to confirm', 400, 'payment_not_pending')
    }

    // Verify caller is the vendor for this order
    const { data: vendor } = await admin
      .from('vendors')
      .select('id, user_id')
      .eq('id', order.vendor_id)
      .eq('user_id', user.id)
      .single()

    if (!vendor) return jsonError('Forbidden', 403, 'forbidden')

    await admin
      .from('orders')
      .update({
        payment_status: 'vendor_confirmed',
        status: 'preparing',
      })
      .eq('id', orderId)

    try {
      await admin.from('notifications').insert({
        user_id: order.buyer_id,
        type: 'payment_confirmed',
        title: '✅ Payment confirmed!',
        body: 'Vendor confirmed your transfer. Your order is now being prepared.',
        href: '/my-orders',
      })
    } catch { /* non-critical */ }

    if (order.conversation_id) {
      try {
        const msgBody = '✅ Payment received! Your order is being prepared.'
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
