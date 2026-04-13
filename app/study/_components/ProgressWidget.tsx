"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface ProgressWidgetProps {
  userId: string;
}

type AttemptQueryRow = {
  id: string;
  score: number | null;
  total_questions: number | null;
  created_at: string | null;
  study_quiz_sets:
    | { course_code: string | null }
    | Array<{ course_code: string | null }>
    | null;
};

type AttemptRow = {
  id: string;
  score: number;
  total_questions: number;
  created_at: string;
  course_code: string | null;
};

type CourseStat = {
  courseCode: string;
  avgPct: number;
  trend: number | null;
  attemptCount: number;
};

type ProgressStats = {
  totalSessions: number;
  avgScore: number | null;
  bestScore: number | null;
  courseStats: CourseStat[];
};

function getCourseCode(
  joined: AttemptQueryRow["study_quiz_sets"]
): string | null {
  if (Array.isArray(joined)) return joined[0]?.course_code ?? null;
  return joined?.course_code ?? null;
}

function getScoreClass(value: number | null) {
  if (value == null) return "text-foreground";
  if (value >= 70) return "text-[#3B6D11] dark:text-emerald-400";
  if (value >= 50) return "text-[#633806] dark:text-amber-400";
  return "text-[#791F1F] dark:text-red-400";
}

function getBarClass(value: number) {
  if (value >= 70) return "bg-[#5B35D5]";
  if (value >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

export default function ProgressWidget({ userId }: ProgressWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProgressStats | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setStats(null);
      return;
    }

    let cancelled = false;

    async function fetchProgress() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("study_practice_attempts")
          .select("id, score, total_questions, created_at, study_quiz_sets(course_code)")
          .eq("user_id", userId)
          .eq("status", "submitted")
          .not("score", "is", null)
          .not("total_questions", "is", null)
          .gt("total_questions", 0)
          .order("created_at", { ascending: true })
          .limit(200);

        if (error || !Array.isArray(data)) {
          if (!cancelled) setStats(null);
          return;
        }

        const attempts: AttemptRow[] = (data as AttemptQueryRow[]).map((row) => ({
          id: row.id,
          score: Number(row.score ?? 0),
          total_questions: Number(row.total_questions ?? 0),
          created_at: String(row.created_at ?? ""),
          course_code: getCourseCode(row.study_quiz_sets),
        }));

        const totalSessions = attempts.length;
        if (!totalSessions) {
          if (!cancelled) setStats(null);
          return;
        }

        const allPcts = attempts.map((attempt) =>
          Math.round((attempt.score / attempt.total_questions) * 100)
        );
        const avgScore = allPcts.length
          ? Math.round(allPcts.reduce((sum, value) => sum + value, 0) / allPcts.length)
          : null;
        const bestScore = allPcts.length ? Math.max(...allPcts) : null;

        const byCourse = new Map<string, number[]>();
        for (const attempt of attempts) {
          const code = attempt.course_code?.trim().toUpperCase();
          if (!code) continue;
          const pct = Math.round((attempt.score / attempt.total_questions) * 100);
          if (!byCourse.has(code)) byCourse.set(code, []);
          byCourse.get(code)?.push(pct);
        }

        const courseStats: CourseStat[] = Array.from(byCourse.entries())
          .map(([courseCode, pcts]) => {
            const avgPct = Math.round(
              pcts.reduce((sum, value) => sum + value, 0) / pcts.length
            );
            let trend: number | null = null;
            if (pcts.length >= 2) {
              const first = pcts[0] ?? null;
              const recent = pcts.slice(-3);
              const recentAvg = Math.round(
                recent.reduce((sum, value) => sum + value, 0) / recent.length
              );
              trend = first == null ? null : recentAvg - first;
            }
            return { courseCode, avgPct, trend, attemptCount: pcts.length };
          })
          .sort((a, b) => b.avgPct - a.avgPct)
          .slice(0, 4);

        if (!cancelled) {
          setStats({
            totalSessions,
            avgScore,
            bestScore,
            courseStats,
          });
        }
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProgress();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return <div className="h-[120px] animate-pulse rounded-3xl bg-muted" />;
  }

  if (!userId || !stats || stats.totalSessions === 0) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p className="text-sm font-extrabold text-foreground">My progress</p>
        <Link
          href="/study/history"
          className="text-xs font-semibold text-[#5B35D5] no-underline hover:underline"
        >
          Full history →
        </Link>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <div className="px-4 py-3 text-center">
          <p className="text-xl font-extrabold leading-none text-foreground">
            {stats.totalSessions}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">sessions</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className={`text-xl font-extrabold leading-none ${getScoreClass(stats.avgScore)}`}>
            {stats.avgScore != null ? `${stats.avgScore}%` : "—"}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">avg score</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className={`text-xl font-extrabold leading-none ${getScoreClass(stats.bestScore)}`}>
            {stats.bestScore != null ? `${stats.bestScore}%` : "—"}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">best</p>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            By course
          </p>
          <p className="text-[10px] text-muted-foreground">avg score</p>
        </div>

        {stats.courseStats.map((stat) => (
          <div key={stat.courseCode} className="flex items-center gap-2.5">
            <p className="w-[46px] shrink-0 text-right text-[11px] font-semibold text-foreground">
              {stat.courseCode}
            </p>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${getBarClass(stat.avgPct)}`}
                style={{ width: `${stat.avgPct}%` }}
              />
            </div>
            <p className="w-7 shrink-0 text-right text-[11px] text-muted-foreground">
              {stat.avgPct}%
            </p>
            {stat.trend != null && stat.trend > 0 ? (
              <span className="rounded-md bg-[#EAF3DE] px-1.5 py-0.5 text-[9px] font-semibold text-[#3B6D11] dark:bg-emerald-950/40 dark:text-emerald-400">
                +{stat.trend}%
              </span>
            ) : stat.trend != null && stat.trend < 0 ? (
              <span className="rounded-md bg-[#FCEBEB] px-1.5 py-0.5 text-[9px] font-semibold text-[#791F1F] dark:bg-rose-950/40 dark:text-red-400">
                {stat.trend}%
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
