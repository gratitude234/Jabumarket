// app/study/history/[attemptId]/AttemptReviewClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, EmptyState } from "../../_components/StudyUI";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  XCircle,
  BookOpen,
  LayoutGrid,
  Flag,
  FlagOff,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";

function cn(...p: Array<string | false | null | undefined>) {
  return p.filter(Boolean).join(" ");
}

function normalize(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
}

type AttemptRow = {
  id: string;
  user_id: string;
  set_id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  total_questions: number | null;
  time_spent_seconds: number | null;
};

type SetRow = {
  id: string;
  title: string;
  description: string | null;
  course_code: string | null;
  level: string | null;
  time_limit_minutes: number | null;
};

type QuestionRow = {
  id: string;
  prompt: string;
  explanation: string | null;
  position: number | null;
};

type OptionRow = {
  id: string;
  question_id: string;
  text: string;
  is_correct: boolean;
  position: number | null;
};

type ReviewTab = "wrong" | "flagged" | "unanswered" | "all";

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
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-5xl p-3 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-6">
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
              <ArrowDownX />
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ArrowDownX() {
  // small, consistent close icon without importing more icons
  return <span className="text-xl leading-none">×</span>;
}

export default function AttemptReviewClient() {
  const router = useRouter();
  const params = useParams<{ attemptId: string }>();
  const attemptId = String(params?.attemptId ?? "");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptRow | null>(null);
  const [setMeta, setSetMeta] = useState<SetRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [optionsByQ, setOptionsByQ] = useState<Record<string, OptionRow[]>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({}); // qid -> optionId

  // UX state
  const [tab, setTab] = useState<ReviewTab>("wrong"); // ✅ mobile-first default: mistakes
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedQ, setSelectedQ] = useState<string | null>(null);

  // Local flags + explanation toggles (client-only review helpers)
  const flagsKey = useMemo(() => `jabu:reviewFlags:${attemptId}`, [attemptId]);
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [expOpen, setExpOpen] = useState<Record<string, boolean>>({});

  // Used for "Retry wrong questions" handoff
  const retryKey = useMemo(() => `jabu:retryWrong:${attemptId}`, [attemptId]);

  // Sticky footer height above global bottom nav (same convention you used elsewhere)
  const APP_BOTTOM_NAV_H = 72;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        if (!attemptId) throw new Error("Missing attempt id");

        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          router.replace(`/login?next=${encodeURIComponent(`/study/history/${attemptId}`)}`);
          return;
        }

        // Attempt (must belong to user)
        const { data: att, error: attErr } = await supabase
          .from("study_practice_attempts")
          .select("id,user_id,set_id,status,started_at,submitted_at,score,total_questions,time_spent_seconds")
          .eq("id", attemptId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (attErr) throw attErr;
        if (!att) throw new Error("Attempt not found");

        const setId = String((att as any).set_id);

        // Set meta + questions
        const [setRes, qRes] = await Promise.all([
          supabase
            .from("study_quiz_sets")
            .select("id,title,description,course_code,level,time_limit_minutes")
            .eq("id", setId)
            .maybeSingle(),
          supabase
            .from("study_quiz_questions")
            .select("id,prompt,explanation,position")
            .eq("set_id", setId)
            .order("position", { ascending: true }),
        ]);

        if (setRes.error) throw setRes.error;
        if (qRes.error) throw qRes.error;

        const qs = (qRes.data as any[] | null) ?? [];
        const qIds = qs.map((q) => String(q.id));

        // Options
        let optData: any[] = [];
        if (qIds.length) {
          const { data: oData, error: oErr } = await supabase
            .from("study_quiz_options")
            .select("id,question_id,text,is_correct,position")
            .in("question_id", qIds)
            .order("position", { ascending: true });
          if (oErr) throw oErr;
          optData = (oData as any[] | null) ?? [];
        }

        const grouped: Record<string, OptionRow[]> = {};
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

        // Answers
        const { data: aData, error: aErr } = await supabase
          .from("study_attempt_answers")
          .select("question_id,selected_option_id")
          .eq("attempt_id", attemptId);

        if (aErr) throw aErr;

        const aMap: Record<string, string> = {};
        (aData ?? []).forEach((r: any) => {
          if (r?.question_id && r?.selected_option_id) aMap[String(r.question_id)] = String(r.selected_option_id);
        });

        // Restore local flags
        let localFlags: Record<string, boolean> = {};
        try {
          const raw = window.localStorage.getItem(flagsKey);
          if (raw) localFlags = JSON.parse(raw);
        } catch {
          // ignore
        }

        // Pre-open explanations for wrong answers (learning-first)
        const expSeed: Record<string, boolean> = {};
        for (const q of qs) {
          const qid = String(q.id);
          const chosenId = aMap[qid];
          if (!chosenId) continue;
          const chosen = (grouped[qid] ?? []).find((x) => x.id === chosenId);
          if (chosen && !chosen.is_correct) expSeed[qid] = true;
        }

        if (!cancelled) {
          setAttempt(att as any);
          setSetMeta(setRes.data as any);

          const normalizedQs = qs.map((q) => ({
            id: String(q.id),
            prompt: String(q.prompt ?? ""),
            explanation: q.explanation ? String(q.explanation) : null,
            position: typeof q.position === "number" ? q.position : null,
          }));

          setQuestions(normalizedQs);
          setOptionsByQ(grouped);
          setAnswers(aMap);
          setFlagged(localFlags);
          setExpOpen(expSeed);

          // Default selected question:
          // prefer first wrong, else first unanswered, else first question
          const firstWrong =
            normalizedQs.find((qq) => {
              const chosenId = aMap[qq.id];
              if (!chosenId) return false;
              const chosen = (grouped[qq.id] ?? []).find((x) => x.id === chosenId);
              return !!chosen && !chosen.is_correct;
            })?.id ?? null;

          const firstUnanswered = normalizedQs.find((qq) => !aMap[qq.id])?.id ?? null;

          setSelectedQ(firstWrong ?? firstUnanswered ?? normalizedQs[0]?.id ?? null);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load review");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attemptId, router, flagsKey]);

  // Persist flags
  useEffect(() => {
    try {
      window.localStorage.setItem(flagsKey, JSON.stringify(flagged));
    } catch {
      // ignore
    }
  }, [flagged, flagsKey]);

  const derived = useMemo(() => {
    const total = questions.length;
    let answered = 0;
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;

    const wrongIds: string[] = [];
    const unansweredIds: string[] = [];

    for (const q of questions) {
      const chosenId = answers[q.id];
      const opts = optionsByQ[q.id] ?? [];
      if (!chosenId) {
        unanswered += 1;
        unansweredIds.push(q.id);
        continue;
      }

      answered += 1;
      const chosen = opts.find((o) => o.id === chosenId);
      if (chosen?.is_correct) correct += 1;
      else {
        wrong += 1;
        wrongIds.push(q.id);
      }
    }

    const flaggedIds = questions.filter((q) => !!flagged[q.id]).map((q) => q.id);

    return { total, answered, correct, wrong, unanswered, wrongIds, unansweredIds, flaggedIds };
  }, [questions, answers, optionsByQ, flagged]);

  const filteredList = useMemo(() => {
    if (tab === "wrong") return derived.wrongIds;
    if (tab === "unanswered") return derived.unansweredIds;
    if (tab === "flagged") return derived.flaggedIds;
    return questions.map((q) => q.id);
  }, [tab, derived, questions]);

  const selectedIndexInAll = useMemo(() => {
    if (!selectedQ) return 0;
    const i = questions.findIndex((q) => q.id === selectedQ);
    return i >= 0 ? i : 0;
  }, [selectedQ, questions]);

  const selected = useMemo(() => {
    if (!selectedQ) return null;
    return questions.find((q) => q.id === selectedQ) ?? null;
  }, [selectedQ, questions]);

  const selectedOpts = selected ? optionsByQ[selected.id] ?? [] : [];
  const chosenId = selected ? answers[selected.id] : undefined;
  const chosenOpt = selected ? selectedOpts.find((o) => o.id === chosenId) ?? null : null;
  const correctOpt = selected ? selectedOpts.find((o) => o.is_correct) ?? null : null;
  const isWrong = Boolean(chosenId && chosenOpt && !chosenOpt.is_correct);
  const isUnanswered = Boolean(selected && !chosenId);

  const headerCode = normalize(String(setMeta?.course_code ?? "")).toUpperCase();

  function goToQ(qid: string) {
    setSelectedQ(qid);
    setPaletteOpen(false);
  }

  function prev() {
    const i = selectedIndexInAll;
    if (i <= 0) return;
    setSelectedQ(questions[i - 1]?.id ?? selectedQ);
  }

  function next() {
    const i = selectedIndexInAll;
    if (i >= questions.length - 1) return;
    setSelectedQ(questions[i + 1]?.id ?? selectedQ);
  }

  function toggleFlag(qid: string) {
    setFlagged((p) => ({ ...p, [qid]: !p[qid] }));
  }

  function toggleExplanation(qid: string) {
    setExpOpen((p) => ({ ...p, [qid]: !p[qid] }));
  }

  function retryWrong() {
    if (!setMeta) return;
    try {
      window.localStorage.setItem(
        retryKey,
        JSON.stringify({
          attemptId,
          setId: setMeta.id,
          questionIds: derived.wrongIds,
          createdAt: Date.now(),
        })
      );
    } catch {
      // ignore
    }
    router.push(`/study/practice/${encodeURIComponent(setMeta.id)}?retry=wrong&fromAttempt=${encodeURIComponent(attemptId)}`);
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4">
        <Card className="rounded-3xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading review…
          </div>
        </Card>
      </div>
    );
  }

  if (err || !attempt || !setMeta) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mt-4">
          <EmptyState
            title="Couldn’t open review"
            description={err ?? "Missing data"}
            action={
              <Link
                href="/study/history"
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50"
              >
                Back to history <ArrowRight className="h-4 w-4" />
              </Link>
            }
            icon={<AlertTriangle className="h-5 w-5 text-muted-foreground" />}
          />
        </div>
      </div>
    );
  }

  const statusPill =
    attempt.status === "submitted"
      ? "border-emerald-300/40 bg-emerald-100/30 text-foreground dark:bg-emerald-950/20"
      : "border-amber-300/40 bg-amber-100/30 text-foreground dark:bg-amber-950/20";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4">
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

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/study/practice/${encodeURIComponent(setMeta.id)}?attempt=${encodeURIComponent(attempt.id)}`}
            className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
            title="Open this attempt"
          >
            <RefreshCcw className="h-4 w-4" /> Open attempt
          </Link>

          <Link
            href={`/study/practice/${encodeURIComponent(setMeta.id)}`}
            className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2 text-sm font-extrabold text-foreground no-underline hover:opacity-90"
            title="Start a new attempt"
          >
            Retry set <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4">
        <Card className="rounded-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-extrabold tracking-tight text-foreground">
              {normalize(String(setMeta.title ?? "Practice"))}
            </p>

            {headerCode ? (
              <Link
                href={`/study/courses/${encodeURIComponent(headerCode)}`}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground no-underline hover:bg-secondary/50"
              >
                {headerCode}
              </Link>
            ) : null}

            {setMeta.level ? (
              <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                {String(setMeta.level)}L
              </span>
            ) : null}

            <span className={cn("rounded-full border px-3 py-1.5 text-xs font-extrabold", statusPill)}>
              {attempt.status === "submitted" ? "Submitted" : "In progress"}
            </span>
          </div>

          {setMeta.description ? <p className="mt-2 text-sm text-muted-foreground">{normalize(setMeta.description)}</p> : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground">
              Score: {derived.correct}/{derived.total}
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground">
              Wrong: {derived.wrong}
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground">
              Unanswered: {derived.unanswered}
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground">
              Time: {fmtDuration(attempt.time_spent_seconds)}
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground">
              Submitted: {fmtDate(attempt.submitted_at)}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Chip active={tab === "wrong"} onClick={() => setTab("wrong")}>
              Wrong ({derived.wrong})
            </Chip>
            <Chip active={tab === "flagged"} onClick={() => setTab("flagged")}>
              Flagged ({derived.flaggedIds.length})
            </Chip>
            <Chip active={tab === "unanswered"} onClick={() => setTab("unanswered")}>
              Unanswered ({derived.unanswered})
            </Chip>
            <Chip active={tab === "all"} onClick={() => setTab("all")}>
              All ({derived.total})
            </Chip>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="ml-auto inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <LayoutGrid className="h-4 w-4" />
              Questions
            </button>

            <button
              type="button"
              onClick={retryWrong}
              disabled={derived.wrongIds.length === 0}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                derived.wrongIds.length === 0
                  ? "border border-border/60 bg-background text-muted-foreground opacity-60"
                  : "bg-secondary text-foreground hover:opacity-90"
              )}
              title="Retry only the questions you missed (saved to local state for now)"
            >
              Retry wrong
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </Card>
      </div>

      {/* Main */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[320px,1fr]">
        {/* Left: list */}
        <Card className="rounded-3xl">
          <p className="text-sm font-extrabold text-foreground">Questions</p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            Tap any question. Wrong answers auto-open explanation.
          </p>

          {filteredList.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Nothing here"
                description="No questions match this filter."
                icon={<AlertTriangle className="h-5 w-5 text-muted-foreground" />}
              />
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {filteredList.map((qid) => {
                const qIndex = questions.findIndex((q) => q.id === qid);
                const q = questions[qIndex];
                const isActive = selectedQ === qid;

                const chosenId = answers[qid];
                const opts = optionsByQ[qid] ?? [];
                const chosen = chosenId ? opts.find((o) => o.id === chosenId) : null;
                const ok = Boolean(chosen && chosen.is_correct);

                return (
                  <button
                    key={qid}
                    type="button"
                    onClick={() => setSelectedQ(qid)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isActive ? "border-border bg-secondary" : "border-border/70 bg-card hover:bg-secondary/40"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-muted-foreground">Question {qIndex + 1}</p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">
                        {normalize(q?.prompt ?? "")}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-extrabold">
                        {flagged[qid] ? (
                          <span className="rounded-full border border-border bg-background px-2 py-1 text-foreground">
                            🚩 Flagged
                          </span>
                        ) : null}

                        {!chosenId ? (
                          <span className="rounded-full border border-border bg-background px-2 py-1 text-muted-foreground">
                            Unanswered
                          </span>
                        ) : ok ? (
                          <span className="rounded-full border border-emerald-300/40 bg-emerald-100/30 px-2 py-1 text-foreground dark:bg-emerald-950/20">
                            Correct
                          </span>
                        ) : (
                          <span className="rounded-full border border-rose-300/40 bg-rose-100/30 px-2 py-1 text-foreground dark:bg-rose-950/20">
                            Wrong
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-0.5">
                      {!chosenId ? (
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground">
                          —
                        </span>
                      ) : ok ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                      ) : (
                        <XCircle className="h-6 w-6 text-rose-600" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <Link
            href="/study/history"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
          >
            <BookOpen className="h-4 w-4" /> View all attempts
          </Link>
        </Card>

        {/* Right: detail */}
        <Card className="rounded-3xl">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select a question to review.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-muted-foreground">Question</p>
                  <p className="mt-2 whitespace-pre-wrap text-base font-semibold text-foreground">
                    {normalize(selected.prompt)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleFlag(selected.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-extrabold",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    flagged[selected.id]
                      ? "border-border bg-secondary text-foreground"
                      : "border-border bg-background text-foreground hover:bg-secondary/50"
                  )}
                  aria-label={flagged[selected.id] ? "Unflag question" : "Flag question"}
                  title={flagged[selected.id] ? "Unflag" : "Flag"}
                >
                  {flagged[selected.id] ? <FlagOff className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
                  {flagged[selected.id] ? "Flagged" : "Flag"}
                </button>
              </div>

              <div className="mt-4 grid gap-2">
                {selectedOpts.map((o, i) => {
                  const isChosen = chosenId === o.id;
                  const isCorrect = o.is_correct;
                  const showWrongChosen = isChosen && !isCorrect;

                  return (
                    <div
                      key={o.id}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border px-4 py-3",
                        "border-border bg-background",
                        isCorrect ? "border-emerald-300/40 bg-emerald-100/30 dark:bg-emerald-950/20" : "",
                        showWrongChosen ? "border-rose-300/40 bg-rose-100/30 dark:bg-rose-950/20" : ""
                      )}
                    >
                      <div className="mt-0.5">
                        {isCorrect ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : showWrongChosen ? (
                          <XCircle className="h-5 w-5 text-rose-600" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border border-border" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="whitespace-pre-wrap text-sm font-semibold text-foreground">
                          {String.fromCharCode(65 + i)}. {normalize(o.text)}
                        </p>
                        {isChosen ? (
                          <p className={cn("mt-1 text-xs font-extrabold", isCorrect ? "text-emerald-600" : "text-rose-600")}>
                            Your choice
                          </p>
                        ) : null}
                        {isCorrect ? <p className="mt-1 text-xs font-extrabold text-emerald-600">Correct answer</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Explanation toggle */}
              <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                <button
                  type="button"
                  onClick={() => toggleExplanation(selected.id)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-foreground">Explanation</p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      {isWrong ? "This is opened automatically because your answer was wrong." : "Tap to open/close."}
                    </p>
                  </div>
                  {expOpen[selected.id] ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>

                {expOpen[selected.id] ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm font-semibold text-muted-foreground">
                    {normalize(selected.explanation ?? "No explanation provided.")}
                  </p>
                ) : null}
              </div>

              {/* Quick fix card */}
              {(isWrong || isUnanswered) && correctOpt ? (
                <div className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-100/30 p-4 text-foreground dark:bg-amber-950/20">
                  <p className="text-sm font-extrabold">Quick fix</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Correct answer: <span className="font-extrabold text-foreground">{normalize(correctOpt.text)}</span>.
                    {isUnanswered ? " Try answering it next time." : " Read the explanation and retry wrong questions."}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={retryWrong}
                      disabled={derived.wrongIds.length === 0}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-extrabold transition",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        derived.wrongIds.length === 0
                          ? "border border-border/60 bg-background text-muted-foreground opacity-60"
                          : "bg-secondary text-foreground hover:opacity-90"
                      )}
                    >
                      Retry wrong <ArrowRight className="h-4 w-4" />
                    </button>

                    <Link
                      href={`/study/practice/${encodeURIComponent(setMeta.id)}`}
                      className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
                    >
                      Retry full set <RefreshCcw className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>

      {/* Sticky bottom nav (mobile-first) */}
      <div
        className="fixed inset-x-0 bottom-0 z-50"
        style={{ paddingBottom: APP_BOTTOM_NAV_H }}
        aria-label="Review controls"
      >
        <div className="mx-auto w-full max-w-5xl px-4 pb-3">
          <div className="rounded-3xl border border-border bg-background/80 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={prev}
                disabled={selectedIndexInAll <= 0}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-extrabold",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selectedIndexInAll <= 0
                    ? "border-border/50 bg-background text-muted-foreground opacity-60"
                    : "border-border bg-background text-foreground hover:bg-secondary/50"
                )}
              >
                <ArrowLeft className="h-4 w-4" />
                Prev
              </button>

              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <LayoutGrid className="h-4 w-4" />
                {selectedIndexInAll + 1}/{derived.total}
              </button>

              {selected ? (
                <button
                  type="button"
                  onClick={() => toggleFlag(selected.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-extrabold",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    flagged[selected.id]
                      ? "border-border bg-secondary text-foreground"
                      : "border-border bg-background text-foreground hover:bg-secondary/50"
                  )}
                  aria-label={flagged[selected.id] ? "Unflag question" : "Flag question"}
                >
                  <Flag className="h-4 w-4" />
                  {flagged[selected.id] ? "Flagged" : "Flag"}
                </button>
              ) : null}

              <button
                type="button"
                onClick={next}
                disabled={selectedIndexInAll >= questions.length - 1}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-extrabold",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selectedIndexInAll >= questions.length - 1
                    ? "border-border/50 bg-background text-muted-foreground opacity-60"
                    : "border-border bg-background text-foreground hover:bg-secondary/50"
                )}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Question palette sheet */}
      <Sheet
        open={paletteOpen}
        title="Questions"
        subtitle="Green = correct, Red = wrong, Grey = unanswered, 🚩 = flagged"
        onClose={() => setPaletteOpen(false)}
      >
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
          {questions.map((q, i) => {
            const chosenId = answers[q.id];
            const opts = optionsByQ[q.id] ?? [];
            const chosen = chosenId ? opts.find((o) => o.id === chosenId) ?? null : null;
            const ok = Boolean(chosen && chosen.is_correct);

            const isActive = selectedQ === q.id;
            const isFlagged = !!flagged[q.id];

            const tone = !chosenId
              ? "border-border bg-background text-foreground hover:bg-secondary/50"
              : ok
              ? "border-emerald-300/40 bg-emerald-100/30 text-foreground dark:bg-emerald-950/20"
              : "border-rose-300/40 bg-rose-100/30 text-foreground dark:bg-rose-950/20";

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => goToQ(q.id)}
                className={cn(
                  "relative rounded-2xl border px-0 py-2 text-sm font-extrabold transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  tone,
                  isActive ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""
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
          <Chip active={tab === "wrong"} onClick={() => setTab("wrong")}>
            Wrong
          </Chip>
          <Chip active={tab === "flagged"} onClick={() => setTab("flagged")}>
            Flagged
          </Chip>
          <Chip active={tab === "unanswered"} onClick={() => setTab("unanswered")}>
            Unanswered
          </Chip>
          <Chip active={tab === "all"} onClick={() => setTab("all")}>
            All
          </Chip>

          <button
            type="button"
            onClick={() => setPaletteOpen(false)}
            className="ml-auto inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            Close
          </button>
        </div>
      </Sheet>
    </div>
  );
}