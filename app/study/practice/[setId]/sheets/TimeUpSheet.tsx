// [setId]/sheets/TimeUpSheet.tsx
"use client";

import { AlarmClock, Loader2, RotateCcw, BookOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TimeUpSheet({
  open,
  onClose,
  finalizing,
  answered,
  total,
  onReview,
  onRestart,
}: {
  open: boolean;
  onClose: () => void;
  finalizing: boolean;
  answered?: number;
  total?: number;
  onReview?: () => void;
  onRestart?: () => void;
}) {
  if (!open) return null;

  const a = Number.isFinite(answered as number) ? (answered as number) : undefined;
  const t = Number.isFinite(total as number) ? (total as number) : undefined;

  return (
    <div className="fixed inset-0 z-[90]">
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
          aria-label="Time up"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-foreground">Time’s up</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your attempt was saved automatically. You can review your answers now.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex items-center justify-center rounded-2xl border border-border bg-background p-2 text-foreground",
                "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
              aria-label="Close time up sheet"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-4 py-4">
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background text-foreground">
                  <AlarmClock className="h-5 w-5" />
                </span>

                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-foreground">Auto-submitted</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    We stopped the timer and submitted what you had.
                  </p>

                  {typeof a === "number" && typeof t === "number" ? (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-border bg-background p-3">
                        <p className="text-[11px] font-extrabold text-muted-foreground">Answered</p>
                        <p className="mt-1 text-base font-extrabold text-foreground tabular-nums">
                          {a}/{t}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-background p-3">
                        <p className="text-[11px] font-extrabold text-muted-foreground">Unanswered</p>
                        <p className="mt-1 text-base font-extrabold text-foreground tabular-nums">
                          {Math.max(0, t - a)}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {finalizing ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Tip: review your wrong answers first to learn faster.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-border px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onRestart ?? onClose}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-extrabold text-foreground",
                  "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
                disabled={finalizing}
              >
                <RotateCcw className="h-4 w-4" />
                Restart
              </button>

              <button
                type="button"
                onClick={onReview ?? onClose}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground",
                  "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
                disabled={finalizing}
              >
                <BookOpen className="h-4 w-4" />
                Review answers
              </button>
            </div>

            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              If saving is still in progress, wait a moment before restarting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}