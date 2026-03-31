// app/study/StudyHomeClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import StudyTabs from "./_components/StudyTabs";
import { EmptyState } from "./_components/StudyUI";
import { StudyPrefsProvider, useStudyPrefs } from "./_components/StudyPrefsContext";
import { ForYouSection, MaterialCard, Section, Skeleton, type MaterialMini, type Chips } from "./_components/ForYouSection";
import { ContinueCard } from "./_components/ContinueCard";
import { HeroCard } from "./_components/HeroCard";
import { QuickActions } from "./_components/QuickActions";
import { cn, currentAcademicSessionFallback } from "@/lib/utils";
import {
  ArrowRight,
  BookOpen,
  Clock,
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

  // P-5: Exam countdown
  const [examCountdown, setExamCountdown] = useState<{
    daysLeft: number; semester: string;
  } | null>(null);

  useEffect(() => {
    async function checkExamSeason() {
      try {
        const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
        const { data } = await supabase
          .from('study_academic_calendar')
          .select('session, semester, ends_on')
          .gte('ends_on', today)
          .order('ends_on', { ascending: true })
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

      {/* P-5: Exam countdown banner */}
      {examCountdown && (
        <Link
          href="/study/practice"
          className={cn(
            'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 no-underline',
            examCountdown.daysLeft <= 7
              ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30'
              : 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30'
          )}
        >
          <div className="min-w-0">
            <p className={cn(
              'text-sm font-extrabold',
              examCountdown.daysLeft <= 7
                ? 'text-red-900 dark:text-red-200'
                : 'text-amber-900 dark:text-amber-200'
            )}>
              {examCountdown.daysLeft <= 1
                ? 'Exams start tomorrow!'
                : `Finals in ${examCountdown.daysLeft} days`}
            </p>
            <p className={cn(
              'text-xs',
              examCountdown.daysLeft <= 7
                ? 'text-red-700 dark:text-red-300'
                : 'text-amber-700 dark:text-amber-300'
            )}>
              Practice now to be ready — tap to start.
            </p>
          </div>
          <ArrowRight className={cn(
            'h-4 w-4 shrink-0',
            examCountdown.daysLeft <= 7 ? 'text-red-700' : 'text-amber-700'
          )} />
        </Link>
      )}

      <HeroCard
        displayName={displayName}
        hasPrefs={hasPrefs}
        userId={userId}
      />

      <QuickActions />

      <ContinueCard />

      {/* Filter chips for For You */}
      <div className="flex flex-wrap gap-2">
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
                ? "border-[#5B35D5]/25 bg-[#EEEDFE] text-[#3B24A8]"
                : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

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
              <MaterialCard key={m.id} m={m} context="trending" />
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
