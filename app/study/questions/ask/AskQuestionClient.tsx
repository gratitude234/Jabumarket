"use client";
// app/study/questions/ask/AskQuestionClient.tsx
import { cn } from "@/lib/utils";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Loader2, Plus, ShieldAlert } from "lucide-react";

const LEVELS = ["100", "200", "300", "400", "500", "600"] as const;
const TITLE_MAX = 120;
const BODY_MAX = 3000;

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
    if (t.length < 8) return setError("Title is too short (min 8 characters).");
    if (b.length < 10) return setError("Please add more details (min 10 characters).");

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

  const titleRemaining = TITLE_MAX - title.length;
  const bodyRemaining = BODY_MAX - body.length;

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
          <p className="text-sm font-semibold text-foreground">Ask a question</p>
          <p className="text-xs text-muted-foreground">Be clear — it helps people answer faster.</p>
        </div>
      </div>

      {!userId && (
        <div className="rounded-3xl border border-amber-200/70 bg-amber-500/5 p-4 dark:border-amber-700/30 dark:bg-amber-950/10">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border bg-background">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Sign in required</p>
              <p className="mt-1 text-sm text-muted-foreground">
                To prevent spam, you need to be signed in to ask questions and post answers.
              </p>
              <Link
                href="/login"
                className={cn(
                  "mt-3 inline-flex items-center gap-2 rounded-2xl border border-border bg-foreground px-4 py-2 text-sm font-semibold text-background no-underline",
                  "hover:opacity-90"
                )}
              >
                Go to Login
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {/* Title */}
        <div className="rounded-3xl border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Title</span>
            <span
              className={cn(
                "text-xs font-semibold",
                titleRemaining < 20 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
              )}
            >
              {title.length}/{TITLE_MAX}
            </span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="E.g., How do I calculate standard deviation in GST101?"
            className="mt-2 h-10 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            maxLength={TITLE_MAX}
          />
          <p className="mt-1 text-xs text-muted-foreground">Keep it short and specific.</p>
        </div>

        {/* Course + Level */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-border bg-background p-4">
            <span className="text-xs font-semibold text-muted-foreground">Course code (optional)</span>
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value.toUpperCase())}
              placeholder="GST101"
              className="mt-2 h-10 w-full bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="rounded-3xl border border-border bg-background p-4">
            <span className="text-xs font-semibold text-muted-foreground">Level (optional)</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="mt-2 h-10 w-full bg-transparent text-sm text-foreground outline-none"
            >
              <option value="">Select level</option>
              {LEVELS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}L
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Details */}
        <div className="rounded-3xl border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Details</span>
            <span
              className={cn(
                "text-xs font-semibold",
                bodyRemaining < 200 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
              )}
            >
              {body.length}/{BODY_MAX}
            </span>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Explain what you tried, what you don't understand, and include the exact question if possible."
            className="mt-2 min-h-[140px] w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            maxLength={BODY_MAX}
          />
          <p className="mt-1 text-xs text-muted-foreground">The more detail, the better answers you'll get.</p>
        </div>

        {error && (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={!canSubmit || loading}
          onClick={submit}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-3xl px-4 py-3 text-sm font-semibold transition-all",
            !canSubmit || loading
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-foreground text-background hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Post question
        </button>
      </div>
    </div>
  );
}