"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag } from "lucide-react";
import { Card } from "../../../_components/StudyUI";
import OptionCard from "../parts/OptionCard";
import ResponsePanel from "../parts/ResponsePanel";
import { cn, normalize, QuizOption, QuizQuestion } from "../usePracticeEngine";

function readAutoReveal() {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem("jabu:practiceAutoReveal");
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    // ignore
  }
  return true;
}

function HintChip({ tone, children }: { tone: "good" | "bad" | "neutral"; children: React.ReactNode }) {
  const cls =
    tone === "good"
      ? "border-emerald-300/40 bg-emerald-100/30 dark:bg-emerald-950/20"
      : tone === "bad"
      ? "border-rose-300/40 bg-rose-100/30 dark:bg-rose-950/20"
      : "border-border bg-background";
  return (
    <span className={cn("rounded-full border px-2 py-1 text-[10px] font-extrabold text-foreground", cls)}>
      {children}
    </span>
  );
}

export default function InteractiveRunner({
  idx,
  total,
  current,
  opts,
  answers,
  flagged,
  submitted,
  onChoose,
  onToggleFlag,
  onNext,
}: {
  idx: number;
  total: number;
  current: QuizQuestion;
  opts: QuizOption[];
  answers: Record<string, string>;
  flagged: Record<string, boolean>;
  submitted: boolean;
  onChoose: (qid: string, oid: string) => void;
  onToggleFlag: (qid: string) => void;
  onNext: () => void;
}) {
  const chosenId = answers[current.id] ?? null;

  const [autoReveal, setAutoReveal] = useState(true);
  useEffect(() => {
    setAutoReveal(readAutoReveal());
  }, []);

  function toggleAuto(v: boolean) {
    setAutoReveal(v);
    try {
      window.localStorage.setItem("jabu:practiceAutoReveal", v ? "1" : "0");
    } catch {
      // ignore
    }
  }

  const hasAnswered = !!chosenId;
  const isLast = idx >= total - 1;

  const correct = useMemo(() => opts.find((o) => o.is_correct) ?? null, [opts]);
  const chosen = useMemo(() => (chosenId ? opts.find((o) => o.id === chosenId) ?? null : null), [chosenId, opts]);

  const reveal = hasAnswered && autoReveal;

  const state = !chosen ? "idle" : chosen.is_correct ? "correct" : "wrong";

  return (
    <div className="space-y-3">
      <Card className="rounded-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-muted-foreground">
              Question {idx + 1} of {total}
            </p>

            <p className="mt-2 whitespace-pre-wrap text-base font-semibold leading-relaxed text-foreground">
              {normalize(String(current?.prompt ?? ""))}
            </p>

            {/* Micro helper text (only while answering) */}
            {!hasAnswered ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Tap an option to get instant feedback. You can still change your answer before Next.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => onToggleFlag(current.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-extrabold",
              flagged[current.id]
                ? "border-border bg-secondary text-foreground"
                : "border-border bg-background text-foreground hover:bg-secondary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              submitted ? "opacity-60" : ""
            )}
            title="Flag this question"
            aria-label="Flag this question"
            disabled={submitted}
          >
            <Flag className="h-4 w-4" /> {flagged[current.id] ? "Flagged" : "Flag"}
          </button>
        </div>

        {/* Options */}
        <div className="mt-4 grid gap-2">
          {opts.map((o, i) => {
            const isChosen = answers[current.id] === o.id;
            const label = String.fromCharCode(65 + i);

            // Right-side chip becomes “redundant” once OptionCard itself shows color,
            // but chips still help clarity on small screens.
            const rightHint =
              reveal ? (
                o.is_correct ? (
                  isChosen ? (
                    <HintChip tone="good">Correct</HintChip>
                  ) : (
                    <HintChip tone="neutral">Answer</HintChip>
                  )
                ) : isChosen ? (
                  <HintChip tone="bad">Your pick</HintChip>
                ) : null
              ) : null;

            return (
              <OptionCard
                key={o.id}
                label={label}
                text={String(o.text ?? "")}
                chosen={isChosen}
                disabled={submitted}
                onClick={() => onChoose(current.id, o.id)}
                rightHint={rightHint}
                reveal={reveal}
                isCorrect={!!o.is_correct}
              />
            );
          })}
        </div>

        {/* Status + Next */}
        {hasAnswered ? (
          <div className="mt-4 rounded-2xl border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-muted-foreground">STATUS</p>

                <p className="mt-1 text-sm font-extrabold text-foreground">
                  {state === "correct" ? "✅ Correct" : state === "wrong" ? "❌ Not quite" : ""}
                </p>

                {state === "wrong" && correct ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Correct answer:{" "}
                    <span className="font-semibold text-foreground">{normalize(String(correct.text ?? ""))}</span>
                  </p>
                ) : null}

                {reveal ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Tip: You can still tap another option to change your answer before moving on.
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onNext}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground",
                  "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  submitted ? "opacity-60" : ""
                )}
                disabled={submitted}
              >
                {isLast ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Explanation / auto-reveal control lives here */}
      <ResponsePanel
        explanation={current.explanation}
        chosenOptionId={chosenId}
        options={opts}
        autoReveal={autoReveal}
        onToggleAutoReveal={toggleAuto}
      />
    </div>
  );
}