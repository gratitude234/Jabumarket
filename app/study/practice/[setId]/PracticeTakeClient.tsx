// [setId]/PracticeTakeClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  LayoutGrid,
  Loader2,
  RefreshCcw,
  Send,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, EmptyState } from "../../_components/StudyUI";
import { cn, normalize, usePracticeEngine } from "./usePracticeEngine";
import TopBar, { type PracticeMode } from "./parts/TopBar";
import MetaCard from "./parts/MetaCard";
import ExamRunner from "./runners/ExamRunner";
import InteractiveRunner from "./runners/InteractiveRunner";
import PaletteSheet from "./sheets/PaletteSheet";
import SubmitSheet from "./sheets/SubmitSheet";
import TimeUpSheet from "./sheets/TimeUpSheet";

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

function getPreferredMode(): PracticeMode {
  if (typeof window === "undefined") return "interactive";
  try {
    const raw = window.localStorage.getItem("jabu:practiceMode") as PracticeMode | null;
    if (raw === "exam" || raw === "interactive") return raw;
  } catch {
    // ignore
  }
  return "interactive";
}

export default function PracticeTakeClient() {
  const router = useRouter();
  const params = useParams<{ setId: string }>();
  const sp = useSearchParams();

  const setId = String(params?.setId ?? "");
  const attemptFromUrl = String(sp.get("attempt") ?? "").trim();
  const urlMode = (sp.get("mode") ?? "") as PracticeMode | "";
  const defaultModeRef = useRef<PracticeMode>("interactive");
  const [defaultMode, setDefaultMode] = useState<PracticeMode>("interactive");

  useEffect(() => {
    const pref = getPreferredMode();
    defaultModeRef.current = pref;
    setDefaultMode(pref);
  }, []);

  const mode: PracticeMode = urlMode === "exam" || urlMode === "interactive" ? urlMode : defaultMode;

  const engine = usePracticeEngine({ setId, attemptFromUrl });

  const {
    meta,
    questions,
    loading,
    err,
    idx,
    setIdx,
    current,
    opts,
    answers,
    flagged,
    submitted,
    setSubmitted,
    timeLeftMs,
    reviewTab,
    setReviewTab,
    reviewItems,
    stats,
    finalizing,
    choose,
    toggleFlag,
    goToQuestion,
    restart,
    finalizeAttempt,
  } = engine;

  // UI
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [timeUpOpen, setTimeUpOpen] = useState(false);

  // Meta / info panel: show initially, then auto-collapse once user starts
  const [infoOpen, setInfoOpen] = useState(true);
  const autoCollapsedRef = useRef(false);

  useEffect(() => {
    if (autoCollapsedRef.current) return;
    if (submitted) return;
    if (stats.answered > 0 || idx > 0) {
      autoCollapsedRef.current = true;
      setInfoOpen(false);
    }
  }, [stats.answered, idx, submitted]);

  const total = stats.total;
  const isLast = questions.length > 0 && idx >= questions.length - 1;

  const nextLabel = useMemo(() => (isLast ? "Finish" : "Next"), [isLast]);

  // Auto-open time up sheet when timer hits zero.
  const prevLeft = useRef<number | null>(null);
  useEffect(() => {
    if (submitted) return;
    if (typeof timeLeftMs !== "number") return;
    const was = prevLeft.current;
    prevLeft.current = timeLeftMs;
    if (was !== null && was > 0 && timeLeftMs <= 0) {
      setTimeUpOpen(true);
      setSubmitted(true);
    }
  }, [timeLeftMs, submitted, setSubmitted]);

  // When submitted changes to true, finalize reliably
  useEffect(() => {
    if (!submitted) return;
    void finalizeAttempt(timeUpOpen ? "timeup" : "manual");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  // Keyboard shortcuts (desktop power)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!questions.length || !current) return;
    if (submitted) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
  }, [questions.length, current?.id, submitted, opts, choose, setIdx, toggleFlag]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4">
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
      <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Back
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-40 pt-3">
      <TopBar
        timeLeftMs={timeLeftMs}
        answered={stats.answered}
        total={stats.total}
        flaggedCount={stats.flaggedCount}
        disabled={submitted}
        defaultMode={defaultModeRef.current}
      />

      {/* Collapsible set info */}
      <div className="mt-3">
        <Card className="rounded-3xl">
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            className={cn(
              "w-full rounded-3xl px-4 py-3 text-left",
              "flex items-center justify-between gap-3",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            )}
            aria-expanded={infoOpen}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-background">
                <Info className="h-4 w-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-foreground">Set info</p>
                <p className="text-xs text-muted-foreground truncate">
                  {stats.total} questions • {mode === "exam" ? "Exam mode" : "Interactive mode"}
                </p>
              </div>
            </div>

            <span className="shrink-0 inline-flex items-center gap-2 text-xs font-extrabold text-muted-foreground">
              {infoOpen ? (
                <>
                  Hide <ChevronUp className="h-4 w-4" />
                </>
              ) : (
                <>
                  Show <ChevronDown className="h-4 w-4" />
                </>
              )}
            </span>
          </button>

          {infoOpen ? (
            <div className="px-4 pb-4">
              <MetaCard meta={meta} />
            </div>
          ) : null}
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
                        onClick={() => {
                          goToQuestion(it.index);
                          setPaletteOpen(false);
                          try {
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          } catch {
                            // ignore
                          }
                        }}
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
        <div className="mt-4">
          {mode === "interactive" ? (
            <InteractiveRunner
              idx={idx}
              total={total}
              current={current!}
              opts={opts}
              answers={answers}
              flagged={flagged}
              submitted={submitted}
              onChoose={choose}
              onToggleFlag={toggleFlag}
              onNext={() => {
                if (idx >= questions.length - 1) setSubmitOpen(true);
                else setIdx((v) => Math.min(questions.length - 1, v + 1));
              }}
            />
          ) : (
            <ExamRunner
              idx={idx}
              total={total}
              current={current!}
              opts={opts}
              answers={answers}
              flagged={flagged}
              submitted={submitted}
              onChoose={choose}
              onToggleFlag={toggleFlag}
            />
          )}
        </div>
      )}

      {/* Sticky bottom controls */}
      {questions.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-50">
          <div className="mx-auto w-full max-w-3xl px-4 pb-[calc(12px+env(safe-area-inset-bottom))]">
            <div className="rounded-3xl border border-border bg-background/85 p-3 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIdx((v) => Math.max(0, v - 1))}
                  disabled={submitted || idx === 0}
                  className={cn(
                    "inline-flex items-center justify-center rounded-2xl border px-3 py-2 text-sm font-extrabold",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    submitted || idx === 0
                      ? "border-border/50 bg-background text-muted-foreground opacity-60"
                      : "border-border bg-background text-foreground hover:bg-secondary/50"
                  )}
                >
                  Prev
                </button>

                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground",
                    "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  )}
                  aria-label="Open question palette"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="tabular-nums">{stats.answered}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="tabular-nums">{stats.total}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (submitted) return;
                    if (isLast) setSubmitOpen(true);
                    else setIdx((v) => Math.min(questions.length - 1, v + 1));
                  }}
                  disabled={submitted || idx >= questions.length - 1}
                  className={cn(
                    "inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm font-extrabold",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    submitted
                      ? "bg-secondary/50 text-muted-foreground opacity-60"
                      : "bg-secondary text-foreground hover:opacity-90"
                  )}
                  aria-label={nextLabel}
                >
                  {nextLabel}
                </button>

                {!submitted ? (
                  <button
                    type="button"
                    onClick={() => setSubmitOpen(true)}
                    className="hidden sm:inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Send className="h-4 w-4" /> Submit
                  </button>
                ) : null}
              </div>

              {!submitted ? (
                <div className="mt-2 sm:hidden">
                  <button
                    type="button"
                    onClick={() => setSubmitOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Send className="h-4 w-4" /> Submit
                  </button>
                </div>
              ) : null}

              {submitted ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={restart}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <RefreshCcw className="h-4 w-4" /> Restart
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <PaletteSheet
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        questions={questions}
        activeIndex={idx}
        answers={answers}
        flagged={flagged}
        onJump={(i) => {
          goToQuestion(i);
          setPaletteOpen(false);
        }}
        footer={
          <div className="mt-2 flex flex-wrap gap-2">
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
                <Send className="h-4 w-4" /> Submit
              </button>
            ) : null}
          </div>
        }
      />

      <SubmitSheet
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        answered={stats.answered}
        total={stats.total}
        onSubmit={() => {
          setSubmitOpen(false);
          setSubmitted(true);
        }}
      />

      {/* ✅ Updated call: pass answered/total + restart for best UX */}
      <TimeUpSheet
        open={timeUpOpen}
        onClose={() => setTimeUpOpen(false)}
        finalizing={finalizing}
        answered={stats.answered}
        total={stats.total}
        onReview={() => setTimeUpOpen(false)}
        onRestart={restart}
      />
    </div>
  );
}