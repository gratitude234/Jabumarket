"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Timer, Sparkles } from "lucide-react";
import { cn, msToClock } from "@/lib/utils";

export type PracticeMode = "exam" | "interactive";

function buildHref(path: string, params: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    const s = (v ?? "").toString().trim();
    if (!s) return;
    sp.set(k, s);
  });
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export default function TopBar({
  timeLeftMs,
  answered,
  total,
  flaggedCount,
  disabled,
  defaultMode,
}: {
  timeLeftMs: number | null;
  answered: number;
  total: number;
  flaggedCount: number;
  disabled?: boolean;
  defaultMode: PracticeMode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const attempt = sp.get("attempt") ?? "";

  const modeParam = (sp.get("mode") ?? "") as PracticeMode | "";
  const initialMode =
    (modeParam === "exam" || modeParam === "interactive" ? modeParam : "") || defaultMode;

  const [mode, setMode] = useState<PracticeMode>(initialMode);

  // keep state synced with URL changes
  useEffect(() => {
    const m = (sp.get("mode") ?? "") as PracticeMode | "";
    const next = (m === "exam" || m === "interactive" ? m : "") || defaultMode;
    setMode(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, defaultMode]);

  const modeLabel = useMemo(() => (mode === "interactive" ? "Interactive" : "Exam"), [mode]);

  const progress = useMemo(() => {
    const t = Math.max(0, total || 0);
    const a = Math.max(0, answered || 0);
    return clamp01(t ? a / t : 0);
  }, [answered, total]);

  const timeTone = useMemo(() => {
    if (typeof timeLeftMs !== "number") return "neutral";
    if (timeLeftMs <= 60_000) return "urgent";
    if (timeLeftMs <= 5 * 60_000) return "warn";
    return "neutral";
  }, [timeLeftMs]);

  function switchMode(next: PracticeMode) {
    setMode(next);

    // persist preference
    try {
      window.localStorage.setItem("jabu:practiceMode", next);
    } catch {
      // ignore
    }

    router.replace(
      buildHref(pathname, {
        attempt: attempt || null,
        mode: next,
      })
    );
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-30 -mx-3 sm:mx-0",
        "bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70",
        "border-b border-border"
      )}
    >
      <div className="px-3 sm:px-0 py-2 sm:py-3">
        {/* Row 1: navigation + key status pills */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground",
              "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              disabled ? "opacity-60" : ""
            )}
            aria-label="Go back"
            disabled={disabled}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="flex items-center justify-end gap-2">
            {typeof timeLeftMs === "number" ? (
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-2 text-xs font-extrabold",
                  timeTone === "urgent"
                    ? "border-amber-300/40 bg-amber-100/40 text-foreground dark:bg-amber-950/30"
                    : timeTone === "warn"
                    ? "border-border bg-secondary/60 text-foreground"
                    : "border-border bg-background text-foreground"
                )}
                title="Time left"
                aria-label={`Time left ${msToClock(timeLeftMs)}`}
              >
                <Timer className="h-4 w-4" />
                <span className="tabular-nums">{msToClock(timeLeftMs)}</span>
              </div>
            ) : (
              <div
                className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-2 text-xs font-extrabold text-muted-foreground"
                title="Untimed"
              >
                Untimed
              </div>
            )}

            <div
              className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-2 text-xs font-extrabold text-foreground"
              title="Progress"
              aria-label={`${answered} of ${total} answered`}
            >
              <span className="tabular-nums">
                {answered}/{total}
              </span>
              <span className="hidden sm:inline">&nbsp;answered</span>
            </div>

            {flaggedCount ? (
              <div
                className="inline-flex items-center rounded-full border border-border bg-secondary px-2.5 py-2 text-xs font-extrabold text-foreground"
                title="Flagged questions"
                aria-label={`${flaggedCount} flagged`}
              >
                <span className="tabular-nums">{flaggedCount}</span>
                <span className="hidden sm:inline">&nbsp;flagged</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Row 2: progress bar + mode toggle */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
              <div
                className="h-full rounded-full bg-foreground/80"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] font-semibold text-muted-foreground">
              {Math.round(progress * 100)}% complete
            </div>
          </div>

          {/* Desktop segmented control */}
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => switchMode("interactive")}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold transition",
                mode === "interactive"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50",
                disabled ? "opacity-60" : ""
              )}
              aria-pressed={mode === "interactive"}
            >
              <Sparkles className="h-3.5 w-3.5" /> Interactive
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() => switchMode("exam")}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold transition",
                mode === "exam" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50",
                disabled ? "opacity-60" : ""
              )}
              aria-pressed={mode === "exam"}
            >
              Exam
            </button>
          </div>

          {/* Mobile: one-tap toggle */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => switchMode(mode === "interactive" ? "exam" : "interactive")}
            className={cn(
              "sm:hidden inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground",
              "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              disabled ? "opacity-60" : ""
            )}
            aria-label="Switch mode"
            title="Switch mode"
          >
            <Sparkles className="h-4 w-4" />
            <span className="truncate max-w-[9rem]">{modeLabel}</span>
          </button>
        </div>
      </div>
    </header>
  );
}