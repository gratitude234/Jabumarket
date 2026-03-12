"use client";
// app/study/questions/[id]/QuestionDetailClient.tsx
import { cn } from "@/lib/utils";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Flag,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsUp,
} from "lucide-react";

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
  onAnswerAdded,
}: {
  questionId: string;
  title: string;
  questionBody: string | null;
  courseCode: string | null;
  level: string | null;
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
          className="shrink-0 grid h-7 w-7 place-items-center rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
          aria-label="Retry"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // idle
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
        <p className="text-[11px] text-violet-500/80 dark:text-violet-400/70">No human answers yet — ask Gemini for a starting point</p>
      </div>
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-400" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function formatDateTime(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

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
};

export default function QuestionDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [meId, setMeId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionRow | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);

  const [myVoteLoading, setMyVoteLoading] = useState(false);
  const [myUpvoted, setMyUpvoted] = useState(false);

  const [answerBody, setAnswerBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const canAnswer = useMemo(() => {
    if (!meId) return false;
    return answerBody.trim().length >= 10;
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
        .select(
          "id,title,body,course_code,level,created_at,answers_count,upvotes_count,solved,author_email,author_id"
        )
        .eq("id", id)
        .single();
      if (q.error) throw q.error;
      setQuestion(q.data as any);

      const a = await supabase
        .from("study_answers")
        .select("id,question_id,body,created_at,author_email,author_id,is_accepted")
        .eq("question_id", id)
        .order("is_accepted", { ascending: false })
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
    if (!meId) {
      setPostError("Please sign in to upvote.");
      return;
    }
    if (!question) return;
    if (myVoteLoading) return;

    // Optimistic update so the button feels instant
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
      // Reconcile with server truth
      setQuestion((q) => q ? { ...q, upvotes_count: json.count } : q);
      setMyUpvoted(json.upvoted);
    } catch (e: any) {
      // Roll back optimistic update on failure
      setQuestion({ ...question, upvotes_count: question.upvotes_count });
      setMyUpvoted(myUpvoted);
      setPostError(e?.message ?? "Failed to update vote.");
    } finally {
      setMyVoteLoading(false);
    }
  }

  async function postAnswer() {
    setPostError(null);
    if (!meId) {
      setPostError("Please sign in to answer.");
      return;
    }
    const b = answerBody.trim();
    if (b.length < 10) return;
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
      setQuestion((q) => q ? { ...q, answers_count: (q.answers_count ?? 0) + 1 } : q);
    } catch (e: any) {
      setPostError(e?.message ?? "Failed to post answer.");
    } finally {
      setPosting(false);
    }
  }

  async function acceptAnswer(answerId: string) {
    setPostError(null);
    if (!question) return;
    if (!meId || question.author_id !== meId) {
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

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/study/questions"
            className="grid h-10 w-10 place-items-center rounded-2xl border bg-white hover:bg-zinc-50"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-lg font-semibold text-zinc-900">Question</p>
            <p className="text-sm text-zinc-600">Study Q&amp;A</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border bg-white p-4 text-sm text-zinc-600">Loading…</div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : question ? (
        <>
          <div className="rounded-3xl border bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              {question.solved ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Solved</span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">Open</span>
              )}
              {question.course_code ? (
                <Link
                  href={`/study/courses/${encodeURIComponent(question.course_code)}`}
                  className="rounded-full border bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  {question.course_code}
                </Link>
              ) : null}
              {question.level ? (
                <span className="rounded-full border bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800">{question.level}L</span>
              ) : null}
            </div>

            <p className="mt-2 text-xl font-semibold text-zinc-900">{question.title}</p>
            {question.body ? <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{question.body}</p> : null}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600">
              <span>
                {question.author_email ? `Posted by ${question.author_email}` : "Posted"} • {formatDateTime(question.created_at)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleUpvote}
                  disabled={myVoteLoading}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold",
                    myUpvoted
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
                    myVoteLoading && "opacity-70"
                  )}
                >
                  {myVoteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                  {question.upvotes_count ?? 0}
                </button>
                <Link
                  href={`/study/report?question=${encodeURIComponent(question.id)}`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  <Flag className="h-3.5 w-3.5" /> Report
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-zinc-900">Answers</p>
              <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                <MessageSquare className="h-3.5 w-3.5" /> {question.answers_count ?? answers.length}
              </span>
            </div>

            <div className="mt-3 space-y-3">
              {answers.length === 0 ? (
                <>
                  <p className="text-sm text-zinc-600">No answers yet. Be the first to help.</p>
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
                </>
              ) : (
                answers.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "rounded-2xl border p-3",
                      a.is_accepted ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap text-sm text-zinc-800">{a.body}</p>
                        <p className="mt-2 text-xs text-zinc-600">
                          {a.author_email === "ai@jabumarket.app" ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/60 bg-violet-50 px-2 py-0.5 text-[10px] font-extrabold text-violet-700 dark:border-violet-700/30 dark:bg-violet-950/30 dark:text-violet-300">
                              <Sparkles className="h-3 w-3" /> AI · Gemini
                            </span>
                          ) : (
                            <span>{a.author_email ? `By ${a.author_email}` : "Answer"} • {formatDateTime(a.created_at)}</span>
                          )}
                        </p>
                      </div>
                      {a.is_accepted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Accepted
                        </span>
                      ) : question.author_id === meId ? (
                        <button
                          type="button"
                          onClick={() => acceptAnswer(a.id)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Accept
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-3xl border bg-white p-4">
            <p className="text-base font-semibold text-zinc-900">Your answer</p>
            {!meId ? (
              <p className="mt-1 text-sm text-zinc-600">
                Please <Link className="font-semibold text-zinc-900 underline" href="/login">sign in</Link> to post an answer.
              </p>
            ) : null}

            <textarea
              value={answerBody}
              onChange={(e) => setAnswerBody(e.target.value)}
              placeholder="Write your answer…"
              className="mt-3 min-h-[120px] w-full resize-none rounded-2xl border bg-white p-3 text-sm text-zinc-900 outline-none"
            />
            {postError ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{postError}</div>
            ) : null}
            <button
              type="button"
              onClick={postAnswer}
              disabled={!canAnswer || posting}
              className={cn(
                "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-3xl px-4 py-3 text-sm font-semibold",
                !canAnswer || posting ? "cursor-not-allowed bg-zinc-200 text-zinc-500" : "bg-zinc-900 text-white hover:bg-zinc-800"
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