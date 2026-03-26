"use client";
// app/study/questions/[id]/QuestionDetailClient.tsx
import { cn } from "@/lib/utils";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Flag,
  GraduationCap,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsUp,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskEmail(email: string | null | undefined): string {
  if (!email) return "Anonymous";
  if (email === "ai@jabumarket.app") return "AI · Gemini";
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._]/g, " ");
}

function formatWhen(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestionRow = {
  id: string;
  title: string;
  body: string | null;
  course_code: string | null;
  level: string | null;
  created_at: string | null;
  answers_count: number | null;
  upvotes_count: number | null;
  solved: boolean | null;
  author_email: string | null;
  author_id: string | null;
};

type AnswerRow = {
  id: string;
  question_id: string;
  body: string;
  created_at: string | null;
  author_email: string | null;
  author_id: string | null;
  is_accepted: boolean | null;
  upvotes_count?: number | null;
  is_ai?: boolean | null;
};

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}

function QuestionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-background p-5">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-6 w-3/4" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-1 h-4 w-5/6" />
        <div className="mt-5 flex gap-3">
          <Skeleton className="h-8 w-20 rounded-2xl" />
          <Skeleton className="h-8 w-20 rounded-2xl" />
        </div>
      </div>
      <div className="rounded-3xl border border-border bg-background p-5">
        <Skeleton className="h-5 w-24" />
        <div className="mt-4 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border p-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
              <Skeleton className="mt-3 h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── AI Answer Button ──────────────────────────────────────────────────────────

type AiAnswerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done" }
  | { status: "error"; message: string };

function AiAnswerButton({
  questionId,
  title,
  questionBody,
  courseCode,
  level,
  compact,
  onAnswerAdded,
}: {
  questionId: string;
  title: string;
  questionBody: string | null;
  courseCode: string | null;
  level: string | null;
  compact?: boolean;
  onAnswerAdded: (answer: AnswerRow) => void;
}) {
  const [state, setState] = useState<AiAnswerState>({ status: "idle" });

  async function askAi() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/ai/qa-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, title, questionBody, courseCode, level }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setState({ status: "error", message: json.error ?? "Something went wrong." });
      } else {
        const a = json.answer;
        setState({ status: "done" });
        onAnswerAdded({
          id: a.id ?? `ai-${Date.now()}`,
          question_id: questionId,
          body: a.body,
          created_at: a.created_at ?? new Date().toISOString(),
          author_email: "ai@jabumarket.app",
          author_id: null,
          is_accepted: false,
          is_ai: true,
        });
      }
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  if (state.status === "done") return null;

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-violet-200/70 bg-violet-50/60 px-3 py-3 dark:border-violet-700/30 dark:bg-violet-950/20">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-600">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
        <div>
          <p className="text-xs font-extrabold text-violet-700 dark:text-violet-300">Generating AI answer…</p>
          <p className="text-[11px] text-violet-500/80">Powered by Gemini</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-rose-200/60 bg-rose-50/60 px-3 py-2.5 dark:border-rose-800/40 dark:bg-rose-950/20">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-rose-700 dark:text-rose-400">Couldn&apos;t get AI answer</p>
          <p className="text-[11px] text-rose-600/80">{state.message}</p>
        </div>
        <button
          type="button"
          onClick={askAi}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-xl border border-rose-200/60 bg-background text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          aria-label="Retry"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // compact = when human answers already exist
  if (compact) {
    return (
      <button
        type="button"
        onClick={askAi}
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-all",
          "border-violet-200/70 bg-violet-50/40 hover:bg-violet-100/60",
          "dark:border-violet-700/30 dark:bg-violet-950/10 dark:hover:bg-violet-950/20",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        )}
      >
        <BrainCircuit className="h-4 w-4 shrink-0 text-violet-500 dark:text-violet-400" />
        <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Also get an AI take</p>
        <Sparkles className="ml-auto h-3.5 w-3.5 shrink-0 text-violet-400" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={askAi}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all",
        "border-violet-200/70 bg-violet-50/60 hover:bg-violet-100/60",
        "dark:border-violet-700/30 dark:bg-violet-950/20 dark:hover:bg-violet-950/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      )}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
        <BrainCircuit className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold text-violet-700 dark:text-violet-300">Get an AI answer</p>
        <p className="text-[11px] text-violet-500/80 dark:text-violet-400/70">
          No human answers yet — ask Gemini for a starting point
        </p>
      </div>
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-400" />
    </button>
  );
}

// ── Answer upvote button ──────────────────────────────────────────────────────

function AnswerUpvoteButton({
  answerId,
  initialCount,
  meId,
  onError,
}: {
  answerId: string;
  initialCount: number;
  meId: string | null;
  onError: (msg: string) => void;
}) {
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!meId) { onError("Please sign in to upvote."); return; }
    if (loading) return;
    const wasVoted = voted;
    setCount((c) => (wasVoted ? Math.max(0, c - 1) : c + 1));
    setVoted(!wasVoted);
    setLoading(true);
    try {
      const res = await fetch(`/api/study/answers/${answerId}/upvote`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed.");
      setCount(json.count);
      setVoted(json.upvoted);
    } catch (e: any) {
      setCount((c) => (wasVoted ? c + 1 : Math.max(0, c - 1)));
      setVoted(wasVoted);
      onError(e?.message ?? "Failed to update vote.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      title={voted ? "Remove upvote" : "Upvote this answer"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors",
        voted
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:bg-secondary/60",
        loading && "opacity-60 cursor-not-allowed"
      )}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QuestionDetailClient({ id }: { id: string }) {
  const [meId, setMeId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionRow | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);

  const [myVoteLoading, setMyVoteLoading] = useState(false);
  const [myUpvoted, setMyUpvoted] = useState(false);

  const ANSWER_MAX = 2000;
  const [answerBody, setAnswerBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const isMyQuestion = meId != null && question?.author_id === meId;
  const humanAnswerCount = answers.filter((a) => !a.is_ai && a.author_email !== "ai@jabumarket.app").length;
  const hasAiAnswer = answers.some((a) => a.is_ai || a.author_email === "ai@jabumarket.app");

  const canAnswer = useMemo(() => {
    if (!meId) return false;
    const len = answerBody.trim().length;
    return len >= 10 && len <= ANSWER_MAX;
  }, [meId, answerBody]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data?.user?.id ?? null);
    })();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const q = await supabase
        .from("study_questions")
        .select("id,title,body,course_code,level,created_at,answers_count,upvotes_count,solved,author_email,author_id")
        .eq("id", id)
        .single();
      if (q.error) throw q.error;
      setQuestion(q.data as any);

      const a = await supabase
        .from("study_answers")
        .select("id,question_id,body,created_at,author_email,author_id,is_accepted,upvotes_count,is_ai")
        .eq("question_id", id)
        .order("is_accepted", { ascending: false })
        .order("upvotes_count", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (a.error) throw a.error;
      setAnswers((a.data as any) ?? []);

      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (uid) {
        const v = await supabase
          .from("study_question_votes")
          .select("id")
          .eq("question_id", id)
          .eq("voter_id", uid)
          .maybeSingle();
        setMyUpvoted(!!v.data);
      } else {
        setMyUpvoted(false);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load question.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, meId]);

  async function toggleUpvote() {
    setPostError(null);
    if (!meId) { setPostError("Please sign in to upvote."); return; }
    if (!question || myVoteLoading) return;

    const optimisticCount = myUpvoted
      ? Math.max(0, (question.upvotes_count ?? 0) - 1)
      : (question.upvotes_count ?? 0) + 1;
    setQuestion({ ...question, upvotes_count: optimisticCount });
    setMyUpvoted(!myUpvoted);
    setMyVoteLoading(true);

    try {
      const res = await fetch(`/api/study/questions/${id}/upvote`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to update vote.");
      setQuestion((q) => (q ? { ...q, upvotes_count: json.count } : q));
      setMyUpvoted(json.upvoted);
    } catch (e: any) {
      setQuestion({ ...question, upvotes_count: question.upvotes_count });
      setMyUpvoted(myUpvoted);
      setPostError(e?.message ?? "Failed to update vote.");
    } finally {
      setMyVoteLoading(false);
    }
  }

  async function postAnswer() {
    setPostError(null);
    if (!meId) { setPostError("Please sign in to answer."); return; }
    const b = answerBody.trim();
    if (b.length < 10 || b.length > ANSWER_MAX) return;
    setPosting(true);
    try {
      const res = await fetch("/api/study/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: id, body: b }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to post answer.");
      setAnswers((prev) => [...prev, json.answer as any]);
      setAnswerBody("");
      setQuestion((q) => (q ? { ...q, answers_count: (q.answers_count ?? 0) + 1 } : q));
    } catch (e: any) {
      setPostError(e?.message ?? "Failed to post answer.");
    } finally {
      setPosting(false);
    }
  }

  async function acceptAnswer(answerId: string) {
    setPostError(null);
    if (!question || !isMyQuestion) {
      setPostError("Only the question owner can mark an answer as accepted.");
      return;
    }
    try {
      const res = await fetch(`/api/study/answers/${answerId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to accept answer.");
      setQuestion({ ...question, solved: true });
      setAnswers((prev) =>
        prev
          .map((a) => ({ ...a, is_accepted: a.id === answerId }))
          .sort((a, b) => Number(!!b.is_accepted) - Number(!!a.is_accepted))
      );
    } catch (e: any) {
      setPostError(e?.message ?? "Failed to accept answer.");
    }
  }

  const remainingChars = ANSWER_MAX - answerBody.length;

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Link
          href="/study/questions"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground no-underline",
            "hover:bg-secondary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Questions
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Question</p>
          <p className="text-xs text-muted-foreground">Study Q&amp;A</p>
        </div>
      </div>

      {loading ? (
        <QuestionSkeleton />
      ) : error ? (
        <div className="rounded-3xl border border-border bg-background p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-foreground">Couldn&apos;t load question</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <button
                type="button"
                onClick={load}
                className={cn(
                  "mt-3 inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground",
                  "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <RotateCcw className="h-4 w-4" /> Try again
              </button>
            </div>
          </div>
        </div>
      ) : question ? (
        <>
          {/* ── Question card ── */}
          <div className="rounded-3xl border border-border bg-background p-5">
            <div className="flex flex-wrap items-center gap-2">
              {question.solved ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Solved
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Open</span>
              )}
              {question.course_code ? (
                <Link
                  href={`/study/courses/${encodeURIComponent(question.course_code)}`}
                  className={cn(
                    "rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground no-underline",
                    "hover:bg-secondary/50"
                  )}
                >
                  {question.course_code}
                </Link>
              ) : null}
              {question.level ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground">
                  {question.level}L
                </span>
              ) : null}
              {isMyQuestion ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  Your question
                </span>
              ) : null}
            </div>

            <h1 className="mt-3 text-xl font-semibold text-foreground">{question.title}</h1>
            {question.body ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{question.body}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                By{" "}
                <span className="font-semibold text-foreground capitalize">{maskEmail(question.author_email)}</span>
                {" · "}
                {formatWhen(question.created_at)}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleUpvote}
                  disabled={myVoteLoading}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition-colors",
                    myUpvoted
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:bg-secondary/60",
                    myVoteLoading && "opacity-70"
                  )}
                >
                  {myVoteLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ThumbsUp className="h-3.5 w-3.5" />
                  )}
                  {question.upvotes_count ?? 0}
                </button>

                <Link
                  href={`/study/report?question=${encodeURIComponent(question.id)}`}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground no-underline",
                    "hover:bg-secondary/50"
                  )}
                >
                  <Flag className="h-3.5 w-3.5" /> Report
                </Link>
              </div>
            </div>
          </div>

          {/* ── Answers card ── */}
          <div className="rounded-3xl border border-border bg-background p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-foreground">
                Answers
                {answers.length > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    {humanAnswerCount}
                    {hasAiAnswer ? " + AI" : ""}
                  </span>
                )}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {answers.length === 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">No answers yet. Be the first to help.</p>
                  {question && (
                    <AiAnswerButton
                      questionId={question.id}
                      title={question.title}
                      questionBody={question.body}
                      courseCode={question.course_code}
                      level={question.level}
                      onAnswerAdded={(a) => setAnswers([a])}
                    />
                  )}
                  {question?.created_at && (Date.now() - new Date(question.created_at).getTime()) > 86_400_000 && (
                    <Link
                      href={`/study/tutors${question.course_code ? `?course=${encodeURIComponent(question.course_code)}` : ''}`}
                      className="mt-3 inline-flex items-center gap-2 rounded-2xl border bg-background px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    >
                      <GraduationCap className="h-4 w-4" />
                      Find a tutor for {question.course_code ?? 'this course'} →
                    </Link>
                  )}
                </>
              ) : (
                <>
                  {answers.map((a) => {
                    const isAi = !!(a.is_ai || a.author_email === "ai@jabumarket.app");
                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "rounded-2xl border p-4",
                          a.is_accepted
                            ? "border-emerald-200/70 bg-emerald-500/5 dark:border-emerald-700/30 dark:bg-emerald-950/10"
                            : isAi
                            ? "border-border/60 bg-secondary/30"
                            : "border-border bg-background"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {isAi && (
                              <div className="mb-2 flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                  <Sparkles className="h-3 w-3" /> Generated by AI
                                </span>
                                <span className="text-[10px] text-muted-foreground">Verify before your exam</span>
                              </div>
                            )}
                            <p className="whitespace-pre-wrap text-sm text-foreground">{a.body}</p>

                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                              {isAi ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/60 bg-violet-50/80 px-2 py-0.5 text-[10px] font-extrabold text-violet-700 dark:border-violet-700/30 dark:bg-violet-950/30 dark:text-violet-300">
                                  <Sparkles className="h-3 w-3" /> AI · Gemini
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  <span className="font-semibold text-foreground capitalize">
                                    {maskEmail(a.author_email)}
                                  </span>
                                  {" · "}
                                  {formatWhen(a.created_at)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-2">
                            {a.is_accepted ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-background px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Accepted
                              </span>
                            ) : isMyQuestion ? (
                              <button
                                type="button"
                                onClick={() => acceptAnswer(a.id)}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-2xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground",
                                  "hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                )}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Accept
                              </button>
                            ) : null}

                            {!isAi && (
                              <AnswerUpvoteButton
                                answerId={a.id}
                                initialCount={a.upvotes_count ?? 0}
                                meId={meId}
                                onError={(msg) => setPostError(msg)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Compact AI button when human answers exist but no AI answer yet */}
                  {!hasAiAnswer && question && (
                    <AiAnswerButton
                      questionId={question.id}
                      title={question.title}
                      questionBody={question.body}
                      courseCode={question.course_code}
                      level={question.level}
                      compact
                      onAnswerAdded={(a) => setAnswers((prev) => [...prev, a])}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Post your answer ── */}
          <div className="rounded-3xl border border-border bg-background p-5">
            <p className="text-base font-semibold text-foreground">Your answer</p>

            {!meId ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Please{" "}
                <Link className="font-semibold text-foreground underline" href="/login">
                  sign in
                </Link>{" "}
                to post an answer.
              </p>
            ) : null}

            <textarea
              value={answerBody}
              onChange={(e) => setAnswerBody(e.target.value)}
              placeholder="Write your answer… (min 10 characters)"
              maxLength={ANSWER_MAX}
              className={cn(
                "mt-3 min-h-[130px] w-full resize-none rounded-2xl border border-border bg-background p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground",
                "focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              )}
            />

            {/* Character counter */}
            <div className="mt-1 flex justify-end">
              <span
                className={cn(
                  "text-xs font-semibold",
                  remainingChars < 100
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
                )}
              >
                {answerBody.length}/{ANSWER_MAX}
              </span>
            </div>

            {postError ? (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {postError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={postAnswer}
              disabled={!canAnswer || posting}
              className={cn(
                "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-3xl px-4 py-3 text-sm font-semibold transition-all",
                !canAnswer || posting
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-foreground text-background hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Post answer
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}