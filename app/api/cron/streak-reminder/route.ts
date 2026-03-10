// app/api/cron/streak-reminder/route.ts
//
// Cron route: send WhatsApp streak reminders to at-risk users.
//
// TRIGGERING
// ----------
// Called automatically by Vercel Cron (see vercel.json) at 19:00 UTC every day
// (equivalent to 8 PM WAT, a good evening nudge).
// Can also be invoked manually:
//   curl -X POST https://your-domain/api/cron/streak-reminder \
//        -H "Authorization: Bearer $CRON_SECRET"
//
// REQUIRED ENV VARS
// -----------------
//   CRON_SECRET                — shared secret Vercel sends as Bearer token
//   WHATSAPP_TOKEN             — Meta Cloud API permanent system-user access token
//   WHATSAPP_PHONE_NUMBER_ID   — Meta Business phone number ID (from API dashboard)
//
// AT-RISK DEFINITION
// ------------------
// A user is "at risk" today when:
//   • They have a streak > 0 (practiced on at least one prior consecutive day)
//   • They DID practice yesterday (streak is currently alive)
//   • They have NOT practiced today yet
//   • They opted in: whatsapp_notify = true AND whatsapp_phone IS NOT NULL
//
// MESSAGE TEMPLATE
// ----------------
// Uses Meta's "send_template" API with a plain text fallback body so the route
// works even without a pre-approved template (useful during development).
// Replace WHATSAPP_TEMPLATE_NAME with your approved template name, or leave the
// freeform body for testing inside the 24-hour session window.

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// ── Config ────────────────────────────────────────────────────────────────────

const WHATSAPP_API_VERSION = "v19.0";
const WHATSAPP_API_BASE    = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

// How many messages to send per invocation (safety cap against runaway charges)
const SEND_LIMIT = 200;

// ── Types ─────────────────────────────────────────────────────────────────────

type AtRiskRow = {
  user_id: string;
  whatsapp_phone: string;
  streak: number;
};

type SendResult = {
  phone: string;
  ok: boolean;
  waMessageId?: string;
  error?: string;
};

// ── WhatsApp sender ───────────────────────────────────────────────────────────

async function sendWhatsApp(
  phone: string,
  streak: number,
  token: string,
  phoneNumberId: string
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const message = buildMessage(phone, streak);

  const res = await fetch(`${WHATSAPP_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }

  const data = await res.json().catch(() => ({}));
  const messageId = data?.messages?.[0]?.id;
  return { ok: true, messageId };
}

/**
 * Build the WhatsApp message payload.
 *
 * Uses a freeform text message for development / within 24-hour sessions.
 * For production, swap to a pre-approved template:
 *
 *   type: "template",
 *   template: {
 *     name: "streak_reminder",   // your approved template name
 *     language: { code: "en" },
 *     components: [{ type: "body", parameters: [{ type: "text", text: String(streak) }] }]
 *   }
 */
function buildMessage(to: string, streak: number) {
  const streakLabel = streak === 1 ? "1-day streak" : `${streak}-day streak`;
  const text =
    `🔥 Your ${streakLabel} ends at midnight!\n\n` +
    `Practice just one set on JABU Study Hub to keep it alive.\n\n` +
    `👉 https://jabu.edu.ng/study/practice`;

  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };
}

// ── Query: find at-risk users ─────────────────────────────────────────────────

async function fetchAtRiskUsers(): Promise<AtRiskRow[]> {
  const admin = createSupabaseAdminClient();

  const today     = new Date();
  const todayKey  = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const yestKey   = yesterday.toISOString().slice(0, 10);

  // Users who practiced yesterday but NOT today, with WhatsApp opt-in
  //
  // Strategy:
  //   1. Get all user_ids that practiced yesterday (did_practice = true)
  //   2. Exclude those who already practiced today
  //   3. Join study_preferences to get phone + filter on whatsapp_notify
  //
  // Done in two round-trips to stay within PostgREST's query capabilities.

  // Step 1: practiced yesterday
  const { data: ystRows, error: ystErr } = await admin
    .from("study_daily_activity")
    .select("user_id")
    .eq("activity_date", yestKey)
    .eq("did_practice", true);

  if (ystErr || !ystRows?.length) return [];

  const ystUserIds = ystRows.map((r: any) => r.user_id as string);

  // Step 2: practiced today (exclude these)
  const { data: todayRows } = await admin
    .from("study_daily_activity")
    .select("user_id")
    .eq("activity_date", todayKey)
    .eq("did_practice", true)
    .in("user_id", ystUserIds);

  const doneToday = new Set<string>((todayRows ?? []).map((r: any) => r.user_id as string));
  const atRiskIds = ystUserIds.filter((id) => !doneToday.has(id));
  if (!atRiskIds.length) return [];

  // Step 3: get streak length + WhatsApp details for at-risk users
  // streak = count of consecutive days ending yesterday
  // We fetch the last 90 days and compute per-user in JS (simple, avoids PL/pgSQL)
  const since = new Date(today.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);

  const { data: actRows, error: actErr } = await admin
    .from("study_daily_activity")
    .select("user_id, activity_date, did_practice")
    .in("user_id", atRiskIds)
    .gte("activity_date", since)
    .eq("did_practice", true)
    .order("activity_date", { ascending: false });

  if (actErr) return [];

  // Build per-user streak (consecutive days ending on yesterday)
  const streakByUser = new Map<string, number>();
  for (const userId of atRiskIds) {
    const days = new Set(
      ((actRows ?? []) as any[])
        .filter((r) => r.user_id === userId)
        .map((r) => r.activity_date as string)
    );
    let streak = 0;
    let cursor = new Date(yesterday);
    for (let i = 0; i < 90; i++) {
      const key = cursor.toISOString().slice(0, 10);
      if (days.has(key)) {
        streak++;
        cursor = new Date(cursor.getTime() - 86_400_000);
      } else {
        break;
      }
    }
    if (streak > 0) streakByUser.set(userId, streak);
  }

  // Only users with streak > 0 are genuinely at risk
  const streakUserIds = atRiskIds.filter((id) => (streakByUser.get(id) ?? 0) > 0);
  if (!streakUserIds.length) return [];

  // Step 4: fetch WhatsApp opt-in details
  const { data: prefRows, error: prefErr } = await admin
    .from("study_preferences")
    .select("user_id, whatsapp_phone, whatsapp_notify")
    .in("user_id", streakUserIds)
    .eq("whatsapp_notify", true)
    .not("whatsapp_phone", "is", null);

  if (prefErr || !prefRows?.length) return [];

  return (prefRows as any[])
    .filter((r) => r.whatsapp_phone)
    .map((r) => ({
      user_id:        r.user_id as string,
      whatsapp_phone: r.whatsapp_phone as string,
      streak:         streakByUser.get(r.user_id) ?? 1,
    }))
    .slice(0, SEND_LIMIT);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // ── Auth: verify CRON_SECRET ─────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided   = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (provided !== cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── Env checks ────────────────────────────────────────────────────────────
  const waToken   = process.env.WHATSAPP_TOKEN ?? "";
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

  if (!waToken || !waPhoneId) {
    return NextResponse.json(
      { ok: false, error: "WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set" },
      { status: 500 }
    );
  }

  // ── Find at-risk users ────────────────────────────────────────────────────
  let users: AtRiskRow[];
  try {
    users = await fetchAtRiskUsers();
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `Failed to query at-risk users: ${e?.message}` },
      { status: 500 }
    );
  }

  if (!users.length) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, errors: [] });
  }

  // ── Send messages (sequential to avoid rate-limiting) ────────────────────
  const results: SendResult[] = [];

  for (const user of users) {
    const result = await sendWhatsApp(
      user.whatsapp_phone,
      user.streak,
      waToken,
      waPhoneId
    ).catch((e) => ({ ok: false as const, error: String(e?.message ?? e) }));

    results.push({
      phone: user.whatsapp_phone.slice(0, -4) + "****", // redact last 4 digits in logs
      ok:    result.ok,
      waMessageId: (result as any).messageId,
      error: (result as any).error,
    });
  }

  const sent   = results.filter((r) => r.ok).length;
  const errors = results.filter((r) => !r.ok);

  return NextResponse.json({
    ok:      true,
    sent,
    skipped: users.length - sent,
    errors:  errors.map((e) => ({ phone: e.phone, error: e.error })),
  });
}

// Vercel Cron also uses GET for scheduled invocations when configured that way;
// support both so the vercel.json schedule works without changes.
export { POST as GET };