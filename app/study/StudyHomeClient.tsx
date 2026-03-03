// app/study/StudyHomeClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import StudyTabs from "./_components/StudyTabs";
import { Card, EmptyState, PageHeader, ContributorStatusHub } from "./_components/StudyUI";
import { getLatestAttempt, getPracticeStreak } from "@/lib/studyPractice";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Search,
  Clock,
  Filter,
  X,
  TrendingUp,
  Bookmark,
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
  faculty_id?: string | null;
  department_id?: string | null;
};

type RepRole = "course_rep" | "dept_librarian" | null;
type RepStatus = "not_applied" | "pending" | "approved" | "rejected";

type RepMeResponse =
  | {
      ok: true;
      status: RepStatus;
      role: RepRole;
      scope:
        | {
            faculty_id: string | null;
            department_id: string | null;
            levels: number[] | null;
            all_levels: boolean;
          }
        | null;
    }
  | { ok: false; code?: string; message?: string };

export default function StudyHomeClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<{ id: string; email?: string | null } | null>(null);

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [counts, setCounts] = useState<StudyCounts>({ courses: 0, approvedMaterials: 0, tutors: 0 });

  const [query, setQuery] = useState("");
  const [chips, setChips] = useState<{ level?: number; semester?: string; type?: string }>({});

  const [continueAttempt, setContinueAttempt] = useState<any | null>(null);
  const [streak, setStreak] = useState<{ streak: number; didPracticeToday: boolean } | null>(null);

  const [forYou, setForYou] = useState<MaterialMini[]>([]);
  const [trending, setTrending] = useState<MaterialMini[]>([]);
  const [recentCourses, setRecentCourses] = useState<CourseMini[]>([]);

  const [rep, setRep] = useState<{
    loading: boolean;
    status: RepStatus;
    role: RepRole;
    scope: any;
  }>({ loading: true, status: "not_applied", role: null, scope: null });

  const hasPrefs = useMemo(() => {
    return !!(prefs?.faculty_id || prefs?.department_id || prefs?.faculty || prefs?.department || prefs?.level);
  }, [prefs]);

  const quickLevel = prefs?.level ?? 100;
  const canUpload = rep.status === "approved";

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

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);

      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user ?? null;

      if (!mounted) return;
      if (!user) {
        router.replace("/login");
        return;
      }

      setAuthed({ id: user.id, email: user.email });

      // Rep/Librarian status
      setRep((p) => ({ ...p, loading: true }));
      try {
        const r = await fetch("/api/study/rep-applications/me", { cache: "no-store" });
        const j = (await r.json()) as RepMeResponse;
        if (mounted && j && (j as any).ok) {
          const ok = j as Extract<RepMeResponse, { ok: true }>;
          setRep({
            loading: false,
            status: ok.status,
            role: ok.role,
            scope: ok.scope,
          });
        } else {
          setRep((p) => ({ ...p, loading: false }));
        }
      } catch {
        setRep((p) => ({ ...p, loading: false }));
      }

      // Preferences
      const prefsPromise = supabase
        .from("study_preferences")
        .select(
          "level, faculty_id, department_id, faculty:study_faculties(name), department:study_departments(name)"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      // Counts
      const countsPromise = Promise.all([
        supabase.from("study_courses").select("id", { count: "exact", head: true }),
        supabase.from("study_materials").select("id", { count: "exact", head: true }).eq("approved", true),
        supabase.from("study_tutors").select("id", { count: "exact", head: true }),
      ]);

      // Lists
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

      const attemptPromise = getLatestAttempt().catch(() => null);
      const streakPromise = getPracticeStreak().catch(() => null);

      const [prefsRes, countsRes, trendingRes, coursesRes, latestAttemptRes, streakRes] =
        await Promise.all([prefsPromise, countsPromise, trendingPromise, coursesPromise, attemptPromise, streakPromise]);

      if (!mounted) return;

      // Resolve prefs (new + legacy)
      let effectivePrefs: Prefs | null = null;

      if (!prefsRes.error && prefsRes.data) {
        effectivePrefs = {
          faculty: (prefsRes.data as any).faculty?.name ?? null,
          department: (prefsRes.data as any).department?.name ?? null,
          level: (prefsRes.data as any).level ?? null,
          faculty_id: (prefsRes.data as any).faculty_id ?? null,
          department_id: (prefsRes.data as any).department_id ?? null,
        };
      } else {
        const legacyRes = await supabase
          .from("study_user_preferences")
          .select("faculty,department,level")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!legacyRes.error && legacyRes.data) {
          effectivePrefs = {
            faculty: (legacyRes.data as any).faculty ?? null,
            department: (legacyRes.data as any).department ?? null,
            level: (legacyRes.data as any).level ?? null,
            faculty_id: null,
            department_id: null,
          };
        }
      }

      setPrefs(effectivePrefs);

      const [coursesCountRes, materialsCountRes, tutorsCountRes] = countsRes;
      setCounts({
        courses: coursesCountRes.count ?? 0,
        approvedMaterials: materialsCountRes.count ?? 0,
        tutors: tutorsCountRes.count ?? 0,
      });

      setTrending((trendingRes.data as MaterialMini[]) ?? []);
      setRecentCourses((coursesRes.data as CourseMini[]) ?? []);
      setContinueAttempt(latestAttemptRes ?? null);
      setStreak(streakRes ?? null);

      // For you (prefer IDs, fallback to name matching)
      if (effectivePrefs) {
        const p = effectivePrefs;

        let q = supabase
          .from("study_materials")
          .select("id,title,course_code,level,semester,material_type,downloads,created_at")
          .eq("approved", true)
          .order("created_at", { ascending: false })
          .limit(6);

        if (p.department_id) q = q.eq("department_id", p.department_id);
        else if (p.department) q = q.ilike("department", `%${p.department}%`);

        if (!p.department_id) {
          if (p.faculty_id) q = q.eq("faculty_id", p.faculty_id);
          else if (p.faculty) q = q.ilike("faculty", `%${p.faculty}%`);
        }

        if (p.level) q = q.eq("level", String(p.level));

        const fy = await q;
        if (!fy.error) setForYou((fy.data as MaterialMini[]) ?? []);
        else setForYou([]);
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
      <StudyTabs showUploadTab={canUpload} contributorStatus={rep.status} />

      <PageHeader
        title="Study"
        subtitle="Browse materials, practice past questions, and track your progress."
        right={
          <div className="flex items-center gap-2">
            <Link
              href="/study/practice"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2",
                "text-sm font-semibold text-foreground hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              Practice <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <ContributorStatusHub loading={rep.loading} status={rep.status} role={rep.role} scope={rep.scope} />

      <Card className="rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">
              Welcome{authed?.email ? `, ${authed.email.split("@")[0]}` : ""} 👋
            </p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight text-foreground">
              What do you want to study today?
            </h2>

            {loading ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="h-6 w-20 rounded-full bg-muted animate-pulse" />
                <span className="h-6 w-24 rounded-full bg-muted animate-pulse" />
                <span className="h-6 w-20 rounded-full bg-muted animate-pulse" />
                <span className="h-6 w-20 rounded-full bg-muted animate-pulse" />
              </div>
            ) : (
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
                <span className="rounded-full border border-border bg-background px-2 py-1">
                  🔥 streak: {streak?.streak ?? 0}
                </span>
              </div>
            )}
          </div>

          <div className="shrink-0">
            {hasPrefs ? (
              <Link
                href="/study/onboarding"
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
                  "text-sm font-semibold text-foreground hover:bg-secondary/50"
                )}
              >
                Preferences <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                href="/study/onboarding"
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2",
                  "text-sm font-semibold text-foreground hover:opacity-90"
                )}
              >
                Set up <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search materials (e.g. BCH 201, Anatomy, Past Questions)…"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") toMaterialsSearch();
              }}
            />
            {query || chips.level || chips.semester || chips.type ? (
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

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setChips((p) => ({
                  ...p,
                  type: p.type === "past_question" ? undefined : "past_question",
                }))
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                chips.type === "past_question"
                  ? "border-border bg-secondary text-foreground"
                  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                PQ
              </span>
              Past Questions
            </button>

            <button
              type="button"
              onClick={() =>
                setChips((p) => ({ ...p, semester: p.semester === "first" ? undefined : "first" }))
              }
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
              onClick={() =>
                setChips((p) => ({ ...p, semester: p.semester === "second" ? undefined : "second" }))
              }
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
                  level: p.level === quickLevel ? undefined : quickLevel,
                }))
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                chips.level === quickLevel
                  ? "border-border bg-secondary text-foreground"
                  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <GraduationCap className="h-4 w-4" />
              {quickLevel}L
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
      </Card>

      <Card className="rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-foreground">Continue</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick up where you left off, or start a new practice session.
            </p>
          </div>
          <Link
            href="/study/practice"
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
              "text-sm font-semibold text-foreground hover:bg-secondary/50"
            )}
          >
            Practice <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {continueAttempt ? (
            <Link
              href="/study/practice"
              className={cn(
                "rounded-2xl border border-border bg-background p-3 hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <div className="flex items-start gap-3">
                <Bookmark className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Resume last attempt
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    Continue your previous practice session.
                  </p>
                </div>
              </div>
            </Link>
          ) : (
            <div className="rounded-2xl border border-border bg-background p-3">
              <p className="text-sm font-semibold text-foreground">
                No active attempt
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start a practice session to track progress.
              </p>
            </div>
          )}

          <Link
            href="/study/materials"
            className={cn(
              "rounded-2xl border border-border bg-background p-3 hover:bg-secondary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Browse materials
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Find notes, slides, and past questions.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </Card>

      {!loading && !hasPrefs ? (
        <EmptyState
          title="Personalize your Study Home"
          description="Set your faculty, department, and level so we can recommend the best materials for you."
          action={
            <Link
              href="/study/onboarding"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2",
                "text-sm font-semibold text-foreground hover:opacity-90"
              )}
            >
              Set preferences <ArrowRight className="h-4 w-4" />
            </Link>
          }
          icon={GraduationCap}
        />
      ) : null}

      <Section
        title="For you"
        subtitle={
          hasPrefs
            ? "Fresh uploads matching your preferences."
            : "Set preferences to get better recommendations."
        }
        href="/study/materials"
        hrefLabel="See all"
      >
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton />
            <Skeleton />
          </div>
        ) : forYou.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {forYou.map((m) => (
              <MaterialCard key={m.id} m={m} />
            ))}
          </div>
        ) : (
          <EmptyState
            variant="compact"
            title={hasPrefs ? "No recommendations yet" : "No preferences set"}
            description={
              hasPrefs
                ? "Check Materials or search for a course code."
                : "Set preferences to see recommended materials here."
            }
            action={
              <div className="flex flex-wrap items-center gap-2">
                {!hasPrefs ? (
                  <Link
                    href="/study/onboarding"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2",
                      "text-sm font-semibold text-foreground hover:opacity-90"
                    )}
                  >
                    Set preferences <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}

                <Link
                  href="/study/materials"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2",
                    "text-sm font-semibold text-foreground hover:bg-secondary/50"
                  )}
                >
                  Browse materials <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            }
            icon={Bookmark}
          />
        )}
      </Section>

      <Section
        title="Trending"
        subtitle="Most downloaded materials right now."
        href="/study/materials"
        hrefLabel="Explore"
      >
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton />
            <Skeleton />
          </div>
        ) : trending.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {trending.map((m) => (
              <MaterialCard key={m.id} m={m} trending />
            ))}
          </div>
        ) : (
          <EmptyState
            variant="compact"
            title="Nothing trending yet"
            description="Once students start downloading materials, the top ones will show here."
            icon={TrendingUp}
          />
        )}
      </Section>

      <Section
        title="Courses"
        subtitle="Recently added courses you can browse."
        href="/study/materials"
        hrefLabel="View"
      >
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton />
            <Skeleton />
          </div>
        ) : recentCourses.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentCourses.map((c) => (
              <Link
                key={c.id}
                href={`/study/courses/${encodeURIComponent(c.course_code)}`}
                className={cn(
                  "rounded-2xl border border-border bg-card p-4 shadow-sm hover:bg-secondary/20",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-foreground">
                      {c.course_code}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {c.course_title ?? "Course"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border bg-background px-2 py-1">
                        {c.level}L
                      </span>
                      <span className="rounded-full border border-border bg-background px-2 py-1">
                        {c.semester}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            variant="compact"
            title="No courses yet"
            description="Add courses to start organizing materials by course code."
            icon={BookOpen}
          />
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-foreground">{title}</p>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {href ? (
          <Link
            href={href}
            className={cn(
              "shrink-0 inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
              "text-sm font-semibold text-foreground hover:bg-secondary/50"
            )}
          >
            {hrefLabel ?? "See all"} <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function MaterialCard({ m, trending }: { m: MaterialMini; trending?: boolean }) {
  // ✅ consistent with hero search: q=
  const courseQ = m.course_code ?? "";
  const href = `/study/materials${courseQ ? `?q=${encodeURIComponent(courseQ)}` : ""}`;

  return (
    <Link
      href={href}
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-sm hover:bg-secondary/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-foreground line-clamp-1">
            {m.title ?? m.course_code ?? "Material"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {(m.course_code ? `${m.course_code} • ` : "") + (m.material_type ?? "material")}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {m.level ? (
              <span className="rounded-full border border-border bg-background px-2 py-1">{m.level}</span>
            ) : null}
            {m.semester ? (
              <span className="rounded-full border border-border bg-background px-2 py-1">{m.semester}</span>
            ) : null}
            {trending ? (
              <span className="rounded-full border border-border bg-background px-2 py-1">
                <TrendingUp className="mr-1 inline-block h-3.5 w-3.5" />
                {m.downloads ?? 0}
              </span>
            ) : null}
          </div>
        </div>

        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm animate-pulse">
      <div className="h-4 w-2/3 rounded bg-muted" />
      <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-16 rounded-full bg-muted" />
        <div className="h-6 w-20 rounded-full bg-muted" />
      </div>
    </div>
  );
}