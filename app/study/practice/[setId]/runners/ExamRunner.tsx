// [setId]/runners/ExamRunner.tsx
"use client";

import { Flag } from "lucide-react";
import { Card } from "../../../_components/StudyUI";
import OptionCard from "../parts/OptionCard";
import { cn, normalize, QuizOption, QuizQuestion } from "../usePracticeEngine";

export default function ExamRunner({
  idx,
  total,
  current,
  opts,
  answers,
  flagged,
  submitted,
  onChoose,
  onToggleFlag,
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
}) {
  return (
    <div className="space-y-3">
      <Card className="rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-muted-foreground">
              Question {idx + 1} of {total}
            </p>

            <p className="mt-2 whitespace-pre-wrap text-base font-semibold leading-relaxed text-foreground">
              {normalize(String(current?.prompt ?? ""))}
            </p>

            {/* Better microcopy for Exam mode */}
            <p className="mt-2 text-xs text-muted-foreground">
              Exam mode: no instant feedback — your answer is saved and scored on submit.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onToggleFlag(current.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-extrabold",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              flagged[current.id]
                ? "border-border bg-secondary text-foreground"
                : "border-border bg-background text-foreground hover:bg-secondary/50",
              submitted ? "opacity-60" : ""
            )}
            title="Flag this question"
            aria-label="Flag this question"
            disabled={submitted}
          >
            <Flag className="h-4 w-4" /> {flagged[current.id] ? "Flagged" : "Flag"}
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          {opts.map((o, i) => {
            const chosen = answers[current.id] === o.id;
            const label = String.fromCharCode(65 + i);

            return (
              <OptionCard
                key={o.id}
                label={label}
                text={String(o.text ?? "")}
                chosen={chosen}
                disabled={submitted}
                onClick={() => onChoose(current.id, o.id)}
              />
            );
          })}
        </div>
      </Card>

      {/* Cleaner, less noisy tips (still helpful) */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          Tip: Press <span className="font-extrabold text-foreground">1–5</span> to pick options
        </div>
        <div className="rounded-2xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          Use <span className="font-extrabold text-foreground">← / →</span> to navigate
        </div>
        <div className="rounded-2xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          Press <span className="font-extrabold text-foreground">F</span> to flag
        </div>
      </div>
    </div>
  );
}