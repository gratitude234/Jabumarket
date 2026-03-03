"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export type QuizSet = {
  id: string;
  title: string;
  description: string | null;
  course_code: string | null;
  level: string | null;
  time_limit_minutes: number | null;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  explanation: string | null;
  position: number | null;
};

export type QuizOption = {
  id: string;
  question_id: string;
  text: string;
  is_correct: boolean;
  position: number | null;
};

export type ReviewTab = "all" | "wrong" | "flagged" | "unanswered";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function normalize(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

export function msToClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function safePushRecent(item: {
  id: string;
  title: string;
  course_code?: string;
  when?: string;
  href?: string;
}) {
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

type LatestRestore = {
  answers?: Record<string, string>;
  flagged?: Record<string, boolean>;
};

function readLocalDraft(key: string): LatestRestore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as any;
    return {
      answers: parsed?.answers && typeof parsed.answers === "object" ? parsed.answers : undefined,
      flagged: parsed?.flagged && typeof parsed.flagged === "object" ? parsed.flagged : undefined,
    };
  } catch {
    return {};
  }
}

export function usePracticeEngine({
  setId,
  attemptFromUrl,
}: {
  setId: string;
  attemptFromUrl: string;
}) {
  const router = useRouter();

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

  // Finalize
  const [finalizing, setFinalizing] = useState(false);
  const finalizedRef = useRef(false);

  // Review
  const [reviewTab, setReviewTab] = useState<ReviewTab>("all");

  // Local draft autosave (backup if DB upsert fails)
  const draftKey = useMemo(
    () => `jabu:practiceDraft:${setId}:${attemptId ?? "noattempt"}`,
    [setId, attemptId]
  );

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
      setReviewTab("all");

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
              if (r?.question_id && r?.selected_option_id)
                amap[String(r.question_id)] = String(r.selected_option_id);
            });

            // Merge local draft
            const local = readLocalDraft(`jabu:practiceDraft:${setId}:${effectiveAttemptId}`);
            if (local.answers) Object.assign(amap, local.answers);

            if (!cancelled) {
              setAnswers(amap);
              if (local.flagged) setFlagged(local.flagged);
            }
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
            router.replace(
              `/study/practice/${encodeURIComponent(setId)}?attempt=${encodeURIComponent(
                effectiveAttemptId
              )}`
            );
          }
        }

        // Timer deadline based on startedAtMs
        const mins =
          typeof (setRes.data as any)?.time_limit_minutes === "number"
            ? (setRes.data as any).time_limit_minutes
            : null;

        if (mins && mins > 0) {
          const deadline = startedAtMs + mins * 60_000;
          deadlineRef.current = deadline;
          setTimeLeftMs(deadline - Date.now());
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
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({ answers, flagged, updatedAt: Date.now() })
      );
    } catch {
      // ignore
    }
  }, [answers, flagged, draftKey, setId, attemptId]);

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

      // Avoid breaking if optional columns don't exist.
      const attemptUpdate: any = {
        status: "submitted",
        submitted_at: submittedIso,
        score: correct,
        total_questions: total,
        time_spent_seconds: timeSpent,
      };

      await supabase
        .from("study_practice_attempts")
        .update(attemptUpdate)
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

  return {
    // data
    meta,
    questions,
    optionsByQ,
    loading,
    err,

    // state
    idx,
    setIdx,
    current,
    opts,
    answers,
    flagged,
    submitted,
    setSubmitted,
    attemptId,
    timeLeftMs,

    // review
    reviewTab,
    setReviewTab,
    reviewItems,
    stats,
    finalizing,

    // actions
    choose,
    toggleFlag,
    goToQuestion,
    restart,
    finalizeAttempt,
  };
}
