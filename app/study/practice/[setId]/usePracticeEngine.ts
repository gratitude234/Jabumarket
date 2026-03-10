"use client";
import { cn, normalize, msToClock, safePushRecent } from "@/lib/utils";
import type { QuizSet, QuizQuestion, QuizOption, ReviewTab } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

  // IMPORTANT UX: when we add ?attempt= to the URL (router.replace), we should NOT re-run the whole loader.
  // Capture the initial attempt (if any) only once for this page load.
  const initialAttemptRef = useRef<string | null>(attemptFromUrl || null);

  // Cache userId from the initial auth call so choose() and finalizeAttempt()
  // never need to call supabase.auth.getUser() again during a session.
  const userIdRef = useRef<string | null>(null);

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

        // ─── PHASE 1: fire everything we can in parallel ──────────────────
        // auth, quiz set, questions+options (nested join), and attempt
        // validation (if a URL attempt id exists) all start at the same time.
        // On a slow campus network this cuts initial load from ~4 sequential
        // round trips down to 1.

        const setReq = supabase
          .from("study_quiz_sets")
          .select("id,title,description,course_code,level,time_limit_minutes")
          .eq("id", setId)
          .maybeSingle();

        // Fetch questions AND their options in one query via PostgREST nested
        // select — eliminates the previous options waterfall step entirely.
        const qReq = supabase
          .from("study_quiz_questions")
          .select(
            "id,prompt,explanation,position," +
            "study_quiz_options(id,question_id,text,is_correct,position)"
          )
          .eq("set_id", setId)
          .order("position", { ascending: true });

        // Validate the attempt from the URL (if present) in the same wave.
        const attValidateReq = initialAttemptRef.current
          ? supabase
              .from("study_practice_attempts")
              .select("id,set_id,status,started_at")
              .eq("id", initialAttemptRef.current)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null });

        const [authRes, setRes, qRes, attValidateRes] = await Promise.all([
          supabase.auth.getUser(),
          setReq,
          qReq,
          attValidateReq,
        ]);

        const user = authRes.data?.user ?? null;
        userIdRef.current = user?.id ?? null;

        if (setRes.error) throw setRes.error;
        if (!setRes.data) throw new Error("Practice set not found");
        if (qRes.error) throw qRes.error;

        // Unpack the nested options from each question row
        const qData = (qRes.data ?? []) as any[];
        const grouped: Record<string, QuizOption[]> = {};
        for (const q of qData) {
          const qid = String(q.id);
          const rawOpts: any[] = Array.isArray(q.study_quiz_options)
            ? q.study_quiz_options
            : [];
          grouped[qid] = rawOpts
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((o) => ({
              id: String(o.id),
              question_id: qid,
              text: String(o.text ?? ""),
              is_correct: Boolean(o.is_correct),
              position: typeof o.position === "number" ? o.position : null,
            }));
        }

        // Strip nested options key so qData shape matches QuizQuestion type
        const cleanQData: QuizQuestion[] = qData.map(({ study_quiz_options: _opts, ...rest }) => ({
          id: String(rest.id),
          prompt: String(rest.prompt ?? ""),
          explanation: rest.explanation ?? null,
          position: typeof rest.position === "number" ? rest.position : null,
        }));

        // ─── PHASE 2: attempt restore / create ───────────────────────────
        // Attempt creation needs userId (from Phase 1 auth).
        // Answers fetch needs the validated attemptId (from Phase 1 attValidate).
        // These are the only true sequential dependencies left.

        let effectiveAttemptId: string | null = initialAttemptRef.current || null;
        let startedAtMs = Date.now();

        if (user && initialAttemptRef.current) {
          // Use the already-validated attempt data from Phase 1
          const attData = !attValidateRes.error ? (attValidateRes as any).data : null;

          if (attData?.id && String(attData.set_id) === setId) {
            effectiveAttemptId = String(attData.id);
            const st = new Date(String(attData.started_at)).getTime();
            startedAtMs = Number.isFinite(st) ? st : Date.now();

            // Answers are the only remaining sequential fetch — they need
            // the confirmed attemptId before we can request them.
            const ansRes = await supabase
              .from("study_attempt_answers")
              .select("question_id,selected_option_id")
              .eq("attempt_id", effectiveAttemptId);

            const amap: Record<string, string> = {};
            (ansRes.data ?? []).forEach((r: any) => {
              if (r?.question_id && r?.selected_option_id)
                amap[String(r.question_id)] = String(r.selected_option_id);
            });

            // Merge local draft (localStorage wins for latest unsaved answers)
            const local = readLocalDraft(`jabu:practiceDraft:${setId}:${effectiveAttemptId}`);
            if (local.answers) Object.assign(amap, local.answers);

            if (!cancelled) {
              setAnswers(amap);
              if (local.flagged) setFlagged(local.flagged);
            }
          }
        }

        // Create new attempt if none was provided via URL
        if (user && !initialAttemptRef.current) {
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
        setQuestions(cleanQData);
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
  }, [setId, router]);

  // Sync URL with attempt id (without re-loading data)
  useEffect(() => {
    if (!attemptId) return;
    if (attemptFromUrl) return;

    // Avoid a Next.js route transition (and a second loader flash) by updating the URL
    // without triggering navigation.
    if (typeof window !== "undefined") {
      const next = `/study/practice/${encodeURIComponent(setId)}?attempt=${encodeURIComponent(attemptId)}`;
      window.history.replaceState(null, "", next);
    }
  }, [attemptId, attemptFromUrl, setId]);

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
        const userId = userIdRef.current;
        if (!userId || !attemptId) return;
        await supabase.from("study_attempt_answers").upsert(
          {
            attempt_id: attemptId,
            user_id: userId,
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
      const userId = userIdRef.current;
      if (!userId || !attemptId) {
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
        .eq("user_id", userId);

      // Update daily activity/streak (ignore if missing)
      const activityDate = submittedIso.slice(0, 10);
      await supabase
        .from("study_daily_activity")
        .upsert(
          {
            user_id: userId,
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