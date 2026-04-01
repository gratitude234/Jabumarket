"use client";
// app/study/questions/ask/AskQuestionClient.tsx
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Loader2, Send, ShieldAlert } from "lucide-react";

const ACCENT = "#5B35D5";

const LEVELS    = ["100", "200", "300", "400", "500", "600"] as const;
const TITLE_MAX = 120;
const BODY_MAX  = 3000;

export default function AskQuestionClient() {
  const router = useRouter();
  const sp     = useSearchParams();

  const presetCourse = (sp.get("course") ?? "").trim().toUpperCase();
  const presetLevel  = (sp.get("level") ?? "").trim();

  const [userId,    setUserId]    = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [title,   setTitle]   = useState("");
  const [body,    setBody]    = useState("");
  const [course,  setCourse]  = useState(presetCourse);
  const [level,   setLevel]   = useState(presetLevel);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!userId) return false;
    return title.trim().length >= 8 && body.trim().length >= 10;
  }, [userId, title, body]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data?.user?.id ?? null);
      setUserEmail(data?.user?.email ?? null);
    })();
  }, []);

  async function submit() {
    setError(null);
    if (!userId) { setError("Please sign in to ask a question."); return; }
    const t = title.trim();
    const b = body.trim();
    if (t.length < 8)  { setError("Title is too short (min 8 characters)."); return; }
    if (b.length < 10) { setError("Please add more detail (min 10 characters)."); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("study_questions")
        .insert({
          title: t, body: b,
          course_code:   course ? course.trim().toUpperCase() : null,
          level:         level ? level.trim() : null,
          author_id:     userId,
          author_email:  userEmail,
          solved:        false,
          answers_count: 0,
          upvotes_count: 0,
        })
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
  const bodyRemaining  = BODY_MAX  - body.length;

  return (
    <div className="space-y-4 pb-28 md:pb-6">

      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Link href="/study/questions"
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground no-underline hover:bg-secondary/50">
          <ArrowLeft className="h-4 w-4" /> Questions
        </Link>
      </div>

      {/* Page header */}
      <div>
        <h1 className="text-lg font-medium text-foreground">Ask a question</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Be specific — it gets you better answers faster.
        </p>
      </div>

      {/* Auth gate */}
      {!userId && (
        <div className="rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE] p-4 dark:border-[#5B35D5]/30 dark:bg-[#5B35D5]/10">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5B35D5]">
              <ShieldAlert className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Sign in required</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You need to be signed in to ask questions and post answers.
              </p>
              <Link href="/login"
                className="mt-3 inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium text-white no-underline hover:opacity-90"
                style={{ background: ACCENT }}>
                Sign in
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* All fields in one card — less visual noise */}
      <div className="rounded-2xl border border-border bg-background divide-y divide-border overflow-hidden">

        {/* Title */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Title
            </label>
            <span className={cn("text-xs tabular-nums", titleRemaining < 20 ? "text-rose-600" : "text-muted-foreground")}>
              {title.length}/{TITLE_MAX}
            </span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. How do I calculate standard deviation in GST101?"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            maxLength={TITLE_MAX}
          />
          {title.length > 0 && (
            <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  titleRemaining < 20 ? "bg-rose-500" : "bg-[#5B35D5]"
                )}
                style={{ width: `${Math.min(100, (title.length / TITLE_MAX) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Course + Level side by side */}
        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="p-4">
            <label className="block text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
              Course
            </label>
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value.toUpperCase())}
              placeholder="GST101"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">Optional</p>
          </div>
          <div className="p-4">
            <label className="block text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
              Level
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full bg-transparent text-sm text-foreground outline-none"
            >
              <option value="">—</option>
              {LEVELS.map((lv) => (
                <option key={lv} value={lv}>{lv}L</option>
              ))}
            </select>
          </div>
        </div>

        {/* Details */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Details
            </label>
            <span className={cn("text-xs tabular-nums", bodyRemaining < 200 ? "text-rose-600" : "text-muted-foreground")}>
              {body.length}/{BODY_MAX}
            </span>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Explain what you tried, what you don't understand, and include the exact question if possible."
            className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            style={{ minHeight: 120 }}
            maxLength={BODY_MAX}
          />
        </div>
      </div>

      {/* Tip — nudges for better questions */}
      <div className="rounded-2xl px-4 py-3" style={{ background: "#EEEDFE" }}>
        <p className="text-xs leading-relaxed" style={{ color: ACCENT_TEXT }}>
          Questions with a course code get 3× more answers. Add context — what did you try, and where did you get stuck?
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        disabled={!canSubmit || loading}
        onClick={submit}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-medium text-white transition",
          (!canSubmit || loading) ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"
        )}
        style={{ background: ACCENT }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {loading ? "Posting…" : "Post question"}
      </button>
    </div>
  );
}

// Re-export ACCENT_TEXT so it's available in the same file scope
const ACCENT_TEXT = "#3C3489";