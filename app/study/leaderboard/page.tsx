// app/study/leaderboard/page.tsx
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Crown, Medal, MessageSquare, Star, Trophy, User } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Leaderboard refreshes every 5 minutes.
// Once user counts grow, swap the view for a MATERIALIZED VIEW + pg_cron refresh.
export const revalidate = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

type LeaderRow = {
  // user_id is the stable identifier — email can change, user_id never does.
  user_id: string;
  email: string;
  questions: number;
  question_upvotes: number;
  answers: number;
  accepted: number;
  practice_points: number;
  practice_days: number;
  points: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a short, deterministic alias from a user_id.
 * Uses the last 8 hex chars of the UUID → maps to an adjective + noun pair
 * so every user sees a consistent nickname that is non-reversible.
 *
 * e.g. user_id "…3f2a" → "Swift Eagle #3F2A"
 */
const ADJECTIVES = [
  "Swift", "Bright", "Bold", "Keen", "Sharp", "Brave", "Calm", "Clear",
  "Deep", "Fair", "Fine", "Firm", "Free", "Full", "Grand", "Great",
  "High", "Just", "Kind", "Loud", "Pure", "Rare", "Rich", "Safe",
  "Soft", "Sure", "True", "Vast", "Warm", "Wide", "Wise", "Young",
];
const NOUNS = [
  "Eagle", "Hawk", "Bear", "Wolf", "Lion", "Lynx", "Deer", "Crane",
  "Dove", "Finch", "Kite", "Lark", "Pike", "Rook", "Teal", "Wren",
  "Fox", "Stag", "Colt", "Bard", "Sage", "Monk", "Scribe", "Scout",
  "Guide", "Pilot", "Ranger", "Warden", "Knight", "Herald", "Envoy", "Steward",
];

function toAlias(userId: string): string {
  // Take the last 8 chars of the UUID (hex segment after last "-")
  const raw = userId.replace(/-/g, "");
  const tail = raw.slice(-8);
  const num = parseInt(tail, 16);
  const adj = ADJECTIVES[num % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(num / ADJECTIVES.length) % NOUNS.length];
  const tag = tail.slice(-4).toUpperCase();
  return `${adj} ${noun} #${tag}`;
}

function initials(alias: string): string {
  const parts = alias.split(" ");
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

// ─── Points breakdown ─────────────────────────────────────────────────────────

const POINT_RULES: Array<{ key: keyof LeaderRow; label: string; multiplier: number }> = [
  { key: "accepted",        label: "Accepted answers", multiplier: 5 },
  { key: "answers",         label: "Answers posted",   multiplier: 2 },
  { key: "questions",       label: "Questions asked",  multiplier: 1 },
  { key: "question_upvotes",label: "Upvotes received", multiplier: 1 },
  { key: "practice_points", label: "Practice pts",     multiplier: 1 },
];

function PointsBreakdown({ row }: { row: LeaderRow }) {
  return (
    <details className="group">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1",
          "text-[11px] font-semibold text-muted-foreground select-none",
          "hover:text-foreground transition-colors",
          "[&::-webkit-details-marker]:hidden"
        )}
      >
        <Star className="h-3 w-3" />
        <span className="group-open:hidden">Show breakdown</span>
        <span className="hidden group-open:inline">Hide breakdown</span>
      </summary>

      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {POINT_RULES.map(({ key, label, multiplier }) => {
          const count = row[key] as number;
          const earned = count * multiplier;
          return (
            <div
              key={key}
              className="rounded-xl border border-border bg-background px-2.5 py-2"
            >
              <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-sm font-extrabold text-foreground">
                {count}
                <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                  ×{multiplier}
                </span>
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                = {earned} pts
              </p>
            </div>
          );
        })}
      </div>

      {/* Practice days callout — only shown when non-zero */}
      {row.practice_days > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          🔥 Practiced on {row.practice_days} day{row.practice_days !== 1 ? "s" : ""}
        </p>
      )}
    </details>
  );
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchLeaderboard(): Promise<{
  rows: LeaderRow[];
  viewMissing: boolean;
  currentUserId: string | null;
}> {
  const supabase = await createSupabaseServerClient();

  // Fetch current session in parallel with leaderboard data
  const [{ data: authData }, leaderboardResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("study_leaderboard_v")
      .select("user_id,email,questions,question_upvotes,answers,accepted,practice_points,practice_days,points")
      .order("points", { ascending: false })
      .limit(50),
  ]);

  const currentUserId = authData?.user?.id ?? null;

  if (leaderboardResult.error) {
    const viewMissing =
      leaderboardResult.error.code === "42P01" ||
      leaderboardResult.error.message.toLowerCase().includes("study_leaderboard_v");
    if (viewMissing) return { rows: [], viewMissing: true, currentUserId };
    throw new Error(leaderboardResult.error.message);
  }

  return {
    rows: (leaderboardResult.data as LeaderRow[]) ?? [],
    viewMissing: false,
    currentUserId,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function YourRankCard({
  row,
  rank,
}: {
  row: LeaderRow;
  rank: number;
}) {
  const alias = toAlias(row.user_id);
  return (
    <div
      className={cn(
        "rounded-3xl border-2 border-foreground bg-card p-4 shadow-sm",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">Your rank</p>
          <p className="mt-1 text-2xl font-extrabold text-foreground">#{rank}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {alias}
          </p>
          <p className="mt-1 text-sm font-extrabold text-foreground">
            {row.points.toLocaleString("en-NG")}{" "}
            <span className="font-normal text-muted-foreground">pts</span>
          </p>
        </div>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-foreground bg-foreground text-background">
          <User className="h-6 w-6" />
        </div>
      </div>
      <div className="mt-3">
        <PointsBreakdown row={row} />
      </div>
    </div>
  );
}

function PodiumCard({
  row,
  rank,
  isCurrentUser,
}: {
  row: LeaderRow;
  rank: 1 | 2 | 3;
  isCurrentUser: boolean;
}) {
  const alias = toAlias(row.user_id);
  const iconBg =
    rank === 1
      ? "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800"
      : rank === 2
      ? "bg-muted/50 border-border"
      : "bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800";

  return (
    <div
      className={cn(
        "rounded-3xl border bg-card p-4 shadow-sm",
        isCurrentUser ? "border-foreground ring-2 ring-foreground/20" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-muted-foreground">#{rank}</p>
            {isCurrentUser && (
              <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-background">
                You
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-base font-extrabold text-foreground">
            {alias}
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {row.points.toLocaleString("en-NG")}{" "}
            <span className="text-muted-foreground font-normal">pts</span>
          </p>
        </div>
        <div
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-2xl border",
            iconBg
          )}
        >
          {rank === 1 ? (
            <Crown className="h-6 w-6 text-amber-600" />
          ) : (
            <Medal
              className={cn(
                "h-6 w-6",
                rank === 2 ? "text-muted-foreground" : "text-rose-500"
              )}
            />
          )}
        </div>
      </div>

      {/* Expandable breakdown */}
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "accepted", value: row.accepted },
            { label: "answers", value: row.answers },
            { label: "questions", value: row.questions },
            { label: "upvotes", value: row.question_upvotes },
          ].map(({ label, value }) => (
            <span
              key={label}
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
            >
              {value} {label}
            </span>
          ))}
          {row.practice_days > 0 && (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
              🔥 {row.practice_days}d practice
            </span>
          )}
        </div>
        <PointsBreakdown row={row} />
      </div>
    </div>
  );
}

function RankRow({
  row,
  rank,
  isCurrentUser,
}: {
  row: LeaderRow;
  rank: number;
  isCurrentUser: boolean;
}) {
  const alias = toAlias(row.user_id);
  return (
    <details
      className={cn(
        "group rounded-2xl border bg-card transition-colors",
        isCurrentUser
          ? "border-foreground ring-1 ring-foreground/20"
          : "border-border"
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3",
          "[&::-webkit-details-marker]:hidden"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border bg-background text-sm font-extrabold text-foreground">
            {initials(alias)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                #{rank} · {alias}
              </p>
              {isCurrentUser && (
                <span className="shrink-0 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-background">
                  You
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.accepted} accepted · {row.answers} answers · {row.questions} Q
              {row.practice_days > 0 ? ` · 🔥 ${row.practice_days}d practice` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <p className="text-sm font-extrabold text-foreground">
            {row.points.toLocaleString("en-NG")} pts
          </p>
          <Star className="h-3.5 w-3.5 text-muted-foreground group-open:text-foreground transition-colors" />
        </div>
      </summary>

      {/* Expanded breakdown */}
      <div className="border-t border-border px-4 py-3">
        <PointsBreakdown row={row} />
      </div>
    </details>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LeaderboardPage() {
  let rows: LeaderRow[] = [];
  let fetchError: string | null = null;
  let viewMissing = false;
  let currentUserId: string | null = null;

  try {
    const result = await fetchLeaderboard();
    rows = result.rows;
    viewMissing = result.viewMissing;
    currentUserId = result.currentUserId;
  } catch (e: any) {
    fetchError = e?.message ?? "Failed to load leaderboard";
  }

  const top3 = rows.slice(0, 3) as Array<LeaderRow & { rank: 1 | 2 | 3 }>;
  const rest = rows.slice(3);

  // Find the current user's row and rank (1-indexed)
  const myRankIndex = currentUserId
    ? rows.findIndex((r) => r.user_id === currentUserId)
    : -1;
  const myRow = myRankIndex >= 0 ? rows[myRankIndex] : null;
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;
  // Only show the "Your rank" banner if user is NOT already in the visible top-3 podium
  const showYourRankCard = myRow !== null && myRank !== null && myRank > 3;

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      {/* Nav */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/study"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
            "text-sm font-semibold text-foreground no-underline hover:bg-secondary/50"
          )}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <Link
          href="/study/questions"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
            "text-sm font-semibold text-foreground no-underline hover:bg-secondary/50"
          )}
        >
          <MessageSquare className="h-4 w-4" /> Q&amp;A
        </Link>
      </div>

      {/* Header */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">
              Community
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
              Leaderboard
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Top contributors in Jabu Study. Points: accepted answer (×5) +
              answer (×2) + question (×1) + upvote (×1) + practice points (×1).
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Names are anonymised — tap any row to see how points were earned.
            </p>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-background">
            <Trophy className="h-6 w-6 text-foreground" />
          </div>
        </div>

        {fetchError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            {fetchError}
          </div>
        ) : null}

        {viewMissing ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <p className="font-semibold">Leaderboard view not set up yet.</p>
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              Run migration{" "}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">
                003_add_practice_points_to_leaderboard.sql
              </code>{" "}
              in your Supabase SQL editor to enable the leaderboard.
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Your rank card (only shown when not in the top 3 podium) ── */}
      {showYourRankCard && myRow && myRank ? (
        <YourRankCard row={myRow} rank={myRank} />
      ) : null}

      {/* ── Your rank is in the top 3: subtle callout instead ── */}
      {myRow && myRank && myRank <= 3 ? (
        <div className="rounded-2xl border border-foreground/30 bg-card px-4 py-3 text-sm font-semibold text-foreground">
          🏆 You&apos;re in the top 3! Your card is highlighted in the podium below.
        </div>
      ) : null}

      {/* Empty */}
      {!fetchError && rows.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground">No activity yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Once people start asking and answering questions, top helpers will appear here.
          </p>
          <div className="mt-4">
            <Link
              href="/study/questions/ask"
              className={cn(
                "inline-flex items-center justify-center rounded-2xl bg-secondary px-4 py-3",
                "text-sm font-semibold text-foreground no-underline hover:opacity-90"
              )}
            >
              Ask a question
            </Link>
          </div>
        </div>
      ) : null}

      {/* Podium — top 3 */}
      {top3.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {top3.map((r, i) => (
            <PodiumCard
              key={r.user_id}  // ← stable user_id key, not email
              row={r}
              rank={(i + 1) as 1 | 2 | 3}
              isCurrentUser={r.user_id === currentUserId}
            />
          ))}
        </div>
      ) : null}

      {/* Rest of top 50 — each row is expandable */}
      {rest.length > 0 ? (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-extrabold text-foreground">Top 50</h2>
          <div className="mt-4 space-y-2">
            {rest.map((r, i) => (
              <RankRow
                key={r.user_id}  // ← stable user_id key, not email
                row={r}
                rank={i + 4}
                isCurrentUser={r.user_id === currentUserId}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}