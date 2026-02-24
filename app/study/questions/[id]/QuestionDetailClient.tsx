// app/study/questions/[id]/QuestionDetailClient.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  ThumbsUp,
  CheckCircle2,
  Flag,
  Send,
} from "lucide-react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

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
  const [meEmail, setMeEmail] = useState<string | null>(null);

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
      setMeEmail(data?.user?.email ?? null);
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
    setMyVoteLoading(true);
    try {
      if (myUpvoted) {
        const del = await supabase
          .from("study_question_votes")
          .delete()
          .eq("question_id", id)
          .eq("voter_id", meId);
        if (del.error) throw del.error;
        const next = Math.max(0, (question.upvotes_count ?? 0) - 1);
        setQuestion({ ...question, upvotes_count: next });
        setMyUpvoted(false);
      } else {
        const ins = await supabase
          .from("study_question_votes")
          .insert({ question_id: id, voter_id: meId });
        if (ins.error) throw ins.error;
        const next = (question.upvotes_count ?? 0) + 1;
        setQuestion({ ...question, upvotes_count: next });
        setMyUpvoted(true);
      }
      await supabase
        .from("study_questions")
        .update({ upvotes_count: (question.upvotes_count ?? 0) + (myUpvoted ? -1 : 1) })
        .eq("id", id);
    } catch (e: any) {
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
      const ins = await supabase
        .from("study_answers")
        .insert({
          question_id: id,
          body: b,
          author_id: meId,
          author_email: meEmail,
          is_accepted: false,
        })
        .select("id,question_id,body,created_at,author_email,author_id,is_accepted")
        .single();
      if (ins.error) throw ins.error;
      setAnswers((prev) => [...prev, ins.data as any]);
      setAnswerBody("");
      await supabase
        .from("study_questions")
        .update({ answers_count: (question?.answers_count ?? 0) + 1 })
        .eq("id", id);
      setQuestion((q) => (q ? { ...q, answers_count: (q.answers_count ?? 0) + 1 } : q));
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
      await supabase.from("study_answers").update({ is_accepted: false }).eq("question_id", id);
      const up = await supabase.from("study_answers").update({ is_accepted: true }).eq("id", answerId);
      if (up.error) throw up.error;
      await supabase.from("study_questions").update({ solved: true }).eq("id", id);
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
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
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
                <p className="text-sm text-zinc-600">No answers yet. Be the first to help.</p>
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
                          {a.author_email ? `By ${a.author_email}` : "Answer"} • {formatDateTime(a.created_at)}
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
