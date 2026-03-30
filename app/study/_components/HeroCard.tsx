"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HeroCard({
  displayName,
  streak,
  dueCount,
  masteryPct,
  hasPrefs,
  userId,
}: {
  displayName: string | null;
  streak: number;
  dueCount: number | null;
  masteryPct: number | null;
  hasPrefs: boolean;
  userId: string | null;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      {/* Greeting row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{getGreeting()}</p>
          <p className="text-lg font-extrabold text-foreground">
            {displayName ?? "there"} 👋
          </p>
        </div>
        {hasPrefs ? (
          <Link
            href="/study/onboarding"
            className="shrink-0 rounded-2xl border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary/50"
          >
            Preferences →
          </Link>
        ) : (
          <Link
            href="/study/onboarding"
            className="shrink-0 rounded-2xl border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary/50"
          >
            Set up →
          </Link>
        )}
      </div>

      {/* Stat grid */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {/* Streak tile */}
        <div className="rounded-2xl bg-secondary/60 px-3 py-2">
          <p className="text-base font-extrabold text-foreground">{streak}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            day streak{streak === 1 ? "" : "s"} 🔥
          </p>
        </div>

        {/* Mastery tile */}
        <div className="rounded-2xl bg-secondary/60 px-3 py-2">
          <p className="text-base font-extrabold text-foreground">
            {masteryPct !== null ? `${masteryPct}%` : "—"}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">mastery this week</p>
        </div>

        {/* Third tile — reserved for future */}
        {null}
      </div>

      {/* Due pill — only when dueCount > 0 */}
      {dueCount !== null && dueCount > 0 && (
        <div
          className={cn(
            "mt-3 flex items-center justify-between gap-3 rounded-2xl",
            "bg-[#5B35D5]/[0.07] border border-[#5B35D5]/20 px-3 py-2.5",
            "dark:bg-[#5B35D5]/10 dark:border-[#5B35D5]/30"
          )}
        >
          <p className="text-sm font-semibold text-[#3B24A8] dark:text-indigo-200">
            {dueCount} {dueCount === 1 ? "card" : "cards"} due today
          </p>
          <Link
            href="/study/practice?due=1"
            className="rounded-xl bg-[#5B35D5] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4526B8]"
          >
            Review now →
          </Link>
        </div>
      )}

      {/* All caught up — only when dueCount === 0 */}
      {dueCount === 0 && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-2 rounded-full border border-border",
            "bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground"
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          All caught up today
        </div>
      )}
    </div>
  );
}
