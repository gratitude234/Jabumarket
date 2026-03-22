// app/api/orders/[orderId]/receipt/route.ts
// POST — buyer uploads a transfer receipt image.
// Stores to Supabase Storage (order-receipts bucket) and writes receipt_url
// back to the orders row so the vendor can view it before confirming payment.

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

function jsonError(msg: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, code, message: msg }, { status })
}

const MAX_FILE_BYTES = 5 * 1024 * 1024  // 5 MB
const ALLOWED_TYPES  = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonError('Unauthenticated', 401, 'unauthenticated')

    // ── Parse multipart form ──────────────────────────────────────────────────
    const formData = await req.formData().catch(() => null)
    const file = formData?.get('receipt') as File | null

    if (!file) return jsonError('No receipt file provided', 400, 'no_file')
    if (file.size > MAX_FILE_BYTES) return jsonError('File too large (max 5 MB)', 400, 'file_too_large')
    if (!ALLOWED_TYPES.includes(file.type)) {
      return jsonError('File must be a JPEG, PNG, WebP, or HEIC image', 400, 'invalid_type')
    }

    const admin = createSupabaseAdminClient()

    // ── Verify the order belongs to this buyer ────────────────────────────────
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, buyer_id, vendor_id, conversation_id, payment_status')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) return jsonError('Order not found', 404, 'order_not_found')
    if (order.buyer_id !== user.id) return jsonError('Forbidden', 403, 'forbidden')
    if (order.payment_status === 'vendor_confirmed') {
      return jsonError('Payment already confirmed — receipt cannot be changed', 400, 'already_confirmed')
    }

    // ── Upload to Supabase Storage ─────────────────────────────────────────────
    // Bucket: order-receipts (private, no public access)
    // Path:   {orderId}/{timestamp}.{ext}
    const ext      = file.type.split('/')[1].replace('jpeg', 'jpg')
    const filePath = `${orderId}/${Date.now()}.${ext}`
    const buffer   = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from('order-receipts')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,       // overwrite if buyer re-uploads
      })

    if (uploadErr) {
      console.error('[receipt] storage upload failed:', uploadErr.message)
      return jsonError('Failed to upload receipt. Please try again.', 500, 'upload_failed')
    }

    // ── Generate a signed URL valid for 7 days ────────────────────────────────
    const { data: signedData, error: signErr } = await admin.storage
      .from('order-receipts')
      .createSignedUrl(filePath, 60 * 60 * 24 * 7)  // 7 days

    if (signErr || !signedData?.signedUrl) {
      return jsonError('Upload succeeded but could not generate preview URL', 500, 'sign_failed')
    }

    const receiptUrl = signedData.signedUrl

    // ── Write receipt_url back to the order ───────────────────────────────────
    await admin
      .from('orders')
      .update({ receipt_url: receiptUrl })
      .eq('id', orderId)

    // ── Notify vendor so they know a receipt is ready to view ─────────────────
    const { data: vendor } = await admin
      .from('vendors')
      .select('user_id')
      .eq('id', order.vendor_id)
      .single()

    if (vendor?.user_id) {
      try {
        await admin.from('notifications').insert({
          user_id: vendor.user_id,
          type:    'receipt_uploaded',
          title:   '🧾 Receipt uploaded',
          body:    'A buyer has uploaded a transfer receipt. Review it before confirming payment.',
          href:    '/vendor/orders',
        })
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ ok: true, receipt_url: receiptUrl })

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}