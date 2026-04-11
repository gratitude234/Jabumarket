Fix a bug in app/api/study/materials/upload/route.ts.

── CONTEXT ────────────────────────────────────────────────────────────────────
The upload route has a primary insert and a fallback insert. The fallback fires
when the primary insert fails due to a "column does not exist" DB error (i.e.
some optional schema columns haven't been migrated yet). The fallback is broken
in two ways that cause uploaded materials to become completely invisible.

── BUG 1 — uploader_id is missing from the fallback insert ───────────────────
The fallback inserts only { course_id, title, session, approved: false }.
Because uploader_id is null, the "My Materials" page (which queries
.eq("uploader_id", uid)) never finds the material. The uploader cannot even
see their own upload anywhere on the platform.

── BUG 2 — approved ignores the autoApprove flag ─────────────────────────────
The variable autoApprove is computed earlier in the route by checking if the
uploader is an active rep (study_reps table) or a study admin (study_admins
table). The primary insert correctly uses { approved: autoApprove }. The
fallback hardcodes approved: false, so even reps and admins who should be
auto-approved get silently dumped into the pending queue.

── THE FIX ────────────────────────────────────────────────────────────────────
Find the fallback insert block — it looks like this:

  const { data: inserted2, error: insErr2 } = await admin
    .from("study_materials")
    .insert({
      course_id,
      title,
      session,
      approved: false,
    } as any)

Replace the insert payload with:

  {
    course_id,
    title,
    session,
    approved: autoApprove,
    approved_by: autoApprove ? userId : null,
    approved_at: autoApprove ? nowIso : null,
    uploader_id: userId,
    uploader_email: uploader_email,
    material_type: material_type || null,
    downloads: 0,
  }

── CONSTRAINTS ────────────────────────────────────────────────────────────────
- Touch only the fallback insert block. Do not change the primary insert, the
  autoApprove logic, the file_path update, or any other part of the route.
- Keep the cast (as any) — the DB type may not include all fields yet.
- Do not add new imports or helpers.