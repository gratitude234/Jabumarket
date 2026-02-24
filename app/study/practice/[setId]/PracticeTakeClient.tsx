// app/study/practice/[setId]/PracticeTakeClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, EmptyState } from "../../_components/StudyUI";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Flag,
  Loader2,
  RefreshCcw,
  Timer,
  X,
  XCircle,
  LayoutGrid,
  Send,
  AlertTriangle,
} from "lucide-react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type QuizSet = {
  id: string;
  title: string;
  description: string | null;
  course_code: string | null;
  level: string | null;
  time_limit_minutes: number | null;
};

type QuizQuestion = {
  id: string;
  prompt: string;
  explanation: string | null;
  position: number | null;
};

type QuizOption = {
  id: string;
  question_id: string;
  text: string;
  is_correct: boolean;
  position: number | null;
};

type ReviewTab = "all" | "wrong" | "flagged" | "unanswered";

function normalize(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function msToClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function safePushRecent(item: { id: string; title: string; course_code?: string; when?: string; href?: string }) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("jabuStudyRecent");
    const prev = raw ? (JSON.parse(raw) as any[]) : [];
    const next = [item, ...(Array.isArray(prev) ? prev : [])]
      .filter(Boolean)
      .filter((x, i, arr) => arr.findIndex((y) => y?.id === x?.id) === i)
      .slice(0, 12);
    window.localStorage.setItem("jabuStudyRecent", JSON.stringify(next));
  } catch {
    // ignore
  }
}

function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-border bg-secondary text-foreground"
          : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Sheet({
  open,
  title,
  subtitle,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-3xl p-3 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-6">
        <div className="w-full rounded-3xl border border-border bg-card p-4 shadow-xl sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-extrabold tracking-tight text-foreground">{title}</p>
              {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl p-2 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function PracticeTakeClient() {
  const router = useRouter();
  const params = useParams<{ setId: string }>();
  const sp = useSearchParams();

  const setId = String(params?.setId ?? "");
  const attemptFromUrl = String(sp.get("attempt") ?? "").trim();

  const [meta, setMeta] = useState<QuizSet | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [optionsByQ, setOptionsByQ] = useState<Record<string, QuizOption[]>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});

  const [attemptId, setAttemptId] = useState<string | null>(attemptFromUrl || null);

  // Timer
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);

  // UI
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);

  const [finalizing, setFinalizing] = useState(false);
  const finalizedRef = useRef(false);

  // Review mode
  const [reviewTab, setReviewTab] = useState<ReviewTab>("all");

  // Local draft autosave (backup if DB upsert fails)
  const draftKey = useMemo(() => `jabu:practiceDraft:${setId}:${attemptId ?? "noattempt"}`, [setId, attemptId]);

  const current = questions[idx];
  const opts = current ? optionsByQ[current.id] ?? [] : [];

  const stats = useMemo(() => {
    const total = questions.length;
    const answered = Object.keys(answers).length;
    const flaggedCount = Object.values(flagged).filter(Boolean).length;

    let correct = 0;
    if (submitted) {
      for (const q of questions) {
        const chosen = answers[q.id];
        if (!chosen) continue;
        const o = (optionsByQ[q.id] ?? []).find((x) => x.id === chosen);
        if (o?.is_correct) correct += 1;
      }
    }
    return { total, answered, flaggedCount, correct };
  }, [questions, answers, flagged, submitted, optionsByQ]);

  // Load + restore/create attempt + timer base
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);
      setSubmitted(false);
      setFinalizing(false);
      finalizedRef.current = false;
      setIdx(0);
      setAnswers({});
      setFlagged({});
      setTimeLeftMs(null);
      deadlineRef.current = null;

      try {
        if (!setId) throw new Error("Missing set id");

        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user ?? null;

        // Fetch set + questions (+ options)
        const setReq = supabase
          .from("study_quiz_sets")
          .select("id,title,description,course_code,level,time_limit_minutes")
          .eq("id", setId)
          .maybeSingle();

        const qReq = supabase
          .from("study_quiz_questions")
          .select("id,prompt,explanation,position")
          .eq("set_id", setId)
          .order("position", { ascending: true });

        const [setRes, qRes] = await Promise.all([setReq, qReq]);
        if (setRes.error) throw setRes.error;
        if (!setRes.data) throw new Error("Practice set not found");
        if (qRes.error) throw qRes.error;

        const qData = (qRes.data ?? []) as any[];
        const qIds = qData.map((q) => String(q.id));
        let optData: any[] = [];

        if (qIds.length) {
          const oRes = await supabase
            .from("study_quiz_options")
            .select("id,question_id,text,is_correct,position")
            .in("question_id", qIds)
            .order("position", { ascending: true });
          if (oRes.error) throw oRes.error;
          optData = (oRes.data ?? []) as any[];
        }

        const grouped: Record<string, QuizOption[]> = {};
        for (const o of optData) {
          const qid = String(o.question_id);
          if (!grouped[qid]) grouped[qid] = [];
          grouped[qid].push({
            id: String(o.id),
            question_id: qid,
            text: String(o.text ?? ""),
            is_correct: Boolean(o.is_correct),
            position: typeof o.position === "number" ? o.position : null,
          });
        }

        // Attempt: restore or create
        let effectiveAttemptId: string | null = attemptFromUrl || null;
        let startedAtMs = Date.now();

        // Restore from URL
        if (user && attemptFromUrl) {
          const attRes = await supabase
            .from("study_practice_attempts")
            .select("id,set_id,status,started_at")
            .eq("id", attemptFromUrl)
            .eq("user_id", user.id)
            .maybeSingle();

          if (!attRes.error && attRes.data?.id && String(attRes.data.set_id) === setId) {
            effectiveAttemptId = String(attRes.data.id);
            const st = new Date(String(attRes.data.started_at)).getTime();
            startedAtMs = Number.isFinite(st) ? st : Date.now();

            // Answers from DB
            const ansRes = await supabase
              .from("study_attempt_answers")
              .select("question_id,selected_option_id")
              .eq("attempt_id", effectiveAttemptId);

            const amap: Record<string, string> = {};
            (ansRes.data ?? []).forEach((r: any) => {
              if (r?.question_id && r?.selected_option_id) amap[String(r.question_id)] = String(r.selected_option_id);
            });

            // Also merge local draft answers (if any)
            try {
              const raw = window.localStorage.getItem(`jabu:practiceDraft:${setId}:${effectiveAttemptId}`);
              if (raw) {
                const local = JSON.parse(raw) as any;
                if (local?.answers && typeof local.answers === "object") {
                  Object.assign(amap, local.answers);
                }
                if (local?.flagged && typeof local.flagged === "object") {
                  // flagged merge happens later after state is set
                }
              }
            } catch {
              // ignore
            }

            if (!cancelled) setAnswers(amap);
          }
        }

        // Create new attempt if none provided
        if (user && !attemptFromUrl) {
          const startedIso = new Date().toISOString();
          const created = await supabase
            .from("study_practice_attempts")
            .insert({
              user_id: user.id,
              set_id: setId,
              status: "in_progress",
              started_at: startedIso,
            } as any)
            .select("id,started_at")
            .maybeSingle();

          if (!created.error && created.data?.id) {
            effectiveAttemptId = String(created.data.id);
            const st = new Date(String(created.data.started_at ?? startedIso)).getTime();
            startedAtMs = Number.isFinite(st) ? st : Date.now();
            // Put attempt in URL for resume
            router.replace(`/study/practice/${encodeURIComponent(setId)}?attempt=${encodeURIComponent(effectiveAttemptId)}`);
          }
        }

        // Timer deadline based on startedAtMs we computed (reliable)
        const mins =
          typeof (setRes.data as any)?.time_limit_minutes === "number"
            ? (setRes.data as any).time_limit_minutes
            : null;

        if (mins && mins > 0) {
          const deadline = startedAtMs + mins * 60_000;
          deadlineRef.current = deadline;
          setTimeLeftMs(deadline - Date.now());
        }

        // Load local draft flags (best-effort)
        if (typeof window !== "undefined" && effectiveAttemptId) {
          try {
            const raw = window.localStorage.getItem(`jabu:practiceDraft:${setId}:${effectiveAttemptId}`);
            if (raw) {
              const local = JSON.parse(raw) as any;
              if (local?.flagged && typeof local.flagged === "object") setFlagged(local.flagged);
            }
          } catch {
            // ignore
          }
        }

        if (cancelled) return;

        setMeta(setRes.data as any);
        setQuestions((qData as any) ?? []);
        setOptionsByQ(grouped);
        setAttemptId(effectiveAttemptId);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load practice set");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [setId, attemptFromUrl, router]);

  // Timer tick + auto-submit
  useEffect(() => {
    if (!deadlineRef.current) return;
    if (submitted) return;

    const t = setInterval(() => {
      const dl = deadlineRef.current;
      if (!dl) return;

      const left = dl - Date.now();
      setTimeLeftMs(left);

      if (left <= 0) {
        setTimeLeftMs(0);
        setTimeUpOpen(true);
        setSubmitted(true);
      }
    }, 250);

    return () => clearInterval(t);
  }, [submitted]);

  // Autosave to localStorage (answers + flags)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!setId || !attemptId) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ answers, flagged, updatedAt: Date.now() }));
    } catch {
      // ignore
    }
  }, [answers, flagged, draftKey, setId, attemptId]);

  // Keyboard shortcuts (mobile-friendly + desktop power)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!questions.length || !current) return;
      if (submitted) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIdx((v) => Math.max(0, v - 1));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIdx((v) => Math.min(questions.length - 1, v + 1));
      }
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFlag(current.id);
      }
      // 1-5 selects option
      if (/^[1-5]$/.test(e.key)) {
        const n = Number(e.key) - 1;
        const o = opts[n];
        if (o) {
          e.preventDefault();
          choose(current.id, o.id);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [questions.length, current?.id, submitted, opts]);

  const headerCode = normalize(String(meta?.course_code ?? "")).toUpperCase();

  function choose(qid: string, oid: string) {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qid]: oid }));

    // Persist answer (best-effort)
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user || !attemptId) return;
        await supabase.from("study_attempt_answers").upsert(
          {
            attempt_id: attemptId,
            user_id: user.id,
            question_id: qid,
            selected_option_id: oid,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "attempt_id,question_id" }
        );
      } catch {
        // ignore
      }
    })();
  }

  function toggleFlag(qid: string) {
    setFlagged((prev) => ({ ...prev, [qid]: !prev[qid] }));
  }

  function goToQuestion(i: number) {
    setIdx(Math.max(0, Math.min(questions.length - 1, i)));
    setPaletteOpen(false);
  }

  function restart() {
    router.refresh();
  }

  async function finalizeAttempt(reason: "manual" | "timeup") {
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    setFinalizing(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user || !attemptId) {
        setFinalizing(false);
        return;
      }

      const total = questions.length;
      let correct = 0;
      for (const q of questions) {
        const chosen = answers[q.id];
        if (!chosen) continue;
        const o = (optionsByQ[q.id] ?? []).find((x) => x.id === chosen);
        if (o?.is_correct) correct += 1;
      }

      const submittedIso = new Date().toISOString();
      let timeSpent: number | null = null;

      if (deadlineRef.current && meta?.time_limit_minutes) {
        const limitSec = meta.time_limit_minutes * 60;
        const left = typeof timeLeftMs === "number" ? Math.max(0, Math.floor(timeLeftMs / 1000)) : 0;
        timeSpent = Math.max(0, limitSec - left);
      }

      await supabase
        .from("study_practice_attempts")
        .update({
          status: "submitted",
          submitted_at: submittedIso,
          score: correct,
          total_questions: total,
          time_spent_seconds: timeSpent,
          submit_reason: reason, // optional column; if missing, supabase will ignore? (if strict schema, remove)
        } as any)
        .eq("id", attemptId)
        .eq("user_id", user.id);

      // Update daily activity/streak (ignore if missing)
      const activityDate = submittedIso.slice(0, 10);
      await supabase
        .from("study_daily_activity")
        .upsert(
          {
            user_id: user.id,
            activity_date: activityDate,
            did_practice: true,
            points: Math.max(1, correct),
            updated_at: submittedIso,
          } as any,
          { onConflict: "user_id,activity_date" }
        );

      safePushRecent({
        id: `practice:${attemptId}`,
        title: meta?.title ?? "Practice",
        course_code: meta?.course_code ?? undefined,
        when: submittedIso,
        href: `/study/practice/${encodeURIComponent(setId)}?attempt=${encodeURIComponent(attemptId)}`,
      });

      // clear local draft (so it doesn't resurrect after submit)
      try {
        if (typeof window !== "undefined") window.localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
    } catch {
      // ignore
    } finally {
      setFinalizing(false);
    }
  }

  // When submitted changes to true (manual or time-up), finalize reliably
  useEffect(() => {
    if (!submitted) return;
    // If time up sheet is open, reason=timeup, else manual
    void finalizeAttempt(timeUpOpen ? "timeup" : "manual");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  const reviewItems = useMemo(() => {
    if (!submitted) return [];

    const list = questions.map((q, i) => {
      const chosen = answers[q.id] ?? null;
      const opts = optionsByQ[q.id] ?? [];
      const correctOpt = opts.find((o) => o.is_correct) ?? null;
      const chosenOpt = chosen ? opts.find((o) => o.id === chosen) ?? null : null;

      const isWrong = !!chosen && !!chosenOpt && !chosenOpt.is_correct;
      const isUnanswered = !chosen;
      const isFlagged = !!flagged[q.id];

      return {
        q,
        index: i,
        chosen,
        chosenOpt,
        correctOpt,
        isWrong,
        isUnanswered,
        isFlagged,
      };
    });

    if (reviewTab === "wrong") return list.filter((x) => x.isWrong);
    if (reviewTab === "flagged") return list.filter((x) => x.isFlagged);
    if (reviewTab === "unanswered") return list.filter((x) => x.isUnanswered);
    return list;
  }, [submitted, questions, answers, optionsByQ, flagged, reviewTab]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4">
        <Card className="rounded-3xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading practice…
          </div>
        </Card>
      </div>
    );
  }

  if (err || !meta) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4">
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
                Go to Practice <ArrowRight className="h-4 w-4" />
              </Link>
            }
            icon={<AlertTriangle className="h-5 w-5 text-muted-foreground" />}
          />
        </div>
      </div>
    );
  }

  const total = stats.total;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex items-center gap-2">
          {typeof timeLeftMs === "number" ? (
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold",
                timeLeftMs <= 60_000
                  ? "border-amber-300/40 bg-amber-100/40 text-foreground dark:bg-amber-950/30"
                  : "border-border bg-background text-foreground"
              )}
              title="Time left"
            >
              <Timer className="h-4 w-4" /> {msToClock(timeLeftMs)}
            </div>
          ) : null}

          <div className="rounded-full border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground">
            {stats.answered}/{stats.total} answered
          </div>

          {stats.flaggedCount ? (
            <div className="rounded-full border border-border bg-secondary px-3 py-2 text-xs font-extrabold text-foreground">
              {stats.flaggedCount} flagged
            </div>
          ) : null}
        </div>
      </div>

      {/* Meta */}
      <div className="mt-4">
        <Card className="rounded-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-extrabold tracking-tight text-foreground">
              {normalize(String(meta.title ?? "Practice"))}
            </p>

            {headerCode ? (
              <Link
                href={`/study/courses/${encodeURIComponent(headerCode)}`}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground no-underline hover:bg-secondary/50"
              >
                {headerCode}
              </Link>
            ) : null}

            {meta.level ? (
              <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                {String(meta.level)}L
              </span>
            ) : null}
          </div>

          {meta.description ? <p className="mt-2 text-sm text-muted-foreground">{normalize(meta.description)}</p> : null}
        </Card>
      </div>

      {/* Empty */}
      {questions.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No questions in this set yet"
            description="Add questions in study_quiz_questions and options in study_quiz_options."
            action={
              <Link
                href="/study/practice"
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50"
              >
                Back to sets <ArrowRight className="h-4 w-4" />
              </Link>
            }
            icon={<AlertTriangle className="h-5 w-5 text-muted-foreground" />}
          />
        </div>
      ) : submitted ? (
        /* Review Mode */
        <div className="mt-4 space-y-3">
          <Card className="rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-foreground">Results</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Score: <span className="font-extrabold text-foreground">{stats.correct}</span> / {stats.total}
                  {finalizing ? (
                    <span className="ml-2 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                    </span>
                  ) : null}
                </p>
              </div>

              <button
                type="button"
                onClick={restart}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RefreshCcw className="h-4 w-4" />
                Restart
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Chip active={reviewTab === "all"} onClick={() => setReviewTab("all")}>
                All
              </Chip>
              <Chip active={reviewTab === "wrong"} onClick={() => setReviewTab("wrong")}>
                Wrong
              </Chip>
              <Chip active={reviewTab === "flagged"} onClick={() => setReviewTab("flagged")}>
                Flagged
              </Chip>
              <Chip active={reviewTab === "unanswered"} onClick={() => setReviewTab("unanswered")}>
                Unanswered
              </Chip>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="ml-auto inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <LayoutGrid className="h-4 w-4" />
                Questions
              </button>
            </div>
          </Card>

          <div className="grid gap-3">
            {reviewItems.length === 0 ? (
              <EmptyState
                title="Nothing here"
                description="No questions match this filter."
                icon={<AlertTriangle className="h-5 w-5 text-muted-foreground" />}
              />
            ) : (
              reviewItems.map((it) => {
                const chosenText = it.chosenOpt?.text ?? null;
                const correctText = it.correctOpt?.text ?? null;

                return (
                  <Card key={it.q.id} className="rounded-3xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-muted-foreground">
                          Question {it.index + 1} of {total}
                          {it.isFlagged ? <span className="ml-2">🚩</span> : null}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-foreground">
                          {normalize(String(it.q.prompt ?? ""))}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => goToQuestion(it.index)}
                        className="shrink-0 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        Jump
                      </button>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm">
                      <div
                        className={cn(
                          "rounded-2xl border p-3",
                          it.isUnanswered
                            ? "border-border bg-background"
                            : it.isWrong
                            ? "border-rose-300/40 bg-rose-100/30 dark:bg-rose-950/20"
                            : "border-emerald-300/40 bg-emerald-100/30 dark:bg-emerald-950/20"
                        )}
                      >
                        <p className="text-xs font-extrabold text-muted-foreground">YOUR ANSWER</p>
                        <p className="mt-1 font-semibold text-foreground">
                          {it.isUnanswered ? "— Unanswered —" : chosenText ?? "—"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-border bg-background p-3">
                        <p className="text-xs font-extrabold text-muted-foreground">CORRECT ANSWER</p>
                        <p className="mt-1 font-semibold text-foreground">{correctText ?? "—"}</p>
                      </div>

                      {it.q.explanation ? (
                        <div className="rounded-2xl border border-border bg-card p-3">
                          <p className="text-xs font-extrabold text-muted-foreground">EXPLANATION</p>
                          <p className="mt-1 text-sm text-muted-foreground">{normalize(it.q.explanation)}</p>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Taking Mode */
        <div className="mt-4 space-y-3">
          <Card className="rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-muted-foreground">
                  Question {idx + 1} of {total}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-base font-semibold text-foreground">
                  {normalize(String(current?.prompt ?? ""))}
                </p>
              </div>

              <button
                type="button"
                onClick={() => toggleFlag(current.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-extrabold",
                  flagged[current.id]
                    ? "border-border bg-secondary text-foreground"
                    : "border-border bg-background text-foreground hover:bg-secondary/50"
                )}
                title="Flag this question"
                aria-label="Flag this question"
              >
                <Flag className="h-4 w-4" /> {flagged[current.id] ? "Flagged" : "Flag"}
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {opts.map((o, i) => {
                const chosen = answers[current.id] === o.id;

                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => choose(current.id, o.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      chosen
                        ? "border-border bg-secondary text-foreground"
                        : "border-border bg-background text-foreground hover:bg-secondary/50"
                    )}
                    aria-label={`Option ${i + 1}`}
                  >
                    <span className="mt-0.5 text-muted-foreground">
                      {chosen ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                    </span>
                    <span className="whitespace-pre-wrap">{normalize(String(o.text ?? ""))}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Helper mini tips */}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-background px-3 py-2">
              Tip: Press <span className="font-extrabold text-foreground">1–5</span> to pick options
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-2">
              <span className="font-extrabold text-foreground">← / →</span> to navigate
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-2">
              Press <span className="font-extrabold text-foreground">F</span> to flag
            </span>
          </div>
        </div>
      )}

      {/* Sticky bottom controls (mobile-first) */}
      {questions.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-50">
          <div className="mx-auto w-full max-w-3xl px-4 pb-[72px]">
            <div className="rounded-3xl border border-border bg-background/80 p-3 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIdx((v) => Math.max(0, v - 1))}
                  disabled={submitted || idx === 0}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-extrabold",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    submitted || idx === 0
                      ? "border-border/50 bg-background text-muted-foreground opacity-60"
                      : "border-border bg-background text-foreground hover:bg-secondary/50"
                  )}
                  aria-label="Previous question"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Prev
                </button>

                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Open question palette"
                >
                  <LayoutGrid className="h-4 w-4" />
                  {stats.answered}/{stats.total}
                </button>

                {!submitted ? (
                  <button
                    type="button"
                    onClick={() => setSubmitOpen(true)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2 text-sm font-extrabold text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label="Submit attempt"
                  >
                    <Send className="h-4 w-4" />
                    Submit
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={restart}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Restart
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIdx((v) => Math.min(questions.length - 1, v + 1))}
                  disabled={submitted || idx >= questions.length - 1}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-extrabold",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    submitted || idx >= questions.length - 1
                      ? "border-border/50 bg-background text-muted-foreground opacity-60"
                      : "border-border bg-background text-foreground hover:bg-secondary/50"
                  )}
                  aria-label="Next question"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Palette sheet */}
      <Sheet
        open={paletteOpen}
        title="Questions"
        subtitle="Tap any number to jump. Green = answered, 🚩 = flagged."
        onClose={() => setPaletteOpen(false)}
      >
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
          {questions.map((q, i) => {
            const isAnswered = !!answers[q.id];
            const isFlagged = !!flagged[q.id];
            const isActive = i === idx;

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => goToQuestion(i)}
                className={cn(
                  "relative rounded-2xl border px-0 py-2 text-sm font-extrabold",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  isActive
                    ? "border-border bg-secondary text-foreground"
                    : isAnswered
                    ? "border-emerald-300/40 bg-emerald-100/30 text-foreground dark:bg-emerald-950/20"
                    : "border-border bg-background text-foreground hover:bg-secondary/50"
                )}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Question ${i + 1}`}
              >
                {i + 1}
                {isFlagged ? <span className="absolute -right-1 -top-1 text-xs">🚩</span> : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Chip active={false} onClick={() => setPaletteOpen(false)}>
            Close
          </Chip>
          {!submitted ? (
            <button
              type="button"
              onClick={() => {
                setPaletteOpen(false);
                setSubmitOpen(true);
              }}
              className="ml-auto inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <Send className="h-4 w-4" />
              Submit
            </button>
          ) : null}
        </div>
      </Sheet>

      {/* Submit confirmation */}
      <Sheet
        open={submitOpen}
        title="Submit attempt?"
        subtitle="You can still review your answers after submitting."
        onClose={() => setSubmitOpen(false)}
      >
        <div className="rounded-3xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">
            Answered: <span className="font-extrabold">{stats.answered}</span> / {stats.total}
          </p>
          {stats.total - stats.answered > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              You have <span className="font-extrabold text-foreground">{stats.total - stats.answered}</span> unanswered questions.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSubmitOpen(false)}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Keep working
            </button>

            <button
              type="button"
              onClick={() => {
                setSubmitOpen(false);
                setSubmitted(true);
              }}
              className="ml-auto inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Send className="h-4 w-4" />
              Submit now
            </button>
          </div>
        </div>
      </Sheet>

      {/* Time up sheet */}
      <Sheet
        open={timeUpOpen}
        title="Time’s up"
        subtitle="Your attempt is being submitted automatically."
        onClose={() => setTimeUpOpen(false)}
      >
        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background">
              <Timer className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-foreground">Auto-submitting…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {finalizing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving your attempt…
                  </span>
                ) : (
                  "Done. You can review your answers now."
                )}
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setTimeUpOpen(false)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}