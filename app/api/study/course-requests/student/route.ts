import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function normCode(code: string) {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user ?? null;

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawCode = typeof body?.course_code === "string" ? body.course_code : "";
    const rawTitle = typeof body?.course_title === "string" ? body.course_title : "";
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 400) : null;

    // Optional context fields — students may not know their UUIDs, so all nullable
    const faculty_id = typeof body?.faculty_id === "string" && body.faculty_id.trim() ? body.faculty_id.trim() : null;
    const department_id = typeof body?.department_id === "string" && body.department_id.trim() ? body.department_id.trim() : null;
    const level = typeof body?.level === "number" && body.level > 0 ? Math.trunc(body.level) : null;

    const course_code = normCode(rawCode);
    const course_title = rawTitle.trim().slice(0, 120) || null;

    if (!course_code || course_code.length < 3) {
      return NextResponse.json({ ok: false, error: "Course code is required (min 3 characters)." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    // Avoid duplicate pending requests for the same course code
    const { data: existing } = await admin
      .from("study_course_requests")
      .select("id, status, created_at")
      .eq("course_code", course_code)
      .eq("requester_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ ok: true, requested: false, already_pending: true, id: existing.id });
    }

    const { data: inserted, error: insErr } = await admin
      .from("study_course_requests")
      .insert({
        requester_id: user.id,
        course_code,
        course_title,
        note,
        status: "pending",
        ...(faculty_id ? { faculty_id } : {}),
        ...(department_id ? { department_id } : {}),
        ...(level ? { level } : {}),
      })
      .select("id, created_at")
      .maybeSingle();

    if (insErr) throw insErr;

    return NextResponse.json({ ok: true, requested: true, id: inserted?.id ?? null });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    return NextResponse.json({ ok: false, error: e?.message || "Failed to submit request" }, { status });
  }
}
