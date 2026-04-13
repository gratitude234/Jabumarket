"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  getInProgressAttempts,
  getPracticeStreak,
  type PracticeAttemptRow,
} from "@/lib/studyPractice";

type DueCourseRow = {
  // Assumption: Supabase may return the nested relation as either an object or
  // a single-item array depending on generated typings for this relation.
  study_quiz_sets:
    | { course_code: string | null }
    | Array<{ course_code: string | null }>
    | null;
};

function extractCourseCode(row: DueCourseRow) {
  const nested = row.study_quiz_sets;
  if (Array.isArray(nested)) return nested[0]?.course_code ?? null;
  return nested?.course_code ?? null;
}

export function HeroCard({
  displayName,
  userId,
  loading,
}: {
  displayName: string | null;
  userId: string | null;
  loading: boolean;
}) {
  const [streak, setStreak] = useState(0);
  const [activeDays, setActiveDays] = useState<Set<string>>(new Set());
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [dueCourses, setDueCourses] = useState<string[]>([]);
  const [continueAttempt, setContinueAttempt] = useState<PracticeAttemptRow | null>(null);
  const [streakLoading, setStreakLoading] = useState(true);
  const [ctaResolved, setCtaResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getPracticeStreak().catch(() => null);
        if (!cancelled) setStreak(res?.streak ?? 0);
      } finally {
        if (!cancelled) setStreakLoading(false);
      }

      if (!userId) return;
      try {
        const since = new Date(Date.now() + 3_600_000 - 28 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const { data } = await supabase
          .from("study_daily_activity")
          .select("activity_date,did_practice")
          .eq("user_id", userId)
          .gte("activity_date", since);
        if (!cancelled && data) {
          const nextDays = new Set<string>();
          for (const row of data as { activity_date: string; did_practice: boolean }[]) {
            if (row?.did_practice === true && row?.activity_date) nextDays.add(String(row.activity_date));
          }
          setActiveDays(nextDays);
        }
      } catch {
        // non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (loading) return;

    if (!userId) {
      setDueCount(0);
      setDueCourses([]);
      setContinueAttempt(null);
      setCtaResolved(true);
      return;
    }

    let cancelled = false;
    setCtaResolved(false);

    (async () => {
      try {
        const now = new Date().toISOString();
        const [countRes, coursesRes, inProgress] = await Promise.all([
          supabase
            .from("study_weak_questions")
            .select("user_id", { count: "exact", head: true })
            .eq("user_id", userId)
            .lte("next_due_at", now)
            .is("graduated_at", null),
          supabase
            .from("study_weak_questions")
            .select("study_quiz_sets(course_code)")
            .eq("user_id", userId)
            .lte("next_due_at", now)
            .is("graduated_at", null)
            .limit(10),
          getInProgressAttempts(1).catch(() => []),
        ]);

        if (cancelled) return;

        setDueCount(!countRes.error ? countRes.count ?? 0 : 0);

        if (!coursesRes.error && Array.isArray(coursesRes.data)) {
          const nextCourses = Array.from(
            new Set(
              (coursesRes.data as DueCourseRow[])
                .map(extractCourseCode)
                .map((code) => code?.trim())
                .filter((code): code is string => Boolean(code))
            )
          ).slice(0, 2);
          setDueCourses(nextCourses);
        } else {
          setDueCourses([]);
        }

        setContinueAttempt(inProgress[0] ?? null);
      } catch {
        if (!cancelled) {
          setDueCount(0);
          setDueCourses([]);
          setContinueAttempt(null);
        }
      } finally {
        if (!cancelled) setCtaResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, userId]);

  const now = new Date(Date.now() + 3_600_000);
  const todayStr = now.toISOString().slice(0, 10);
  const dotDays: string[] = [];
  for (let i = 27; i >= 0; i--) {
    dotDays.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }

  const streakColor =
    streak >= 7 ? "text-orange-500" : streak >= 3 ? "text-amber-500" : "text-muted-foreground";

  const timeGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const greeting = displayName ? `${timeGreeting}, ${displayName}` : `${timeGreeting}`;
  const dueMinutes = dueCount && dueCount > 0 ? Math.ceil(dueCount * 0.4) : 0;
  const answeredCount = typeof continueAttempt?.score === "number" ? continueAttempt.score : 0;
  const totalCount = typeof continueAttempt?.total_questions === "number" ? continueAttempt.total_questions : 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-extrabold tracking-tight text-foreground">{greeting}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick up where you left off and keep your streak moving.
            </p>
          </div>

          <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 shadow-sm">
            <Flame className={cn("h-4 w-4", streakLoading ? "text-muted-foreground" : streakColor)} />
            <span className="text-sm font-extrabold text-foreground">{streakLoading ? "0" : streak}</span>
          </div>
        </div>

        {!ctaResolved ? (
          <div className="mt-4 h-[72px] animate-pulse rounded-2xl bg-secondary/70" />
        ) : dueCount !== null && dueCount > 0 ? (
          <Link
            href="/study/practice?due=1"
            className={cn(
              "mt-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 no-underline shadow-sm transition",
              "bg-[#5B35D5] text-white hover:bg-[#4526B8]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B35D5] focus-visible:ring-offset-2"
            )}
          >
            <div className="min-w-0">
              <p className="text-sm font-extrabold">
                Review {dueCount} due card{dueCount === 1 ? "" : "s"} · ~{dueMinutes} min
              </p>
              {dueCourses.length > 0 ? (
                <p className="mt-1 truncate text-xs text-white/70">{dueCourses.join(", ")}</p>
              ) : null}
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-white" />
          </Link>
        ) : continueAttempt ? (
          <Link
            href={`/study/practice/${encodeURIComponent(continueAttempt.set_id)}?attempt=${encodeURIComponent(continueAttempt.id)}`}
            className={cn(
              "mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 no-underline transition",
              "hover:bg-secondary/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-foreground">
                Continue {continueAttempt.study_quiz_sets?.title ?? "Practice set"}
                {totalCount > 0 ? ` · ${answeredCount}/${totalCount}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Resume your in-progress practice attempt.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ) : (
          <Link
            href="/study/practice"
            className={cn(
              "mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 no-underline transition",
              "hover:bg-secondary/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            <div>
              <p className="text-sm font-extrabold text-foreground">Start practicing</p>
              <p className="mt-1 text-xs text-muted-foreground">Warm up with a fresh study session.</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        )}
      </div>

      <div className="border-t border-border px-5 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          28-day activity
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: "4px" }}>
          {dotDays.map((day) => {
            const isToday = day === todayStr;
            const practiced = activeDays.has(day);
            return (
              <div
                key={day}
                title={day}
                className={cn(
                  "h-2 rounded-sm",
                  isToday
                    ? practiced
                      ? "bg-[#5B35D5] ring-2 ring-[#5B35D5]/35 ring-offset-1"
                      : "bg-muted ring-2 ring-[#5B35D5]/30 ring-offset-1"
                    : practiced
                    ? "bg-[#5B35D5]/60"
                    : "bg-secondary"
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
