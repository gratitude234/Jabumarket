// app/study/StudyHomeClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import StudyTabs from "./_components/StudyTabs";
import { Card, EmptyState, PageHeader, ContributorStatusHub } from "./_components/StudyUI";
import UnifiedSearch from "./_components/UnifiedSearch";
import { StudyPrefsProvider, useStudyPrefs } from "./_components/StudyPrefsContext";
import { ForYouSection, MaterialCard, Section, Skeleton, type MaterialMini, type Chips } from "./_components/ForYouSection";
import { ContinueCard } from "./_components/ContinueCard";
import { StreakSection } from "./_components/StreakSection";
import { cn, currentAcademicSessionFallback } from "@/lib/utils";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Filter,
  GraduationCap,
  TrendingUp,
  X,
} from "lucide-react";
import type { StudyCounts, MaterialMiniStatic } from "./page";

// ── Types ─────────────────────────────────────────────────────────────────────

type CourseMini = {
  id: string;
  course_code: string;
  course_title: string | null;
  level: number;
  semester: string;
  faculty: string;
  department: string;
};

// ── Root export — wraps inner client in the prefs provider ────────────────────

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

// ── Inner component — consumes context ────────────────────────────────────────

function StudyHomeInner({
  initialCounts,
  initialTrending,
}: {
  initialCounts: StudyCounts;
  initialTrending: MaterialMiniStatic[];
}) {
  const { loading, displayName, prefs, hasPrefs, rep, userId, updateSemester } =
    useStudyPrefs();

  const counts = initialCounts;
  const [trending] = useState<MaterialMini[]>(initialTrending as MaterialMini[]);
  const [recentCourses, setRecentCourses] = useState<CourseMini[]>([]);
  const [chips, setChips] = useState<Chips>({});

  const [semesterPrompt, setSemesterPrompt] = useState<{
    show: boolean;
    suggested: string | null;
    current: string | null;
    session: string | null;
  }>({ show: false, suggested: null, current: null, session: null });
  const [switchingSemester, setSwitchingSemester] = useState(false);

  // ── Derived ────────────────────────────────────────────────────────────────
  const quickLevel = prefs?.level ?? 100;

  const filteredTrending = useMemo(() => {
    if (!chips.level && !chips.semester && !chips.type) return trending;
    return trending.filter((m) => {
      if (chips.level && String(m.level) !== String(chips.level)) return false;
      if (chips.semester && m.semester !== chips.semester) return false;
      if (chips.type && m.material_type !== chips.type) return false;
      return true;
    });
  }, [trending, chips]);

  // ── Courses + semester prompt — re-run whenever prefs resolve ─────────────
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
        const session = (prefs!.session ?? currentAcademicSessionFallback()) as string;
        const saved = prefs!.semester ?? null;

        const cur = await supabase
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  function clearFilters() { setChips({}); }

  function dismissSemesterPrompt(session: string, suggested: string) {
    try {
      localStorage.setItem(`jabu_semester_prompt_dismissed:${session}:${suggested}`, "1");
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

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <StudyTabs contributorStatus={rep.status} />

      {/* Semester mismatch banner */}
      {semesterPrompt.show && (
        <div className="sticky top-[49px] z-20 -mx-4 flex items-center justify-between gap-3 border-b border-amber-200/60 bg-amber-50 px-4 py-2.5 dark:border-amber-800/40 dark:bg-amber-950/40">
          <p className="text-xs font-semibold leading-snug text-amber-900 dark:text-amber-200">
            {semesterPrompt.suggested === "first"
              ? "It looks like it's First Semester."
              : semesterPrompt.suggested === "second"
              ? "It looks like it's Second Semester."
              : "It looks like it's Summer."}
            <span className="ml-1 font-normal opacity-80">
              {semesterPrompt.current
                ? `Switch from "${semesterPrompt.current}" to "${semesterPrompt.suggested}" for better results?`
                : `Set semester to "${semesterPrompt.suggested}" for better results?`}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={applySuggestedSemester}
              disabled={switchingSemester}
              className="text-xs font-bold text-amber-900 underline underline-offset-2 disabled:opacity-50 dark:text-amber-200"
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
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <PageHeader
        title="Study"
        subtitle="Browse materials, practice past questions, and track your progress."
        right={
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
        }
      />

      <ContributorStatusHub
        loading={rep.loading}
        status={rep.status}
        role={rep.role}
        scope={rep.scope}
      />

      <StreakSection />

      {/* Welcome + chips */}
      <Card className="rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">
              Welcome{displayName ? `, ${displayName}` : ""} 👋
            </p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight text-foreground">
              What do you want to study today?
            </h2>

            {loading ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                <span className="h-6 w-24 animate-pulse rounded-full bg-muted" />
                <span className="h-6 w-20 animate-pulse rounded-full bg-muted" />
              </div>
            ) : hasPrefs ? (
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
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Set preferences to get personalized recommendations.
              </p>
            )}
          </div>

          <Link
            href="/study/onboarding"
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
              "text-sm font-semibold text-foreground hover:bg-secondary/50",
              !hasPrefs && "border-transparent bg-secondary hover:opacity-90"
            )}
          >
            {hasPrefs ? "Preferences" : "Set up"} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4">
          <UnifiedSearch placeholder="Search materials, courses, Q&A, practice…" />

          <div className="mt-3 flex flex-wrap gap-2">
            {([
              {
                label: "Past Questions",
                icon: (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                    PQ
                  </span>
                ),
                active: chips.type === "past_question",
                onToggle: () =>
                  setChips((p) => ({ ...p, type: p.type === "past_question" ? undefined : "past_question" })),
              },
              {
                label: "1st Sem",
                icon: <Clock className="h-4 w-4" />,
                active: chips.semester === "first",
                onToggle: () =>
                  setChips((p) => ({ ...p, semester: p.semester === "first" ? undefined : "first" })),
              },
              {
                label: "2nd Sem",
                icon: <Clock className="h-4 w-4" />,
                active: chips.semester === "second",
                onToggle: () =>
                  setChips((p) => ({ ...p, semester: p.semester === "second" ? undefined : "second" })),
              },
              {
                label: `${quickLevel}L`,
                icon: <GraduationCap className="h-4 w-4" />,
                active: chips.level === quickLevel,
                onToggle: () =>
                  setChips((p) => ({ ...p, level: p.level === quickLevel ? undefined : quickLevel })),
              },
            ] as const).map(({ label, icon, active, onToggle }) => (
              <button
                key={label}
                type="button"
                onClick={onToggle}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-border bg-secondary text-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                {icon}
                {label}
              </button>
            ))}

            <Link
              href="/study/search"
              className={cn(
                "ml-auto inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-xs font-semibold text-foreground",
                "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              <Filter className="h-4 w-4" />
              Search
            </Link>
          </div>
        </div>
      </Card>

      <ContinueCard />

      {!loading && !hasPrefs && (
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
      )}

      <ForYouSection chips={chips} onClearFilters={clearFilters} />

      <Section
        title="Trending"
        subtitle={hasPrefs ? "Most downloaded across all departments." : "Most downloaded materials right now."}
        href="/study/materials"
        hrefLabel="Explore"
      >
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton />
            <Skeleton />
          </div>
        ) : filteredTrending.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredTrending.map((m) => (
              <MaterialCard key={m.id} m={m} trending />
            ))}
          </div>
        ) : trending.length > 0 ? (
          <EmptyState
            variant="compact"
            title="No matches for these filters"
            description="Try clearing the filters to see trending materials."
            action={
              <button
                type="button"
                onClick={clearFilters}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2",
                  "text-sm font-semibold text-foreground hover:bg-secondary/50"
                )}
              >
                <X className="h-4 w-4" /> Clear filters
              </button>
            }
            icon={TrendingUp}
          />
        ) : (
          <EmptyState
            variant="compact"
            title="Nothing trending yet"
            description="Once students start downloading materials, the top ones will show here."
            icon={TrendingUp}
          />
        )}
      </Section>

      {hasPrefs && (
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
                      <p className="text-sm font-extrabold text-foreground">{c.course_code}</p>
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
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
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
      )}
    </div>
  );
}