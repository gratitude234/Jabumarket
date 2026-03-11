// [setId]/parts/ResponsePanel.tsx
"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { Card } from "../../../_components/StudyUI";
import { cn, normalize } from "@/lib/utils";
import type { QuizOption } from "@/lib/types";

export default function ResponsePanel({
  explanation,
  chosenOptionId,
  options,
  autoReveal,
  onToggleAutoReveal,
}: {
  explanation: string | null | undefined;
  chosenOptionId: string | null | undefined;
  options: QuizOption[];
  autoReveal: boolean;
  onToggleAutoReveal: (v: boolean) => void;
}) {
  const chosen = useMemo(
    () => (chosenOptionId ? options.find((o) => o.id === chosenOptionId) ?? null : null),
    [chosenOptionId, options]
  );

  const correct = useMemo(() => options.find((o) => o.is_correct) ?? null, [options]);

  const hasAnswered = !!chosen;
  const isCorrect = !!chosen?.is_correct;
  const hasExplanation = !!(explanation && String(explanation).trim().length > 0);

  // Default: keep things compact on mobile.
  const [open, setOpen] = useState(false);

  // If they have answered and there *is* an explanation, gently encourage opening it once.
  // (No localStorage: keep it simple + predictable.)
  const summary = !hasAnswered
    ? "Answer to unlock feedback and explanation."
    : isCorrect
    ? "Nice. Want the reason behind it?"
    : "Don’t worry—review the correct answer and why.";

  const headerTone = !hasAnswered
    ? "neutral"
    : isCorrect
    ? "good"
    : "bad";

  const headerClass =
    headerTone === "good"
      ? "border-emerald-300/40 bg-emerald-100/30 dark:bg-emerald-950/20"
      : headerTone === "bad"
      ? "border-rose-300/40 bg-rose-100/30 dark:bg-rose-950/20"
      : "border-border bg-background";

  const Icon =
    !hasAnswered ? Lightbulb : isCorrect ? CheckCircle2 : XCircle;

  return (
    <Card className="rounded-3xl">
      {/* Header */}
      <div className={cn("rounded-3xl border p-3", headerClass)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className={cn(
                "mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-background",
                headerTone === "good"
                  ? "border-emerald-300/40 text-emerald-700 dark:text-emerald-200"
                  : headerTone === "bad"
                  ? "border-rose-300/40 text-rose-700 dark:text-rose-200"
                  : "border-border text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
            </span>

            <div className="min-w-0">
              <p className="text-sm font-extrabold text-foreground">
                {!hasAnswered ? "Feedback" : isCorrect ? "Correct" : "Not quite"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>
            </div>
          </div>

          {/* Auto reveal toggle */}
          <button
            type="button"
            onClick={() => onToggleAutoReveal(!autoReveal)}
            className={cn(
              "shrink-0 inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-extrabold",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              autoReveal
                ? "border-border bg-secondary text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
            title="Toggle instant feedback"
            aria-label="Toggle instant feedback"
          >
            <Sparkles className="h-4 w-4" />
            {autoReveal ? "Auto" : "Manual"}
          </button>
        </div>

        {/* Key lines (only after answered) */}
        {hasAnswered ? (
          <div className="mt-3 grid gap-2">
            <div className="rounded-2xl border border-border bg-background p-3">
              <p className="text-[11px] font-extrabold text-muted-foreground">YOUR ANSWER</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {normalize(String(chosen?.text ?? ""))}
              </p>
            </div>

            {!isCorrect && correct ? (
              <div className="rounded-2xl border border-border bg-background p-3">
                <p className="text-[11px] font-extrabold text-muted-foreground">CORRECT ANSWER</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {normalize(String(correct.text ?? ""))}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Explanation toggle */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {hasExplanation ? "Explanation available" : "No explanation for this question"}
          </p>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={!hasExplanation}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-extrabold",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              hasExplanation
                ? "border-border bg-background text-foreground hover:bg-secondary/50"
                : "border-border/60 bg-background text-muted-foreground opacity-60 cursor-not-allowed"
            )}
            aria-expanded={open}
          >
            {open ? (
              <>
                Hide <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Show <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Explanation body */}
      {open && hasExplanation ? (
        <div className="px-4 pb-4 pt-3">
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="text-[11px] font-extrabold text-muted-foreground">WHY</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {normalize(String(explanation ?? ""))}
            </p>
          </div>

          {/* Small helper for manual mode */}
          {!autoReveal ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Manual mode tip: select an option, then open this panel to review the explanation.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}