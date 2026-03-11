// [setId]/sheets/SubmitSheet.tsx
"use client";

import { AlertTriangle, CheckCircle2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

function StatPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "warn" | "good";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-300/40 bg-emerald-100/30 dark:bg-emerald-950/20"
      : tone === "warn"
      ? "border-amber-300/40 bg-amber-100/30 dark:bg-amber-950/20"
      : "border-border bg-background";

  return (
    <div className={cn("rounded-2xl border p-3", cls)}>
      <p className="text-[11px] font-extrabold text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-extrabold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export default function SubmitSheet({
  open,
  onClose,
  answered,
  total,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  answered: number;
  total: number;
  onSubmit: () => void;
}) {
  if (!open) return null;

  const unanswered = Math.max(0, (total ?? 0) - (answered ?? 0));
  const isComplete = unanswered === 0;

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-3xl px-4 pb-[calc(10px+env(safe-area-inset-bottom))]">
        <div
          className={cn(
            "overflow-hidden rounded-3xl border border-border bg-background shadow-2xl",
            "max-h-[85vh] flex flex-col"
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Submit practice"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-foreground">Submit practice?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                You can review your answers after submitting.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex items-center justify-center rounded-2xl border border-border bg-background p-2 text-foreground",
                "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
              aria-label="Close submit sheet"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <StatPill label="Answered" value={`${answered}/${total}`} tone={isComplete ? "good" : "neutral"} />
              <StatPill label="Unanswered" value={unanswered} tone={unanswered > 0 ? "warn" : "good"} />
            </div>

            {/* Warning */}
            {!isComplete ? (
              <div className="mt-3 rounded-3xl border border-amber-300/40 bg-amber-100/30 p-4 dark:bg-amber-950/20">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-300/40 bg-background text-foreground">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-foreground">You have unanswered questions</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Submitting now is okay, but you might want to answer them first for a better score.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-3xl border border-emerald-300/40 bg-emerald-100/30 p-4 dark:bg-emerald-950/20">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-300/40 bg-background text-foreground">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-foreground">All questions answered</p>
                    <p className="mt-1 text-xs text-muted-foreground">Nice — you’re ready to submit.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-border px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  "inline-flex items-center justify-center rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground",
                  "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                Keep practicing
              </button>

              <button
                type="button"
                onClick={onSubmit}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground",
                  "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                <Send className="h-4 w-4" />
                Submit & view results
              </button>
            </div>

            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Tip: you can restart after viewing results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}