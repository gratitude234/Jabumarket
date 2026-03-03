import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import { requireStudyModeratorFromRequest } from "../../../../../lib/studyAdmin/requireStudyModeratorFromRequest";
import { isWithinScope } from "../../../../../lib/studyAdmin/scope";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { scope } = await requireStudyModeratorFromRequest(req);

    const body = (await req.json().catch(() => null)) as any;
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === "string").slice(0, 200) : [];
    if (!ids.length) return NextResponse.json({ ok: false, error: "No ids provided" }, { status: 400 });

    const admin = createSupabaseAdminClient();

    // If not super, scope-check all items first
    if (scope.role !== "super") {
      const { data: rows, error } = await admin
        .from("study_materials")
        .select("id, course_id, study_courses:course_id(faculty_id, department_id, level)")
        .in("id", ids);

      if (error) throw error;

      for (const r of rows || []) {
        const course = (r as any).study_courses;
        const ok = isWithinScope(scope, {
          faculty_id: course?.faculty_id ?? null,
          department_id: course?.department_id ?? null,
          level: course?.level ?? null,
        });
        if (!ok) return NextResponse.json({ ok: false, error: "Forbidden (scope mismatch)" }, { status: 403 });
      }
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from("study_materials")
      .update({ approved: true, updated_at: nowIso })
      .in("id", ids);

    if (updErr) throw updErr;

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status });
  }
}
