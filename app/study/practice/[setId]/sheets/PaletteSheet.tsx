// [setId]/sheets/PaletteSheet.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Flag, Circle, CheckCircle2, Dot, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/lib/types";

type FilterKey = "all" | "unanswered" | "flagged";

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
          : "border-border/70 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function LegendItem({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl border border-border bg-background">
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

export default function PaletteSheet({
  open,
  onClose,
  questions,
  activeIndex,
  answers,
  flagged,
  onJump,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  questions: QuizQuestion[];
  activeIndex: number;
  answers: Record<string, string>;
  flagged: Record<string, boolean>;
  onJump: (i: number) => void;
  footer?: React.ReactNode;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  // Reset filter when sheet opens (keeps it predictable).
  useEffect(() => {
    if (open) setFilter("all");
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const total = questions.length;

  const counts = useMemo(() => {
    let answeredCount = 0;
    let flaggedCount = 0;
    for (const q of questions) {
      if (answers[q.id]) answeredCount++;
      if (flagged[q.id]) flaggedCount++;
    }
    return {
      answered: answeredCount,
      unanswered: Math.max(0, total - answeredCount),
      flagged: flaggedCount,
    };
  }, [answers, flagged, questions, total]);

  const filtered = useMemo(() => {
    if (filter === "all") return questions.map((q, idx) => ({ q, idx }));
    if (filter === "unanswered")
      return questions
        .map((q, idx) => ({ q, idx }))
        .filter(({ q }) => !answers[q.id]);
    // flagged
    return questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => !!flagged[q.id]);
  }, [answers, flagged, filter, questions]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
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
          aria-label="Question palette"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-foreground">Questions</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Answered{" "}
                <span className="font-extrabold text-foreground tabular-nums">
                  {counts.answered}/{total}
                </span>
                {" • "}
                Unanswered{" "}
                <span className="font-extrabold text-foreground tabular-nums">
                  {counts.unanswered}
                </span>
                {counts.flagged ? (
                  <>
                    {" • "}
                    Flagged{" "}
                    <span className="font-extrabold text-foreground tabular-nums">
                      {counts.flagged}
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={cn(
                "inline-flex items-center justify-center rounded-2xl border border-border bg-background p-2 text-foreground",
                "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
              aria-label="Close palette"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Filters + legend */}
          <div className="px-4 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>
                <Filter className="h-4 w-4" /> All
              </Chip>
              <Chip active={filter === "unanswered"} onClick={() => setFilter("unanswered")}>
                <Circle className="h-4 w-4" /> Unanswered
              </Chip>
              <Chip active={filter === "flagged"} onClick={() => setFilter("flagged")}>
                <Flag className="h-4 w-4" /> Flagged
              </Chip>

              <div className="ml-auto hidden sm:flex items-center gap-3">
                <LegendItem
                  icon={<Dot className="h-5 w-5 text-muted-foreground" />}
                  label="Current"
                />
                <LegendItem
                  icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
                  label="Answered"
                />
                <LegendItem icon={<Flag className="h-4 w-4 text-muted-foreground" />} label="Flagged" />
              </div>
            </div>

            {/* Mobile legend */}
            <div className="mt-3 grid grid-cols-3 gap-2 sm:hidden">
              <LegendItem icon={<Dot className="h-5 w-5 text-muted-foreground" />} label="Current" />
              <LegendItem icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />} label="Answered" />
              <LegendItem icon={<Flag className="h-4 w-4 text-muted-foreground" />} label="Flagged" />
            </div>
          </div>

          {/* Grid */}
          <div className="mt-3 flex-1 overflow-auto px-4 pb-4">
            {filtered.length === 0 ? (
              <div className="rounded-3xl border border-border bg-card p-4 text-sm text-muted-foreground">
                Nothing matches this filter.
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                {filtered.map(({ q, idx }) => {
                  const answered = !!answers[q.id];
                  const isFlagged = !!flagged[q.id];
                  const isActive = idx === activeIndex;

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => onJump(idx)}
                      className={cn(
                        "relative h-12 rounded-2xl border text-sm font-extrabold tabular-nums",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isActive
                          ? "border-border bg-secondary text-foreground"
                          : "border-border bg-background text-foreground hover:bg-secondary/50",
                        answered && !isActive && "bg-background",
                        answered && !isActive && "border-emerald-300/30",
                        !answered && !isActive && "border-border/70",
                        isFlagged && "border-amber-300/40"
                      )}
                      aria-label={`Question ${idx + 1}${answered ? ", answered" : ", unanswered"}${
                        isFlagged ? ", flagged" : ""
                      }`}
                    >
                      {idx + 1}

                      {/* Current dot */}
                      {isActive ? (
                        <span className="absolute -top-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background">
                          <Dot className="h-5 w-5" />
                        </span>
                      ) : null}

                      {/* Answered tick */}
                      {answered ? (
                        <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300/30 bg-background">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                      ) : null}

                      {/* Flag */}
                      {isFlagged ? (
                        <span className="absolute -bottom-1 -left-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-300/30 bg-background">
                          <Flag className="h-4 w-4" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Footer slot (e.g., submit button) */}
            {footer ? <div className="mt-4">{footer}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}