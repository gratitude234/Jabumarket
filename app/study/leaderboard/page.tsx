// app/study/leaderboard/page.tsx
// Scoped leaderboard: All / My Department / My Level
// Scope is resolved server-side using the requesting user's study_preferences.
// The page remains a Server Component; scope is passed via URL search param
// so scope tabs work without JS-heavy client state.

import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Crown, Medal, MessageSquare, Star, Trophy, User, Users, GraduationCap, Globe } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 5-min revalidation — swap for MATERIALIZED VIEW + pg_cron when user base grows.
export const revalidate = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

type LeaderRow = {
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

type Scope = "all" | "dept" | "level";

type UserPrefs = {
  department_id: string | null;
  faculty_id: string | null;
  level: number | null;
  department: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** user_id → display name (full_name from profiles, fallback to email prefix) */
type ProfileMap = Record<string, string>;

function displayName(userId: string, email: string, profileMap: ProfileMap): string {
  return profileMap[userId] ?? email?.split("@")[0] ?? "Anonymous";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

// ─── Points breakdown ─────────────────────────────────────────────────────────

const POINT_RULES: Array<{ key: keyof LeaderRow; label: string; multiplier: number }> = [
  { key: "accepted",         label: "Accepted answers", multiplier: 5 },
  { key: "answers",          label: "Answers posted",   multiplier: 2 },
  { key: "questions",        label: "Questions asked",  multiplier: 1 },
  { key: "question_upvotes", label: "Upvotes received", multiplier: 1 },
  { key: "practice_points",  label: "Practice pts",     multiplier: 1 },
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
              <p className="mt-0.5 text-[10px] text-muted-foreground">= {earned} pts</p>
            </div>
          );
        })}
      </div>

      {row.practice_days > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          🔥 Practiced on {row.practice_days} day{row.practice_days !== 1 ? "s" : ""}
        </p>
      )}
    </details>
  );
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchLeaderboard(scope: Scope): Promise<{
  rows: LeaderRow[];
  viewMissing: boolean;
  currentUserId: string | null;
  userPrefs: UserPrefs | null;
  scopeLabel: string;
  outsideTopNRow: { row: LeaderRow; rank: number } | null;
  profileMap: ProfileMap;
}> {
  const supabase = await createSupabaseServerClient();

  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData?.user?.id ?? null;

  // Fetch user prefs (needed for dept/level scope labels and filtering)
  let userPrefs: UserPrefs | null = null;
  if (currentUserId) {
    const { data } = await supabase
      .from("study_preferences")
      .select("department_id, faculty_id, level, department")
      .eq("user_id", currentUserId)
      .maybeSingle();
    if (data) userPrefs = data as UserPrefs;
  }

  // Build the base leaderboard query
  let query = supabase
    .from("study_leaderboard_v")
    .select(
      "user_id,email,questions,question_upvotes,answers,accepted,practice_points,practice_days,points"
    )
    .order("points", { ascending: false })
    .limit(50);

  let scopeLabel = "All of JABU";

  // Scope: filter to users who share the same department_id or level
  if (scope === "dept" && userPrefs?.department_id) {
    // Get user_ids in the same department from study_preferences
    const { data: deptUsers } = await supabase
      .from("study_preferences")
      .select("user_id")
      .eq("department_id", userPrefs.department_id);

    const userIds = (deptUsers ?? []).map((r: any) => r.user_id as string);
    if (userIds.length > 0) {
      query = query.in("user_id", userIds);
    }
    scopeLabel = userPrefs.department
      ? `${userPrefs.department} Dept.`
      : "My Department";
  } else if (scope === "level" && userPrefs?.level) {
    // Get user_ids at the same level
    const { data: levelUsers } = await supabase
      .from("study_preferences")
      .select("user_id")
      .eq("level", userPrefs.level);

    const userIds = (levelUsers ?? []).map((r: any) => r.user_id as string);
    if (userIds.length > 0) {
      query = query.in("user_id", userIds);
    }
    scopeLabel = `${userPrefs.level}L Students`;
  }

  const leaderboardResult = await query;

  if (leaderboardResult.error) {
    const viewMissing =
      leaderboardResult.error.code === "42P01" ||
      leaderboardResult.error.message.toLowerCase().includes("study_leaderboard_v");
    if (viewMissing) return { rows: [], viewMissing: true, currentUserId, userPrefs, scopeLabel, outsideTopNRow: null, profileMap: {} };
    throw new Error(leaderboardResult.error.message);
  }

  const rows = (leaderboardResult.data as LeaderRow[]) ?? [];

  // If the current user is not in the top N, fetch their row and rank
  let outsideTopNRow: { row: LeaderRow; rank: number } | null = null;
  if (currentUserId && !rows.some((r) => r.user_id === currentUserId)) {
    const { data: myData } = await supabase
      .from("study_leaderboard_v")
      .select("user_id,email,questions,question_upvotes,answers,accepted,practice_points,practice_days,points")
      .eq("user_id", currentUserId)
      .maybeSingle();
    if (myData) {
      const myRow = myData as LeaderRow;
      const { count } = await supabase
        .from("study_leaderboard_v")
        .select("*", { count: "exact", head: true })
        .gt("points", myRow.points);
      outsideTopNRow = { row: myRow, rank: (count ?? 0) + 1 };
    }
  }

  // Bulk-fetch real names from profiles for all visible user_ids
  const allIds = [
    ...rows.map((r) => r.user_id),
    ...(outsideTopNRow ? [outsideTopNRow.row.user_id] : []),
  ];
  const profileMap: ProfileMap = {};
  if (allIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", allIds);
    for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name?.trim()) profileMap[p.id] = p.full_name.trim();
    }
  }

  return {
    rows,
    viewMissing: false,
    currentUserId,
    userPrefs,
    scopeLabel,
    outsideTopNRow,
    profileMap,
  };
}

// ─── Scope Tab Bar ────────────────────────────────────────────────────────────

function ScopeTabs({
  scope,
  userPrefs,
}: {
  scope: Scope;
  userPrefs: UserPrefs | null;
}) {
  const tabs: Array<{ key: Scope; label: string; icon: React.ReactNode; disabled?: boolean }> = [
    { key: "all",   label: "All JABU",     icon: <Globe className="h-4 w-4" /> },
    {
      key: "dept",
      label: userPrefs?.department ?? "My Dept.",
      icon: <Users className="h-4 w-4" />,
      disabled: !userPrefs?.department_id,
    },
    {
      key: "level",
      label: userPrefs?.level ? `${userPrefs.level}L` : "My Level",
      icon: <GraduationCap className="h-4 w-4" />,
      disabled: !userPrefs?.level,
    },
  ];

  return (
    <div className="flex w-full items-center gap-2 overflow-x-auto rounded-3xl border border-border bg-background p-2">
      {tabs.map((t) => {
        const active = scope === t.key;
        const href = t.key === "all" ? "/study/leaderboard" : `/study/leaderboard?scope=${t.key}`;
        return (
          <Link
            key={t.key}
            href={t.disabled ? "#" : href}
            aria-disabled={t.disabled}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              t.disabled && "pointer-events-none opacity-40"
            )}
          >
            {t.icon}
            <span className="max-w-[140px] truncate">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Sub-components (unchanged from original) ─────────────────────────────────

function YourRankCard({ row, rank, name }: { row: LeaderRow; rank: number; name: string }) {
  return (
    <div className="rounded-3xl border-2 border-foreground bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">Your rank</p>
          <p className="mt-1 text-2xl font-extrabold text-foreground">#{rank}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{name}</p>
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
  name,
}: {
  row: LeaderRow;
  rank: 1 | 2 | 3;
  isCurrentUser: boolean;
  name: string;
}) {
  const iconBg =
    rank === 1
      ? "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800"
      : rank === 2
      ? "bg-muted/50 border-border"
      : "bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800";

  return (
    <div
      id={isCurrentUser ? "my-rank" : undefined}
      className={cn(
        "rounded-3xl border bg-card p-4 shadow-sm",
        isCurrentUser ? "border-primary/30 bg-primary/5 ring-2 ring-primary" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-muted-foreground">#{rank}</p>
            {isCurrentUser && (
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold">
                You
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-base font-extrabold text-foreground">{name}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {row.points.toLocaleString("en-NG")}{" "}
            <span className="text-muted-foreground font-normal">pts</span>
          </p>
        </div>
        <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl border", iconBg)}>
          {rank === 1 ? (
            <Crown className="h-6 w-6 text-amber-600" />
          ) : (
            <Medal className={cn("h-6 w-6", rank === 2 ? "text-muted-foreground" : "text-rose-500")} />
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "accepted", value: row.accepted },
            { label: "answers",  value: row.answers },
            { label: "questions",value: row.questions },
            { label: "upvotes",  value: row.question_upvotes },
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
  name,
}: {
  row: LeaderRow;
  rank: number;
  isCurrentUser: boolean;
  name: string;
}) {
  return (
    <details
      id={isCurrentUser ? "my-rank" : undefined}
      className={cn(
        "group rounded-2xl border bg-card transition-colors",
        isCurrentUser ? "border-primary/30 bg-primary/5 ring-2 ring-primary" : "border-border"
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
            {initials(name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                #{rank} · {name}
              </p>
              {isCurrentUser && (
                <span className="shrink-0 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold">
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

      <div className="border-t border-border px-4 py-3">
        <PointsBreakdown row={row} />
      </div>
    </details>
  );
}

// ─── Sticky rank anchor bar ───────────────────────────────────────────────────
// Visible to logged-in users who have earned points. Stays pinned below the
// top nav while scrolling. Clicking it jumps to #my-rank in the list.

function StickyRankBar({
  rank,
  points,
  name,
}: {
  rank: number;
  points: number;
  name: string;
}) {
  return (
    <div className="sticky top-16 z-30">
      <a
        href="#my-rank"
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-background/90 px-4 py-2.5 shadow-sm backdrop-blur",
          "text-sm font-semibold text-foreground no-underline hover:bg-secondary/60 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-primary/10 text-[11px] font-extrabold text-primary">
            {initials(name)}
          </span>
          <span className="truncate">
            <span className="text-muted-foreground">You · </span>
            {name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span className="font-extrabold text-foreground">#{rank}</span>
          <span className="text-muted-foreground">{points.toLocaleString("en-NG")} pts</span>
          <span className="text-muted-foreground">↓ Jump</span>
        </div>
      </a>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams?: { scope?: string };
}) {
  // Validate scope param
  const rawScope = (searchParams?.scope ?? "all").toLowerCase();
  const scope: Scope = rawScope === "dept" || rawScope === "level" ? rawScope : "all";

  let rows: LeaderRow[] = [];
  let fetchError: string | null = null;
  let viewMissing = false;
  let currentUserId: string | null = null;
  let userPrefs: UserPrefs | null = null;
  let scopeLabel = "All of JABU";
  let outsideTopNRow: { row: LeaderRow; rank: number } | null = null;
  let profileMap: ProfileMap = {};

  try {
    const result = await fetchLeaderboard(scope);
    rows = result.rows;
    viewMissing = result.viewMissing;
    currentUserId = result.currentUserId;
    userPrefs = result.userPrefs;
    scopeLabel = result.scopeLabel;
    outsideTopNRow = result.outsideTopNRow;
    profileMap = result.profileMap;
  } catch (e: any) {
    fetchError = e?.message ?? "Failed to load leaderboard";
  }

  const top3 = rows.slice(0, 3) as Array<LeaderRow & { rank: 1 | 2 | 3 }>;
  const rest = rows.slice(3);

  const myRankIndex = currentUserId
    ? rows.findIndex((r) => r.user_id === currentUserId)
    : -1;
  const myRow = myRankIndex >= 0 ? rows[myRankIndex] : null;
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;
  const showYourRankCard = myRow !== null && myRank !== null && myRank > 3;

  const activeUserRow = myRow ?? outsideTopNRow?.row ?? null;
  const activeUserRank = myRank ?? outsideTopNRow?.rank ?? null;
  const myName = activeUserRow
    ? displayName(activeUserRow.user_id, activeUserRow.email, profileMap)
    : null;
  const showStickyBar = !!currentUserId && !!activeUserRow && !!activeUserRank && !fetchError && !viewMissing;

  // Show a hint when dept/level scope finds no one (user is alone or prefs missing)
  const scopeEmpty = !fetchError && rows.length === 0 && scope !== "all";
  const noPrefsForScope =
    (scope === "dept" && !userPrefs?.department_id) ||
    (scope === "level" && !userPrefs?.level);

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
            <p className="text-sm font-semibold text-muted-foreground">Community</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
              Leaderboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing: <span className="font-semibold text-foreground">{scopeLabel}</span>
              {" "}·{" "}
              <span className="text-xs">
                Points: accepted (×5) + answer (×2) + question (×1) + upvote (×1) + practice (×1)
              </span>
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
              in your Supabase SQL editor.
            </p>
          </div>
        ) : null}
      </div>

      {/* Scope tab bar */}
      <ScopeTabs scope={scope} userPrefs={userPrefs} />

      {/* Sticky rank anchor bar */}
      {showStickyBar && myName && activeUserRank && activeUserRow ? (
        <StickyRankBar
          rank={activeUserRank}
          points={activeUserRow.points}
          name={myName}
        />
      ) : currentUserId && !fetchError && !viewMissing && !activeUserRow ? (
        <p className="text-sm text-muted-foreground">
          You haven&apos;t earned any points yet — answer a question to get started.
        </p>
      ) : null}

      {/* No prefs hint for dept/level scope */}
      {noPrefsForScope && (
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm dark:border-amber-800/40 dark:bg-amber-950/30">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            {scope === "dept" ? "Department not set" : "Level not set"}
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
            Set your {scope === "dept" ? "department" : "level"} in{" "}
            <Link href="/study/onboarding" className="underline underline-offset-2">
              Study Preferences
            </Link>{" "}
            to see a scoped leaderboard.
          </p>
        </div>
      )}

      {/* Your rank card */}
      {showYourRankCard && myRow && myRank ? (
        <YourRankCard row={myRow} rank={myRank} name={myName ?? ""} />
      ) : null}

      {myRow && myRank && myRank <= 3 ? (
        <div className="rounded-2xl border border-foreground/30 bg-card px-4 py-3 text-sm font-semibold text-foreground">
          🏆 You&apos;re in the top 3! Your card is highlighted in the podium below.
        </div>
      ) : null}

      {/* Empty state */}
      {!fetchError && rows.length === 0 && !viewMissing ? (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground">
            {scopeEmpty ? "No activity in this scope yet" : "No activity yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {scopeEmpty
              ? "Be the first to earn points in this scope — ask questions, answer peers, and practice."
              : "Once people start asking and answering questions, top helpers will appear here."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/study/questions/ask"
              className={cn(
                "inline-flex items-center justify-center rounded-2xl bg-secondary px-4 py-3",
                "text-sm font-semibold text-foreground no-underline hover:opacity-90"
              )}
            >
              Ask a question
            </Link>
            {scopeEmpty && (
              <Link
                href="/study/leaderboard"
                className={cn(
                  "inline-flex items-center justify-center rounded-2xl border border-border bg-background px-4 py-3",
                  "text-sm font-semibold text-foreground no-underline hover:bg-secondary/50"
                )}
              >
                View all of JABU
              </Link>
            )}
          </div>
        </div>
      ) : null}

      {/* Podium — top 3 */}
      {top3.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {top3.map((r, i) => (
            <PodiumCard
              key={r.user_id}
              row={r}
              rank={(i + 1) as 1 | 2 | 3}
              isCurrentUser={r.user_id === currentUserId}
              name={displayName(r.user_id, r.email, profileMap)}
            />
          ))}
        </div>
      ) : null}

      {/* Rest of top 50 */}
      {rest.length > 0 ? (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-extrabold text-foreground">Top 50</h2>
          <div className="mt-4 space-y-2">
            {rest.map((r, i) => (
              <RankRow
                key={r.user_id}
                row={r}
                rank={i + 4}
                isCurrentUser={r.user_id === currentUserId}
                name={displayName(r.user_id, r.email, profileMap)}
              />
            ))}
          </div>
          {/* Pinned user row — shown when user is outside the top 50 */}
          {outsideTopNRow && (
            <div className="mt-2 border-t-2 border-dashed border-border pt-3">
              <RankRow
                row={outsideTopNRow.row}
                rank={outsideTopNRow.rank}
                isCurrentUser
                name={displayName(outsideTopNRow.row.user_id, outsideTopNRow.row.email, profileMap)}
              />
            </div>
          )}
        </div>
      ) : outsideTopNRow ? (
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="border-t-2 border-dashed border-border pt-3">
            <RankRow
              row={outsideTopNRow.row}
              rank={outsideTopNRow.rank}
              isCurrentUser
              name={displayName(outsideTopNRow.row.user_id, outsideTopNRow.row.email, profileMap)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}