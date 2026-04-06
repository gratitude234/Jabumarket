"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { getPracticeStreak } from "@/lib/studyPractice";

export function HeroCard({
  displayName,
  hasPrefs,
  userId,
}: {
  displayName: string | null;
  hasPrefs: boolean;
  userId: string | null;
}) {
  const [streak, setStreak] = useState(0);
  const [activeDays, setActiveDays] = useState<Set<string>>(new Set());
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [streakLoading, setStreakLoading] = useState(true);

  // ── Streak + 28-day activity ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getPracticeStreak().catch(() => null);
        if (!cancelled) setStreak(res?.streak ?? 0);
      } finally {
        if (!cancelled) setStreakLoading(false);
      }

      // 28-day dot grid
      if (!userId) return;
      try {
        const since = new Date(Date.now() + 3_600_000 - 28 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const { data } = await supabase
          .from("study_daily_activity")
          .select("activity_date,did_practice")
          .eq("user_id", userId)
          .gte("activity_date", since);
        if (!cancelled && data) {
          const s = new Set<string>();
          for (const r of data as { activity_date: string; did_practice: boolean }[]) {
            if (r?.did_practice === true && r?.activity_date) s.add(String(r.activity_date));
          }
          setActiveDays(s);
        }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Due today count ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) { setDueCount(0); return; }
    let cancelled = false;
    (async () => {
      try {
        const now = new Date().toISOString();
        const { count, error } = await supabase
          .from("study_weak_questions")
          .select("user_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .lte("next_due_at", now)
          .is("graduated_at", null);
        if (!cancelled && !error) setDueCount(count ?? 0);
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Dot grid helpers ───────────────────────────────────────────────────────
  const now = new Date(Date.now() + 3_600_000);
  const todayStr = now.toISOString().slice(0, 10);
  const dotDays: string[] = [];
  for (let i = 27; i >= 0; i--) {
    dotDays.push(
      new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    );
  }

  const streakColor =
    streak >= 7 ? "text-orange-500" : streak >= 3 ? "text-amber-500" : "text-muted-foreground";

  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {/* ── Top section ── */}
      <div className="p-5 pb-4">
        {/* Greeting row */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{timeGreeting}</p>
            <p className="mt-0.5 text-xl font-extrabold tracking-tight text-foreground">
              {displayName ? `${displayName} 👋` : "Welcome 👋"}
            </p>
          </div>
          <Link
            href="/study/onboarding"
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-border bg-background px-3 py-2",
              "text-sm font-semibold text-foreground hover:bg-secondary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              !hasPrefs && "border-[#5B35D5]/20 bg-[#EEEDFE] text-[#3B24A8]"
            )}
          >
            {hasPrefs ? "Preferences" : "Set up"} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Stat tiles — only shown once prefs are configured */}
        {hasPrefs ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-secondary/60 px-3 py-2.5">
              <p className={cn("text-xl font-extrabold leading-none", streakLoading ? "text-muted-foreground" : streakColor)}>
                {streakLoading ? "0" : streak}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                day{streak !== 1 ? "s" : ""} streak 🔥
              </p>
            </div>

            <div className="rounded-2xl bg-secondary/60 px-3 py-2.5">
              <p className="text-xl font-extrabold leading-none text-[#5B35D5]">—</p>
              <p className="mt-1 text-[10px] text-muted-foreground">mastery this wk</p>
            </div>

            <div className="rounded-2xl bg-secondary/60 px-3 py-2.5">
              <p className="text-xl font-extrabold leading-none text-foreground">●●●</p>
              <p className="mt-1 text-[10px] text-muted-foreground">courses active</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            Set up your study profile to track your streak, mastery, and active courses.
          </p>
        )}

        {/* Due today */}
        {dueCount !== null && dueCount > 0 ? (
          <Link
            href="/study/practice?due=1"
            className={cn(
              "mt-3 flex items-center justify-between gap-3 no-underline",
              "rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE] px-3 py-2.5",
              "dark:border-[#5B35D5]/30 dark:bg-[#5B35D5]/10"
            )}
          >
            <p className="text-sm font-semibold text-[#3B24A8] dark:text-indigo-200">
              {dueCount} {dueCount === 1 ? "card" : "cards"} due today
            </p>
            <span className="rounded-xl bg-[#5B35D5] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4526B8]">
              Review now →
            </span>
          </Link>
        ) : dueCount === 0 && hasPrefs ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            All caught up today
          </div>
        ) : null}
      </div>

      {/* ── 28-day activity bar ── */}
      <div className="border-t border-border px-5 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          28-day activity
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: "4px" }}>
          {dotDays.map((d) => {
            const isToday = d === todayStr;
            const practiced = activeDays.has(d);
            return (
              <div
                key={d}
                title={d}
                className={cn(
                  "h-2 rounded-sm",
                  isToday
                    ? practiced
                      ? "bg-[#5B35D5] ring-2 ring-[#5B35D5]/35 ring-offset-1"
                      : "bg-muted ring-2 ring-[#5B35D5]/30 ring-offset-1"
                    : practiced
                    ? "bg-[#5B35D5]/60"
                    : "bg-secondary"
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
