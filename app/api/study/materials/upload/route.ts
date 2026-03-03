// app/api/study/materials/upload/route.ts
// Creates a pending material row + returns a signed upload token for Supabase Storage.

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStudyModerator } from "@/lib/studyAdmin/requireStudyModerator";
import { isWithinScope } from "@/lib/studyAdmin/scope";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "study-materials";

function jsonError(message: string, status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, code, message, ...(extra || {}) }, { status });
}

function safeFilename(name: string) {
  const raw = (name || "file").trim();
  // Keep it readable but safe for paths
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9._\- ()]/g, "")
    .trim()
    .slice(0, 120);

  // Avoid empty
  return cleaned || "file";
}

export async function POST(req: Request) {
  try {
    const { userId, scope } = await requireStudyModerator();

    const body = (await req.json().catch(() => null)) as any;
    if (!body) return jsonError("Invalid JSON", 400, "BAD_REQUEST");

    const course_id = typeof body.course_id === "string" ? body.course_id.trim() : "";
    if (!course_id) return jsonError("Missing course", 400, "MISSING_COURSE");

    const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
    if (!title) return jsonError("Missing title", 400, "MISSING_TITLE");

    const material_type = typeof body.material_type === "string" ? body.material_type.trim() : "other";
    const session = typeof body.session === "string" ? body.session.trim().slice(0, 40) : null;

    const file_name = typeof body.file_name === "string" ? body.file_name.trim() : "file";
    const mime_type = typeof body.mime_type === "string" ? body.mime_type.trim() : null;
    const file_size = typeof body.file_size === "number" ? body.file_size : null;
    const file_hash = typeof body.file_hash === "string" ? body.file_hash.trim() : null;

    const admin = createSupabaseAdminClient();

    // 1) Load course and enforce scope on the server
    const { data: courseRow, error: courseErr } = await admin
      .from("study_courses")
      .select("id, faculty_id, department_id, level, semester, course_code")
      .eq("id", course_id)
      .maybeSingle();

    if (courseErr) return jsonError(courseErr.message || "DB error", 500, "DB_ERROR");
    if (!courseRow?.id) return jsonError("Course not found", 404, "COURSE_NOT_FOUND");

    const ok = isWithinScope(scope, {
      faculty_id: (courseRow as any)?.faculty_id ?? null,
      department_id: (courseRow as any)?.department_id ?? null,
      level: (courseRow as any)?.level ?? null,
    });
    if (!ok) return jsonError("Forbidden", 403, "NOT_APPROVED");

    // 2) Duplicate check (authoritative)
    if (file_hash) {
      const { data: dup, error: dupErr } = await admin
        .from("study_materials")
        .select("id, title, created_at")
        .eq("file_hash", file_hash)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dupErr) return jsonError(dupErr.message || "DB error", 500, "DB_ERROR");
      if (dup?.id) {
        return jsonError(
          "Duplicate found",
          409,
          "DUPLICATE_FOUND",
          { duplicate_of: { id: dup.id, title: (dup as any)?.title ?? null, created_at: (dup as any)?.created_at ?? null } }
        );
      }
    }

    // 3) Create pending row (approved=false) with file_path that we will upload to.
    // We use the returned id as part of the path to guarantee uniqueness.
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    const uploader_email = (userData?.user?.email as string | undefined) ?? null;

    const { data: inserted, error: insErr } = await admin
      .from("study_materials")
      .insert({
        course_id,
        title,
        session,
        approved: false,
        material_type,
        downloads: 0,
        file_hash: file_hash || null,
        uploader_id: userId,
        uploader_email: uploader_email,
        // placeholders; updated below
        file_path: null,
        file_url: null,
      } as any)
      .select("id")
      .maybeSingle();

    if (insErr) {
      // If some optional columns don't exist on the user's DB, fall back to a minimal insert.
      const msg = (insErr.message || "").toLowerCase();
      const mightBeMissingColumns = msg.includes("column") && msg.includes("does not exist");
      if (!mightBeMissingColumns) return jsonError(insErr.message || "Insert failed", 500, "DB_ERROR");

      const { data: inserted2, error: insErr2 } = await admin
        .from("study_materials")
        .insert({
          course_id,
          title,
          session,
          approved: false,
        } as any)
        .select("id")
        .maybeSingle();

      if (insErr2) return jsonError(insErr2.message || "Insert failed", 500, "DB_ERROR");
      if (!inserted2?.id) return jsonError("Insert failed", 500, "DB_ERROR");

      // Continue with inserted2
      (inserted as any).id = inserted2.id;
    }

    const material_id = (inserted as any)?.id as string;
    if (!material_id) return jsonError("Insert failed", 500, "DB_ERROR");

    const dept = (courseRow as any)?.department_id ?? "dept";
    const code = String((courseRow as any)?.course_code ?? "COURSE").trim().replace(/[^A-Z0-9_-]/gi, "");

    const ext = (() => {
      const n = safeFilename(file_name);
      const idx = n.lastIndexOf(".");
      if (idx > 0 && idx < n.length - 1) return n.slice(idx);
      return mime_type?.includes("pdf") ? ".pdf" : "";
    })();

    const finalName = safeFilename(file_name).replace(/\.[^.]+$/, "") + ext;
    const file_path = `materials/${dept}/${code}/${material_id}-${finalName}`;

    // Compute public url (works if the bucket is public; if bucket is private, client should switch to signed download later)
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(file_path);
    const file_url = (pub as any)?.publicUrl ?? null;

    // Update the material row with file_path and file_url
    const { error: updErr } = await admin
      .from("study_materials")
      .update(
        {
          file_path,
          file_url,
          mime_type: mime_type || null,
          file_size: file_size || null,
          updated_at: new Date().toISOString(),
        } as any
      )
      .eq("id", material_id);

    // If schema drift or permissions prevent updating optional columns, at least persist the essentials.
    if (updErr) {
      console.error("study_materials update failed:", updErr);
      await admin
        .from("study_materials")
        .update({ file_path, file_url, updated_at: new Date().toISOString() } as any)
        .eq("id", material_id);
    }

// 4) Create signed upload token
    const storageAny: any = admin.storage.from(BUCKET) as any;
    if (typeof storageAny.createSignedUploadUrl !== "function") {
      return jsonError(
        "Storage client missing createSignedUploadUrl(). Update @supabase/supabase-js.",
        500,
        "STORAGE_UNSUPPORTED"
      );
    }

    const { data: signed, error: signedErr } = await storageAny.createSignedUploadUrl(file_path);
    if (signedErr) return jsonError(signedErr.message || "Failed to sign upload", 500, "SIGN_UPLOAD_FAILED");

    const token = (signed as any)?.token as string | undefined;
    const signedPath = (signed as any)?.path as string | undefined;

    if (!token || !signedPath) {
      return jsonError("Signed upload response missing token/path", 500, "SIGN_UPLOAD_FAILED");
    }

    return NextResponse.json({
      ok: true,
      material_id,
      bucket: BUCKET,
      path: signedPath,
      token,
    });
  } catch (e: any) {
    const code = typeof e?.code === "string" ? e.code : undefined;
    const status = Number(e?.status) || 500;
    const msg = e?.message || "Error";

    if (code === "NO_SESSION") return jsonError("Unauthorized", 401, "NO_SESSION");
    if (code === "NOT_STUDY_MODERATOR") return jsonError("Forbidden", 403, "NOT_APPROVED");
    if (code === "REP_SCOPE_MISCONFIGURED") return jsonError(msg, 403, "REP_SCOPE_MISCONFIGURED");

    return jsonError(msg, status, code || "SERVER_ERROR");
  }
}
