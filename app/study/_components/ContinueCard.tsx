"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Bookmark, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./StudyUI";
import { getLatestAttempt, getInProgressAttempts, type PracticeAttemptRow } from "@/lib/studyPractice";

export function ContinueCard() {
  const [attempts, setAttempts] = useState<PracticeAttemptRow[]>([]);
  const [fallbackAttempt, setFallbackAttempt] = useState<PracticeAttemptRow | null>(null);
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
          if (!cancelled) setFallbackAttempt(latest);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card className="rounded-3xl">
      {/* Header */}
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
            "text-sm font-semibold text-foreground hover:bg-secondary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          Practice <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Attempt slots */}
      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-border bg-background p-3 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 shrink-0 rounded bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-32 rounded bg-muted" />
                <div className="h-3 w-48 rounded bg-muted" />
              </div>
            </div>
          </div>
        ) : attempts.length > 0 ? (
          attempts.map((a) => {
            // PracticeAttemptRow has no answered_count field — progress bar falls back to Resume →
            const answered: number | null = null;
            const total: number | null = a.total_questions;
            return (
              <Link
                key={a.id}
                href={`/study/practice/${encodeURIComponent(a.set_id)}?attempt=${encodeURIComponent(a.id)}`}
                className={cn(
                  "rounded-2xl border border-border bg-background px-3 py-2.5 hover:bg-secondary/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#5B35D5]/[0.07] border border-[#5B35D5]/20">
                    <Bookmark className="h-4 w-4 text-[#5B35D5]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {a.study_quiz_sets?.title ?? "Practice set"}
                      {a.study_quiz_sets?.course_code ? ` · ${a.study_quiz_sets.course_code}` : ""}
                    </p>
                    {answered !== null && total !== null && total > 0 && (
                      <>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {answered} / {total} questions · ~{Math.ceil(((total - answered) * 12) / 60)} min left
                        </p>
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-[#5B35D5]"
                            style={{ width: `${Math.round((answered / total) * 100)}%` }}
                          />
                        </div>
                      </>
                    )}
                    {(answered === null || total === null || total === 0) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Resume →</p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        ) : fallbackAttempt ? (
          <Link
            href={`/study/practice/${encodeURIComponent(fallbackAttempt.set_id)}?attempt=${encodeURIComponent(fallbackAttempt.id)}`}
            className={cn(
              "rounded-2xl border border-border bg-background p-3 hover:bg-secondary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            <div className="flex items-start gap-3">
              <Bookmark className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Review last attempt</p>
                <p className="mt-0.5 truncate text-xs font-medium text-foreground">
                  {fallbackAttempt.study_quiz_sets?.title ?? "Practice set"}
                  {fallbackAttempt.study_quiz_sets?.course_code ? ` · ${fallbackAttempt.study_quiz_sets.course_code}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fallbackAttempt.score != null && fallbackAttempt.total_questions
                    ? `Score: ${fallbackAttempt.score}/${fallbackAttempt.total_questions}`
                    : "Tap to review your answers."}
                </p>
              </div>
            </div>
          </Link>
        ) : (
          <Link
            href="/study/practice"
            className={cn(
              "rounded-2xl border border-border bg-background p-3 hover:bg-secondary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            <div className="flex items-start gap-3">
              <Bookmark className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Start your first practice session</p>
                <p className="mt-1 text-xs text-muted-foreground">Pick a set from Practice and track your scores here.</p>
              </div>
            </div>
          </Link>
        )}

        {/* Browse materials — always visible */}
        <Link
          href="/study/materials"
          className={cn(
            "flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2.5 hover:bg-secondary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Browse materials</p>
            <p className="text-xs text-muted-foreground">Find notes, slides, and past questions.</p>
          </div>
        </Link>
      </div>
    </Card>
  );
}