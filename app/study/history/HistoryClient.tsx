"use client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import StudyTabs from "../_components/StudyTabs";
import { Card, EmptyState, SkeletonCard } from "../_components/StudyUI";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  Filter,
  History,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { FilterChip as Chip, SelectRow } from "@/components/ui/study-filters";

// ─── Utilities ────────────────────────────────────────────────────────────────

function normalizeQuery(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m";
  const m = Math.floor(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function getDateGroup(iso: string | null | undefined): string {
  if (!iso) return "Older";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Older";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const thisWeekStart = new Date(today.getTime() - today.getDay() * 86_400_000);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86_400_000);
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (itemDay >= today) return "Today";
  if (itemDay >= yesterday) return "Yesterday";
  if (itemDay >= thisWeekStart) return "This week";
  if (itemDay >= lastWeekStart) return "Last week";
  return d.toLocaleString("default", { month: "long", year: "numeric" });
}

function buildHref(path: string, params: Record<string, string | number | null | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s) sp.set(k, s);
  });
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

function pctToColor(pct: number): string {
  if (pct >= 70) return "#1D9E75";
  if (pct >= 60) return "#378ADD";
  if (pct >= 50) return "#BA7517";
  if (pct >= 45) return "#E8762A";
  return "#A32D2D";
}

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({
  score,
  total,
  size = 44,
}: {
  score: number | null | undefined;
  total: number | null | undefined;
  size?: number;
}) {
  const hasScore =
    typeof score === "number" && typeof total === "number" && total > 0;
  const pct = hasScore ? Math.round((score! / total!) * 100) : null;
  const r = Math.round(size * 0.4);
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const offset =
    pct != null ? circ * (1 - Math.max(0, Math.min(100, pct)) / 100) : circ;
  const sw = size >= 64 ? 4.5 : 3;
  const fs = size >= 64 ? 13 : size >= 44 ? 10 : 9;
  const color = pct != null ? pctToColor(pct) : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0 }}
      aria-label={pct != null ? `Score: ${pct}%` : "No score yet"}
    >
      <circle
        cx={cx} cy={cx} r={r} fill="none"
        stroke="currentColor" strokeWidth={sw} opacity={0.12}
      />
      {pct != null && (
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      )}
      <text
        x={cx} y={cx} textAnchor="middle" dominantBaseline="central"
        fontSize={fs} fontWeight={500} fill="currentColor"
      >
        {pct != null ? `${pct}%` : "—"}
      </text>
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

const TABLE_ATTEMPTS = "study_practice_attempts";
const TABLE_SETS = "study_quiz_sets";

type AttemptRow = {
  id: string;
  set_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  submitted_at?: string | null;
  status?: string | null;
  score?: number | null;
  total_questions?: number | null;
  time_spent_seconds?: number | null;
  study_quiz_sets?: {
    id: string;
    title: string | null;
    course_code?: string | null;
  } | null;
};

type StatsData = {
  totalAttempts: number;
  avgScore: number | null;
  totalTimeSeconds: number;
  trendPct: number | null;
};

// ─── Stats Banner ─────────────────────────────────────────────────────────────

function StatsBanner({ stats, loading }: { stats: StatsData | null; loading: boolean }) {
  if (loading) {
    return (
      <Card className="animate-pulse rounded-3xl">
        <div className="mb-3 h-4 w-28 rounded bg-muted" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-background p-3">
              <div className="h-5 w-10 rounded bg-muted" />
              <div className="mt-1.5 h-3 w-14 rounded bg-muted" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!stats || stats.totalAttempts === 0) return null;

  const trendUp = stats.trendPct != null && stats.trendPct > 0;
  const trendDown = stats.trendPct != null && stats.trendPct < 0;

  return (
    <Card className="rounded-3xl">
      <p className="mb-3 text-sm font-extrabold text-foreground">Your progress</p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-border bg-background p-3 text-center">
          <p className="text-xl font-extrabold tabular-nums text-foreground">{stats.totalAttempts}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Attempts</p>
        </div>
        <div className="rounded-2xl border border-border bg-background p-3 text-center">
          <p className="text-xl font-extrabold tabular-nums text-foreground">
            {stats.avgScore != null ? `${stats.avgScore}%` : "—"}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Avg score</p>
        </div>
        <div className="rounded-2xl border border-border bg-background p-3 text-center">
          <p className="text-xl font-extrabold tabular-nums text-foreground">
            {stats.totalTimeSeconds > 0 ? formatDuration(stats.totalTimeSeconds) : "—"}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">Study time</p>
        </div>
      </div>

      {(trendUp || trendDown) && (
        <div
          className={cn(
            "mt-3 flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-extrabold",
            trendUp
              ? "border border-emerald-300/40 bg-emerald-100/30 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
              : "border border-rose-300/40 bg-rose-100/30 text-rose-800 dark:bg-rose-950/20 dark:text-rose-300"
          )}
        >
          {trendUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {trendUp ? "+" : ""}{stats.trendPct}% average score vs your earlier attempts
        </div>
      )}
    </Card>
  );
}

// ─── Attempt Card ─────────────────────────────────────────────────────────────

function AttemptCard({ a }: { a: AttemptRow }) {
  const title =
    (a.study_quiz_sets?.title ?? "Practice attempt").trim() || "Practice attempt";
  const code = (a.study_quiz_sets?.course_code ?? "").toString().trim().toUpperCase();
  const when = a.updated_at ?? a.created_at ?? null;

  const isSubmitted =
    Boolean(a.submitted_at) ||
    (a.status
      ? ["submitted", "completed", "finished"].includes(a.status.toLowerCase())
      : false);

  const hasScore =
    typeof a.score === "number" &&
    typeof a.total_questions === "number" &&
    a.total_questions > 0;

  const pct = hasScore ? Math.round((a.score! / a.total_questions!) * 100) : null;

  return (
    <Card className="rounded-3xl p-4">
      <div className="flex items-start gap-3">
        {/* Score ring */}
        <div className="mt-0.5 shrink-0">
          <ScoreRing
            score={isSubmitted ? a.score : null}
            total={isSubmitted ? a.total_questions : null}
            size={44}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-foreground">{title}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {code ? (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-extrabold text-foreground">
                {code}
              </span>
            ) : null}

            {isSubmitted ? (
              <span className="rounded-full border border-emerald-300/40 bg-emerald-100/30 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                Completed
              </span>
            ) : (
              <span className="rounded-full border border-amber-300/40 bg-amber-100/30 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                In progress
              </span>
            )}

            {when ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatWhen(when)}
              </span>
            ) : null}
          </div>

          {/* Progress bar for in-progress */}
          {!isSubmitted && hasScore ? (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: pct != null ? pctToColor(pct) : "#888",
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                {a.score}/{a.total_questions} answered
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/study/history/${a.id}`}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-extrabold text-foreground no-underline",
            "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          {isSubmitted ? "Review mistakes" : "Continue"}
          <ArrowRight className="h-4 w-4" />
        </Link>

        {a.set_id && isSubmitted ? (
          <Link
            href={`/study/practice/${a.set_id}`}
            title="Retry set"
            aria-label="Retry this set"
            className={cn(
              "inline-flex items-center justify-center rounded-2xl border border-border bg-background px-3 py-2.5 text-foreground no-underline",
              "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
          >
            <BookOpen className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function HistoryClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const qParam = sp.get("q") ?? "";
  const statusParam = sp.get("status") ?? "";
  const courseParam = sp.get("course") ?? "";
  const recentParam = sp.get("recent") ?? "";
  const completedOnly = statusParam === "completed";
  const inProgressOnly = statusParam === "in_progress";

  const [q, setQ] = useState(qParam);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState(statusParam);
  const [draftCourse, setDraftCourse] = useState(courseParam);
  const [draftRecent, setDraftRecent] = useState(recentParam || "30");

  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState<AttemptRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  useEffect(() => setQ(qParam), [qParam]);

  const filtersKey = useMemo(
    () =>
      [normalizeQuery(qParam), statusParam, courseParam.trim().toUpperCase(), recentParam].join("|"),
    [qParam, statusParam, courseParam, recentParam]
  );

  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(false);
    setTotal(0);
  }, [filtersKey]);

  // Debounce search → URL
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    const qNorm = normalizeQuery(q);
    if (qNorm === normalizeQuery(qParam)) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      router.replace(
        buildHref(pathname, {
          q: qNorm || null,
          status: statusParam || null,
          course: courseParam || null,
          recent: recentParam || null,
        })
      );
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, qParam, router, pathname, statusParam, courseParam, recentParam]);

  // Fetch aggregate stats once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatsLoading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return;

        const { data } = await supabase
          .from(TABLE_ATTEMPTS)
          .select("score,total_questions,time_spent_seconds")
          .eq("user_id", uid)
          .eq("status", "submitted")
          .order("submitted_at", { ascending: false })
          .limit(200);

        if (cancelled) return;

        const rows = (data ?? []).filter(Boolean) as {
          score: number | null;
          total_questions: number | null;
          time_spent_seconds: number | null;
        }[];

        const withScores = rows.filter(
          (r) =>
            typeof r.score === "number" &&
            typeof r.total_questions === "number" &&
            r.total_questions > 0
        );

        const avgScore =
          withScores.length > 0
            ? Math.round(
                withScores.reduce(
                  (sum, r) => sum + (r.score! / r.total_questions!) * 100,
                  0
                ) / withScores.length
              )
            : null;

        const totalTimeSeconds = rows.reduce((sum, r) => sum + (r.time_spent_seconds ?? 0), 0);

        // Trend: compare most-recent half vs older half (need ≥6 graded attempts)
        let trendPct: number | null = null;
        const half = Math.floor(withScores.length / 2);
        if (half >= 3) {
          const recent = withScores.slice(0, half);
          const older = withScores.slice(half);
          const rAvg =
            recent.reduce((s, r) => s + (r.score! / r.total_questions!) * 100, 0) / recent.length;
          const oAvg =
            older.reduce((s, r) => s + (r.score! / r.total_questions!) * 100, 0) / older.length;
          if (oAvg > 0) trendPct = Math.round(rAvg - oAvg);
        }

        setStats({ totalAttempts: rows.length, avgScore, totalTimeSeconds, trendPct });
      } catch {
        // Non-blocking; list still loads
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openFilters() {
    setDraftStatus(statusParam);
    setDraftCourse(courseParam);
    setDraftRecent(recentParam || "30");
    setDrawerOpen(true);
  }

  function applyFilters() {
    router.replace(
      buildHref(pathname, {
        q: normalizeQuery(q) || null,
        status: draftStatus || null,
        course: draftCourse.trim().toUpperCase() || null,
        recent: draftRecent || null,
      })
    );
    setDrawerOpen(false);
  }

  function clearAll() {
    setQ("");
    router.replace(pathname);
  }

  const hasAnyFilters = Boolean(
    qParam || statusParam || courseParam || (recentParam && recentParam !== "30")
  );

  async function fetchPage(nextPage: number) {
    const isFirst = nextPage === 1;
    if (isFirst) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setItems([]);
        setTotal(0);
        setHasMore(false);
        return;
      }

      let query = supabase
        .from(TABLE_ATTEMPTS)
        .select(
          `id,set_id,created_at,updated_at,submitted_at,status,score,total_questions,time_spent_seconds,${TABLE_SETS}(id,title,course_code)`,
          { count: "exact" }
        )
        .eq("user_id", uid);

      const recent = (recentParam || "").trim();
      if (recent && recent !== "all") {
        const days = Number(recent);
        if (Number.isFinite(days) && days > 0) {
          query = query.gte(
            "created_at",
            new Date(Date.now() - days * 86_400_000).toISOString()
          );
        }
      }

      if (completedOnly) {
        query = query.or(
          "submitted_at.not.is.null,status.ilike.%submitted%,status.ilike.%completed%"
        );
      } else if (inProgressOnly) {
        query = query.or(
          "submitted_at.is.null,status.ilike.%progress%,status.ilike.%in_progress%"
        );
      }

      const course = courseParam.trim().toUpperCase();
      if (course) query = query.eq(`${TABLE_SETS}.course_code`, course);

      const qNorm = normalizeQuery(qParam);
      if (qNorm) {
        query = query.or(
          `${TABLE_SETS}.title.ilike.%${qNorm}%,${TABLE_SETS}.course_code.ilike.%${qNorm}%`
        );
      }

      query = query
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

      const from = (nextPage - 1) * PAGE_SIZE;
      const res = await query.range(from, from + PAGE_SIZE - 1);

      if (res.error) {
        setError(res.error.message || "Could not load history.");
        if (isFirst) {
          setItems([]);
          setTotal(0);
        }
        return;
      }

      const totalCount = res.count ?? 0;
      const rows = ((res.data as any[]) ?? []).filter(Boolean) as AttemptRow[];

      setTotal(totalCount);
      setItems((prev) => {
        if (isFirst) return rows;
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev];
        for (const r of rows) if (!seen.has(r.id)) merged.push(r);
        return merged;
      });
      setHasMore((nextPage - 1) * PAGE_SIZE + rows.length < totalCount);
    } catch (e: any) {
      setError(e?.message ?? "Could not load history.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // Course filter chips — derived from loaded items
  const courseCodes = useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) {
      const code = item.study_quiz_sets?.course_code?.trim().toUpperCase();
      if (code) seen.add(code);
    }
    return [...seen].sort();
  }, [items]);

  // Group by date
  const groupedItems = useMemo(() => {
    const map = new Map<string, AttemptRow[]>();
    const order: string[] = [];
    for (const item of items) {
      const label = getDateGroup(item.updated_at ?? item.created_at);
      if (!map.has(label)) {
        map.set(label, []);
        order.push(label);
      }
      map.get(label)!.push(item);
    }
    return order.map((label) => ({ label, items: map.get(label)! }));
  }, [items]);

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <StudyTabs />

      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/study"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground no-underline",
            "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <Link
          href="/study/practice"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-extrabold text-foreground no-underline",
            "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <BookOpen className="h-4 w-4" />
          Practice
        </Link>
      </div>

      {/* Header */}
      <Card className="rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-foreground">History</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Track your progress and review every attempt.
            </p>
          </div>
          <History className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
      </Card>

      {/* Stats banner */}
      <StatsBanner stats={stats} loading={statsLoading} />

      {/* Sticky search + filters */}
      <div className="sticky top-16 z-30">
        <Card className="rounded-3xl border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by course code or set title…"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border bg-background hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={openFilters}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>
          </div>

          {/* Course chips */}
          {!loading && courseCodes.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  router.replace(
                    buildHref(pathname, {
                      q: qParam || null, status: statusParam || null,
                      course: null, recent: recentParam || null,
                    })
                  )
                }
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-extrabold transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !courseParam
                    ? "border-border bg-secondary text-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                All
              </button>
              {courseCodes.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() =>
                    router.replace(
                      buildHref(pathname, {
                        q: qParam || null, status: statusParam || null,
                        course: courseParam === code ? null : code,
                        recent: recentParam || null,
                      })
                    )
                  }
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-extrabold transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    courseParam === code
                      ? "border-border bg-secondary text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          ) : null}

          {hasAnyFilters ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Showing <span className="text-foreground">{Math.min(total, items.length)}</span> of{" "}
                <span className="text-foreground">{total}</span>
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-muted-foreground hover:bg-secondary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" />
                Clear all
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Tip: Try <span className="font-extrabold">GST101</span> or &quot;Biochemistry&quot;.
            </p>
          )}

          {(statusParam || (recentParam && recentParam !== "30")) ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {statusParam ? (
                <Chip
                  active
                  onClick={() =>
                    router.replace(
                      buildHref(pathname, {
                        q: qParam || null, status: null,
                        course: courseParam || null, recent: recentParam || null,
                      })
                    )
                  }
                >
                  <Filter className="h-3.5 w-3.5" />
                  {statusParam === "completed" ? "Completed" : "In progress"}
                  <X className="h-3.5 w-3.5" />
                </Chip>
              ) : null}
              {recentParam && recentParam !== "30" ? (
                <Chip
                  active
                  onClick={() =>
                    router.replace(
                      buildHref(pathname, {
                        q: qParam || null, status: statusParam || null,
                        course: courseParam || null, recent: null,
                      })
                    )
                  }
                >
                  {recentParam === "all" ? "All time" : `Last ${recentParam} days`}
                  <X className="h-3.5 w-3.5" />
                </Chip>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-3xl border border-border bg-background p-4">
          <p className="text-sm font-extrabold text-foreground">Couldn&apos;t load history</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => fetchPage(1)}
            className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-extrabold text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Try again <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* List */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="rounded-3xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title="No attempts yet"
          description={
            hasAnyFilters
              ? "Try clearing filters to see all attempts."
              : "Start a practice set and your attempts will show here."
          }
          action={
            <Link
              href="/study/practice"
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-extrabold text-foreground no-underline hover:opacity-90"
            >
              <BookOpen className="h-4 w-4" />
              Go to Practice
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {groupedItems.map((group) => (
            <section key={group.label}>
              <p className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((a) => (
                  <AttemptCard key={a.id} a={a} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Load more */}
      {!loading && items.length > 0 ? (
        <div className="flex justify-center">
          {hasMore ? (
            <button
              type="button"
              onClick={async () => {
                const next = page + 1;
                setPage(next);
                await fetchPage(next);
              }}
              disabled={loadingMore}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-5 py-3 text-sm font-extrabold text-foreground",
                "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                loadingMore ? "opacity-60" : ""
              )}
            >
              {loadingMore ? "Loading…" : "Load more"}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <p className="text-sm font-extrabold text-muted-foreground">
              You&apos;ve reached the end.
            </p>
          )}
        </div>
      ) : null}

      {/* Filters drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filters"
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setDraftStatus(""); setDraftCourse(""); setDraftRecent("30"); }}
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-border bg-background px-4 py-3 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex flex-1 items-center justify-center rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-extrabold text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Apply
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectRow
            label="Status" value={draftStatus} onChange={setDraftStatus} placeholder="All"
            options={[
              { value: "completed", label: "Completed" },
              { value: "in_progress", label: "In progress" },
            ]}
          />
          <SelectRow
            label="Time range" value={draftRecent} onChange={setDraftRecent} placeholder="Last 30 days"
            options={[
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
              { value: "all", label: "All time" },
            ]}
          />
        </div>
        <div className="mt-3 rounded-3xl border border-border bg-background p-4">
          <p className="text-sm font-extrabold text-foreground">Course code</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Or tap a course chip above the list for a quick filter.
          </p>
          <input
            value={draftCourse}
            onChange={(e) => setDraftCourse(e.target.value)}
            placeholder="e.g. GST101"
            className="mt-3 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-extrabold text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </div>
      </Drawer>
    </div>
  );
}