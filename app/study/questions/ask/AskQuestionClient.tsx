// app/study/questions/ask/AskQuestionClient.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Loader2, Plus, ShieldAlert } from "lucide-react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const LEVELS = ["100", "200", "300", "400", "500"] as const;

export default function AskQuestionClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const presetCourse = (sp.get("course") ?? "").trim().toUpperCase();
  const presetLevel = (sp.get("level") ?? "").trim();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [course, setCourse] = useState(presetCourse);
  const [level, setLevel] = useState(presetLevel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!userId) return false;
    if (title.trim().length < 8) return false;
    if (body.trim().length < 10) return false;
    return true;
  }, [userId, title, body]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      setUserId(u?.id ?? null);
      setUserEmail(u?.email ?? null);
    })();
  }, []);

  async function submit() {
    setError(null);
    if (!userId) {
      setError("Please sign in to ask a question.");
      return;
    }
    const t = title.trim();
    const b = body.trim();
    if (t.length < 8) return setError("Title is too short.");
    if (b.length < 10) return setError("Please add more details.");

    setLoading(true);
    try {
      const payload = {
        title: t,
        body: b,
        course_code: course ? course.trim().toUpperCase() : null,
        level: level ? level.trim() : null,
        author_id: userId,
        author_email: userEmail,
        solved: false,
        answers_count: 0,
        upvotes_count: 0,
      };

      const { data, error } = await supabase
        .from("study_questions")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      router.push(`/study/questions/${data.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to post question.");
    } finally {
      setLoading(false);
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
            <p className="text-lg font-semibold text-zinc-900">Ask a question</p>
            <p className="text-sm text-zinc-600">Be clear — it helps people answer faster.</p>
          </div>
        </div>
      </div>

      {!userId && (
        <div className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-2xl bg-white">
              <ShieldAlert className="h-4 w-4 text-amber-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">Sign in required</p>
              <p className="mt-1 text-sm text-amber-800">
                To prevent spam, you need to be signed in to ask questions and post answers.
              </p>
              <Link
                href="/login"
                className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Go to Login
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <label className="block rounded-3xl border bg-white p-4">
          <span className="text-xs font-semibold text-zinc-600">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="E.g., How do I calculate standard deviation in GST101?"
            className="mt-1 h-10 w-full bg-transparent text-sm text-zinc-900 outline-none"
            maxLength={120}
          />
          <p className="mt-1 text-xs text-zinc-500">Keep it short and specific (max 120 chars).</p>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block rounded-3xl border bg-white p-4">
            <span className="text-xs font-semibold text-zinc-600">Course code (optional)</span>
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="GST101"
              className="mt-1 h-10 w-full bg-transparent text-sm text-zinc-900 outline-none"
            />
          </label>
          <label className="block rounded-3xl border bg-white p-4">
            <span className="text-xs font-semibold text-zinc-600">Level (optional)</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="mt-1 h-10 w-full bg-transparent text-sm text-zinc-900 outline-none"
            >
              <option value="">Select level</option>
              {LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}L
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block rounded-3xl border bg-white p-4">
          <span className="text-xs font-semibold text-zinc-600">Details</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Explain what you tried, what you don’t understand, and include the exact question if possible."
            className="mt-1 min-h-[140px] w-full resize-none bg-transparent text-sm text-zinc-900 outline-none"
            maxLength={3000}
          />
          <p className="mt-1 text-xs text-zinc-500">The more detail, the better (max 3000 chars).</p>
        </label>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        <button
          type="button"
          disabled={!canSubmit || loading}
          onClick={submit}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-3xl px-4 py-3 text-sm font-semibold",
            !canSubmit || loading
              ? "cursor-not-allowed bg-zinc-200 text-zinc-500"
              : "bg-zinc-900 text-white hover:bg-zinc-800"
          )}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Post question
        </button>
      </div>
    </div>
  );
}
