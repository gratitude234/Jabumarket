"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface RankWidgetProps {
  userId: string | null;
}

type RankData = {
  points: number;
  practice_points: number;
  rank: number;
};

function formatHeadline(rank: number) {
  if (rank === 1) return "🥇 You're #1 on the leaderboard";
  if (rank === 2) return "🥈 #2 on the leaderboard";
  if (rank === 3) return "🥉 #3 on the leaderboard";
  if (rank <= 10) return `Top 10 · #${rank}`;
  return `#${rank} on the leaderboard`;
}

export default function RankWidget({ userId }: RankWidgetProps) {
  const [loading, setLoading] = useState(Boolean(userId));
  const [data, setData] = useState<RankData | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setData(null);
      return;
    }

    let cancelled = false;

    async function fetchRank() {
      setLoading(true);
      try {
        const { data: leaderboardRow, error: leaderboardError } = await supabase
          .from("study_leaderboard_v")
          .select("points, practice_points, answers, questions")
          .eq("user_id", userId)
          .maybeSingle();

        if (leaderboardError || !leaderboardRow) {
          if (!cancelled) setData(null);
          return;
        }

        const points = typeof leaderboardRow.points === "number" ? leaderboardRow.points : 0;
        const practicePoints = typeof leaderboardRow.practice_points === "number"
          ? leaderboardRow.practice_points
          : 0;

        const { count, error: rankError } = await supabase
          .from("study_leaderboard_v")
          .select("user_id", { count: "exact", head: true })
          .gt("points", points);

        if (rankError) {
          if (!cancelled) setData(null);
          return;
        }

        const rank = (count ?? 0) + 1;
        if (points === 0 && rank > 100) {
          if (!cancelled) setData(null);
          return;
        }

        if (!cancelled) {
          setData({
            points,
            practice_points: practicePoints,
            rank,
          });
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRank();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return <div className="h-14 animate-pulse rounded-2xl bg-muted" />;
  }

  if (!data) return null;

  return (
    <Link href="/study/leaderboard" className="block no-underline">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition hover:bg-secondary/20">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEEDFE]">
          <Trophy className="h-4 w-4 text-[#5B35D5]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-foreground">{formatHeadline(data.rank)}</p>
          <p className="text-xs text-muted-foreground">
            {data.points} pts total · {data.practice_points} from practice
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </Link>
  );
}
