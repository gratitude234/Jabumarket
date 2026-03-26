You are implementing fixes for the Jabumarket Study Hub Materials System based on a completed audit. Read CLAUDE.md first. Audit existing code before touching anything. Implement in order — each fix is independent unless noted.

FIX 1 — C1: Download counter increment
File: app/api/study/materials/[id]/download/route.ts
After generating the signed URL and before the redirect, atomically increment the download counter using a Postgres RPC. First create the function, then call it.
Migration — create supabase/migrations/[timestamp]_increment_material_downloads.sql:
sqlCREATE OR REPLACE FUNCTION increment_material_downloads(p_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE study_materials
  SET downloads = COALESCE(downloads, 0) + 1
  WHERE id = p_id;
$$;
Route change — after const url = signed.signedUrl, before the return:
ts// Fire-and-forget atomic increment — never blocks the redirect
admin.rpc("increment_material_downloads", { p_id: materialId }).catch(() => {});

FIX 2 — C2: Fix AI summary generation in approval route
File: app/api/study-admin/materials/[id]/approve/route.ts
The current fire-and-forget fetch to /api/ai/summarize sends wrong field names and has no auth. Replace the entire AI summary block with a direct call that:

Fetches material details first (needs title, description, course_code, material_type)
Sends correct camelCase fields
Passes service role key as bearer token so the summarize route can auth the internal call

Find the block that fires the AI summarize fetch and replace it:
ts// Fire AI summary generation — fire-and-forget, never blocks approval
try {
  // Fetch material details needed for summarization
  const { data: matForSummary } = await admin
    .from("study_materials")
    .select("title, description, material_type, course_code")
    .eq("id", id)
    .maybeSingle();

  if (matForSummary?.title) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      ? process.env.NEXT_PUBLIC_SITE_URL
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    fetch(`${baseUrl}/api/ai/summarize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        materialId: id,                                          // camelCase
        title: String(matForSummary.title),
        description: (matForSummary as any).description ?? null,
        courseCode: (matForSummary as any).course_code ?? null,
        materialType: (matForSummary as any).material_type ?? "other",
      }),
    }).catch(() => {});
  }
} catch {}
File: app/api/ai/summarize/route.ts
The route currently requires a session cookie. Add a service-role bearer bypass at the top of the handler, before the existing auth check:
ts// Allow internal server-to-server calls using service role key as bearer
const authHeader = req.headers.get("authorization") ?? "";
const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
const isInternalCall = bearerToken === process.env.SUPABASE_SERVICE_ROLE_KEY && bearerToken.length > 0;

if (!isInternalCall) {
  // Original session-based auth for client calls
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
}
Replace the existing auth block (the if (!user) check) with this logic.

FIX 3 — C3: Remove file_url from public list query
File: app/api/study/materials/route.ts
In the main GET handler, find the .select(...) string on the study_materials query. Remove file_url from it. Keep file_path (needed for file type detection). The select string should become:
ts`id,title,description,file_path,session,approved,created_at,downloads,up_votes,
 course_id,material_type,featured,verified,ai_summary,
 study_courses:course_id(id,faculty,department,level,semester,course_code,course_title,faculty_id,department_id)`
Note: also add ai_summary here (needed for H5 — card previews).
File: app/study/materials/MaterialsClient.tsx
In the MaterialRow type, remove file_url: string | null and update any usage that referenced file_url for file type detection to use file_path instead (the same extension detection logic already handles both).

FIX 4 — C4: Add authentication to notify-new-material route
File: app/api/study/notify-new-material/route.ts
Add an auth check at the very top of the POST handler, before any logic:
ts// This route is called server-to-server only — require CRON_SECRET as bearer
const authHeader = req.headers.get("authorization") ?? "";
const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
if (!token || token !== process.env.CRON_SECRET) {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
File: app/api/study-admin/materials/[id]/approve/route.ts
Update the fire-and-forget fetch to /api/study/notify-new-material to include the auth header:
tsfetch(`${baseUrl}/api/study/notify-new-material`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.CRON_SECRET}`,
  },
  body: JSON.stringify({ material_id: id }),
}).catch(() => {});

FIX 5 — C5: Block self-rating on vote route
File: app/api/study/materials/[id]/vote/route.ts
After confirming the user is authenticated and before checking for an existing rating, add:
ts// Fetch material to check uploader
const { data: matCheck } = await admin
  .from("study_materials")
  .select("uploader_id")
  .eq("id", materialId)
  .maybeSingle();

if ((matCheck as any)?.uploader_id && (matCheck as any).uploader_id === user.id) {
  return NextResponse.json({ ok: false, error: "You cannot vote on your own material" }, { status: 403 });
}

FIX 6 — C6: Remove auto-verified from upload/complete route
File: app/api/study/materials/upload/complete/route.ts
Find the block if (exists) { patch.verified = true; } and remove it entirely. The verified flag is admin-granted only and must never be set automatically. The patch block should just be:
tsconst patch: any = { updated_at: nowIso };

if (!exists) {
  const prior = (row as any).description as string | null;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const note = `[BROKEN_UPLOAD ${stamp}] Client reported completion but file not found in storage.`;
  patch.description = prior ? `${prior}\n\n${note}` : note;
}

FIX 7 — H2 + M1: Fix mineOnly to filter by uploader_id and show pending uploads
File: app/api/study/materials/route.ts
Find the mineOnly logic block (currently calls getUserScope and filters by department). Replace the entire mineOnly branch:
tsif (mineOnly) {
  const { data: authData } = await supabase.auth.getUser();
  const uid = authData?.user?.id;
  if (!uid) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // Override the base query: filter by uploader_id, remove the approved:true default
  query = supabase
    .from("study_materials")
    .select(
      `id,title,description,file_path,session,approved,created_at,downloads,up_votes,
       course_id,material_type,featured,verified,ai_summary,
       study_courses:course_id(id,faculty,department,level,semester,course_code,course_title,faculty_id,department_id)`,
      { count: "exact" }
    )
    .eq("uploader_id", uid)  // show their uploads regardless of approval status
    .order("created_at", { ascending: false })
    .range(from, to);

  const mineRes = await query;
  if (mineRes.error) {
    return NextResponse.json({ ok: false, error: mineRes.error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    items: (mineRes.data as any[]) ?? [],
    total: mineRes.count ?? 0,
    page,
    page_size: pageSize,
  });
}
This early-returns from the function, so the rest of the query logic is unaffected.

FIX 8 — H3 + Vote integrity: Add atomic vote RPC
Create migration supabase/migrations/[timestamp]_toggle_material_vote.sql:
sqlCREATE OR REPLACE FUNCTION toggle_material_vote(p_material_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_voted boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM study_material_ratings
    WHERE material_id = p_material_id AND user_id = p_user_id
  ) THEN
    DELETE FROM study_material_ratings
    WHERE material_id = p_material_id AND user_id = p_user_id;

    UPDATE study_materials
    SET up_votes = GREATEST(0, COALESCE(up_votes, 0) - 1)
    WHERE id = p_material_id;

    v_voted := false;
  ELSE
    INSERT INTO study_material_ratings (material_id, user_id, vote)
    VALUES (p_material_id, p_user_id, 1);

    UPDATE study_materials
    SET up_votes = COALESCE(up_votes, 0) + 1
    WHERE id = p_material_id;

    v_voted := true;
  END IF;

  RETURN jsonb_build_object('voted', v_voted);
END;
$$;
File: app/api/study/materials/[id]/vote/route.ts
Replace the entire existing toggle logic (the if (existing) ... else ... block) with a single RPC call after the self-rating check:
tsconst { data: rpcResult, error: rpcErr } = await admin.rpc("toggle_material_vote", {
  p_material_id: materialId,
  p_user_id: user.id,
});

if (rpcErr) {
  return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 500 });
}

const voted = (rpcResult as any)?.voted ?? false;
return NextResponse.json({ ok: true, voted });

FIX 9 — M3: Set approved_by and approved_at on approval
File: app/api/study-admin/materials/[id]/approve/route.ts
Find the requireStudyModeratorFromRequest call and capture userId from it. Then update the patch:
tsconst { scope, userId: moderatorId } = await requireStudyModeratorFromRequest(req);
Update the patch object:
tsconst patch = {
  approved: true,
  updated_at: nowIso,
  approved_by: moderatorId,
  approved_at: nowIso,
};
Check requireStudyModeratorFromRequest in lib/studyAdmin/requireStudyModeratorFromRequest.ts — if it doesn't return userId, add it to the return object from that function.

FIX 10 — M4: Add related materials to detail page
File: app/study/materials/[id]/MaterialDetailClient.tsx
Add a related materials fetch after the main material loads. At the end of the existing useEffect that loads the material, after setting the material state:
ts// Fetch related materials (same course code, different type, max 4)
if ((mat as any)?.course_code || mat?.study_courses?.course_code) {
  const code = (mat as any)?.course_code ?? mat?.study_courses?.course_code;
  const { data: related } = await supabase
    .from("study_materials")
    .select("id,title,material_type,downloads,up_votes,file_path,created_at,study_courses:course_id(course_code)")
    .eq("approved", true)
    .eq("course_code", code)
    .neq("id", materialId)
    .order("downloads", { ascending: false })
    .limit(4);
  if (!cancelled && related?.length) setRelatedMaterials(related as any[]);
}
Add state: const [relatedMaterials, setRelatedMaterials] = useState<any[]>([]).
Render after the votes/download section:
tsx{relatedMaterials.length > 0 && (
  <div className="mt-6">
    <p className="text-sm font-semibold text-foreground mb-3">
      More for {material?.study_courses?.course_code ?? "this course"}
    </p>
    <div className="space-y-2">
      {relatedMaterials.map((r) => (
        <Link
          key={r.id}
          href={`/study/materials/${r.id}`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 hover:bg-secondary/50 no-underline"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{r.title ?? "Untitled"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {r.material_type?.replace("_", " ")} · {r.downloads ?? 0} downloads
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  </div>
)}

FIX 11 — P1: Surface AI summary teaser on material cards
File: app/study/materials/MaterialsClient.tsx
In the material card component, after the description line, add a parsed AI summary teaser. The ai_summary is now included in the list query (added in Fix 3). Parse it and show the overview or first key topic:
tsx{(() => {
  const raw = (s as any)?.ai_summary;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const preview = parsed?.overview ?? parsed?.keyTopics?.[0] ?? null;
    if (!preview) return null;
    return (
      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground italic">
        ✦ {String(preview)}
      </p>
    );
  } catch {
    return null;
  }
})()}
Add this after the existing description line in the card render.

FIX 12 — Upload: Add post-download rating prompt
File: app/study/materials/[id]/MaterialDetailClient.tsx
After a successful download (the download button click handler resolves), show a rating prompt. The download is a redirect via /api/study/materials/[id]/download — track it with a local state flag:
tsconst [showRatingPrompt, setShowRatingPrompt] = useState(false);
In the download button's onClick handler, after the redirect fires:
ts// Show rating prompt after short delay (user returns to page after download)
setTimeout(() => setShowRatingPrompt(true), 2000);
Add prompt below the download button:
tsx{showRatingPrompt && !hasVoted && (
  <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3">
    <p className="text-sm font-semibold text-foreground flex-1">Was this material helpful?</p>
    <button
      type="button"
      onClick={() => { handleVote(); setShowRatingPrompt(false); }}
      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-secondary/50"
    >
      <ThumbsUp className="h-3.5 w-3.5" /> Yes
    </button>
    <button
      type="button"
      onClick={() => setShowRatingPrompt(false)}
      className="text-xs text-muted-foreground hover:text-foreground"
    >
      Skip
    </button>
  </div>
)}

AFTER ALL FIXES

Run npm run build and fix any TypeScript errors.
Deploy the two SQL migrations to Supabase (increment_material_downloads, toggle_material_vote).
Verify the Storage bucket study-materials is set to private in the Supabase dashboard (not public). This is required for Fix 3 to actually protect files.
Do not change any routing, UI layout, or logic not explicitly mentioned above.