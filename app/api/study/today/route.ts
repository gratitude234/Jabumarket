import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PrimaryKind = "due" | "continue" | "practice" | "material" | "onboarding";

type StudyPrefsRow = {
  department_id: string | null;
  department: string | null;
  faculty_id: string | null;
  level: number | string | null;
  semester: string | null;
};

type PracticeSetRecommendation = {
  id: string;
  title: string;
  courseCode: string | null;
  questionsCount: number | null;
};

type MaterialRecommendation = {
  id: string;
  title: string;
  courseCode: string | null;
  materialType: string | null;
};

function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function normalizeLevel(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function normalizeSemester(value: string | null | undefined) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "1st" || v === "first") return "first";
  if (v === "2nd" || v === "second") return "second";
  if (v === "summer") return "summer";
  return "";
}

function joinedOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function extractCourseCodeFromWeakRow(row: any) {
  const question = joinedOne(row?.study_quiz_questions);
  const set = joinedOne(question?.study_quiz_sets);
  const code = String(set?.course_code ?? "").trim().toUpperCase();
  return code || null;
}

async function getPracticeStreak(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const sinceDate = new Date(Date.now() + 3_600_000 - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("study_daily_activity")
    .select("activity_date,did_practice")
    .eq("user_id", userId)
    .gte("activity_date", sinceDate)
    .order("activity_date", { ascending: false });

  if (error || !Array.isArray(data)) return 0;

  const map = new Map<string, boolean>();
  for (const row of data as any[]) {
    if (row?.activity_date) map.set(String(row.activity_date), Boolean(row.did_practice));
  }

  const todayMs = Date.now() + 3_600_000;
  const todayKey = new Date(todayMs).toISOString().slice(0, 10);
  let cursorMs = map.get(todayKey) === true ? todayMs : todayMs - 86_400_000;
  let streak = 0;

  for (let i = 0; i < 90; i += 1) {
    const key = new Date(cursorMs).toISOString().slice(0, 10);
    if (map.get(key) !== true) break;
    streak += 1;
    cursorMs -= 86_400_000;
  }

  return streak;
}

async function getWeakCourses(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const { data, error } = await supabase
    .from("study_practice_attempts")
    .select("score,total_questions,study_quiz_sets(course_code)")
    .eq("user_id", userId)
    .eq("status", "submitted")
    .not("total_questions", "is", null)
    .gt("total_questions", 0)
    .order("submitted_at", { ascending: false })
    .limit(50);

  if (error || !Array.isArray(data)) return [];

  const acc = new Map<string, { score: number; total: number; count: number }>();
  for (const row of data as any[]) {
    const set = joinedOne(row?.study_quiz_sets);
    const code = String(set?.course_code ?? "").trim().toUpperCase();
    const score = Number(row?.score ?? 0);
    const total = Number(row?.total_questions ?? 0);
    if (!code || !Number.isFinite(score) || !Number.isFinite(total) || total <= 0) continue;

    const current = acc.get(code) ?? { score: 0, total: 0, count: 0 };
    acc.set(code, {
      score: current.score + score,
      total: current.total + total,
      count: current.count + 1,
    });
  }

  return Array.from(acc.entries())
    .map(([courseCode, value]) => ({
      courseCode,
      accuracy: value.total > 0 ? Math.round((value.score / value.total) * 100) / 100 : 0,
      count: value.count,
    }))
    .filter((row) => row.count >= 2 && row.accuracy < 0.6)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3)
    .map(({ courseCode, accuracy }) => ({ courseCode, accuracy }));
}

async function getPracticeRecommendations(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  prefs: StudyPrefsRow | null
) {
  const level = normalizeLevel(prefs?.level);
  const semester = normalizeSemester(prefs?.semester);

  let query = supabase
    .from("study_quiz_sets")
    .select("id,title,course_code,questions_count,source,created_at")
    .eq("published", true)
    .or(`visibility.eq.public,created_by.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(12);

  if (level != null) query = query.eq("level", level);
  if (semester) query = query.eq("semester", semester);

  let { data, error } = await query;
  if (error && semester) {
    let fallback = supabase
      .from("study_quiz_sets")
      .select("id,title,course_code,questions_count,source,created_at")
      .eq("published", true)
      .or(`visibility.eq.public,created_by.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(12);
    if (level != null) fallback = fallback.eq("level", level);
    const res = await fallback;
    data = res.data;
    error = res.error;
  }

  if (error || !Array.isArray(data)) return [];

  return [...(data as any[])]
    .sort((a, b) => {
      const aOfficial = a?.source === "rep_ai_bank" ? 1 : 0;
      const bOfficial = b?.source === "rep_ai_bank" ? 1 : 0;
      if (aOfficial !== bOfficial) return bOfficial - aOfficial;
      return new Date(b?.created_at ?? 0).getTime() - new Date(a?.created_at ?? 0).getTime();
    })
    .slice(0, 4)
    .map((row): PracticeSetRecommendation => ({
      id: String(row.id),
      title: String(row.title ?? "Practice set"),
      courseCode: row.course_code ? String(row.course_code).toUpperCase() : null,
      questionsCount: typeof row.questions_count === "number" ? row.questions_count : null,
    }));
}

async function getMaterialRecommendations(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  prefs: StudyPrefsRow | null
) {
  const level = normalizeLevel(prefs?.level);
  const semester = normalizeSemester(prefs?.semester);

  let query = supabase
    .from("study_materials")
    .select("id,title,course_code,material_type,downloads,created_at")
    .eq("approved", true)
    .eq("upload_status", "live")
    .order("downloads", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(8);

  if (prefs?.department_id) query = query.eq("department_id", prefs.department_id);
  else if (prefs?.department) query = query.ilike("department", `%${prefs.department}%`);
  if (level != null) query = query.eq("level", String(level));
  if (semester) query = query.eq("semester", semester);

  let { data, error } = await query;
  if (error && semester) {
    let fallback = supabase
      .from("study_materials")
      .select("id,title,course_code,material_type,downloads,created_at")
      .eq("approved", true)
      .eq("upload_status", "live")
      .order("downloads", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(8);

    if (prefs?.department_id) fallback = fallback.eq("department_id", prefs.department_id);
    else if (prefs?.department) fallback = fallback.ilike("department", `%${prefs.department}%`);
    if (level != null) fallback = fallback.eq("level", String(level));

    const res = await fallback;
    data = res.data;
    error = res.error;
  }

  if (error || !Array.isArray(data)) return [];

  return (data as any[]).slice(0, 4).map((row): MaterialRecommendation => ({
    id: String(row.id),
    title: String(row.title ?? "Study material"),
    courseCode: row.course_code ? String(row.course_code).toUpperCase() : null,
    materialType: row.material_type ? String(row.material_type) : null,
  }));
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData?.user?.id;

  if (authError || !userId) {
    return jsonError("Sign in first", 401, "unauthorized");
  }

  const nowIso = new Date().toISOString();
  const weekAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { data: prefsData } = await supabase
    .from("study_preferences")
    .select("department_id,department,faculty_id,level,semester")
    .eq("user_id", userId)
    .maybeSingle();
  const prefs = (prefsData as StudyPrefsRow | null) ?? null;
  const hasPrefs = Boolean(prefs?.department_id || prefs?.department || prefs?.faculty_id || prefs?.level);

  const [
    dueRes,
    inProgressRes,
    weekAttemptsRes,
    streak,
    weakCourses,
    practiceSets,
    materials,
  ] = await Promise.all([
    supabase
      .from("study_weak_questions")
      .select("question_id,study_quiz_questions(study_quiz_sets(course_code))")
      .eq("user_id", userId)
      .is("graduated_at", null)
      .lte("next_due_at", nowIso)
      .limit(200),
    supabase
      .from("study_practice_attempts")
      .select("id,set_id,score,total_questions,updated_at,study_quiz_sets(id,title,course_code)")
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase
      .from("study_practice_attempts")
      .select("id,score,total_questions")
      .eq("user_id", userId)
      .eq("status", "submitted")
      .gte("submitted_at", weekAgoIso),
    getPracticeStreak(supabase, userId).catch(() => 0),
    getWeakCourses(supabase, userId).catch(() => []),
    getPracticeRecommendations(supabase, userId, prefs).catch(() => []),
    getMaterialRecommendations(supabase, prefs).catch(() => []),
  ]);

  const dueRows = !dueRes.error && Array.isArray(dueRes.data) ? (dueRes.data as any[]) : [];
  const dueCourseCounts = new Map<string, number>();
  for (const row of dueRows) {
    const code = extractCourseCodeFromWeakRow(row);
    if (!code) continue;
    dueCourseCounts.set(code, (dueCourseCounts.get(code) ?? 0) + 1);
  }
  const topCourses = Array.from(dueCourseCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([courseCode]) => courseCode);

  const inProgress = !inProgressRes.error && Array.isArray(inProgressRes.data)
    ? (inProgressRes.data as any[])[0] ?? null
    : null;
  const inProgressSet = joinedOne(inProgress?.study_quiz_sets);

  const weeklyAttempts = !weekAttemptsRes.error && Array.isArray(weekAttemptsRes.data)
    ? (weekAttemptsRes.data as any[])
    : [];
  const scoredAttempts = weeklyAttempts.filter((row) => {
    const score = Number(row?.score);
    const total = Number(row?.total_questions);
    return Number.isFinite(score) && Number.isFinite(total) && total > 0;
  });
  const avgScore = scoredAttempts.length
    ? Math.round(
        scoredAttempts.reduce((sum, row) => sum + (Number(row.score) / Number(row.total_questions)) * 100, 0) /
          scoredAttempts.length
      )
    : null;

  let primaryAction: { kind: PrimaryKind; label: string; href: string; meta?: string };
  if (!hasPrefs) {
    primaryAction = {
      kind: "onboarding",
      label: "Set up your study profile",
      href: "/study/onboarding",
      meta: "Get materials and practice for your department.",
    };
  } else if (dueRows.length > 0) {
    primaryAction = {
      kind: "due",
      label: "Review due questions",
      href: "/study/practice?due=1",
      meta: `${dueRows.length} question${dueRows.length === 1 ? "" : "s"} waiting${topCourses.length ? ` in ${topCourses.join(", ")}` : ""}.`,
    };
  } else if (inProgress?.id && inProgress?.set_id) {
    const answered = typeof inProgress.score === "number" ? inProgress.score : null;
    const total = typeof inProgress.total_questions === "number" ? inProgress.total_questions : null;
    primaryAction = {
      kind: "continue",
      label: "Continue practice",
      href: `/study/practice/${encodeURIComponent(String(inProgress.set_id))}?attempt=${encodeURIComponent(String(inProgress.id))}`,
      meta: `${inProgressSet?.title ?? "Practice set"}${answered != null && total ? ` - ${answered}/${total}` : ""}`,
    };
  } else if (practiceSets[0]) {
    primaryAction = {
      kind: "practice",
      label: "Start today's set",
      href: `/study/practice/${encodeURIComponent(practiceSets[0].id)}`,
      meta: [practiceSets[0].courseCode, practiceSets[0].questionsCount ? `${practiceSets[0].questionsCount} questions` : null]
        .filter(Boolean)
        .join(" - "),
    };
  } else if (materials[0]) {
    primaryAction = {
      kind: "material",
      label: "Browse recommended materials",
      href: `/study/materials/${encodeURIComponent(materials[0].id)}`,
      meta: [materials[0].courseCode, materials[0].materialType?.replace("_", " ")].filter(Boolean).join(" - "),
    };
  } else {
    primaryAction = {
      kind: "material",
      label: "Find study materials",
      href: "/study/materials",
      meta: "Browse uploads from other JABU students.",
    };
  }

  const response = NextResponse.json({
    ok: true,
    primaryAction,
    weekly: {
      sessions: weeklyAttempts.length,
      avgScore,
      streak,
    },
    due: {
      count: dueRows.length,
      topCourses,
    },
    recommendations: {
      practiceSets,
      materials,
      weakCourses,
    },
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
