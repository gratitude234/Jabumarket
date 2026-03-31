"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getLatestAttempt,
  getInProgressAttempts,
  type PracticeAttemptRow,
} from "@/lib/studyPractice";

function AttemptItem({ a }: { a: PracticeAttemptRow }) {
  const answered = typeof a.score === "number" ? a.score : null;
  const total = typeof a.total_questions === "number" ? a.total_questions : null;
  const hasProgress = answered !== null && total !== null && total > 0;
  const pct = hasProgress ? Math.round((answered / total) * 100) : 0;
  const minsLeft =
    hasProgress ? Math.ceil(((total - answered) * 12) / 60) : null;

  const setTitle = a.study_quiz_sets?.title ?? "Practice set";
  const courseCode = a.study_quiz_sets?.course_code;
  const displayName = courseCode ? `${courseCode} · ${setTitle}` : setTitle;

  return (
    <Link
      href={`/study/practice/${encodeURIComponent(a.set_id)}?attempt=${encodeURIComponent(a.id)}`}
      className={cn(
        "flex items-center gap-3 px-4 py-3 no-underline transition-colors",
        "hover:bg-secondary/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE]">
        <Zap className="h-4 w-4 text-[#5B35D5]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
        {hasProgress ? (
          <>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {answered} / {total} questions
              {minsLeft !== null && minsLeft > 0 ? ` · ~${minsLeft} min left` : ""}
            </p>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-[#5B35D5] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">Resume →</p>
        )}
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function ContinueCard() {
  const [attempts, setAttempts] = useState<PracticeAttemptRow[]>([]);
  const [fallback, setFallback] = useState<PracticeAttemptRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inProgress = await getInProgressAttempts(3);
        if (cancelled) return;
        if (inProgress.length > 0) {
          setAttempts(inProgress);
        } else {
          const latest = await getLatestAttempt();
          if (!cancelled) setFallback(latest);
        }
      } catch { /* silent */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Nothing to show
  if (!loading && attempts.length === 0 && !fallback) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-extrabold text-foreground">Continue where you left off</p>
        <Link
          href="/study/history"
          className="text-xs font-semibold text-[#5B35D5] hover:underline"
        >
          See all →
        </Link>
      </div>

      {/* Attempt list */}
      {loading ? (
        <div className="animate-pulse px-4 py-3">
          <div className="h-3 w-40 rounded bg-muted" />
          <div className="mt-2 h-2.5 w-56 rounded bg-muted" />
          <div className="mt-2 h-1 w-full rounded-full bg-muted" />
        </div>
      ) : attempts.length > 0 ? (
        <div className="divide-y divide-border">
          {attempts.map((a) => (
            <AttemptItem key={a.id} a={a} />
          ))}
        </div>
      ) : fallback ? (
        <Link
          href={`/study/practice/${encodeURIComponent(fallback.set_id)}?attempt=${encodeURIComponent(fallback.id)}`}
          className={cn(
            "flex items-center gap-3 px-4 py-3 no-underline transition-colors",
            "hover:bg-secondary/40"
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE]">
            <Zap className="h-4 w-4 text-[#5B35D5]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Review last attempt</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {fallback.study_quiz_sets?.title ?? "Practice set"}
              {fallback.study_quiz_sets?.course_code
                ? ` · ${fallback.study_quiz_sets.course_code}`
                : ""}
            </p>
            {fallback.score !== null && fallback.total_questions ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Score: {fallback.score}/{fallback.total_questions}
              </p>
            ) : null}
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : null}
    </div>
  );
}
