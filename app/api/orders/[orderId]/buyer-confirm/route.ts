// app/api/orders/[orderId]/buyer-confirm/route.ts
// POST — buyer confirms they have transferred payment

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { sendVendorPush } from '@/lib/webPush'

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
      .select('id, buyer_id, vendor_id, conversation_id, total, payment_status, status')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) return jsonError('Order not found', 404, 'order_not_found')
    if (order.buyer_id !== user.id) return jsonError('Forbidden', 403, 'forbidden')
    if (order.payment_status !== 'unpaid') return jsonError('Payment already submitted', 400, 'already_submitted')
    if (['cancelled', 'delivered'].includes(order.status)) return jsonError('Order is not active', 400, 'order_inactive')

    await admin
      .from('orders')
      .update({
        payment_status: 'buyer_confirmed',
        payment_method: 'transfer',
        paid_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    const { data: vendor } = await admin
      .from('vendors')
      .select('id, user_id')
      .eq('id', order.vendor_id)
      .single()

    const notifTitle = '💸 Payment submitted'
    const notifBody  = "A buyer says they've transferred payment. Check your account and confirm."

    if (vendor?.user_id) {
      // In-app notification for vendor
      try {
        await admin.from('notifications').insert({
          user_id: vendor.user_id,
          type: 'payment_submitted',
          title: notifTitle,
          body:  notifBody,
          href:  '/vendor/orders',
        })
      } catch { /* non-critical */ }

      // Push notification to vendor's device(s)
      try {
        await sendVendorPush(order.vendor_id, {
          title: notifTitle,
          body:  notifBody,
          href:  '/vendor/orders',
          tag:   `payment-${orderId}`,
        })
      } catch { /* non-critical */ }
    }

    if (order.conversation_id) {
      try {
        const msgBody = `💸 I have transferred ₦${(order.total as number).toLocaleString()}. Please confirm once you receive it.`
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