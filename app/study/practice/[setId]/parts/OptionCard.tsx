"use client";

import type React from "react";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { cn, normalize } from "../usePracticeEngine";

type Props = {
  label: string;
  text: string;
  chosen: boolean;
  disabled?: boolean;
  onClick: () => void;
  rightHint?: React.ReactNode;

  /**
   * Optional: enables correctness styling (used in Interactive review/reveal flows).
   * - If reveal=true and isCorrect=true -> green “correct” state
   * - If reveal=true and chosen=true and isCorrect=false -> red “wrong” state
   * - If reveal=true and isCorrect=true and chosen=false -> subtle green highlight (correct answer)
   */
  reveal?: boolean;
  isCorrect?: boolean;
};

export default function OptionCard({
  label,
  text,
  chosen,
  disabled,
  onClick,
  rightHint,
  reveal = false,
  isCorrect,
}: Props) {
  const isDisabled = !!disabled;

  const showCorrect = reveal && !!isCorrect;
  const showWrong = reveal && chosen && isCorrect === false;

  // If we're revealing and this option is the correct one but not chosen,
  // show a subtle “this is the correct answer” highlight.
  const showCorrectUnchosen = reveal && !!isCorrect && !chosen;

  const leftIcon = showCorrect ? (
    <CheckCircle2 className="h-5 w-5" />
  ) : showWrong ? (
    <XCircle className="h-5 w-5" />
  ) : chosen ? (
    <CheckCircle2 className="h-5 w-5" />
  ) : (
    <Circle className="h-5 w-5" />
  );

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      aria-label={`Option ${label}`}
      aria-pressed={chosen}
      aria-disabled={isDisabled}
      data-chosen={chosen ? "true" : "false"}
      data-reveal={reveal ? "true" : "false"}
      className={cn(
        // Layout + sizing
        "group relative w-full text-left",
        "rounded-2xl border px-4 py-3",
        "flex items-start gap-3",
        "transition",
        "select-none",

        // Focus / a11y
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",

        // Press feedback
        "active:scale-[0.99]",

        // Base theme
        "bg-background text-foreground border-border",
        !isDisabled && "hover:bg-secondary/50",

        // Selected (no reveal)
        chosen && !reveal && "bg-secondary border-border",

        // Reveal states
        showCorrect && "border-emerald-300/50 bg-emerald-100/30 dark:bg-emerald-950/20",
        showWrong && "border-rose-300/50 bg-rose-100/30 dark:bg-rose-950/20",
        showCorrectUnchosen && "border-emerald-300/40 bg-emerald-50/20 dark:bg-emerald-950/10",

        // Disabled
        isDisabled && "opacity-70 cursor-not-allowed"
      )}
    >
      {/* Left cluster: label chip + icon */}
      <div className="mt-0.5 flex items-center gap-2">
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-xl border text-[11px] font-extrabold",
            "bg-background",
            showCorrect || showCorrectUnchosen
              ? "border-emerald-300/50 text-emerald-700 dark:text-emerald-200"
              : showWrong
              ? "border-rose-300/50 text-rose-700 dark:text-rose-200"
              : chosen
              ? "border-border text-foreground"
              : "border-border text-muted-foreground"
          )}
        >
          {label}
        </span>

        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-xl border",
            "bg-background",
            showCorrect || showCorrectUnchosen
              ? "border-emerald-300/40 text-emerald-700 dark:text-emerald-200"
              : showWrong
              ? "border-rose-300/40 text-rose-700 dark:text-rose-200"
              : chosen
              ? "border-border text-foreground"
              : "border-border text-muted-foreground",
            !isDisabled && "group-hover:bg-secondary/40"
          )}
        >
          {leftIcon}
        </span>
      </div>

      {/* Main text */}
      <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm font-semibold leading-relaxed">
        {normalize(text)}
      </span>

      {/* Optional right hint (chips like “Correct”, “Your pick”) */}
      {rightHint ? (
        <span className="ml-2 shrink-0 self-start">{rightHint}</span>
      ) : null}
    </button>
  );
}