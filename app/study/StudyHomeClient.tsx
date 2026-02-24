"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import StudyTabs from "./_components/StudyTabs";
import { Card, EmptyState, PageHeader, SkeletonCard, GhostCta } from "./_components/StudyUI";
import { getLatestAttempt, getPracticeStreak } from "@/lib/studyPractice";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Calculator,
  UploadCloud,
  Search,
  Clock,
  Sparkles,
  Filter,
  X,
  Bookmark,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type StudyCounts = {
  courses: number;
  approvedMaterials: number;
  tutors: number;
};

type MaterialMini = {
  id: string;
  title: string | null;
  course_code: string | null;
  level: string | null;
  semester: string | null;
  material_type: string;
  downloads: number | null;
  created_at: string;
};

type CourseMini = {
  id: string;
  course_code: string;
  course_title: string | null;
  level: number;
  semester: string;
  faculty: string;
  department: string;
};

type Prefs = {
  faculty?: string | null;
  department?: string | null;
  level?: number | null;
};

export default function StudyHomeClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<{ id: string; email?: string | null } | null>(null);

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [counts, setCounts] = useState<StudyCounts>({ courses: 0, approvedMaterials: 0, tutors: 0 });

  const [query, setQuery] = useState("");
  const [chips, setChips] = useState<{ level?: number; semester?: string; type?: string }>({});

  const [continueAttempt, setContinueAttempt] = useState<any | null>(null);
  const [streak, setStreak] = useState<{ current: number; best: number } | null>(null);

  const [forYou, setForYou] = useState<MaterialMini[]>([]);
  const [trending, setTrending] = useState<MaterialMini[]>([]);
  const [recentCourses, setRecentCourses] = useState<CourseMini[]>([]);

  const hasPrefs = useMemo(() => {
    return !!(prefs?.faculty || prefs?.department || prefs?.level);
  }, [prefs]);

  const canShowForYou = useMemo(() => {
    // For You is better with at least department/level
    return !!(prefs?.department || prefs?.faculty || prefs?.level);
  }, [prefs]);

  function toMaterialsSearch() {
    const sp = new URLSearchParams();
    if (query.trim()) sp.set("q", query.trim());
    if (chips.level) sp.set("level", String(chips.level));
    if (chips.semester) sp.set("semester", chips.semester);
    if (chips.type) sp.set("type", chips.type);
    const url = `/study/materials${sp.toString() ? `?${sp.toString()}` : ""}`;
    router.push(url);
  }

  function clearFilters() {
    setChips({});
    setQuery("");
  }

  // Load everything (faster via Promise.all + best-effort fallbacks)
  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);

      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;

      if (!mounted) return;
      if (!user) {
        // If your Study requires auth, send to login; otherwise remove this.
        router.replace("/login");
        return;
      }

      setAuthed({ id: user.id, email: user.email });

      // 1) Prefs (best effort)
      // NOTE: If your prefs table name differs, update here.
      const prefsPromise = supabase
        .from("study_preferences")
        .select("faculty, department, level")
        .eq("user_id", user.id)
        .maybeSingle();

      // 2) Counts (best effort)
      const countsPromise = Promise.all([
        supabase.from("study_courses").select("id", { count: "exact", head: true }),
        supabase.from("study_materials").select("id", { count: "exact", head: true }).eq("approved", true),
        supabase.from("study_tutors").select("id", { count: "exact", head: true }),
      ]);

      // 3) Dashboard lists (best effort)
      const trendingPromise = supabase
        .from("study_materials")
        .select("id,title,course_code,level,semester,material_type,downloads,created_at")
        .eq("approved", true)
        .order("downloads", { ascending: false })
        .limit(6);

      const coursesPromise = supabase
        .from("study_courses")
        .select("id,course_code,course_title,level,semester,faculty,department")
        .order("created_at", { ascending: false })
        .limit(6);

      // 4) Continue + streak (uses your util; keep it best-effort)
      const attemptPromise = getLatestAttempt(user.id).catch(() => null);
      const streakPromise = getPracticeStreak(user.id).catch(() => null);

      const [prefsRes, countsRes, trendingRes, coursesRes, latestAttemptRes, streakRes] =
        await Promise.all([prefsPromise, countsPromise, trendingPromise, coursesPromise, attemptPromise, streakPromise]);

      if (!mounted) return;

      // Prefs: table may not exist yet, so ignore errors gracefully
      if (!prefsRes.error && prefsRes.data) {
        setPrefs({
          faculty: prefsRes.data.faculty ?? null,
          department: prefsRes.data.department ?? null,
          level: prefsRes.data.level ?? null,
        });
      } else {
        setPrefs(null);
      }

      // Counts
      const [coursesCountRes, materialsCountRes, tutorsCountRes] = countsRes;
      setCounts({
        courses: coursesCountRes.count ?? 0,
        approvedMaterials: materialsCountRes.count ?? 0,
        tutors: tutorsCountRes.count ?? 0,
      });

      // Trending
      setTrending((trendingRes.data as MaterialMini[]) ?? []);

      // Courses
      setRecentCourses((coursesRes.data as CourseMini[]) ?? []);

      // Continue + streak
      setContinueAttempt(latestAttemptRes ?? null);
      setStreak(streakRes ?? null);

      // For You (depends on prefs) — separate query so it stays accurate
      // If no prefs, we just keep it empty and show a setup banner.
      if (!prefsRes.error && prefsRes.data) {
        const p = prefsRes.data as Prefs;

        // Build query carefully (text match can be fragile; best effort)
        let q = supabase
          .from("study_materials")
          .select("id,title,course_code,level,semester,material_type,downloads,created_at")
          .eq("approved", true)
          .order("created_at", { ascending: false })
          .limit(6);

        if (p.department) q = q.ilike("department", `%${p.department}%`);
        else if (p.faculty) q = q.ilike("faculty", `%${p.faculty}%`);

        if (p.level) q = q.eq("level", String(p.level));

        const fy = await q;
        if (!fy.error) setForYou((fy.data as MaterialMini[]) ?? []);
      } else {
        setForYou([]);
      }

      setLoading(false);
    }

    run();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <StudyTabs />

      {/* Header */}
      <PageHeader
        title="Study"
        subtitle="Browse materials, practice past questions, and track your progress."
        right={
          <div className="flex items-center gap-2">
            <Link
              href="/study/materials/upload"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
                "text-sm font-semibold text-foreground hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <UploadCloud className="h-4 w-4" />
              Upload
            </Link>
          </div>
        }
      />

      {/* Hero */}
      <Card className="rounded-3xl">
        {loading ? (
          <div className="space-y-3">
            <div className="h-5 w-44 rounded bg-muted" />
            <div className="h-4 w-72 max-w-full rounded bg-muted" />
            <div className="h-11 w-full rounded-2xl bg-muted" />
            <div className="flex gap-2 overflow-hidden">
              <div className="h-9 w-24 rounded-full bg-muted" />
              <div className="h-9 w-28 rounded-full bg-muted" />
              <div className="h-9 w-24 rounded-full bg-muted" />
              <div className="h-9 w-28 rounded-full bg-muted" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-muted-foreground">
                  Welcome{authed?.email ? `, ${authed.email.split("@")[0]}` : ""} 👋
                </p>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight text-foreground">
                  What do you want to study today?
                </h2>

                {/* Micro stats */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border bg-background px-2 py-1">
                    {counts.courses} courses
                  </span>
                  <span className="rounded-full border border-border bg-background px-2 py-1">
                    {counts.approvedMaterials} materials
                  </span>
                  <span className="rounded-full border border-border bg-background px-2 py-1">
                    {counts.tutors} tutors
                  </span>
                  {streak ? (
                    <span className="rounded-full border border-border bg-background px-2 py-1">
                      🔥 streak: {streak.current}
                    </span>
                  ) : null}
                </div>
              </div>

              <Link
                href="/study/practice"
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2",
                  "text-sm font-semibold text-foreground hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                Practice
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Search */}
            <div className="mt-4">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search materials (e.g. BCH 201, Anatomy, Past Questions)…"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {(query || chips.level || chips.semester || chips.type) ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-xl border border-border bg-background px-2 py-1",
                      "text-xs font-semibold text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    )}
                    aria-label="Clear search and filters"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </button>
                ) : null}
              </div>

              {/* Filter chips (mobile-first) */}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setChips((p) => ({ ...p, type: p.type === "past_question" ? undefined : "past_question" }))}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    chips.type === "past_question"
                      ? "border-border bg-secondary text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <FileChipIcon />
                  Past Questions
                </button>

                <button
                  type="button"
                  onClick={() => setChips((p) => ({ ...p, semester: p.semester === "first" ? undefined : "first" }))}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    chips.semester === "first"
                      ? "border-border bg-secondary text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <Clock className="h-4 w-4" />
                  1st Sem
                </button>

                <button
                  type="button"
                  onClick={() => setChips((p) => ({ ...p, semester: p.semester === "second" ? undefined : "second" }))}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    chips.semester === "second"
                      ? "border-border bg-secondary text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <Clock className="h-4 w-4" />
                  2nd Sem
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setChips((p) => ({
                      ...p,
                      level: p.level === 100 ? undefined : 100,
                    }))
                  }
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    chips.level === 100
                      ? "border-border bg-secondary text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <GraduationCap className="h-4 w-4" />
                  100L
                </button>

                <button
                  type="button"
                  onClick={toMaterialsSearch}
                  className={cn(
                    "ml-auto inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-xs font-semibold text-foreground",
                    "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  )}
                >
                  <Filter className="h-4 w-4" />
                  Search
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Onboarding Banner (NO forced redirect) */}
      {!loading && !hasPrefs ? (
        <Card className="rounded-3xl">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Personalize your Study Home</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Set your faculty/department/level so we can show you the right materials and practice sets.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/study/onboarding?next=/study"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-semibold text-foreground",
                    "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  )}
                >
                  Set up now <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/study/materials"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-semibold",
                    "text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  )}
                >
                  Browse anyway
                </Link>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction
          href="/study/materials"
          title="Materials"
          subtitle="Browse & download"
          icon={<BookOpen className="h-5 w-5" />}
        />
        <QuickAction
          href="/study/practice"
          title="Practice"
          subtitle="Past questions"
          icon={<Sparkles className="h-5 w-5" />}
        />
        <QuickAction
          href="/study/library"
          title="Library"
          subtitle="Saved items"
          icon={<Bookmark className="h-5 w-5" />}
        />
        <QuickAction
          href="/study/gpa"
          title="GPA"
          subtitle="Calculator"
          icon={<Calculator className="h-5 w-5" />}
        />
      </div>

      {/* Continue */}
      {loading ? (
        <SkeletonCard />
      ) : continueAttempt ? (
        <Card className="rounded-3xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Continue practice</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick up where you stopped last time.
              </p>
            </div>
            <Link
              href={`/study/history`}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
                "text-sm font-semibold text-foreground hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              History <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>
      ) : null}

      {/* For You */}
      <SectionHeader
        title="For you"
        subtitle={canShowForYou ? "Based on your preferences" : "Set up preferences to personalize this"}
        right={<GhostCta href="/study/materials">See all</GhostCta>}
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !canShowForYou ? (
        <EmptyState
          title="Set preferences to get recommendations"
          description="Choose your faculty/department/level and we’ll show you the right materials first."
          action={<GhostCta href="/study/onboarding?next=/study">Set up now</GhostCta>}
          icon={<ShieldCheck className="h-5 w-5 text-muted-foreground" />}
        />
      ) : forYou.length === 0 ? (
        <EmptyState
          title="No recommendations yet"
          description="Try browsing materials or uploading your first past question."
          action={
            <div className="flex gap-2">
              <GhostCta href="/study/materials">Browse</GhostCta>
              <GhostCta href="/study/materials/upload">Upload</GhostCta>
            </div>
          }
          icon={<Sparkles className="h-5 w-5 text-muted-foreground" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {forYou.map((m) => (
            <MaterialMiniCard key={m.id} m={m} />
          ))}
        </div>
      )}

      {/* Trending */}
      <SectionHeader
        title="Trending"
        subtitle="Most downloaded materials"
        right={<GhostCta href="/study/materials?sort=downloads">Explore</GhostCta>}
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : trending.length === 0 ? (
        <EmptyState
          title="No trending materials yet"
          description="Once students start downloading, you’ll see popular items here."
          icon={<TrendingUp className="h-5 w-5 text-muted-foreground" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {trending.map((m) => (
            <MaterialMiniCard key={m.id} m={m} />
          ))}
        </div>
      )}

      {/* Courses */}
      <SectionHeader
        title="Explore courses"
        subtitle="Jump into a course and find materials fast"
        right={<GhostCta href="/study/materials">Browse courses</GhostCta>}
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : recentCourses.length === 0 ? (
        <EmptyState
          title="No courses available yet"
          description="Add/seed courses so students can browse by course code."
          icon={<GraduationCap className="h-5 w-5 text-muted-foreground" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {recentCourses.map((c) => (
            <Link
              key={c.id}
              href={`/study/courses/${encodeURIComponent(c.course_code)}`}
              className={cn(
                "group rounded-3xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-foreground">{c.course_code}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {c.course_title ?? "Course"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border bg-background px-2 py-1">
                      {c.level}L
                    </span>
                    <span className="rounded-full border border-border bg-background px-2 py-1">
                      {String(c.semester).toUpperCase()}
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Small components ---------------------------- */

function QuickAction({
  href,
  title,
  subtitle,
  icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-3xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </Link>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 pt-2">
      <div className="min-w-0">
        <h3 className="text-base font-extrabold tracking-tight text-foreground">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function MaterialMiniCard({ m }: { m: MaterialMini }) {
  const label = [
    m.course_code ? m.course_code : null,
    m.level ? `${m.level}L` : null,
    m.semester ? String(m.semester).toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <Link
      href="/study/materials"
      className={cn(
        "group rounded-3xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-extrabold text-foreground">
            {m.title ?? "Untitled material"}
          </p>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{label || "Study material"}</p>

          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-background px-2 py-1">
              {String(m.material_type).replaceAll("_", " ")}
            </span>
            <span className="rounded-full border border-border bg-background px-2 py-1">
              {m.downloads ?? 0} downloads
            </span>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function FileChipIcon() {
  // tiny icon without importing FileText to keep chips light
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="text-muted-foreground">
      <path
        fill="currentColor"
        d="M14 2H7a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h10a2 2 0 0 0 2-2V7zm0 2.5L18.5 9H14zM8 13h8v2H8zm0 4h8v2H8zm0-8h5v2H8z"
      />
    </svg>
  );
}