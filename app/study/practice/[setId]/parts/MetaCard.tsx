"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "../../../_components/StudyUI";
import { cn } from "@/lib/utils";
import { normalize } from "@/lib/utils";
import type { QuizSet } from "@/lib/types";

export default function MetaCard({ meta }: { meta: QuizSet }) {
  const [open, setOpen] = useState(false);
  const headerCode = normalize(String(meta?.course_code ?? "")).toUpperCase();

  return (
    <Card className="rounded-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-extrabold tracking-tight text-foreground">
              {normalize(String(meta.title ?? "Practice"))}
            </p>

            {headerCode ? (
              <Link
                href={`/study/courses/${encodeURIComponent(headerCode)}`}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground no-underline hover:bg-secondary/50"
              >
                {headerCode}
              </Link>
            ) : null}

            {meta.level ? (
              <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                {String(meta.level)}L
              </span>
            ) : null}
          </div>

          {meta.description ? (
            <p className={cn("mt-2 text-sm text-muted-foreground", open ? "" : "line-clamp-2")}>
              {normalize(meta.description)}
            </p>
          ) : null}
        </div>

        {meta.description ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "shrink-0 inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground",
              "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
            aria-label={open ? "Collapse description" : "Expand description"}
          >
            {open ? (
              <>
                Less <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                More <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
        ) : null}
      </div>
    </Card>
  );
}