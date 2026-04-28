"use client";

import { useEffect, useState } from "react";
import { BookOpen, ArrowRight } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { trackHomeView, type StudyHomeHeroState } from "@/lib/studyAnalytics";
import { currentAcademicSessionFallback } from "@/lib/utils";
import StudyTabs from "./_components/StudyTabs";
import { StudyPrefsProvider, useStudyPrefs } from "./_components/StudyPrefsContext";
import { ForYouSection, type Chips } from "./_components/ForYouSection";
import CourseSearch from "./_components/CourseSearch";
import { HeroCard } from "./_components/HeroCard";
import { QuickActions } from "./_components/QuickActions";
import BannerSlot from "./_components/BannerSlot";
import StatsStrip from "./_components/StatsStrip";
import QuickStartChecklist from "./_components/QuickStartChecklist";

export default function StudyHomeClient() {
  return (
    <StudyPrefsProvider>
      <StudyHomeInner />
    </StudyPrefsProvider>
  );
}

function StudyHomeInner() {
  const { loading, displayName, prefs, hasPrefs, rep, userId, updateSemester } =
    useStudyPrefs();

  const [chips, setChips] = useState<Chips>({});
  const [semesterPrompt, setSemesterPrompt] = useState<{
    show: boolean;
    suggested: string | null;
    current: string | null;
    session: string | null;
  }>({ show: false, suggested: null, current: null, session: null });
  const [switchingSemester, setSwitchingSemester] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [nudgeResolved, setNudgeResolved] = useState(false);
  const [heroMetrics, setHeroMetrics] = useState<{
    heroState: StudyHomeHeroState;
    dueCount: number;
    streak: number;
  } | null>(null);
  const [examCountdown, setExamCountdown] = useState<{
    daysLeft: number;
    semester: string;
  } | null>(null);
  const [totalAttempts, setTotalAttempts] = useState<number | null>(null);

  function markSessionFlag(flag: string) {
    if (typeof window === "undefined") return false;
    window.__studyAnalyticsFlags ??= {};
    if (window.__studyAnalyticsFlags[flag]) return false;
    window.__studyAnalyticsFlags[flag] = true;
    return true;
  }

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
        if (daysLeft <= 21) {
          setExamCountdown({ daysLeft, semester: data.semester });
        }
      } catch {
        // non-critical
      }
    }

    checkExamSeason();
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem("jabu:setupNudgeDismissed") === "1") {
        setNudgeDismissed(true);
      }
    } catch {
      // non-critical
    }
    setNudgeResolved(true);
  }, []);

  useEffect(() => {
    if (loading || !heroMetrics || !markSessionFlag("study_home_viewed")) return;
    trackHomeView(heroMetrics.heroState, {
      has_prefs: hasPrefs,
      due_count: heroMetrics.dueCount,
      streak: heroMetrics.streak,
    });
  }, [hasPrefs, heroMetrics, loading]);

  useEffect(() => {
    if (loading || !prefs) return;
    let cancelled = false;
    const resolvedPrefs = prefs;

    async function resolveSemester(
      fn: "get_current_semester" | "get_current_semester_fallback",
      session: string
    ) {
      const { data, error } = await supabase.rpc(fn, { p_session: session });
      if (error || !Array.isArray(data)) return null;
      const firstRow = data[0] as { semester?: string | null } | undefined;
      return firstRow?.semester ?? null;
    }

    async function checkSemesterPrompt() {
      try {
        const session = (resolvedPrefs.session ?? currentAcademicSessionFallback()) as string;
        const saved = resolvedPrefs.semester ?? null;
        const current = await resolveSemester("get_current_semester", session);
        const suggested =
          current ?? (await resolveSemester("get_current_semester_fallback", session));

        if (!suggested || saved === suggested) return;

        let dismissed = false;
        try {
          dismissed =
            localStorage.getItem(
              `jabu_semester_prompt_dismissed:${session}:${suggested}`
            ) === "1";
        } catch {
          // non-critical
        }

        if (!cancelled && !dismissed) {
          setSemesterPrompt({ show: true, suggested, current: saved, session });
        }
      } catch {
        // non-critical
      }
    }

    checkSemesterPrompt();
    return () => {
      cancelled = true;
    };
  }, [loading, prefs]);

  useEffect(() => {
    if (loading) return;

    if (!userId) {
      setTotalAttempts(null);
      return;
    }

    let cancelled = false;

    async function fetchTotalAttempts() {
      try {
        const { count, error } = await supabase
          .from("study_practice_attempts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "submitted");

        if (cancelled) return;
        setTotalAttempts(!error ? count ?? 0 : 0);
      } catch {
        if (!cancelled) setTotalAttempts(0);
      }
    }

    setTotalAttempts(null);
    void fetchTotalAttempts();
    return () => {
      cancelled = true;
    };
  }, [loading, userId]);

  function clearFilters() {
    setChips({});
  }

  function dismissSemesterPrompt(session: string, suggested: string) {
    try {
      localStorage.setItem(`jabu_semester_prompt_dismissed:${session}:${suggested}`, "1");
    } catch {
      // non-critical
    }
    setSemesterPrompt({ show: false, suggested: null, current: null, session: null });
  }

  async function applySuggestedSemester() {
    if (!userId || !semesterPrompt.session || !semesterPrompt.suggested) return;

    setSwitchingSemester(true);
    const { session, suggested } = semesterPrompt;

    await supabase
      .from("study_preferences")
      .upsert(
        {
          user_id: userId,
          semester: suggested,
          session,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    updateSemester(suggested, session);
    dismissSemesterPrompt(session, suggested);
    setSwitchingSemester(false);
  }

  const isNewUser = totalAttempts === 0;

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <StudyTabs contributorStatus={rep.status} />

      <BannerSlot
        examCountdown={examCountdown}
        hasPrefs={hasPrefs}
        nudgeDismissed={nudgeResolved && !loading ? nudgeDismissed : true}
        semesterPrompt={semesterPrompt}
        switchingSemester={switchingSemester}
        onDismissSemester={dismissSemesterPrompt}
        onApplySemester={applySuggestedSemester}
        onDismissSetupNudge={() => setNudgeDismissed(true)}
      />

      <CourseSearch />

      <HeroCard
        displayName={displayName}
        userId={userId}
        loading={loading}
        onHeroStateResolved={setHeroMetrics}
      />

      <QuickActions repStatus={rep.status} />

      {userId && totalAttempts === null ? (
        <div className="h-20 animate-pulse rounded-3xl bg-muted" />
      ) : null}

      {userId && totalAttempts !== null
        ? isNewUser
          ? <QuickStartChecklist userId={userId} hasPrefs={hasPrefs} />
          : <StatsStrip userId={userId} />
        : null}

      <ForYouSection chips={chips} setChips={setChips} onClearFilters={clearFilters} />

      <MyCourses />
    </div>
  );
}

// ─── My Courses ───────────────────────────────────────────────────────────────

type CourseRow = {
  id: string;
  course_code: string;
  course_title: string;
  materialCount: number;
};

function MyCourses() {
  const { prefs, loading: prefsLoading, hasPrefs } = useStudyPrefs();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  useEffect(() => {
    if (prefsLoading) return;
    if (!prefs?.department_id && !prefs?.level) return;

    let cancelled = false;
    setCoursesLoading(true);

    (async () => {
      try {
        let q = supabase
          .from("study_courses")
          .select("id,course_code,course_title")
          .eq("status", "approved")
          .order("course_code", { ascending: true })
          .limit(8);

        if (prefs?.department_id) q = q.eq("department_id", prefs.department_id);
        if (prefs?.level) q = q.eq("level", prefs.level);

        const { data, error } = await q;
        if (cancelled || error || !data?.length) {
          if (!cancelled) { setCourses([]); setCoursesLoading(false); }
          return;
        }

        const withCounts = await Promise.all(
          (data as Pick<CourseRow, "id" | "course_code" | "course_title">[]).map(
            async (course) => {
              const { count } = await supabase
                .from("study_materials")
                .select("id", { count: "exact", head: true })
                .eq("course_id", course.id)
                .eq("approved", true);
              return { ...course, materialCount: count ?? 0 };
            }
          )
        );

        if (!cancelled) { setCourses(withCounts); setCoursesLoading(false); }
      } catch {
        if (!cancelled) { setCourses([]); setCoursesLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [prefsLoading, prefs?.department_id, prefs?.level]);

  if (prefsLoading) {
    return (
      <div className="space-y-3">
        <div className="h-5 w-28 animate-pulse rounded-full bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!hasPrefs) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center">
        <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-semibold text-foreground">Your courses will appear here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up your profile to see courses for your department and level.
        </p>
        <Link
          href="/study/profile"
          className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#5B35D5] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4a2bb0]"
        >
          Set up profile <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">My Courses</h2>
          <p className="text-xs text-muted-foreground">Your department&apos;s course hubs</p>
        </div>
        <Link
          href="/study/materials"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B35D5] hover:underline"
        >
          All materials <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {coursesLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : courses.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/study/courses/${encodeURIComponent(course.course_code)}`}
              className="group flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 no-underline transition hover:border-[#5B35D5]/40 hover:bg-[#EEEDFE]/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-xl bg-[#5B35D5]/10 px-2.5 py-1 text-xs font-bold text-[#5B35D5]">
                  {course.course_code}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#5B35D5]" />
              </div>
              <p className="line-clamp-2 text-sm font-semibold text-foreground">
                {course.course_title}
              </p>
              {course.materialCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {course.materialCount} material{course.materialCount !== 1 ? "s" : ""}
                </p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <p className="text-sm font-semibold text-foreground">No courses found yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Materials for your courses will appear here as students upload them.
          </p>
          <Link
            href="/study/materials"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B35D5] hover:underline"
          >
            Browse all materials <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}
