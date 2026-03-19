"use client";
// app/study/history/[attemptId]/AttemptReviewClient.tsx
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, EmptyState } from "../../_components/StudyUI";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flag,
  FlagOff,
  LayoutGrid,
  Loader2,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";

// ─── Utilities ────────────────────────────────────────────────────────────────

function normalize(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
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

function pctToColor(pct: number): string {
  if (pct >= 70) return "#1D9E75";
  if (pct >= 60) return "#378ADD";
  if (pct >= 50) return "#BA7517";
  if (pct >= 45) return "#E8762A";
  return "#A32D2D";
}

type GradeTier = { label: string; className: string };

function scoreGrade(correct: number, total: number): { pct: number; grade: GradeTier } {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  let grade: GradeTier;
  if (pct >= 70)      grade = { label: "A", className: "border-emerald-300/50 bg-emerald-100/40 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" };
  else if (pct >= 60) grade = { label: "B", className: "border-blue-300/50 bg-blue-100/40 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300" };
  else if (pct >= 50) grade = { label: "C", className: "border-amber-300/50 bg-amber-100/40 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" };
  else if (pct >= 45) grade = { label: "D", className: "border-orange-300/50 bg-orange-100/40 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300" };
  else                grade = { label: "F", className: "border-rose-300/50 bg-rose-100/40 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300" };
  return { pct, grade };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReviewChip({
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

function QuestionPalette({
  open,
  questions,
  answers,
  optionsByQ,
  flagged,
  selectedQ,
  tab,
  onSelectQ,
  onSetTab,
  onClose,
}: {
  open: boolean;
  questions: QuestionRow[];
  answers: Record<string, string>;
  optionsByQ: Record<string, OptionRow[]>;
  flagged: Record<string, boolean>;
  selectedQ: string | null;
  tab: ReviewTab;
  onSelectQ: (id: string) => void;
  onSetTab: (t: ReviewTab) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-5xl p-3 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-6">
        <div className="w-full rounded-3xl border border-border bg-card p-4 shadow-xl sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-extrabold tracking-tight text-foreground">Questions</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Green = correct · Red = wrong · Grey = unanswered · 🚩 = flagged
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl p-2 text-xl leading-none hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-10">
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
                  onClick={() => onSelectQ(q.id)}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Question ${i + 1}`}
                  className={cn(
                    "relative rounded-2xl border py-2 text-sm font-extrabold transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    tone,
                    isActive ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""
                  )}
                >
                  {i + 1}
                  {isFlagged ? <span className="absolute -right-1 -top-1 text-xs">🚩</span> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <ReviewChip active={tab === "wrong"} onClick={() => onSetTab("wrong")}>Wrong</ReviewChip>
            <ReviewChip active={tab === "flagged"} onClick={() => onSetTab("flagged")}>Flagged</ReviewChip>
            <ReviewChip active={tab === "unanswered"} onClick={() => onSetTab("unanswered")}>Unanswered</ReviewChip>
            <ReviewChip active={tab === "all"} onClick={() => onSetTab("all")}>All</ReviewChip>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
type MobileTab = "question" | "list";

// ─── Score Ring (large, for review header) ────────────────────────────────────

function ScoreRingLg({
  pct,
  grade,
}: {
  pct: number;
  grade: GradeTier;
}) {
  const size = 76;
  const r = 30;
  const cx = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const color = pctToColor(pct);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="currentColor" strokeWidth={5} opacity={0.12} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
        />
        <text x={cx} y={cx - 6} textAnchor="middle" dominantBaseline="central"
          fontSize={15} fontWeight={600} fill="currentColor">
          {pct}%
        </text>
        <text x={cx} y={cx + 12} textAnchor="middle" dominantBaseline="central"
          fontSize={11} fill="currentColor" opacity={0.6}>
          Grade {grade.label}
        </text>
      </svg>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AttemptReviewClient() {
  const router = useRouter();
  const params = useParams<{ attemptId: string }>();
  const attemptId = String(params?.attemptId ?? "");

  // Data
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptRow | null>(null);
  const [setMeta, setSetMeta] = useState<SetRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [optionsByQ, setOptionsByQ] = useState<Record<string, OptionRow[]>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [prevPct, setPrevPct] = useState<number | null>(null); // score from prior attempt on same set

  // UI state
  const [mobileTab, setMobileTab] = useState<MobileTab>("question");
  const [tab, setTab] = useState<ReviewTab>("wrong");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedQ, setSelectedQ] = useState<string | null>(null);

  // Flags — stored in localStorage, keyed by attemptId
  const flagsKey = useMemo(() => `jabu:reviewFlags:${attemptId}`, [attemptId]);
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});

  // Explanation toggles
  const [expOpen, setExpOpen] = useState<Record<string, boolean>>({});

  // "Mark as understood" — optimistically updated, persisted to DB
  const [understood, setUnderstood] = useState<Record<string, boolean>>({});
  const [understoodSaving, setUnderstoodSaving] = useState<Record<string, boolean>>({});

  // Retry wrong handoff key
  const retryKey = useMemo(() => `jabu:retryWrong:${attemptId}`, [attemptId]);

  const APP_BOTTOM_NAV_H = 72;

  // ── Data loading ─────────────────────────────────────────────────────────────

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

        // Load set meta, questions, previous attempt score concurrently
        const [setRes, qRes, prevRes] = await Promise.all([
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
          // Previous submitted attempt on the same set (for score comparison)
          supabase
            .from("study_practice_attempts")
            .select("score,total_questions")
            .eq("user_id", user.id)
            .eq("set_id", setId)
            .eq("status", "submitted")
            .neq("id", attemptId)
            .order("submitted_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (setRes.error) throw setRes.error;
        if (qRes.error) throw qRes.error;

        const qs = (qRes.data as any[] | null) ?? [];
        const qIds = qs.map((q) => String(q.id));

        // Load options + answers concurrently
        const [optRes, aRes] = await Promise.all([
          qIds.length
            ? supabase
                .from("study_quiz_options")
                .select("id,question_id,text,is_correct,position")
                .in("question_id", qIds)
                .order("position", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          // Answers — only stable columns (no understood yet)
          supabase
            .from("study_attempt_answers")
            .select("question_id,selected_option_id")
            .eq("attempt_id", attemptId),
        ]);

        if (optRes.error) throw optRes.error;
        if (aRes.error) throw aRes.error;

        // Build options map
        const grouped: Record<string, OptionRow[]> = {};
        for (const o of (optRes.data ?? []) as any[]) {
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

        // Build answers map
        const aMap: Record<string, string> = {};
        for (const r of (aRes.data ?? []) as any[]) {
          if (r?.question_id && r?.selected_option_id) {
            aMap[String(r.question_id)] = String(r.selected_option_id);
          }
        }

        // Load understood state separately — graceful: fails silently if
        // migration_understood.sql hasn't been run yet.
        const understoodMap: Record<string, boolean> = {};
        try {
          const { data: uData } = await supabase
            .from("study_attempt_answers")
            .select("question_id,understood")
            .eq("attempt_id", attemptId)
            .eq("understood", true);
          for (const r of (uData ?? []) as any[]) {
            if (r?.question_id) understoodMap[String(r.question_id)] = true;
          }
        } catch {
          // Column doesn't exist yet — run migration_understood.sql in Supabase
        }

        // Restore local flags
        let localFlags: Record<string, boolean> = {};
        try {
          const raw = window.localStorage.getItem(flagsKey);
          if (raw) localFlags = JSON.parse(raw);
        } catch { /* ignore */ }

        // Pre-open explanations for wrong answers
        const expSeed: Record<string, boolean> = {};
        for (const q of qs) {
          const qid = String(q.id);
          const chosenId = aMap[qid];
          if (!chosenId) continue;
          const chosen = (grouped[qid] ?? []).find((x) => x.id === chosenId);
          if (chosen && !chosen.is_correct) expSeed[qid] = true;
        }

        // Previous attempt score
        let prevPctValue: number | null = null;
        if (prevRes.data?.score != null && prevRes.data?.total_questions && prevRes.data.total_questions > 0) {
          prevPctValue = Math.round((prevRes.data.score / prevRes.data.total_questions) * 100);
        }

        if (!cancelled) {
          setAttempt(att as any);
          setSetMeta(setRes.data as any);

          const normalizedQs: QuestionRow[] = qs.map((q) => ({
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
          setUnderstood(understoodMap);
          setPrevPct(prevPctValue);

          // Default selected: first wrong → first unanswered → first question
          const firstWrong = normalizedQs.find((qq) => {
            const chosen = (grouped[qq.id] ?? []).find((x) => x.id === aMap[qq.id]);
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

    return () => { cancelled = true; };
  }, [attemptId, router, flagsKey]);

  // Persist flags to localStorage
  useEffect(() => {
    try { window.localStorage.setItem(flagsKey, JSON.stringify(flagged)); }
    catch { /* ignore */ }
  }, [flagged, flagsKey]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const derived = useMemo(() => {
    let answered = 0, correct = 0, wrong = 0, unanswered = 0;
    const wrongIds: string[] = [], unansweredIds: string[] = [];

    for (const q of questions) {
      const chosenId = answers[q.id];
      const opts = optionsByQ[q.id] ?? [];
      if (!chosenId) { unanswered++; unansweredIds.push(q.id); continue; }
      answered++;
      const chosen = opts.find((o) => o.id === chosenId);
      if (chosen?.is_correct) correct++;
      else { wrong++; wrongIds.push(q.id); }
    }

    const flaggedIds = questions.filter((q) => !!flagged[q.id]).map((q) => q.id);
    const understoodIds = questions.filter((q) => !!understood[q.id]).map((q) => q.id);

    return { total: questions.length, answered, correct, wrong, unanswered, wrongIds, unansweredIds, flaggedIds, understoodIds };
  }, [questions, answers, optionsByQ, flagged, understood]);

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

  const selected = useMemo(() =>
    selectedQ ? questions.find((q) => q.id === selectedQ) ?? null : null,
    [selectedQ, questions]
  );

  const selectedOpts = selected ? optionsByQ[selected.id] ?? [] : [];
  const chosenId = selected ? answers[selected.id] : undefined;
  const chosenOpt = selected ? selectedOpts.find((o) => o.id === chosenId) ?? null : null;
  const correctOpt = selected ? selectedOpts.find((o) => o.is_correct) ?? null : null;
  const isWrong = Boolean(chosenId && chosenOpt && !chosenOpt.is_correct);
  const isUnanswered = Boolean(selected && !chosenId);

  // ── Handlers ─────────────────────────────────────────────────────────────────

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

  function goToQ(qid: string) {
    setSelectedQ(qid);
    setPaletteOpen(false);
    setMobileTab("question");
  }

  function toggleFlag(qid: string) {
    setFlagged((p) => ({ ...p, [qid]: !p[qid] }));
  }

  function toggleExplanation(qid: string) {
    setExpOpen((p) => ({ ...p, [qid]: !p[qid] }));
  }

  async function toggleUnderstood(qid: string) {
    const next = !understood[qid];
    // Optimistic update
    setUnderstood((p) => ({ ...p, [qid]: next }));
    setUnderstoodSaving((p) => ({ ...p, [qid]: true }));

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("study_attempt_answers")
        .update({ understood: next } as any)
        .eq("attempt_id", attemptId)
        .eq("question_id", qid)
        .eq("user_id", uid);

      // Silently ignore column-not-found errors (migration not yet run)
      if (error && !error.message?.includes("understood")) throw error;
    } catch (e: any) {
      // Don't rollback if it's just the column missing — state stays optimistic
      // until migration is applied. For real auth/network errors, rollback.
      if (!e?.message?.includes("understood")) {
        setUnderstood((p) => ({ ...p, [qid]: !next }));
      }
    } finally {
      setUnderstoodSaving((p) => ({ ...p, [qid]: false }));
    }
  }

  function retryWrong() {
    if (!setMeta) return;
    try {
      window.localStorage.setItem(
        retryKey,
        JSON.stringify({
          attemptId, setId: setMeta.id,
          questionIds: derived.wrongIds,
          createdAt: Date.now(),
        })
      );
    } catch { /* ignore */ }
    router.push(
      `/study/practice/${encodeURIComponent(setMeta.id)}?retry=wrong&fromAttempt=${encodeURIComponent(attemptId)}`
    );
  }

  // ── Loading / error states ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 pb-28 md:pb-6">
        <Card className="rounded-3xl">
          <div className="flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading review…
          </div>
        </Card>
      </div>
    );
  }

  if (err || !attempt || !setMeta) {
    return (
      <div className="space-y-4 pb-28 md:pb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <EmptyState
          title="Couldn't open review"
          description={err ?? "Missing data"}
          icon={<AlertTriangle className="h-5 w-5" />}
          action={
            <Link
              href="/study/history"
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
            >
              Back to history <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      </div>
    );
  }

  const { pct, grade } = scoreGrade(derived.correct, derived.total);
  const headerCode = normalize(String(setMeta.course_code ?? "")).toUpperCase();
  const scoreDiff = attempt.score != null && attempt.total_questions && attempt.total_questions > 0 && prevPct != null
    ? pct - prevPct
    : null;

  return (
    <div className="space-y-4 pb-28 md:pb-6">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/study/practice/${encodeURIComponent(setMeta.id)}?attempt=${encodeURIComponent(attempt.id)}`}
            className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
          >
            <RefreshCcw className="h-4 w-4" />
            Open attempt
          </Link>
          <Link
            href={`/study/practice/${encodeURIComponent(setMeta.id)}`}
            className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2 text-sm font-extrabold text-foreground no-underline hover:opacity-90"
          >
            Retry set
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* ── Score summary card ───────────────────────────────────────────────── */}
      <Card className="rounded-3xl">
        {/* Title + badges */}
        <div className="flex items-start gap-4">
          <ScoreRingLg pct={pct} grade={grade} />

          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold tracking-tight text-foreground">
              {normalize(String(setMeta.title ?? "Practice"))}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {headerCode ? (
                <Link
                  href={`/study/courses/${encodeURIComponent(headerCode)}`}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-extrabold text-foreground no-underline hover:bg-secondary/50"
                >
                  {headerCode}
                </Link>
              ) : null}
              {setMeta.level ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {String(setMeta.level)}L
                </span>
              ) : null}
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-extrabold",
                  attempt.status === "submitted"
                    ? "border-emerald-300/40 bg-emerald-100/30 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
                    : "border-amber-300/40 bg-amber-100/30 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
                )}
              >
                {attempt.status === "submitted" ? "Submitted" : "In progress"}
              </span>
            </div>

            {/* vs previous attempt */}
            {scoreDiff != null && scoreDiff !== 0 ? (
              <div
                className={cn(
                  "mt-2 inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5 text-xs font-extrabold",
                  scoreDiff > 0
                    ? "border border-emerald-300/40 bg-emerald-100/30 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
                    : "border border-rose-300/40 bg-rose-100/30 text-rose-800 dark:bg-rose-950/20 dark:text-rose-300"
                )}
              >
                {scoreDiff > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {scoreDiff > 0 ? "+" : ""}{scoreDiff}% vs your last attempt on this set
              </div>
            ) : null}
          </div>
        </div>

        {/* Quick stats row */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { label: "Wrong", value: derived.wrong, danger: true },
            { label: "Skipped", value: derived.unanswered, warn: true },
            { label: "Time", value: fmtDuration(attempt.time_spent_seconds) },
            { label: "Flagged", value: derived.flaggedIds.length },
          ].map(({ label, value, danger, warn }) => (
            <div key={label} className="rounded-2xl border border-border bg-background p-2 text-center">
              <p className={cn(
                "text-base font-extrabold tabular-nums",
                danger && derived.wrong > 0 ? "text-rose-700 dark:text-rose-400" : "",
                warn && derived.unanswered > 0 ? "text-amber-700 dark:text-amber-400" : "",
                !danger && !warn ? "text-foreground" : "",
              )}>
                {value}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Submitted on + tab filters + actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {attempt.submitted_at ? (
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {fmtDate(attempt.submitted_at)}
            </span>
          ) : null}

          <ReviewChip active={tab === "wrong"} onClick={() => setTab("wrong")}>
            Wrong ({derived.wrong})
          </ReviewChip>
          <ReviewChip active={tab === "flagged"} onClick={() => setTab("flagged")}>
            Flagged ({derived.flaggedIds.length})
          </ReviewChip>
          <ReviewChip active={tab === "unanswered"} onClick={() => setTab("unanswered")}>
            Skipped ({derived.unanswered})
          </ReviewChip>
          <ReviewChip active={tab === "all"} onClick={() => setTab("all")}>
            All ({derived.total})
          </ReviewChip>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          >
            Retry wrong
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </Card>

      {/* ── Mobile tab switcher (hidden on lg+) ─────────────────────────────── */}
      <div className="lg:hidden">
        <div className="flex gap-1 rounded-2xl border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => setMobileTab("question")}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-sm font-extrabold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mobileTab === "question"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Question
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("list")}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-sm font-extrabold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mobileTab === "list"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "wrong" ? `Mistakes (${derived.wrong})` : `Questions (${filteredList.length})`}
          </button>
        </div>
      </div>

      {/* ── Main two-column layout ───────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">

        {/* LEFT — Question list */}
        <Card
          className={cn(
            "rounded-3xl",
            // Mobile: show only when on "list" tab
            mobileTab === "list" ? "block" : "hidden lg:block"
          )}
        >
          <p className="text-sm font-extrabold text-foreground">Questions</p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            Tap a question to review it. Wrong answers auto-open the explanation.
          </p>

          {filteredList.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                variant="compact"
                title="Nothing here"
                description="No questions match this filter."
                icon={<AlertTriangle className="h-5 w-5" />}
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
                const isUnderstood = !!understood[qid];

                return (
                  <button
                    key={qid}
                    type="button"
                    onClick={() => { setSelectedQ(qid); setMobileTab("question"); }}
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
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-extrabold">
                        {flagged[qid] ? (
                          <span className="rounded-full border border-border bg-background px-2 py-0.5">🚩</span>
                        ) : null}
                        {isUnderstood ? (
                          <span className="rounded-full border border-emerald-300/40 bg-emerald-100/30 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                            ✓ Understood
                          </span>
                        ) : null}
                        {!chosenId ? (
                          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground">Skipped</span>
                        ) : ok ? (
                          <span className="rounded-full border border-emerald-300/40 bg-emerald-100/30 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">Correct</span>
                        ) : (
                          <span className="rounded-full border border-rose-300/40 bg-rose-100/30 px-2 py-0.5 text-rose-800 dark:bg-rose-950/20 dark:text-rose-300">Wrong</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-0.5 shrink-0">
                      {!chosenId ? (
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-background text-sm text-muted-foreground">—</span>
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
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BookOpen className="h-4 w-4" />
            View all attempts
          </Link>
        </Card>

        {/* RIGHT — Question detail */}
        <Card
          className={cn(
            "rounded-3xl",
            mobileTab === "question" ? "block" : "hidden lg:block"
          )}
        >
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select a question to review.</p>
          ) : (
            <>
              {/* Question header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-muted-foreground">
                    Question {selectedIndexInAll + 1} of {derived.total}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-base font-semibold text-foreground leading-relaxed">
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
                >
                  {flagged[selected.id] ? <FlagOff className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
                  {flagged[selected.id] ? "Flagged" : "Flag"}
                </button>
              </div>

              {/* Options */}
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
                        isCorrect
                          ? "border-emerald-300/40 bg-emerald-100/30 dark:bg-emerald-950/20"
                          : showWrongChosen
                          ? "border-rose-300/40 bg-rose-100/30 dark:bg-rose-950/20"
                          : "border-border bg-background"
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
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
                        {isCorrect ? (
                          <p className="mt-1 text-xs font-extrabold text-emerald-600">Correct answer</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Explanation */}
              <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                <button
                  type="button"
                  onClick={() => toggleExplanation(selected.id)}
                  className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline-none"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-foreground">Explanation</p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      {isWrong
                        ? "Auto-opened because your answer was wrong."
                        : "Tap to expand."}
                    </p>
                  </div>
                  {expOpen[selected.id] ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>

                {expOpen[selected.id] ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm font-semibold text-muted-foreground leading-relaxed">
                    {normalize(selected.explanation ?? "No explanation provided.")}
                  </p>
                ) : null}
              </div>

              {/* Mark as understood */}
              {(isWrong || isUnanswered) ? (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggleUnderstood(selected.id)}
                    disabled={understoodSaving[selected.id]}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-extrabold transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      understood[selected.id]
                        ? "border-emerald-300/40 bg-emerald-100/30 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
                        : "border-border bg-background text-foreground hover:bg-secondary/50",
                      understoodSaving[selected.id] ? "opacity-60" : ""
                    )}
                  >
                    {understood[selected.id] ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Got it
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 opacity-40" />
                        Mark as understood
                      </>
                    )}
                  </button>

                  {/* Quick fix */}
                  {(isWrong || isUnanswered) && correctOpt ? (
                    <div className="text-right text-xs text-muted-foreground">
                      Correct:{" "}
                      <span className="font-extrabold text-foreground">
                        {normalize(correctOpt.text)}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Retry actions for wrong/unanswered */}
              {(isWrong || isUnanswered) && !understood[selected.id] ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={retryWrong}
                    disabled={derived.wrongIds.length === 0}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-extrabold transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      derived.wrongIds.length === 0
                        ? "border border-border/60 bg-background text-muted-foreground opacity-60"
                        : "bg-secondary text-foreground hover:opacity-90"
                    )}
                  >
                    Retry wrong ({derived.wrongIds.length})
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <Link
                    href={`/study/practice/${encodeURIComponent(setMeta.id)}`}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
                  >
                    Retry full set
                    <RefreshCcw className="h-4 w-4" />
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>

      {/* ── Sticky bottom nav (mobile) ───────────────────────────────────────── */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 px-4"
        style={{ paddingBottom: APP_BOTTOM_NAV_H }}
        aria-label="Review controls"
      >
        <div className="pb-3">
          <div className="rounded-3xl border border-border bg-background/90 p-3 shadow-lg backdrop-blur">
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
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  aria-label={flagged[selected.id] ? "Unflag" : "Flag"}
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

      {/* Question palette */}
      <QuestionPalette
        open={paletteOpen}
        questions={questions}
        answers={answers}
        optionsByQ={optionsByQ}
        flagged={flagged}
        selectedQ={selectedQ}
        tab={tab}
        onSelectQ={goToQ}
        onSetTab={setTab}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}