"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { trackHomeCta, trackHomeView, type StudyHomeHeroState } from "@/lib/studyAnalytics";
import { cn, currentAcademicSessionFallback } from "@/lib/utils";
import StudyTabs from "./_components/StudyTabs";
import { EmptyState } from "./_components/StudyUI";
import { StudyPrefsProvider, useStudyPrefs } from "./_components/StudyPrefsContext";
import {
  ForYouSection,
  MaterialCard,
  Section,
  Skeleton,
  type Chips,
  type MaterialMini,
} from "./_components/ForYouSection";
import CourseSearch from "./_components/CourseSearch";
import { HeroCard } from "./_components/HeroCard";
import { QuickActions } from "./_components/QuickActions";
import BannerSlot from "./_components/BannerSlot";
import StatsStrip from "./_components/StatsStrip";
import QuickStartChecklist from "./_components/QuickStartChecklist";
import type { MaterialMiniStatic } from "./page";

export default function StudyHomeClient({
  initialTrending,
}: {
  initialTrending: MaterialMiniStatic[];
}) {
  return (
    <StudyPrefsProvider>
      <StudyHomeInner initialTrending={initialTrending} />
    </StudyPrefsProvider>
  );
}

function StudyHomeInner({
  initialTrending,
}: {
  initialTrending: MaterialMiniStatic[];
}) {
  const { loading, displayName, prefs, hasPrefs, rep, userId, updateSemester } =
    useStudyPrefs();

  const [trending] = useState<MaterialMini[]>(initialTrending as MaterialMini[]);
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

  const filteredTrending = useMemo(() => {
    if (!chips.level && !chips.semester && !chips.type) return trending;
    return trending.filter((material) => {
      if (chips.level && String(material.level) !== String(chips.level)) return false;
      if (chips.semester && material.semester !== chips.semester) return false;
      if (chips.type && material.material_type !== chips.type) return false;
      return true;
    });
  }, [chips, trending]);

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
        nudgeDismissed={nudgeResolved ? nudgeDismissed : true}
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

      <Section
        title="Trending"
        subtitle="Most downloaded right now"
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
            {filteredTrending.map((material, index) => (
              <MaterialCard
                key={material.id}
                m={material}
                context="trending"
                onClick={() =>
                  trackHomeCta("trending_card", {
                    material_id: material.id,
                    course_code: material.course_code,
                    position: index + 1,
                  })
                }
              />
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
    </div>
  );
}
