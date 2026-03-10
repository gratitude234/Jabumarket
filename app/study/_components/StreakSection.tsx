"use client";

import { useEffect, useState } from "react";
import StreakCard, { type PracticeAttemptRow } from "./StreakCard";
import { getLatestAttempt, getPracticeStreak } from "@/lib/studyPractice";

/**
 * Self-contained streak section for the Study home page.
 *
 * Fetches streak and latest attempt in parallel on mount,
 * then passes resolved values down to StreakCard.
 */
export function StreakSection() {
  const [streak, setStreak] = useState<{
    streak: number;
    didPracticeToday: boolean;
  } | null>(null);
  const [lastAttempt, setLastAttempt] = useState<PracticeAttemptRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getPracticeStreak().catch(() => null),
      getLatestAttempt().catch(() => null),
    ]).then(([streakRes, attemptRes]) => {
      if (cancelled) return;
      setStreak(streakRes);
      setLastAttempt(attemptRes);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <StreakCard
      streak={streak?.streak ?? 0}
      lastAttempt={lastAttempt}
      loading={loading}
    />
  );
}