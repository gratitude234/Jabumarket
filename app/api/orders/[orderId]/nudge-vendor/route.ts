// app/api/orders/[orderId]/nudge-vendor/route.ts
// POST — buyer re-pings the vendor when stuck in buyer_confirmed for too long.
// Rate-limited to once per 15 minutes per order so it cannot be spammed.

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

function jsonError(msg: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, code, message: msg }, { status })
}

const NUDGE_COOLDOWN_MS = 15 * 60 * 1000  // 15 minutes

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
      .select('id, buyer_id, vendor_id, conversation_id, total, payment_status, last_nudge_at')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) return jsonError('Order not found', 404, 'order_not_found')
    if (order.buyer_id !== user.id) return jsonError('Forbidden', 403, 'forbidden')

    // Only valid when payment is claimed but not yet confirmed by vendor
    if (order.payment_status !== 'buyer_confirmed') {
      return jsonError('Order is not awaiting vendor payment confirmation', 400, 'wrong_state')
    }

    // ── Rate limit ─────────────────────────────────────────────────────────────
    // Stored in payment_note as "nudged:{ISO}" — lightweight, no migration needed.
    // If payment_note contains real vendor content we skip the check and allow it.
    const lastNudgeAt = (order as any).last_nudge_at as string | null
    if (lastNudgeAt) {
      const elapsed = Date.now() - new Date(lastNudgeAt).getTime()
      if (!isNaN(elapsed) && elapsed < NUDGE_COOLDOWN_MS) {
        const waitMins = Math.ceil((NUDGE_COOLDOWN_MS - elapsed) / 60000)
        return jsonError(
          `Please wait ${waitMins} more minute${waitMins === 1 ? '' : 's'} before nudging again.`,
          429,
          'nudge_cooldown'
        )
      }
    }

    // Stamp time so the next call can enforce the cooldown
    await admin
      .from('orders')
      .update({ last_nudge_at: new Date().toISOString() })
      .eq('id', orderId)

    // ── In-app notification to vendor ─────────────────────────────────────────
    const { data: vendor } = await admin
      .from('vendors')
      .select('user_id')
      .eq('id', order.vendor_id)
      .single()

    if (vendor?.user_id) {
      try {
        await admin.from('notifications').insert({
          user_id: vendor.user_id,
          type:    'payment_nudge',
          title:   '⏳ Buyer is waiting for payment confirmation',
          body:    `A buyer transferred ₦${(order.total as number).toLocaleString()} and is still waiting. Please confirm or dispute the payment.`,
          href:    '/vendor/orders',
        })
      } catch { /* non-critical */ }

      // Push notification — reaches vendor even when tab is closed
      try {
        const { sendPush } = await import('@/lib/webPush')
        const { data: subs } = await admin
          .from('vendor_push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('vendor_id', order.vendor_id)
        if (subs && subs.length > 0) {
          await Promise.allSettled(
            subs.map((sub) =>
              sendPush(sub, {
                title: '⏳ Payment confirmation needed',
                body:  `Buyer is waiting — check ₦${(order.total as number).toLocaleString()} transfer`,
                data:  { href: '/vendor/orders' },
              })
            )
          )
        }
      } catch { /* push failure must never crash the request */ }
    }

    // ── Chat message — visible paper trail for both parties ───────────────────
    if (order.conversation_id) {
      try {
        const msgBody = `⏳ Hi, I transferred ₦${(order.total as number).toLocaleString()} and I'm still waiting for confirmation. Please check when you can.`
        await admin.from('messages').insert({
          conversation_id: order.conversation_id,
          sender_id:       user.id,
          body:            msgBody,
          type:            'text',
        })
        await admin
          .from('conversations')
          .update({
            last_message_at:      new Date().toISOString(),
            last_message_preview: msgBody,
          })
          .eq('id', order.conversation_id)
        await admin.rpc('increment_vendor_unread' as any, { convo_id: order.conversation_id })
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ ok: true })

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}