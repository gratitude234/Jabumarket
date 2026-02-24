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
  BookOpen,
  CheckCircle2,
  Clock,
  Filter,
  Hash,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
  SortAsc,
  SortDesc,
  Play,
  History,
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

type SortKey = "newest" | "oldest";

const SORTS: Array<{ key: SortKey; label: string; icon: React.ReactNode }> = [
  { key: "newest", label: "Newest", icon: <SortDesc className="h-4 w-4" /> },
  { key: "oldest", label: "Oldest", icon: <SortAsc className="h-4 w-4" /> },
];

const LEVELS = ["100", "200", "300", "400", "500"] as const;
const SEMESTERS = ["1st", "2nd", "summer"] as const;

type QuizSetRow = {
  id: string;
  title: string | null;
  description: string | null;

  // common fields (may exist)
  course_code?: string | null;
  level?: number | null;
  semester?: string | null; // could be first/second/summer or 1st/2nd

  // publishing flags (optional)
  published?: boolean | null;
  approved?: boolean | null;

  // stats (optional)
  questions_count?: number | null;
  total_questions?: number | null;

  created_at?: string | null;
};

type LatestAttempt = {
  id: string;
  quiz_set_id: string | null;
  created_at: string | null;
  updated_at?: string | null;

  // optional progress fields
  correct?: number | null;
  total?: number | null;

  study_quiz_sets?: {
    id: string;
    title: string | null;
    course_code?: string | null;
  } | null;
};

function buildHref(
  path: string,
  params: Record<string, string | number | null | undefined>
) {
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
        checked
          ? "border-border bg-secondary text-foreground"
          : "border-border/60 bg-background hover:bg-secondary/50"
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

function safeSemesterLabel(v?: string | null) {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (!s) return "";
  if (s === "first") return "1st";
  if (s === "second") return "2nd";
  return s; // "summer" or already "1st"
}

function QuizSetCard({
  s,
  onStart,
}: {
  s: QuizSetRow;
  onStart: () => void;
}) {
  const title = (s.title ?? "Untitled set").trim() || "Untitled set";
  const code = (s.course_code ?? "").toString().trim().toUpperCase();
  const sem = safeSemesterLabel(s.semester);
  const level = typeof s.level === "number" ? `${s.level}L` : "";
  const qCount =
    typeof s.questions_count === "number"
      ? s.questions_count
      : typeof s.total_questions === "number"
      ? s.total_questions
      : null;

  return (
    <Card className="rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {s.description ? s.description : "Practice past questions and test yourself."}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {code ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                <Hash className="h-3.5 w-3.5" />
                {code}
              </span>
            ) : null}

            {level ? (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {level}
              </span>
            ) : null}

            {sem ? (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {sem} sem
              </span>
            ) : null}

            {qCount !== null ? (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {qCount} questions
              </span>
            ) : null}

            {s.created_at ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatWhen(s.created_at)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background">
          <BookOpen className="h-5 w-5 text-foreground" />
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        className={cn(
          "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground",
          "hover:opacity-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      >
        <Play className="h-4 w-4" />
        Start practice
        <ArrowRight className="h-4 w-4" />
      </button>
    </Card>
  );
}

export default function PracticeHomeClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // URL params
  const qParam = sp.get("q") ?? "";
  const courseParam = sp.get("course") ?? "";
  const levelParam = sp.get("level") ?? "";
  const semesterParam = sp.get("semester") ?? "";
  const sortParam = (sp.get("sort") ?? "newest") as SortKey;

  // (optional) published-only toggle
  const publishedParam = sp.get("published") ?? "";
  const publishedOnly = publishedParam === "1";

  // Local state
  const [q, setQ] = useState(qParam);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Drawer drafts
  const [draftCourse, setDraftCourse] = useState(courseParam);
  const [draftLevel, setDraftLevel] = useState(levelParam);
  const [draftSemester, setDraftSemester] = useState(semesterParam);
  const [draftSort, setDraftSort] = useState<SortKey>(sortParam);
  const [draftPublished, setDraftPublished] = useState(publishedOnly);

  // Data
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sets, setSets] = useState<QuizSetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);

  // Continue/resume
  const [latestAttempt, setLatestAttempt] = useState<LatestAttempt | null>(null);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Pagination (load more)
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);

  const filtersKey = useMemo(() => {
    return [
      normalizeQuery(qParam),
      courseParam.trim().toUpperCase(),
      levelParam,
      semesterParam,
      sortParam,
      publishedOnly ? "p1" : "p0",
    ].join("|");
  }, [qParam, courseParam, levelParam, semesterParam, sortParam, publishedOnly]);

  // keep q synced
  useEffect(() => setQ(qParam), [qParam]);

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
          course: courseParam || null,
          level: levelParam || null,
          semester: semesterParam || null,
          sort: sortParam !== "newest" ? sortParam : null,
          published: publishedOnly ? "1" : null,
        })
      );
    }, 350);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [
    q,
    qParam,
    router,
    pathname,
    courseParam,
    levelParam,
    semesterParam,
    sortParam,
    publishedOnly,
  ]);

  // Reset list when filters change
  useEffect(() => {
    setPage(1);
    setSets([]);
    setHasMore(false);
    setTotal(0);
  }, [filtersKey]);

  // Load latest attempt (best-effort)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) {
          if (mounted) setLatestAttempt(null);
          return;
        }

        // NOTE: adjust table name if yours differs.
        // This is defensive: if table doesn't exist, it will just fail silently.
        const res = await supabase
          .from("study_practice_attempts")
          .select(
            `
            id,quiz_set_id,created_at,updated_at,correct,total,
            study_quiz_sets:quiz_set_id(id,title,course_code)
          `
          )
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        if (!mounted) return;

        if (res.error) {
          setLatestAttempt(null);
          return;
        }

        const row = (res.data as any[])?.[0] ?? null;
        setLatestAttempt(row ? (row as LatestAttempt) : null);
      } catch {
        if (mounted) setLatestAttempt(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function fetchPage(nextPage: number) {
    const isFirst = nextPage === 1;

    if (isFirst) {
      setLoading(true);
      setLoadError(null);
      setSchemaHint(null);
    } else {
      setLoadingMore(true);
    }

    try {
      // NOTE: adjust table/columns if yours differs.
      // Defensive select: includes optional fields if present.
      let query = supabase
        .from("study_quiz_sets")
        .select(
          `
          id,title,description,course_code,level,semester,published,approved,questions_count,total_questions,created_at
        `,
          { count: "exact" }
        );

      // default filter: show only published/approved if those columns exist
      // If your schema doesn’t have them, Supabase will error — we catch and show schemaHint.
      if (publishedOnly) query = query.eq("published", true);

      const qNorm = normalizeQuery(qParam);
      if (qNorm) {
        query = query.or(
          `title.ilike.%${qNorm}%,description.ilike.%${qNorm}%,course_code.ilike.%${qNorm}%`
        );
      }

      const course = courseParam.trim().toUpperCase();
      if (course) query = query.eq("course_code", course);

      if (levelParam) {
        const lv = Number(levelParam);
        if (Number.isFinite(lv)) query = query.eq("level", lv);
      }

      if (semesterParam) {
        // allow both "1st"/"2nd" and "first"/"second" in DB
        const sem = semesterParam.trim().toLowerCase();
        if (sem === "1st") query = query.in("semester", ["1st", "first"]);
        else if (sem === "2nd") query = query.in("semester", ["2nd", "second"]);
        else query = query.eq("semester", sem);
      }

      if (sortParam === "oldest") query = query.order("created_at", { ascending: true });
      else query = query.order("created_at", { ascending: false });

      const from = (nextPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const res = await query.range(from, to);

      if (res.error) {
        const msg = res.error.message || "Unknown error";
        setLoadError(msg);

        // Provide hints if columns aren't present
        if (
          msg.includes("published") ||
          msg.includes("approved") ||
          msg.includes("questions_count") ||
          msg.includes("total_questions")
        ) {
          setSchemaHint(
            "Your practice sets table is missing some optional columns (published/approved/questions_count/total_questions). The page will still work, but you can add them for richer UX."
          );
        }

        if (isFirst) {
          setSets([]);
          setTotal(0);
        }
        return;
      }

      const totalCount = res.count ?? 0;
      setTotal(totalCount);

      const rows = ((res.data as any[]) ?? []).filter(Boolean) as QuizSetRow[];

      setSets((prev) => {
        if (isFirst) return rows;
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev];
        for (const r of rows) if (!seen.has(r.id)) merged.push(r);
        return merged;
      });

      const loaded = (nextPage - 1) * PAGE_SIZE + rows.length;
      setHasMore(loaded < totalCount);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // initial fetch
  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  function openFilters() {
    setDraftCourse(courseParam);
    setDraftLevel(levelParam);
    setDraftSemester(semesterParam);
    setDraftSort(sortParam);
    setDraftPublished(publishedOnly);
    setDrawerOpen(true);
  }

  function applyFilters() {
    router.replace(
      buildHref(pathname, {
        q: normalizeQuery(q) || null,
        course: draftCourse.trim().toUpperCase() || null,
        level: draftLevel || null,
        semester: draftSemester || null,
        sort: draftSort !== "newest" ? draftSort : null,
        published: draftPublished ? "1" : null,
      })
    );
    setDrawerOpen(false);
  }

  function clearAll() {
    setQ("");
    router.replace(pathname);
  }

  const hasAnyFilters = Boolean(
    qParam ||
      courseParam ||
      levelParam ||
      semesterParam ||
      (sortParam && sortParam !== "newest") ||
      publishedOnly
  );

  const activeSortLabel = SORTS.find((s) => s.key === sortParam)?.label ?? "Newest";

  const showingFrom = total === 0 ? 0 : 1;
  const showingTo = Math.min(total, sets.length);

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <StudyTabs />

      {/* Top bar: MATCH StudyHome (no max-w container) */}
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
          href="/study/practice/history"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground no-underline",
            "hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <History className="h-4 w-4" />
          History
        </Link>
      </div>

      <Card className="rounded-3xl">
        <PageHeader
          title="Practice"
          subtitle="Practice past questions and track your improvement."
          right={
            <span className="hidden sm:inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4" />
              {activeSortLabel}
            </span>
          }
        />
      </Card>

      {/* Continue card (best-effort) */}
      {latestAttempt?.quiz_set_id ? (
        <Card className="rounded-3xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground">
                Continue where you stopped
              </p>
              <p className="mt-1 truncate text-base font-semibold text-foreground">
                {(latestAttempt.study_quiz_sets?.title ?? "Practice set").trim() || "Practice set"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {latestAttempt.study_quiz_sets?.course_code ? (
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                    {String(latestAttempt.study_quiz_sets.course_code).toUpperCase()}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatWhen(latestAttempt.updated_at ?? latestAttempt.created_at)}
                </span>
              </div>
            </div>

            <Link
              href={`/study/practice/${latestAttempt.quiz_set_id}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground no-underline",
                "hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              <Play className="h-4 w-4" />
              Continue
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>
      ) : null}

      {/* Sticky search + filters */}
      <div className="sticky top-16 z-30">
        <Card className="rounded-3xl border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search course code, set title, topic…"
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
                Showing <span className="text-foreground">{showingFrom}</span>–
                <span className="text-foreground">{showingTo}</span> of{" "}
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
              Tip: Try <span className="font-semibold">GST101</span> or “Anatomy”.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {courseParam ? (
              <Chip
                active
                onClick={() =>
                  router.replace(
                    buildHref(pathname, {
                      q: qParam || null,
                      course: null,
                      level: levelParam || null,
                      semester: semesterParam || null,
                      sort: sortParam !== "newest" ? sortParam : null,
                      published: publishedOnly ? "1" : null,
                    })
                  )
                }
                title="Clear course"
              >
                <Hash className="h-4 w-4" />
                {courseParam.toUpperCase()}
                <X className="h-4 w-4" />
              </Chip>
            ) : null}

            {levelParam ? (
              <Chip
                active
                onClick={() =>
                  router.replace(
                    buildHref(pathname, {
                      q: qParam || null,
                      course: courseParam || null,
                      level: null,
                      semester: semesterParam || null,
                      sort: sortParam !== "newest" ? sortParam : null,
                      published: publishedOnly ? "1" : null,
                    })
                  )
                }
                title="Clear level"
              >
                {levelParam}L <X className="h-4 w-4" />
              </Chip>
            ) : null}

            {semesterParam ? (
              <Chip
                active
                onClick={() =>
                  router.replace(
                    buildHref(pathname, {
                      q: qParam || null,
                      course: courseParam || null,
                      level: levelParam || null,
                      semester: null,
                      sort: sortParam !== "newest" ? sortParam : null,
                      published: publishedOnly ? "1" : null,
                    })
                  )
                }
                title="Clear semester"
              >
                <Clock className="h-4 w-4" />
                {semesterParam} <X className="h-4 w-4" />
              </Chip>
            ) : null}

            <span className="ml-auto inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4" />
              {activeSortLabel}
            </span>
          </div>
        </Card>
      </div>

      {/* Errors */}
      {loadError ? (
        <div className="rounded-3xl border border-border bg-background p-4">
          <p className="text-sm font-semibold text-foreground">Couldn’t load practice sets</p>
          <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
          {schemaHint ? (
            <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">{schemaHint}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Results */}
      <div className="grid gap-3 sm:grid-cols-2">
        {loading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} className="rounded-3xl" />
            ))}
          </>
        ) : sets.length === 0 ? (
          <div className="sm:col-span-2">
            <EmptyState
              icon={<BookOpen className="h-5 w-5" />}
              title="No practice sets found"
              description={
                hasAnyFilters
                  ? "Try clearing filters or searching a different course/topic."
                  : "No sets have been published yet. Check Materials or come back later."
              }
              action={
                <Link
                  href="/study/materials"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground no-underline",
                    "hover:opacity-90",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                >
                  <Filter className="h-4 w-4" />
                  Browse Materials
                </Link>
              }
            />
          </div>
        ) : (
          sets.map((s) => (
            <QuizSetCard
              key={s.id}
              s={s}
              onStart={() => {
                router.push(`/study/practice/${s.id}`);
              }}
            />
          ))
        )}
      </div>

      {/* Load more */}
      {!loading && sets.length > 0 ? (
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
                setDraftCourse("");
                setDraftLevel("");
                setDraftSemester("");
                setDraftSort("newest");
                setDraftPublished(false);
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
        <div className="rounded-3xl border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Sort</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setDraftSort(s.key)}
                className={cn(
                  "inline-flex items-center justify-between gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  draftSort === s.key
                    ? "border-border bg-secondary text-foreground"
                    : "border-border/60 bg-background text-foreground hover:bg-secondary/50"
                )}
              >
                <span className="inline-flex items-center gap-2">
                  {s.icon}
                  {s.label}
                </span>
                {draftSort === s.key ? <span className="text-xs font-semibold">Selected</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <SelectRow
            label="Course code"
            value={draftCourse}
            onChange={setDraftCourse}
            options={[]}
            placeholder="e.g., GST101 (type below)"
          />
          <p className="text-xs text-muted-foreground -mt-1">
            Tip: Type the course code in the search bar (it matches codes too).
          </p>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <SelectRow
            label="Level"
            value={draftLevel}
            onChange={setDraftLevel}
            options={LEVELS.map((l) => ({ value: l, label: `${l}L` }))}
            placeholder="All levels"
          />
          <SelectRow
            label="Semester"
            value={draftSemester}
            onChange={setDraftSemester}
            options={SEMESTERS.map((s) => ({ value: s, label: s }))}
            placeholder="All semesters"
          />
        </div>

        <div className="mt-3">
          <ToggleRow
            label="Published only"
            desc="Show only published sets (if supported by your DB)"
            checked={draftPublished}
            onChange={setDraftPublished}
          />
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Filters apply when you tap <span className="font-semibold">Apply</span>. Search updates automatically.
          </p>
        </div>
      </Drawer>

      {/* Toast */}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div
            role="status"
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-lg"
          >
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}