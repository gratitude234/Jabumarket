import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeQuery(v: string) {
  return (v || "").trim().replace(/\s+/g, " ");
}

function safeDecodeURIComponent(v: string) {
  // Some pages pass an already URL-encoded q (e.g. "CSC%20209").
  // PostgREST filter strings can't contain raw '%' tokens, so decode it first.
  let cur = v || "";
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      cur = next;
    } catch {
      break;
    }
  }
  return cur;
}

function asPosInt(v: string | null, fallback: number) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i > 0 ? i : fallback;
}

function mapSemesterParamToDb(v: string) {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "1st" || s === "first") return "first";
  if (s === "2nd" || s === "second") return "second";
  if (s === "summer") return "summer";
  return "";
}

type SortKey = "newest" | "oldest" | "downloads_desc" | "downloads_asc";

async function getUserScope(supabase: any) {
  // Best-effort scope lookup. We prefer study_user_preferences because it contains `semester`.
  // If a user hasn't onboarded yet, we return null and the API behaves like "All materials".
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return null;

  // Try legacy prefs first (contains faculty/department names + semester)
  const legacy = await supabase
    .from("study_user_preferences")
    .select("faculty,department,level,semester")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!legacy.error && legacy.data) {
    const department = (legacy.data as any)?.department ? String((legacy.data as any).department).trim() : "";
    const faculty = (legacy.data as any)?.faculty ? String((legacy.data as any).faculty).trim() : "";
    const level = (legacy.data as any)?.level ?? null;
    const semester = (legacy.data as any)?.semester ? String((legacy.data as any).semester).trim() : "";
    return { faculty, department, level, semester };
  }

  // Fallback to normalized table (IDs only). If we don't have readable names, we still can scope by level.
  const norm = await supabase.from("study_preferences").select("level").eq("user_id", user.id).maybeSingle();
  if (!norm.error && norm.data) {
    const level = (norm.data as any)?.level ?? null;
    return { faculty: "", department: "", level, semester: "" };
  }

  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const q = normalizeQuery(safeDecodeURIComponent(url.searchParams.get("q") || ""));
    const level = (url.searchParams.get("level") || "").trim();
    const semester = (url.searchParams.get("semester") || "").trim();
    const faculty = (url.searchParams.get("faculty") || "").trim();
    const dept = (url.searchParams.get("dept") || "").trim();
    const course = (url.searchParams.get("course") || "").trim();
    const session = (url.searchParams.get("session") || "").trim();
    const type = (url.searchParams.get("type") || "").trim();
    const verifiedOnly = (url.searchParams.get("verified") || "") === "1";
    const featuredOnly = (url.searchParams.get("featured") || "") === "1";
    const sort = ((url.searchParams.get("sort") || "newest") as SortKey) || "newest";
    const mineOnly = (url.searchParams.get("mine") || "") === "1";

    const page = asPosInt(url.searchParams.get("page"), 1);
    const pageSize = Math.min(48, Math.max(6, asPosInt(url.searchParams.get("page_size"), 18)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = await createSupabaseServerClient();

    // If mineOnly is requested, scope results to the user's department/level/semester when available.
    const scope = mineOnly ? await getUserScope(supabase) : null;

    let query = supabase
      .from("study_materials")
      .select(
        `
          id,title,description,file_url,file_path,session,approved,created_at,downloads,course_id,
          material_type,featured,verified,
          study_courses:course_id!inner(id,faculty,department,level,semester,course_code,course_title)
        `,
        { count: "exact" }
      )
      .eq("approved", true);

    if (scope) {
      const lv = Number((scope as any)?.level);
      if (Number.isFinite(lv)) query = query.eq("study_courses.level", lv);

      const deptName = String((scope as any)?.department ?? "").trim();
      if (deptName) query = query.eq("study_courses.department", deptName);

      const sem = mapSemesterParamToDb(String((scope as any)?.semester ?? ""));
      if (sem) query = query.eq("study_courses.semester", sem);
    }

    if (q) {
      // PostgREST `.or()` logic strings are whitespace-sensitive.
      // Instead of trying to quote/escape spaces (which is inconsistent across PostgREST versions),
      // we transform whitespace into `*` so the pattern contains NO spaces.
      // Example: "CSC 209" -> "*CSC*209*" (still matches "CSC 209", "CSC-209", etc.).
      const qSafe = q
        .replace(/[%_]/g, "") // strip LIKE wildcards
        .replace(/[(),]/g, " ") // remove syntax-breaking chars
        .trim()
        .replace(/\s+/g, " ");

      const like = `*${qSafe.replace(/\s+/g, "*")}*`;

      query = query.or(
        `title.ilike.${like},description.ilike.${like},study_courses.course_code.ilike.${like},study_courses.course_title.ilike.${like},study_courses.department.ilike.${like},study_courses.faculty.ilike.${like}`
      );
    }

    if (level) {
      const lv = Number(level);
      if (Number.isFinite(lv)) query = query.eq("study_courses.level", lv);
    }

    if (semester) {
      const sem = mapSemesterParamToDb(semester);
      if (sem) query = query.eq("study_courses.semester", sem);
    }

    if (faculty) query = query.eq("study_courses.faculty", faculty);
    if (dept) query = query.eq("study_courses.department", dept);
    if (course) query = query.eq("study_courses.course_code", course.trim().toUpperCase());
    if (session) query = query.ilike("session", `%${session}%`);
    if (type && type !== "all") query = query.eq("material_type", type);
    if (verifiedOnly) query = query.eq("verified", true);
    if (featuredOnly) query = query.eq("featured", true);

    if (sort === "oldest") query = query.order("created_at", { ascending: true });
    else if (sort === "downloads_desc") query = query.order("downloads", { ascending: false, nullsFirst: false });
    else if (sort === "downloads_asc") query = query.order("downloads", { ascending: true, nullsFirst: false });
    else query = query.order("created_at", { ascending: false });

    const res = await query.range(from, to);
    if (res.error) {
      const msg = res.error.message || "Unknown error";
      const schemaHint =
        msg.includes("material_type") || msg.includes("featured") || msg.includes("verified")
          ? "Your database is missing some columns (material_type / featured / verified). Add them to study_materials, then refresh."
          : undefined;
      return NextResponse.json({ ok: false, error: msg, schemaHint }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      items: (res.data as any[]) ?? [],
      total: res.count ?? 0,
      page,
      page_size: pageSize,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
