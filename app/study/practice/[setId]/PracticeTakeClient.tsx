// app/study/practice/[setId]/PracticeTakeClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  RefreshCcw,
  Send,
  Timer,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Trophy,
  Star,
  X,
  Sparkles,
  RotateCcw,
  BookOpen,
  GraduationCap,
  CalendarClock,
  TrendingUp,
} from "lucide-react";
import { Card, EmptyState } from "../../_components/StudyUI";
import { cn, msToClock, normalize } from "@/lib/utils";
import { usePracticeEngine } from "./usePracticeEngine";
import { supabase } from "@/lib/supabase";

type AnyOption = {
  id: string;
  text: string | null;
  // your engine may expose one of these:
  is_correct?: boolean | null;
  correct?: boolean | null;
  isCorrect?: boolean | null;
};

function getIsCorrect(o: AnyOption) {
  return Boolean(o.is_correct ?? o.correct ?? o.isCorrect ?? false);
}

// ── Milestone toast ───────────────────────────────────────────────────────────

type MilestoneLevel = "perfect" | "excellent" | "great" | "good" | "done";

type Milestone = {
  level: MilestoneLevel;
  emoji: string;
  heading: string;
  sub: string;
};

function getMilestone(correct: number, total: number): Milestone {
  if (total === 0) return { level: "done", emoji: "✅", heading: "Session saved", sub: "No questions to score." };
  const pct = Math.round((correct / total) * 100);
  if (pct === 100) return { level: "perfect",   emoji: "🎯", heading: "Perfect score!",     sub: `${correct}/${total} — flawless.` };
  if (pct >= 90)   return { level: "excellent", emoji: "⭐", heading: "Outstanding!",        sub: `${pct}% — keep it up!` };
  if (pct >= 80)   return { level: "great",     emoji: "🔥", heading: "Great work!",         sub: `${pct}% — solid performance.` };
  if (pct >= 60)   return { level: "good",      emoji: "💪", heading: "Good effort!",        sub: `${pct}% — practice makes perfect.` };
  return              { level: "done",      emoji: "✅", heading: "Session complete",     sub: `${pct}% — review your answers below.` };
}

function formatDue(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = t - Date.now();
  const hours = Math.round(diff / 3_600_000);
  if (hours <= 0) return "now";
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(diff / 86_400_000);
  return `in ${days}d`;
}

const MILESTONE_STYLES: Record<MilestoneLevel, string> = {
  perfect:   "border-amber-300/50  bg-amber-50   text-amber-900  dark:border-amber-700/50 dark:bg-amber-950/60 dark:text-amber-200",
  excellent: "border-violet-300/50 bg-violet-50  text-violet-900 dark:border-violet-700/50 dark:bg-violet-950/60 dark:text-violet-200",
  great:     "border-orange-300/50 bg-orange-50  text-orange-900 dark:border-orange-700/50 dark:bg-orange-950/60 dark:text-orange-200",
  good:      "border-emerald-300/50 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-950/60 dark:text-emerald-200",
  done:      "border-border bg-card text-foreground",
};

// ── AI Explain Inline ─────────────────────────────────────────────────────────

type AiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string; cached: boolean }
  | { status: "error"; message: string };

function AiExplainInline({
  questionId,
  questionPrompt,
  chosenOptionText,
  correctOptionText,
  isCorrect,
}: {
  questionId: string;
  questionPrompt: string;
  chosenOptionText: string | null | undefined;
  correctOptionText: string | null | undefined;
  isCorrect: boolean;
}) {
  const [state, setState] = useState<AiState>({ status: "idle" });

  async function fetchExplanation() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          questionPrompt,
          chosenOptionText,
          correctOptionText,
          isCorrect,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setState({ status: "error", message: json.error ?? "Something went wrong." });
      } else {
        setState({ status: "done", text: json.explanation, cached: json.cached });
      }
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  if (state.status === "idle") {
    return (
      <button
        type="button"
        onClick={fetchExplanation}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all",
          "border-violet-200/70 bg-violet-50/60 hover:bg-violet-100/60",
          "dark:border-violet-700/30 dark:bg-violet-950/20 dark:hover:bg-violet-950/30",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        )}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-violet-700 dark:text-violet-300">Ask AI to explain</p>
          <p className="text-[11px] text-violet-500/80 dark:text-violet-400/70">Deeper explanation powered by Gemini</p>
        </div>
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-400" />
      </button>
    );
  }

  if (state.status === "loading") {
    return (
      <div className={cn("flex items-center gap-3 rounded-2xl border px-3 py-3", "border-violet-200/70 bg-violet-50/60", "dark:border-violet-700/30 dark:bg-violet-950/20")}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-600">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
        <div>
          <p className="text-xs font-extrabold text-violet-700 dark:text-violet-300">Thinking…</p>
          <p className="text-[11px] text-violet-500/80">Gemini is generating your explanation</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={cn("rounded-2xl border px-3 py-2.5", "border-rose-200/60 bg-rose-50/60 dark:border-rose-800/40 dark:bg-rose-950/20")}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-rose-700 dark:text-rose-400">Couldn&apos;t generate explanation</p>
            <p className="mt-0.5 text-[11px] text-rose-600/80">{state.message}</p>
          </div>
          <button
            type="button"
            onClick={fetchExplanation}
            className="shrink-0 grid h-7 w-7 place-items-center rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
            aria-label="Retry"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // done
  return (
    <div className={cn("rounded-2xl border px-3 py-3 space-y-2", "border-violet-200/70 bg-violet-50/50", "dark:border-violet-700/30 dark:bg-violet-950/20")}>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <p className="text-xs font-extrabold text-violet-700 dark:text-violet-300">AI Explanation</p>
        <span className="ml-auto text-[10px] font-semibold text-violet-400/80">Gemini · {state.cached ? "cached" : "generated"}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{state.text}</p>
      <p className="text-[10px] text-muted-foreground">AI can make mistakes. Cross-check with your textbook or lecturer.</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PracticeTakeClient() {
  const router = useRouter();
  const params = useParams<{ setId: string }>();
  const sp = useSearchParams();

  const setId = String(params?.setId ?? "");
  const attemptFromUrl = String(sp.get("attempt") ?? "").trim();
  const modeParam = sp.get("mode") ?? "exam";
  const isStudyMode = modeParam === "study";
  const isDueParam = sp.get("due") === "1";

  // Fetch the due question IDs for this set when ?due=1 is present.
  // Falls back to null (= full set) if the fetch fails or the table doesn't exist yet.
  const [dueQuestionIds, setDueQuestionIds] = useState<string[] | null>(null);
  const [dueFetching, setDueFetching] = useState(isDueParam);

  useEffect(() => {
    if (!isDueParam || !setId) { setDueFetching(false); return; }
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/study/practice/due");
        if (!mounted) return;
        if (res.ok) {
          const json = await res.json();
          const match = (json.sets ?? []).find((s: any) => s.set_id === setId);
          setDueQuestionIds(match?.question_ids ?? null);
        }
      } catch { /* non-fatal — fall back to full set */ } finally {
        if (mounted) setDueFetching(false);
      }
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId, isDueParam]);

  // Don't mount the engine until we know the due IDs (avoids a double-load flash).
  const engineReady = !isDueParam || !dueFetching;

  const engine = usePracticeEngine({
    setId,
    attemptFromUrl,
    studyMode: isStudyMode,
    dueQuestionIds: isDueParam ? dueQuestionIds : null,
  });

  const {
    meta,
    questions,
    loading,
    err,
    idx,
    setIdx,
    current,
    opts,
    answers,
    submitted,
    setSubmitted,
    attemptId,
    timeLeftMs,
    stats,
    finalizing,
    weakSummary,
    choose,
    softReset,
    retryWeakQuestions,
    finalizeAttempt,
    isRetryMode,
    isDueMode,
    studyMode,
  } = engine;

  // Instant feedback: reveal correctness after first tap (per question)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  // Milestone toast — fires once when finalization completes
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const milestoneShownRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!submitted || finalizing || milestoneShownRef.current) return;
    milestoneShownRef.current = true;
    const m = getMilestone(stats.correct, stats.total);
    setMilestone(m);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => setMilestone(null), 5000);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [submitted, finalizing, stats.correct, stats.total]);

  // Streak feedback — fetched once when results appear
  const [streakCount, setStreakCount] = useState<number | null>(null);
  const streakFetchedRef = useRef(false);
  useEffect(() => {
    if (!submitted || finalizing || streakFetchedRef.current) return;
    streakFetchedRef.current = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from("study_daily_activity")
          .select("streak_count, did_practice")
          .eq("user_id", user.id)
          .eq("activity_date", today)
          .maybeSingle();
        if (data?.did_practice && typeof data?.streak_count === "number") {
          setStreakCount(data.streak_count);
        }
      } catch {
        // silent
      }
    })();
  }, [submitted, finalizing]);

  // M-3: Mark as understood
  const [understood, setUnderstood] = useState<Record<string, boolean>>({});

  async function handleMarkUnderstood(questionId: string) {
    setUnderstood(prev => ({ ...prev, [questionId]: true }));
    try {
      if (attemptId) {
        await supabase
          .from('study_attempt_answers')
          .update({ understood: true })
          .eq('attempt_id', attemptId)
          .eq('question_id', questionId);
      }
    } catch { /* non-critical */ }
  }

  const total = stats.total;
  const isLast = questions.length > 0 && idx >= questions.length - 1;

  const chosenId = current ? answers[current.id] : null;

  const currentOptions = (opts as AnyOption[]) ?? [];
  const correctOptionId = useMemo(() => {
    const c = currentOptions.find((o) => getIsCorrect(o));
    return c?.id ?? null;
  }, [currentOptions]);

  const isRevealed = current ? !!revealed[current.id] : false;

  const answeredPct = useMemo(() => {
    const t = Math.max(0, total || 0);
    const a = Math.max(0, stats.answered || 0);
    return t ? Math.round((a / t) * 100) : 0;
  }, [stats.answered, total]);

  // Auto-submit when time hits 0
  const prevLeft = useRef<number | null>(null);
  useEffect(() => {
    if (submitted) return;
    if (typeof timeLeftMs !== "number") return;
    const was = prevLeft.current;
    prevLeft.current = timeLeftMs;
    if (was !== null && was > 0 && timeLeftMs <= 0) setSubmitted(true);
  }, [timeLeftMs, submitted, setSubmitted]);

  // Finalize attempt when submitted
  useEffect(() => {
    if (!submitted) return;
    void finalizeAttempt(typeof timeLeftMs === "number" && timeLeftMs <= 0 ? "timeup" : "manual");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  // Guard against accidental back-navigation mid-quiz
  useEffect(() => {
    if (submitted || loading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Your progress is saved — are you sure you want to leave?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [submitted, loading]);

  function submitNow() {
    if (submitted) return;
    setSubmitted(true);
  }

  function handleSubmitClick() {
    if (submitted) return;
    const unanswered = stats.total - stats.answered;
    if (unanswered > 0) {
      const confirmed = window.confirm(
        `${unanswered} question${unanswered !== 1 ? "s" : ""} unanswered — submit anyway?`
      );
      if (!confirmed) return;
    }
    setSubmitted(true);
  }

  function resetAll() {
    setRevealed({});
    softReset();
  }

  function goNext() {
    setIdx((v) => Math.min(questions.length - 1, v + 1));
  }

  function goPrev() {
    setIdx((v) => Math.max(0, v - 1));
  }

  function onPick(optionId: string) {
    if (!current) return;
    if (submitted) return;

    // lock a question after reveal (no changing answers)
    if (revealed[current.id]) return;

    choose(current.id, optionId);
    setRevealed((m) => ({ ...m, [current.id]: true }));
  }

  if (dueFetching || (isDueParam && !engineReady)) {
    return (
      <div className="space-y-4 pb-28 md:pb-6">
        <div className="sticky top-0 z-20 -mx-4 bg-background/85 px-4 py-2 backdrop-blur border-b border-border">
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-2/5 animate-[progress_1.2s_ease-in-out_infinite] rounded-full bg-violet-500/70" />
          </div>
        </div>
        <div className="mt-4 rounded-3xl border border-violet-200/60 bg-violet-50/50 dark:border-violet-800/40 dark:bg-violet-950/20 p-4">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
            <div>
              <p className="text-sm font-extrabold text-foreground">Loading Due Today</p>
              <p className="text-xs text-muted-foreground mt-0.5">Finding your queued questions…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
  // Route-level skeleton (loading.tsx) will usually render first.
  // This is a minimal fallback for client-side transitions.
  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <div className="sticky top-0 z-20 -mx-4 bg-background/85 px-4 py-2 backdrop-blur border-b border-border">
        <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-1/3 animate-[progress_1.2s_ease-in-out_infinite] rounded-full bg-foreground/70" />
        </div>
      </div>
    </div>
  );
}
if (err || !meta) {
    return (
      <div className="pb-32">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mt-4">
          <EmptyState
            title="Couldn’t open practice set"
            description={err ?? "Missing data"}
            action={
              <Link
                href="/study/practice"
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Go to Practice <ChevronRight className="h-4 w-4" />
              </Link>
            }
            icon={<AlertTriangle className="h-5 w-5 text-muted-foreground" />}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28 md:pb-6">
      {/* Sticky mobile header */}
      <div className="sticky top-0 z-20 -mx-4 bg-background/85 px-4 pb-3 pt-2 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground",
              "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              submitted ? "opacity-60" : ""
            )}
            disabled={submitted}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="flex items-center gap-2">
            {studyMode ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/50 bg-violet-100/60 px-2.5 py-2 text-xs font-extrabold text-violet-800 dark:border-violet-700/50 dark:bg-violet-950/40 dark:text-violet-300">
                <GraduationCap className="h-4 w-4" />
                Study
              </span>
            ) : typeof timeLeftMs === "number" ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-2 text-xs font-extrabold",
                  timeLeftMs <= 30_000
                    ? "border-rose-300/40 bg-rose-100/40 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                    : timeLeftMs <= 120_000
                    ? "border-amber-300/40 bg-amber-100/40 text-foreground dark:bg-amber-950/30"
                    : "border-border bg-background text-foreground"
                )}
              >
                <Timer className="h-4 w-4" />
                <span className="tabular-nums">{msToClock(timeLeftMs)}</span>
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-2 text-xs font-extrabold text-muted-foreground">
                Untimed
              </span>
            )}

            <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-2 text-xs font-extrabold text-foreground">
              <span className="tabular-nums">{idx + 1}</span>
              <span className="text-muted-foreground">/</span>
              <span className="tabular-nums">{total}</span>
            </span>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                {isDueMode && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-violet-300/50 bg-violet-100/60 px-2 py-0.5 text-[10px] font-extrabold text-violet-800 dark:border-violet-700/50 dark:bg-violet-950/40 dark:text-violet-300">
                    Due
                  </span>
                )}
                <p className="truncate text-sm font-extrabold text-foreground">{normalize(meta.title)}</p>
              </div>
              <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">
                Answered <span className="tabular-nums">{stats.answered}</span>{" "}
                <span className="text-muted-foreground">•</span>{" "}
                Correct <span className="tabular-nums">{stats.correct}</span>
              </p>
            </div>

          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <div className="h-full rounded-full bg-foreground/80" style={{ width: `${answeredPct}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span className="tabular-nums">{answeredPct}% done</span>
            <span className="tabular-nums">
              {stats.total - stats.answered} left
            </span>
          </div>
        </div>
      </div>

      {/* No questions */}
      {questions.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No questions in this set yet"
            description="Add questions and options, then come back."
            action={
              <Link
                href="/study/practice"
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50"
              >
                Back to sets <ChevronRight className="h-4 w-4" />
              </Link>
            }
            icon={<AlertTriangle className="h-5 w-5 text-muted-foreground" />}
          />
        </div>
      ) : submitted ? (
        /* Results */
        <div className="mt-4 space-y-3">
          <Card className="rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-foreground">
                  {isDueMode ? "Due Today — Done" : isRetryMode ? "Retry Results" : "Results"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Score:{" "}
                  <span className="font-extrabold text-foreground">{stats.correct}</span> /{" "}
                  <span className="font-extrabold text-foreground">{stats.total}</span>
                  {finalizing ? (
                    <span className="ml-2 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                    </span>
                  ) : null}
                </p>
                {isDueMode && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Spaced repetition queue for this set.
                  </p>
                )}
                {!isDueMode && isRetryMode && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Practising weak questions only.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RefreshCcw className="h-4 w-4" /> Restart
              </button>
            </div>
          </Card>

          <Card className="rounded-3xl">
            <p className="text-xs font-extrabold text-muted-foreground">Set</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{normalize(meta.title)}</p>
            {meta.course_code || meta.level ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {[meta.course_code, meta.level].filter(Boolean).join(" • ")}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href="/study/practice"
                className="inline-flex items-center justify-center rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50"
              >
                Back to sets
              </Link>
              <button
                type="button"
                onClick={resetAll}
                className="inline-flex items-center justify-center rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground hover:opacity-90"
              >
                Try again
              </button>
              {/* Retry Weak Questions — only shown when there are wrong/unanswered */}
              {stats.correct < stats.total && (
                <button
                  type="button"
                  onClick={() => {
                    setRevealed({});
                    retryWeakQuestions();
                  }}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-extrabold",
                    "bg-rose-500/10 text-rose-700 hover:bg-rose-500/20",
                    "dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                  )}
                >
                  <RotateCcw className="h-4 w-4" />
                  Retry Weak ({stats.total - stats.correct})
                </button>
              )}
            </div>
          </Card>

          {/* ── SRS summary card ──────────────────────────────────────────── */}
          {weakSummary && weakSummary.filter((r) => !r.wasCorrect).length > 0 ? (
            <Card className="rounded-3xl">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-extrabold text-foreground">Weak questions tracked</p>
                  <p className="text-[11px] text-muted-foreground">
                    {weakSummary.filter((r) => !r.wasCorrect).length} question{weakSummary.filter((r) => !r.wasCorrect).length !== 1 ? "s" : ""} added to your spaced repetition queue
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {weakSummary
                  .filter((r) => !r.wasCorrect)
                  .slice(0, 5)
                  .map((r) => (
                    <div
                      key={r.questionId}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2"
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          r.missCount >= 4
                            ? "bg-rose-500"
                            : r.missCount >= 2
                            ? "bg-amber-500"
                            : "bg-muted-foreground/50"
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                        {r.prompt}
                      </span>
                      <span className="shrink-0 text-[11px] font-extrabold text-muted-foreground">
                        ×{r.missCount}
                      </span>
                      {r.nextDueAt ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          due {formatDue(r.nextDueAt)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleMarkUnderstood(r.questionId)}
                        className={cn(
                          'shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition',
                          understood[r.questionId]
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30'
                            : 'border-border/60 bg-background text-muted-foreground hover:bg-secondary/50'
                        )}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {understood[r.questionId] ? 'Understood' : 'Got it'}
                      </button>
                    </div>
                  ))}
                {weakSummary.filter((r) => !r.wasCorrect).length > 5 && (
                  <p className="pl-2 text-[11px] text-muted-foreground">
                    +{weakSummary.filter((r) => !r.wasCorrect).length - 5} more tracked
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="/study/practice?view=due"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-extrabold",
                    "bg-violet-600 text-white hover:bg-violet-700",
                    "dark:bg-violet-700 dark:hover:bg-violet-600",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  )}
                >
                  <CalendarClock className="h-4 w-4" />
                  View Due Today
                </a>
              </div>
            </Card>
          ) : weakSummary && weakSummary.every((r) => r.wasCorrect) && weakSummary.length > 0 ? (
            <Card className="rounded-3xl">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">No new weak questions</p>
                  <p className="text-[11px] text-muted-foreground">Great session — all tracked questions answered correctly.</p>
                </div>
              </div>
            </Card>
          ) : null}

          {/* Streak feedback */}
          {streakCount !== null && (
            <div className={cn(
              "rounded-3xl border p-4",
              streakCount >= 7
                ? "border-amber-300/50 bg-amber-50 dark:bg-amber-950/20"
                : "border-border bg-background"
            )}>
              <p className="text-sm font-extrabold text-foreground">
                {streakCount === 1
                  ? "You started a streak today — come back tomorrow!"
                  : streakCount >= 7
                  ? `${streakCount}-day streak — you're on a roll!`
                  : `${streakCount}-day streak — keep it going!`}
              </p>
            </div>
          )}

          {/* What next? */}
          <div className="rounded-3xl border border-border bg-background p-4">
            <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground mb-3">What next?</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {weakSummary && weakSummary.some((r) => !r.wasCorrect) && (
                <Link
                  href={`/study/practice/${setId}?due=1`}
                  className="flex flex-col gap-1.5 rounded-2xl border border-border bg-background p-3 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <RotateCcw className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Retry weak questions</p>
                </Link>
              )}
              {meta?.course_code && (
                <Link
                  href={`/study/materials?course=${encodeURIComponent(meta.course_code)}`}
                  className="flex flex-col gap-1.5 rounded-2xl border border-border bg-background p-3 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Browse materials for {meta.course_code}</p>
                </Link>
              )}
              <Link
                href="/study/practice"
                className="flex flex-col gap-1.5 rounded-2xl border border-border bg-background p-3 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Try another set</p>
              </Link>
            </div>
          </div>

          {/* Tutor prompt for low scores */}
          {submitted && stats.total > 0 && (stats.correct / stats.total) < 0.5 && (
            <Link
              href={`/study/tutors${meta?.course_code ? `?course=${encodeURIComponent(meta.course_code)}` : ''}`}
              className="flex items-center justify-between gap-3 rounded-2xl border bg-background px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 no-underline"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Need help?</p>
                <p className="text-xs text-muted-foreground">
                  Browse tutors for {meta?.course_code ?? 'this course'}.
                </p>
              </div>
              <GraduationCap className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>
          )}

          {/* GPA calculator prompt */}
          {stats.correct > 0 && (
            <div className="text-sm text-muted-foreground text-center mt-4">
              Want to track how this affects your GPA?{" "}
              <Link
                href="/study/gpa"
                className="underline underline-offset-2 font-semibold text-foreground hover:opacity-80"
              >
                Open GPA calculator →
              </Link>
            </div>
          )}
        </div>
      ) : (
        /* Question */
        <div className="mt-4 space-y-3">
          <Card className="rounded-3xl">
            <p className="text-xs font-extrabold text-muted-foreground">
              Question <span className="tabular-nums">{idx + 1}</span> of{" "}
              <span className="tabular-nums">{total}</span>
            </p>

            <p className="mt-2 whitespace-pre-wrap text-base font-extrabold leading-snug text-foreground">
              {normalize(String(current?.prompt ?? ""))}
            </p>

            {/* hint row */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-muted-foreground">
                {studyMode
                  ? "Study mode — explanation shown after each answer."
                  : "Tap an option to see if it’s right."}
              </p>

              {isRevealed ? (
                chosenId === correctOptionId ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[12px] font-extrabold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Correct
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[12px] font-extrabold text-foreground">
                    <XCircle className="h-4 w-4 text-rose-600" /> Wrong
                  </span>
                )
              ) : null}
            </div>

            {/* Options */}
            <div className="mt-4 grid gap-2">
              {currentOptions.map((o, i) => {
                const checked = chosenId === o.id;
                const isCorrect = getIsCorrect(o);

                const show = isRevealed;

                const isGreen = show && isCorrect;
                const isRed = show && checked && !isCorrect;

                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onPick(o.id)}
                    className={cn(
                      "w-full text-left rounded-2xl border p-3 transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                      show && "cursor-default",
                      isGreen && "border-emerald-500/35 bg-emerald-500/10",
                      isRed && "border-rose-500/35 bg-rose-500/10",
                      !show && checked && "border-foreground bg-secondary",
                      !show && !checked && "border-border bg-background hover:bg-secondary/50"
                    )}
                    aria-pressed={checked}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-extrabold",
                          isGreen && "border-emerald-500 bg-emerald-500 text-white",
                          isRed && "border-rose-500 bg-rose-500 text-white",
                          !show && checked
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground"
                        )}
                        aria-hidden="true"
                      >
                        {String.fromCharCode(65 + i)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">
                          {normalize(o.text ?? "")}
                        </span>

                        {show ? (
                          isCorrect ? (
                            <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-4 w-4" /> Correct answer
                            </span>
                          ) : checked ? (
                            <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-rose-700 dark:text-rose-300">
                              <XCircle className="h-4 w-4" /> Your choice
                            </span>
                          ) : null
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Navigation + submit */}
            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={idx === 0}
                className={cn(
                  "inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm font-extrabold",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  idx === 0
                    ? "border-border/50 bg-background text-muted-foreground opacity-60"
                    : "border-border bg-background text-foreground hover:bg-secondary/50"
                )}
              >
                Prev
              </button>

              <div className="flex items-center gap-2">
                {!isLast ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex items-center justify-center rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmitClick}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-extrabold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                      studyMode
                        ? "bg-violet-600 text-white dark:bg-violet-700"
                        : "bg-secondary text-foreground"
                    )}
                  >
                    {studyMode ? (
                      <><GraduationCap className="h-4 w-4" /> Finish session</>
                    ) : (
                      <><Send className="h-4 w-4" /> Submit</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </Card>

          {/* ── Explanation Panel — appears after student answers ────────── */}
          {isRevealed && current ? (
            <div className="space-y-2">
              {(current.explanation || (current as any).ai_explanation) ? (
                <div className="rounded-2xl border border-violet-200/70 bg-violet-50/50 px-3 py-3 dark:border-violet-700/30 dark:bg-violet-950/20">
                  <p className="text-xs font-extrabold text-violet-700 dark:text-violet-300 mb-1">Explanation</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {current.explanation ?? (current as any).ai_explanation}
                  </p>
                </div>
              ) : (
                <AiExplainInline
                  questionId={current.id}
                  questionPrompt={String(current.prompt ?? "")}
                  chosenOptionText={
                    currentOptions.find((o) => o.id === chosenId)?.text ?? null
                  }
                  correctOptionText={
                    currentOptions.find((o) => getIsCorrect(o))?.text ?? null
                  }
                  isCorrect={chosenId === correctOptionId}
                />
              )}
            </div>
          ) : null}

          {/* Bottom quick actions (simple, mobile-friendly) */}
          <Card className="rounded-3xl">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-muted-foreground">Quick actions</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {studyMode
                    ? "Finish when you’re done. Your progress is saved."
                    : "Submit anytime. After you pick an option, it locks and shows the correct one."}
                </p>
              </div>

              <button
                type="button"
                onClick={handleSubmitClick}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  studyMode
                    ? "border-violet-300/50 bg-violet-100/60 text-violet-800 hover:bg-violet-100 dark:border-violet-700/50 dark:bg-violet-950/30 dark:text-violet-300"
                    : "border-border bg-background text-foreground hover:bg-secondary/50"
                )}
              >
                {studyMode ? (
                  <><GraduationCap className="h-4 w-4" /> Finish</>
                ) : (
                  <><Send className="h-4 w-4" /> Submit</>
                )}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Milestone toast ── */}
      {milestone && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
        >
          <div
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-3xl border px-4 py-3 shadow-lg",
              "animate-in slide-in-from-bottom-4 fade-in duration-300",
              MILESTONE_STYLES[milestone.level]
            )}
          >
            <span className="mt-0.5 text-xl leading-none" aria-hidden="true">
              {milestone.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold">{milestone.heading}</p>
              <p className="mt-0.5 text-xs font-semibold opacity-80">{milestone.sub}</p>
            </div>
            <button
              type="button"
              onClick={() => setMilestone(null)}
              aria-label="Dismiss"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-xl opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}