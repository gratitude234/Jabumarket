import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { requireStudyModeratorFromRequest } from "../../../../lib/studyAdmin/requireStudyModeratorFromRequest";

export const dynamic = "force-dynamic";

type CourseRow = {
  id: string;
  course_code: string;
  course_title: string | null;
  level: number;
  semester: string;
  department_id: string | null;
  faculty_id: string | null;
  status: string;
  created_at: string;
};

export async function GET(req: Request) {
  try {
    await requireStudyModeratorFromRequest(req);

    const url = new URL(req.url);
    const deptId = url.searchParams.get("dept_id") || "";
    const level = url.searchParams.get("level") || "";
    const status = url.searchParams.get("status") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const limit = 50;
    const offset = (page - 1) * limit;

    const admin = createSupabaseAdminClient();

    let query = admin
      .from("study_courses")
      .select("id, course_code, course_title, level, semester, department_id, faculty_id, status, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (deptId) query = query.eq("department_id", deptId);
    if (level) query = query.eq("level", Number(level));
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, items: (data ?? []) as CourseRow[], total: count ?? 0 });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    const status = Number(err?.status) || 500;
    return NextResponse.json({ ok: false, code: err?.code, message: err?.message || "Error" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireStudyModeratorFromRequest(req);

    const body = await req.json() as {
      course_code: string;
      course_title?: string | null;
      level: number;
      semester: string;
      department_id: string;
      faculty_id?: string | null;
    };

    if (!body.course_code || !body.level || !body.semester || !body.department_id) {
      return NextResponse.json({ ok: false, code: "MISSING_FIELDS", message: "course_code, level, semester, department_id required" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();

    // Look up department name (and its faculty_id as fallback)
    const { data: deptRow } = await admin
      .from("study_departments")
      .select("name, faculty_id")
      .eq("id", body.department_id)
      .single();
    const departmentName = (deptRow as { name: string; faculty_id: string | null } | null)?.name ?? "";
    const resolvedFacultyId = body.faculty_id ?? (deptRow as { faculty_id: string | null } | null)?.faculty_id ?? null;

    // Look up faculty name
    let facultyName = "";
    if (resolvedFacultyId) {
      const { data: facultyRow } = await admin
        .from("study_faculties")
        .select("name")
        .eq("id", resolvedFacultyId)
        .single();
      facultyName = (facultyRow as { name: string } | null)?.name ?? "";
    }

    const { data, error } = await admin
      .from("study_courses")
      .insert({
        course_code: body.course_code.trim().replace(/\s+/g, "").toUpperCase(),
        course_title: body.course_title?.trim() ?? null,
        level: body.level,
        semester: body.semester,
        faculty: facultyName,
        faculty_id: resolvedFacultyId,
        department: departmentName,
        department_id: body.department_id,
        status: "approved",
        approved_by: userId,
        approved_at: now,
      })
      .select("id, course_code, course_title, level, semester, department_id, faculty_id, status, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, course: data });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    const status = Number(err?.status) || 500;
    return NextResponse.json({ ok: false, code: err?.code, message: err?.message || "Error" }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    await requireStudyModeratorFromRequest(req);

    const body = await req.json() as { course_id: string };
    const { course_id } = body;
    if (!course_id) {
      return NextResponse.json({ ok: false, code: "MISSING_FIELDS", message: "course_id required" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    // Fetch all materials linked to this course
    const { data: materials, error: matFetchErr } = await admin
      .from("study_materials")
      .select("id, file_path")
      .eq("course_id", course_id);

    if (matFetchErr) throw matFetchErr;

    const materialCount = materials?.length ?? 0;

    if (materialCount > 0) {
      // Delete files from storage (best-effort — orphans are acceptable)
      const filePaths = (materials ?? [])
        .map((m: { file_path: string | null }) => m.file_path)
        .filter((p): p is string => !!p);

      if (filePaths.length > 0) {
        try {
          await admin.storage.from("study-materials").remove(filePaths);
        } catch {
          // ignore storage errors — proceed with DB delete
        }
      }

      // Delete material rows
      const { error: matDelErr } = await admin
        .from("study_materials")
        .delete()
        .eq("course_id", course_id);
      if (matDelErr) throw matDelErr;
    }

    // Delete the course
    const { error: delErr } = await admin.from("study_courses").delete().eq("id", course_id);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, deleted_materials: materialCount });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    const status = Number(err?.status) || 500;
    return NextResponse.json({ ok: false, code: err?.code, message: err?.message || "Error" }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireStudyModeratorFromRequest(req);

    const body = await req.json() as {
      id: string;
      course_code?: string;
      course_title?: string | null;
      deactivate?: boolean;
    };

    if (!body.id) {
      return NextResponse.json({ ok: false, code: "MISSING_ID", message: "id required" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.course_code !== undefined) updates.course_code = body.course_code.trim().toUpperCase();
    if (body.course_title !== undefined) updates.course_title = body.course_title?.trim() ?? null;
    if (body.deactivate) updates.status = "rejected";

    const { error } = await admin.from("study_courses").update(updates).eq("id", body.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string; message?: string };
    const status = Number(err?.status) || 500;
    return NextResponse.json({ ok: false, code: err?.code, message: err?.message || "Error" }, { status });
  }
}
