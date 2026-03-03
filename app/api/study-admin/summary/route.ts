import { NextResponse } from "next/server";
import { requireStudyModeratorFromRequest } from "../../../../lib/studyAdmin/requireStudyModeratorFromRequest";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

export async function GET(req: Request) {
  try {
    const { scope } = await requireStudyModeratorFromRequest(req);
    const admin = createSupabaseAdminClient();

    // Pending course requests
    let reqQuery = admin
      .from("study_course_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    // Non-super moderators are scoped (department is required by our auth layer)
    if (scope.role !== "super") {
      if (scope.departmentId) reqQuery = reqQuery.eq("department_id", scope.departmentId);
      if (scope.facultyId) reqQuery = reqQuery.eq("faculty_id", scope.facultyId);
    }
    const { count: pendingRequests, error: reqErr } = await reqQuery;
    if (reqErr) throw reqErr;

    // Pending materials (approved=false)
    // Scope via inner join to course.
    let matQuery = admin
      .from("study_materials")
      .select("id, study_courses!inner(id, faculty_id, department_id)", { count: "exact", head: true })
      .eq("approved", false);

    if (scope.role !== "super") {
      if (scope.departmentId) matQuery = matQuery.eq("study_courses.department_id", scope.departmentId);
      if (scope.facultyId) matQuery = matQuery.eq("study_courses.faculty_id", scope.facultyId);
    }

    const { count: pendingMaterials, error: matErr } = await matQuery;
    if (matErr) throw matErr;

    return NextResponse.json({
      scope,
      pendingMaterials: pendingMaterials ?? 0,
      pendingRequests: pendingRequests ?? 0,
    });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status });
  }
}
