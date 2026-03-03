import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { requireStudyModeratorFromRequest } from "../../../../../../lib/studyAdmin/requireStudyModeratorFromRequest";
import { isWithinScope } from "../../../../../../lib/studyAdmin/scope";

function idFromUrl(req: Request) {
  try {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    // .../materials/<id>/approve
    return parts.length >= 2 ? parts[parts.length - 2] : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { scope } = await requireStudyModeratorFromRequest(req);

    // Prefer dynamic route param, but fall back to body.id for resilience
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const id = params?.id || (typeof body?.id === "string" ? body.id : "") || idFromUrl(req);
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const admin = createSupabaseAdminClient();

    // Enforce scoped moderator permissions before approving
    if (scope.role !== "super") {
      const { data: matRow, error: matErr } = await admin
        .from("study_materials")
        .select("id, course_id, study_courses:course_id(faculty_id, department_id, level)")
        .eq("id", id)
        .maybeSingle();

      if (matErr) throw matErr;
      if (!matRow?.id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

      const course = (matRow as any).study_courses;
      const ok = isWithinScope(scope, {
        faculty_id: course?.faculty_id ?? null,
        department_id: course?.department_id ?? null,
        level: course?.level ?? null,
      });
      if (!ok) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Standardized patch: only touch columns we rely on everywhere.
    const nowIso = new Date().toISOString();
    const patch = { approved: true, updated_at: nowIso };

    const { data, error } = await admin
      .from("study_materials")
      .update(patch)
      .eq("id", id)
      .select("id, approved")
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status });
  }
}
