// app/study/StudyHomeClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import StudyTabs from "./_components/StudyTabs";
import { Card, EmptyState, ContributorStatusHub } from "./_components/StudyUI";
import UnifiedSearch from "./_components/UnifiedSearch";
import { StudyPrefsProvider, useStudyPrefs } from "./_components/StudyPrefsContext";
import {
  ForYouSection,
  Section,
  Skeleton,
  type MaterialMini,
  type Chips,
} from "./_components/ForYouSection";
import { ContinueCard } from "./_components/ContinueCard";
import { StreakSection } from "./_components/StreakSection";
import { cn, currentAcademicSessionFallback } from "@/lib/utils";
import {
  ArrowRight,
  BookOpen,
  Building2,
  Calculator,
  GraduationCap,
  Trophy,
  Upload,
  X,
  Zap,
} from "lucide-react";
import type { StudyCounts, MaterialMiniStatic } from "./page";

// ─── Brand accent ─────────────────────────────────────────────────────────────
const ACCENT      = "#5B35D5";
const ACCENT_BG   = "#EEEDFE";
const ACCENT_TEXT = "#3C3489";

// ─── Types ────────────────────────────────────────────────────────────────────

type CourseMini = {
  id: string;
  course_code: string;
  course_title: string | null;
  level: number;
  semester: string;
  faculty: string;
  department: string;
};

// ─── Root export ──────────────────────────────────────────────────────────────

export default function StudyHomeClient({
  initialCounts,
  initialTrending,
}: {
  initialCounts: StudyCounts;
  initialTrending: MaterialMiniStatic[];
}) {
  return (
    <StudyPrefsProvider>
      <StudyHomeInner
        initialCounts={initialCounts}
        initialTrending={initialTrending}
      />
    </StudyPrefsProvider>
  );
}

// ─── Inner component ──────────────────────────────────────────────────────────

function StudyHomeInner({
  initialCounts,
  initialTrending,
}: {
  initialCounts: StudyCounts;
  initialTrending: MaterialMiniStatic[];
}) {
  const { loading, displayName, prefs, hasPrefs, rep, userId, updateSemester } =
    useStudyPrefs();

  const [trending]      = useState<MaterialMini[]>(initialTrending as MaterialMini[]);
  const [recentCourses, setRecentCourses] = useState<CourseMini[]>([]);
  const [chips,         setChips]         = useState<Chips>({});

  const [semesterPrompt, setSemesterPrompt] = useState<{
    show: boolean;
    suggested: string | null;
    current: string | null;
    session: string | null;
  }>({ show: false, suggested: null, current: null, session: null });
  const [switchingSemester, setSwitchingSemester] = useState(false);

  const [examCountdown, setExamCountdown] = useState<{
    daysLeft: number; semester: string;
  } | null>(null);

  useEffect(() => {
    async function checkExamSeason() {
      try {
        const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
        const { data } = await supabase
          .from("study_academic_calendar")
          .select("session, semester, ends_on")
          .gte("ends_on", today)
          .order("ends_on", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!data?.ends_on) return;
        const daysLeft = Math.ceil(
          (new Date(data.ends_on).getTime() - (Date.now() + 3_600_000)) / 86_400_000
        );
        if (daysLeft <= 21) setExamCountdown({ daysLeft, semester: data.semester });
      } catch { /* non-critical */ }
    }
    checkExamSeason();
  }, []);

  // ── Courses + semester prompt ─────────────────────────────────────────────

  useEffect(() => {
    if (loading || !prefs) return;
    let cancelled = false;

    async function fetchCourses() {
      let q = supabase
        .from("study_courses")
        .select("id,course_code,course_title,level,semester,faculty,department")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(8);

      if (prefs!.department_id) q = q.eq("department_id", prefs!.department_id);
      else if (prefs!.department) q = q.ilike("department", `%${prefs!.department}%`);
      if (prefs!.level) q = q.eq("level", prefs!.level);

      const { data, error } = await q;
      if (!cancelled && !error) setRecentCourses((data as CourseMini[]) ?? []);
    }

    async function checkSemesterPrompt() {
      try {
        const session   = (prefs!.session ?? currentAcademicSessionFallback()) as string;
        const saved     = prefs!.semester ?? null;
        const cur       = await supabase
          .rpc("get_current_semester", { p_session: session })
          .then((r: any) => r?.error ? null : (r?.data?.[0]?.semester as string | undefined) ?? null);
        const suggested =
          cur ??
          (await supabase
            .rpc("get_current_semester_fallback", { p_session: session })
            .then((r: any) => r?.error ? null : (r?.data?.[0]?.semester as string | undefined) ?? null));

        if (!suggested || saved === suggested) return;

        let dismissed = false;
        try {
          dismissed =
            localStorage.getItem(
              `jabu_semester_prompt_dismissed:${session}:${suggested}`
            ) === "1";
        } catch {}

        if (!cancelled && !dismissed) {
          setSemesterPrompt({ show: true, suggested, current: saved, session });
        }
      } catch {}
    }

    fetchCourses();
    checkSemesterPrompt();
    return () => { cancelled = true; };
  }, [loading, prefs]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function clearFilters() { setChips({}); }

  function dismissSemesterPrompt(session: string, suggested: string) {
    try {
      localStorage.setItem(
        `jabu_semester_prompt_dismissed:${session}:${suggested}`, "1"
      );
    } catch {}
    setSemesterPrompt({ show: false, suggested: null, current: null, session: null });
  }

  async function applySuggestedSemester() {
    if (!userId || !semesterPrompt.session || !semesterPrompt.suggested) return;
    setSwitchingSemester(true);
    const { session, suggested } = semesterPrompt;
    await supabase
      .from("study_preferences")
      .upsert(
        { user_id: userId, semester: suggested, session, updated_at: new Date().toISOString() } as any,
        { onConflict: "user_id" }
      );
    updateSemester(suggested, session);
    dismissSemesterPrompt(session, suggested);
    setSwitchingSemester(false);
  }

  // Rep info
  const isRep     = rep.status === "approved" && !!rep.role;
  const roleLabel =
    rep.role === "dept_librarian" ? "Dept librarian" :
    rep.role === "course_rep"     ? "Course rep"     : null;
  const scopeLabel = useMemo(() => {
    if (!rep.scope) return null;
    const lvls = Array.isArray(rep.scope.levels) && rep.scope.levels.length
      ? rep.scope.levels.map((l: number) => `${l}L`).join(", ")
      : null;
    if (rep.role === "dept_librarian") return "All levels";
    return lvls;
  }, [rep]);

  // Greeting
  const greeting = useMemo(() => {
    const hour = new Date(Date.now() + 3_600_000).getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const prefsLine = useMemo(() => {
    const parts: string[] = [];
    if (prefs?.level)    parts.push(`${prefs.level}L`);
    if (prefs?.department) parts.push(prefs.department);
    if (prefs?.semester)
      parts.push(
        prefs.semester === "first" ? "1st sem" :
        prefs.semester === "second" ? "2nd sem" : "Summer"
      );
    return parts.join(" · ");
  }, [prefs]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-28 md:pb-6">
      <StudyTabs contributorStatus={rep.status} />

      <UnifiedSearch placeholder="Search courses, past questions, topics…" />

      {/* Semester mismatch banner */}
      {semesterPrompt.show && (
        <div className="sticky top-[49px] z-20 -mx-4 flex items-center justify-between gap-3 border-b border-amber-200/60 bg-amber-50 px-4 py-2.5 dark:border-amber-800/40 dark:bg-amber-950/40">
          <p className="text-xs font-medium leading-snug text-amber-900 dark:text-amber-200">
            {semesterPrompt.suggested === "first" ? "Looks like First Semester."
              : semesterPrompt.suggested === "second" ? "Looks like Second Semester."
              : "Looks like Summer."}
            <span className="ml-1 font-normal opacity-80">
              {semesterPrompt.current
                ? `Switch from "${semesterPrompt.current}" to "${semesterPrompt.suggested}"?`
                : `Set semester to "${semesterPrompt.suggested}"?`}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={applySuggestedSemester}
              disabled={switchingSemester}
              className="text-xs font-medium text-amber-900 underline underline-offset-2 disabled:opacity-50 dark:text-amber-200"
            >
              {switchingSemester ? "Switching…" : "Switch"}
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() =>
                semesterPrompt.session && semesterPrompt.suggested
                  ? dismissSemesterPrompt(semesterPrompt.session, semesterPrompt.suggested)
                  : setSemesterPrompt({ show: false, suggested: null, current: null, session: null })
              }
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-amber-700 hover:bg-amber-100 dark:text-amber-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-foreground">
            {greeting}{displayName ? `, ${displayName}` : ""}
          </h1>
          {loading ? (
            <div className="mt-1 h-4 w-48 animate-pulse rounded bg-muted" />
          ) : prefsLine ? (
            <p className="mt-1 text-sm text-muted-foreground">{prefsLine}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Set preferences to personalise your feed
            </p>
          )}
        </div>
        <Link
          href="/study/onboarding"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/50 no-underline",
            !hasPrefs && "border-transparent text-white"
          )}
          style={!hasPrefs ? { background: ACCENT } : undefined}
        >
          {hasPrefs ? "Preferences" : "Set up"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* ── Exam countdown ───────────────────────────────────────────────── */}
      {examCountdown && (
        <Link
          href="/study/practice"
          className={cn(
            "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 no-underline",
            examCountdown.daysLeft <= 7
              ? "border-rose-300/40 bg-rose-100/30 dark:bg-rose-950/20"
              : "border-amber-300/40 bg-amber-100/30 dark:bg-amber-950/20"
          )}
        >
          <div className="min-w-0">
            <p className={cn(
              "text-sm font-medium",
              examCountdown.daysLeft <= 7
                ? "text-rose-900 dark:text-rose-200"
                : "text-amber-900 dark:text-amber-200"
            )}>
              {examCountdown.daysLeft <= 1 ? "Exams start tomorrow!" : `Finals in ${examCountdown.daysLeft} days`}
            </p>
            <p className={cn(
              "text-xs",
              examCountdown.daysLeft <= 7
                ? "text-rose-700 dark:text-rose-300"
                : "text-amber-700 dark:text-amber-300"
            )}>
              Practice now to be ready.
            </p>
          </div>
          <ArrowRight className={cn(
            "h-4 w-4 shrink-0",
            examCountdown.daysLeft <= 7 ? "text-rose-700" : "text-amber-700"
          )} />
        </Link>
      )}

      {/* ── Due today — primary CTA ───────────────────────────────────────── */}
      {userId && <DueTodayBanner userId={userId} />}

      {/* ── Quick actions 3-up ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            href: "/study/practice",
            icon: <Zap className="h-4 w-4" style={{ color: ACCENT }} />,
            iconBg: ACCENT_BG,
            label: "Practice",
            sub: "Browse sets",
          },
          {
            href: "/study/materials",
            icon: <BookOpen className="h-4 w-4 text-emerald-700" />,
            iconBg: "#EAF3DE",
            label: "Materials",
            sub: "Notes, slides",
          },
          {
            href: "/study/gpa",
            icon: <Calculator className="h-4 w-4 text-amber-700" />,
            iconBg: "#FAEEDA",
            label: "GPA calc",
            sub: "Track grades",
          },
        ].map(({ href, icon, iconBg, label, sub }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col rounded-2xl border border-border bg-background p-3 no-underline hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div
              className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: iconBg }}
            >
              {icon}
            </div>
            <span className="text-xs font-medium text-foreground">{label}</span>
            <span className="mt-0.5 text-[10px] text-muted-foreground">{sub}</span>
          </Link>
        ))}
      </div>

      {/* ── Streak ──────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Streak
          </p>
          <Link
            href="/study/leaderboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground no-underline"
          >
            <Trophy className="h-3.5 w-3.5" /> Leaderboard
          </Link>
        </div>
        <StreakSection />
      </div>

      {/* ── Continue ────────────────────────────────────────────────────── */}
      <ContinueCard />

      {/* ── No prefs nudge ──────────────────────────────────────────────── */}
      {!loading && !hasPrefs && (
        <div
          className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
          style={{ background: ACCENT_BG }}
        >
          <p className="text-sm" style={{ color: ACCENT_TEXT }}>
            Set your department and level for personalised materials.
          </p>
          <Link
            href="/study/onboarding"
            className="shrink-0 rounded-2xl px-3 py-2 text-xs font-medium text-white no-underline"
            style={{ background: ACCENT }}
          >
            Set up →
          </Link>
        </div>
      )}

      {/* ── For you ─────────────────────────────────────────────────────── */}
      <ForYouSection chips={chips} onClearFilters={clearFilters} />

      {/* ── Rep zone ────────────────────────────────────────────────────── */}
      {isRep && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Rep zone
          </p>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: ACCENT_BG }}
              >
                {rep.role === "dept_librarian"
                  ? <Building2 className="h-4 w-4" style={{ color: ACCENT }} />
                  : <GraduationCap className="h-4 w-4" style={{ color: ACCENT }} />
                }
              </div>
              <div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: ACCENT_BG, color: ACCENT_TEXT }}
                >
                  {roleLabel}
                </span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {scopeLabel ? `${scopeLabel} · ` : ""}You can upload for your dept
                </p>
              </div>
            </div>
            <Link
              href="/study/materials/upload"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-medium text-white no-underline"
              style={{ background: ACCENT }}
            >
              <Upload className="h-3.5 w-3.5" /> Upload
            </Link>
          </div>
        </div>
      )}

      {/* ── Courses ─────────────────────────────────────────────────────── */}
      {hasPrefs && (
        <Section
          title="Your courses"
          subtitle="Recently added courses in your department."
          href="/study/materials"
          hrefLabel="View all"
        >
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton /><Skeleton />
            </div>
          ) : recentCourses.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {recentCourses.map((c) => (
                <Link
                  key={c.id}
                  href={`/study/courses/${encodeURIComponent(c.course_code)}`}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 no-underline",
                    "hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.course_code}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {c.course_title ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                      {c.level}L
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              variant="compact"
              title="No courses yet"
              description="Add courses to start organising materials by code."
              icon={<BookOpen className="h-5 w-5" />}
            />
          )}
        </Section>
      )}

      {/* Contributor status — bottom, non-competing */}
      <ContributorStatusHub
        loading={rep.loading}
        status={rep.status}
        role={rep.role}
        scope={rep.scope}
      />
    </div>
  );
}

// ─── DueTodayBanner ───────────────────────────────────────────────────────────
// Replaces DueTodayWidget — indigo banner as the page's primary CTA.
// Inlined here so it doesn't break the existing DueTodayWidget import elsewhere.

function DueTodayBanner({ userId }: { userId: string }) {
  const [count,   setCount]   = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      try {
        const now = new Date().toISOString();
        const { count: dueCount, error } = await supabase
          .from("study_weak_questions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .lte("next_due_at", now)
          .is("graduated_at", null);
        if (!cancelled && !error) setCount(dueCount ?? 0);
      } catch { /* non-critical */ }
      finally { if (!cancelled) setLoading(false); }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  if (loading) return <div className="h-16 w-full animate-pulse rounded-2xl bg-muted" />;
  if (count === null) return null;

  if (count === 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        <span
          className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ background: "#1D9E75" }}
        >
          ✓
        </span>
        Nothing due today — you&apos;re on track
      </div>
    );
  }

  return (
    <Link
      href="/study/practice?due=1"
      className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 no-underline"
      style={{ background: ACCENT }}
    >
      <div className="flex items-center gap-3">
        <p className="text-2xl font-medium leading-none text-white">{count}</p>
        <div>
          <p className="text-sm font-medium text-white">
            {count === 1 ? "Question" : "Questions"} due today
          </p>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.7)" }}>
            SRS review — don&apos;t break the chain
          </p>
        </div>
      </div>
      <div
        className="rounded-2xl px-3 py-2 text-xs font-medium"
        style={{ background: "#fff", color: ACCENT }}
      >
        Start review
      </div>
    </Link>
  );
}