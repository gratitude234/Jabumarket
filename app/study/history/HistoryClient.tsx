"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import StudyTabs from "../_components/StudyTabs";
import { Card, EmptyState, PageHeader, SkeletonCard } from "../_components/StudyUI";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  History,
  Search,
  SlidersHorizontal,
  X,
  Filter,
  BookOpen,
  CheckCircle2,
} from "lucide-react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normalizeQuery(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function formatWhen(iso?: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * ✅ Update these if your DB uses different names.
 * The code is written so you only change table names here.
 */
const TABLE_ATTEMPTS = "study_practice_attempts";
const TABLE_SETS = "study_quiz_sets";

type AttemptRow = {
  id: string;
  quiz_set_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // optional fields (won’t break UI if missing)
  submitted_at?: string | null;
  status?: string | null;
  correct?: number | null;
  total?: number | null;

  // joined set info (optional)
  study_quiz_sets?: {
    id: string;
    title: string | null;
    course_code?: string | null;
  } | null;
};

function buildHref(path: string, params: Record<string, string | number | null | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    const s = String(v).trim();
    if (!s) return;
    sp.set(k, s);
  });
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

function Chip({
  active,
  children,
  onClick,
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-border bg-secondary text-foreground"
          : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    window.setTimeout(() => {
      const root = panelRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      first?.focus?.();
    }, 50);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity",
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        ref={panelRef}
        className={cn(
          "absolute inset-x-0 bottom-0 rounded-t-3xl border border-border bg-card shadow-xl transition-transform",
          open ? "translate-y-0" : "translate-y-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background",
              "hover:bg-secondary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-4">{children}</div>

        {footer ? <div className="border-t border-border p-4">{footer}</div> : null}
      </div>
    </div>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-2xl border border-border bg-background p-3">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-transparent text-sm text-foreground outline-none"
      >
        <option value="">{placeholder ?? "All"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-start justify-between gap-3 rounded-2xl border p-3 text-left transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "border-border bg-secondary text-foreground" : "border-border/60 bg-background hover:bg-secondary/50"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {desc ? <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p> : null}
      </div>
      <div
        className={cn(
          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border",
          checked ? "border-border bg-background" : "border-border/60 bg-background"
        )}
      >
        {checked ? <CheckCircle2 className="h-4 w-4 text-foreground" /> : null}
      </div>
    </button>
  );
}

function AttemptCard({ a }: { a: AttemptRow }) {
  const title = (a.study_quiz_sets?.title ?? "Practice attempt").trim() || "Practice attempt";
  const code = (a.study_quiz_sets?.course_code ?? "").toString().trim().toUpperCase();
  const when = a.updated_at ?? a.created_at ?? null;

  const isSubmitted =
    Boolean(a.submitted_at) ||
    (a.status ? ["submitted", "completed", "finished"].includes(a.status.toLowerCase()) : false);

  const score =
    typeof a.correct === "number" && typeof a.total === "number" && a.total > 0
      ? `${a.correct}/${a.total}`
      : null;

  return (
    <Card className="rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-foreground">{title}</p>
            {isSubmitted ? (
              <span className="rounded-full border border-border bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                Completed
              </span>
            ) : (
              <span className="rounded-full border border-border bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                In progress
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {code ? (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                {code}
              </span>
            ) : null}

            {score ? (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                Score: {score}
              </span>
            ) : null}

            {when ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatWhen(when)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background">
          <History className="h-5 w-5 text-foreground" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/study/history/${a.id}`}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground no-underline",
            "hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          {isSubmitted ? "Review mistakes" : "Continue / Review"}
          <ArrowRight className="h-4 w-4" />
        </Link>

        {a.quiz_set_id ? (
          <Link
            href={`/study/practice/${a.quiz_set_id}`}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground no-underline",
              "hover:bg-secondary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
            title="Retry set"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Retry</span>
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

export default function HistoryClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // URL params
  const qParam = sp.get("q") ?? "";
  const statusParam = sp.get("status") ?? ""; // completed | in_progress
  const courseParam = sp.get("course") ?? "";
  const recentParam = sp.get("recent") ?? ""; // 7 | 30 | all
  const completedOnly = statusParam === "completed";
  const inProgressOnly = statusParam === "in_progress";

  // local
  const [q, setQ] = useState(qParam);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // drafts
  const [draftStatus, setDraftStatus] = useState(statusParam);
  const [draftCourse, setDraftCourse] = useState(courseParam);
  const [draftRecent, setDraftRecent] = useState(recentParam || "30"); // default 30 days
  const [draftOnlyMine, setDraftOnlyMine] = useState(true); // best practice (history should be user-specific)

  // list
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState<AttemptRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);

  useEffect(() => setQ(qParam), [qParam]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filtersKey = useMemo(() => {
    return [normalizeQuery(qParam), statusParam, courseParam.trim().toUpperCase(), recentParam].join("|");
  }, [qParam, statusParam, courseParam, recentParam]);

  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(false);
    setTotal(0);
  }, [filtersKey]);

  // debounce search to URL
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

  function openFilters() {
    setDraftStatus(statusParam);
    setDraftCourse(courseParam);
    setDraftRecent(recentParam || "30");
    setDraftOnlyMine(true);
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

  const hasAnyFilters = Boolean(qParam || statusParam || courseParam || (recentParam && recentParam !== "30"));

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

      // History MUST be user-specific; if not logged in, show empty
      if (!uid) {
        setItems([]);
        setTotal(0);
        setHasMore(false);
        return;
      }

      let query = supabase
        .from(TABLE_ATTEMPTS)
        .select(
          `
          id,quiz_set_id,created_at,updated_at,submitted_at,status,correct,total,
          ${TABLE_SETS}:quiz_set_id(id,title,course_code)
        `,
          { count: "exact" }
        )
        .eq("user_id", uid);

      // recent filter (7/30/all)
      const recent = (recentParam || "").trim();
      if (recent && recent !== "all") {
        const days = Number(recent);
        if (Number.isFinite(days) && days > 0) {
          const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
          query = query.gte("created_at", since);
        }
      }

      // status filter (best-effort)
      if (completedOnly) {
        // if status column exists, filter; if not, the query may fail — caught below.
        query = query.or("submitted_at.not.is.null,status.ilike.%submitted%,status.ilike.%completed%");
      } else if (inProgressOnly) {
        query = query.or("submitted_at.is.null,status.ilike.%progress%,status.ilike.%in_progress%");
      }

      // course code filter (by joined set)
      const course = courseParam.trim().toUpperCase();
      if (course) query = query.eq(`${TABLE_SETS}.course_code`, course);

      // search across title/course code (best-effort)
      const qNorm = normalizeQuery(qParam);
      if (qNorm) {
        query = query.or(`${TABLE_SETS}.title.ilike.%${qNorm}%,${TABLE_SETS}.course_code.ilike.%${qNorm}%`);
      }

      query = query.order("updated_at", { ascending: false }).order("created_at", { ascending: false });

      const from = (nextPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const res = await query.range(from, to);

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

      const loaded = (nextPage - 1) * PAGE_SIZE + rows.length;
      setHasMore(loaded < totalCount);
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

  const showingFrom = total === 0 ? 0 : 1;
  const showingTo = Math.min(total, items.length);

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <StudyTabs />

      {/* Top bar (matches StudyHome style) */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/study"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground no-underline",
            "hover:bg-secondary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <Link
          href="/study/practice"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground no-underline",
            "hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <BookOpen className="h-4 w-4" />
          Practice
        </Link>
      </div>

      <Card className="rounded-3xl">
        <PageHeader title="History" subtitle="Review past attempts and fix your mistakes." right={null} />
      </Card>

      {/* Sticky search + filters */}
      <div className="sticky top-16 z-30">
        <Card className="rounded-3xl border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
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
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl border border-border bg-background hover:bg-secondary/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={openFilters}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground",
                "hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>
          </div>

          {hasAnyFilters ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Showing <span className="text-foreground">{showingFrom}</span>–<span className="text-foreground">{showingTo}</span> of{" "}
                <span className="text-foreground">{total}</span>
              </p>
              <button
                type="button"
                onClick={clearAll}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold",
                  "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              >
                <X className="h-3.5 w-3.5" />
                Clear all
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Tip: Try <span className="font-semibold">GST101</span> or “Biochemistry”.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {statusParam ? (
              <Chip
                active
                onClick={() => router.replace(buildHref(pathname, { q: qParam || null, status: null, course: courseParam || null, recent: recentParam || null }))}
              >
                <Filter className="h-4 w-4" />
                {statusParam === "completed" ? "Completed" : "In progress"}
                <X className="h-4 w-4" />
              </Chip>
            ) : null}

            {courseParam ? (
              <Chip
                active
                onClick={() => router.replace(buildHref(pathname, { q: qParam || null, status: statusParam || null, course: null, recent: recentParam || null }))}
              >
                {courseParam.toUpperCase()}
                <X className="h-4 w-4" />
              </Chip>
            ) : null}

            {recentParam && recentParam !== "30" ? (
              <Chip
                active
                onClick={() => router.replace(buildHref(pathname, { q: qParam || null, status: statusParam || null, course: courseParam || null, recent: null }))}
              >
                Last {recentParam === "all" ? "All time" : `${recentParam} days`}
                <X className="h-4 w-4" />
              </Chip>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-3xl border border-border bg-background p-4">
          <p className="text-sm font-semibold text-foreground">Couldn’t load history</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => fetchPage(1)}
            className={cn(
              "mt-3 inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground",
              "hover:opacity-90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
          >
            Try again <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* List */}
      <div className="grid gap-3 sm:grid-cols-2">
        {loading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} className="rounded-3xl" />
            ))}
          </>
        ) : items.length === 0 ? (
          <div className="sm:col-span-2">
            <EmptyState
              icon={<History className="h-5 w-5" />}
              title="No attempts yet"
              description={hasAnyFilters ? "Try clearing filters." : "Start a practice set and your attempts will show here."}
              action={
                <Link
                  href="/study/practice"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground no-underline",
                    "hover:opacity-90",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                >
                  <BookOpen className="h-4 w-4" />
                  Go to Practice
                </Link>
              }
            />
          </div>
        ) : (
          items.map((a) => <AttemptCard key={a.id} a={a} />)
        )}
      </div>

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
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground",
                "hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                loadingMore ? "opacity-70" : ""
              )}
            >
              {loadingMore ? "Loading…" : "Load more"}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">You’ve reached the end.</p>
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
              onClick={() => {
                setDraftStatus("");
                setDraftCourse("");
                setDraftRecent("30");
                setDraftOnlyMine(true);
              }}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground",
                "hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              )}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground",
                "hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              )}
            >
              Apply
            </button>
          </div>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <SelectRow
            label="Status"
            value={draftStatus}
            onChange={setDraftStatus}
            placeholder="All"
            options={[
              { value: "completed", label: "Completed" },
              { value: "in_progress", label: "In progress" },
            ]}
          />
          <SelectRow
            label="Time range"
            value={draftRecent}
            onChange={setDraftRecent}
            placeholder="Last 30 days"
            options={[
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
              { value: "all", label: "All time" },
            ]}
          />
        </div>

        <div className="mt-3 rounded-3xl border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Course</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Type a course code in the search bar (it matches course codes too). Optional direct filter below:
          </p>
          <input
            value={draftCourse}
            onChange={(e) => setDraftCourse(e.target.value)}
            placeholder="e.g., GST101"
            className="mt-3 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="mt-3">
          <ToggleRow
            label="Only my attempts"
            desc="History is user-specific (recommended)"
            checked={draftOnlyMine}
            onChange={setDraftOnlyMine}
          />
        </div>
      </Drawer>

      {/* Toast */}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}