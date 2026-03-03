import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import { requireStudyModeratorFromRequest } from "../../../../../../lib/studyAdmin/requireStudyModeratorFromRequest";
import { isWithinScope } from "../../../../../../lib/studyAdmin/scope";

export const dynamic = "force-dynamic";
const BUCKET = "study-materials";

function splitPath(file_path: string) {
  const parts = (file_path || "").split("/").filter(Boolean);
  const name = parts.pop() || "";
  const dir = parts.join("/");
  return { dir, name };
}

async function objectExists(admin: any, file_path: string): Promise<boolean> {
  if (!file_path) return false;
  const { dir, name } = splitPath(file_path);
  if (!name) return false;
  const { data, error } = await admin.storage.from(BUCKET).list(dir, { search: name, limit: 10 } as any);
  if (error) return false;
  return Array.isArray(data) && data.some((x: any) => String(x?.name || "") === name);
}

function idFromUrl(req: Request) {
  try {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    // .../materials/<id>/recheck-storage
    return parts.length >= 2 ? parts[parts.length - 2] : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { scope } = await requireStudyModeratorFromRequest(req);

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const id = params?.id || (typeof body?.id === "string" ? body.id : "") || idFromUrl(req);
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const admin = createSupabaseAdminClient();

    const { data: matRow, error: matErr } = await admin
      .from("study_materials")
      .select("id, course_id, file_path, file_url, description, study_courses:course_id(faculty_id, department_id, level)")
      .eq("id", id)
      .maybeSingle();

    if (matErr) throw matErr;
    if (!matRow?.id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (scope.role !== "super") {
      const course = (matRow as any).study_courses;
      const ok = isWithinScope(scope, {
        faculty_id: course?.faculty_id ?? null,
        department_id: course?.department_id ?? null,
        level: course?.level ?? null,
      });
      if (!ok) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const file_path = (matRow as any).file_path as string | null;
    const exists = file_path ? await objectExists(admin as any, file_path) : false;

    const nowIso = new Date().toISOString();
    const patch: any = { updated_at: nowIso };

    if (exists && file_path) {
      // If bucket is public, this will be a useful URL; if private, UI uses signed downloads anyway.
      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(file_path);
      const publicUrl = (pub as any)?.publicUrl ?? null;
      if (publicUrl) patch.file_url = publicUrl;

      // remove BROKEN tag (best-effort)
      const desc = String((matRow as any).description || "");
      patch.description = desc.replace(/\n?\[BROKEN_UPLOAD[^\]]*\][^\n]*/g, "").trim() || null;
    } else {
      patch.file_url = null;
      const prior = (matRow as any).description as string | null;
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const note = `[BROKEN_UPLOAD ${stamp}] Re-check failed: file not found in storage.`;
      patch.description = prior ? `${prior}\n\n${note}` : note;
    }

    const { error: updErr } = await admin.from("study_materials").update(patch).eq("id", id);
    if (updErr) throw updErr;

    return NextResponse.json({ ok: true, exists });
  } catch (e: any) {
    const status = Number(e?.status) || 500;
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status });
  }
}
