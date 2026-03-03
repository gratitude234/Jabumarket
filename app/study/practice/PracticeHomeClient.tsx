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
  Hash,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  SortAsc,
  SortDesc,
  Play,
  History,
  Info,
  Flame,
  Layers,
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

type ViewKey = "for_you" | "recent" | "all";

type QuizSetRow = {
  id: string;
  title: string | null;
  description: string | null;

  course_code?: string | null;
  level?: number | null;
  semester?: string | null;

  published?: boolean | null;
  approved?: boolean | null;

  questions_count?: number | null;
  total_questions?: number | null;

  time_limit_minutes?: number | null;
  created_at?: string | null;
};

type LatestAttempt = {
  id: string;
  set_id: string | null;
  created_at: string | null;
  updated_at?: string | null;

  score?: number | null;
  total_questions?: number | null;

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
  return s;
}

function pill(text: string, icon?: React.ReactNode) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      {icon ? icon : null}
      {text}
    </span>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground",
        "hover:opacity-90 disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground",
        "hover:bg-secondary/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {children}
    </button>
  );
}

function MiniTabs({
  value,
  onChange,
}: {
  value: ViewKey;
  onChange: (v: ViewKey) => void;
}) {
  const items: Array<{ k: ViewKey; label: string; icon: React.ReactNode }> = [
    { k: "for_you", label: "For you", icon: <Sparkles className="h-4 w-4" /> },
    { k: "recent", label: "Recent", icon: <History className="h-4 w-4" /> },
    { k: "all", label: "All sets", icon: <Layers className="h-4 w-4" /> },
  ];

  return (
    <div className="flex w-full items-center gap-2 overflow-auto rounded-3xl border border-border bg-background p-2">
      {items.map((it) => {
        const active = value === it.k;
        return (
          <button
            key={it.k}
            type="button"
            onClick={() => onChange(it.k)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function QuizSetCard({
  s,
  onStart,
  onPreview,
}: {
  s: QuizSetRow;
  onStart: () => void;
  onPreview: () => void;
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

  const time =
    typeof s.time_limit_minutes === "number" && Number.isFinite(s.time_limit_minutes)
      ? `${s.time_limit_minutes} min`
      : "";

  return (
    <Card className="rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {s.description ? s.description : "Practice past questions and test yourself."}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {code ? pill(code, <Hash className="h-3.5 w-3.5" />) : null}
            {level ? pill(level) : null}
            {sem ? pill(`${sem} sem`, <Clock className="h-3.5 w-3.5" />) : null}
            {qCount !== null ? pill(`${qCount} questions`) : null}
            {time ? pill(time) : null}
            {s.created_at ? pill(formatWhen(s.created_at)) : null}
          </div>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background">
          <BookOpen className="h-5 w-5 text-foreground" />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <PrimaryButton onClick={onStart}>
          <Play className="h-4 w-4" />
          Start
          <ArrowRight className="h-4 w-4" />
        </PrimaryButton>

        <SecondaryButton onClick={onPreview}>
          <Info className="h-4 w-4" />
          Preview
        </SecondaryButton>
      </div>
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

  // view tab
  const viewParam = (sp.get("view") ?? "for_you") as ViewKey;

  // published-only toggle
  const publishedParam = sp.get("published") ?? "";
  const publishedOnly = publishedParam === "1";

  // Local state
  const [q, setQ] = useState(qParam);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Preview sheet
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSet, setPreviewSet] = useState<QuizSetRow | null>(null);

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

  // Attempts
  const [latestAttempt, setLatestAttempt] = useState<LatestAttempt | null>(null);
  const [recentAttempts, setRecentAttempts] = useState<LatestAttempt[]>([]);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Pagination
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
      viewParam,
    ].join("|");
  }, [qParam, courseParam, levelParam, semesterParam, sortParam, publishedOnly, viewParam]);

  useEffect(() => setQ(qParam), [qParam]);

  // debounce search to URL (keeps mobile typing smooth)
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
          view: viewParam !== "for_you" ? viewParam : null,
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
    viewParam,
  ]);

  // Reset list when filters change
  useEffect(() => {
    setPage(1);
    setSets([]);
    setHasMore(false);
    setTotal(0);
  }, [filtersKey]);

  // Load latest + recent attempts (best-effort)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) {
          if (mounted) {
            setLatestAttempt(null);
            setRecentAttempts([]);
          }
          return;
        }

        const res = await supabase
          .from("study_practice_attempts")
          .select(
            `
            id,set_id,created_at,updated_at,score,total_questions,
            study_quiz_sets(id,title,course_code)
          `
          )
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(6);

        if (!mounted) return;

        if (res.error) {
          setLatestAttempt(null);
          setRecentAttempts([]);
          return;
        }

        const rows = ((res.data as any[]) ?? []).filter(Boolean) as LatestAttempt[];
        setLatestAttempt(rows[0] ?? null);
        setRecentAttempts(rows.slice(0, 6));
      } catch {
        if (mounted) {
          setLatestAttempt(null);
          setRecentAttempts([]);
        }
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
      // request optional columns if they exist in your schema
      const selectFields =
        "id,title,description,course_code,level,semester,time_limit_minutes,published,questions_count,created_at";

      let query = supabase.from("study_quiz_sets").select(selectFields, { count: "exact" });

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
        // flexible match (your DB might store "first/second/summer" or "1st/2nd/summer")
        const s = semesterParam.trim().toLowerCase();
        if (s) query = query.eq("semester", s);
      }

      if (sortParam === "oldest") query = query.order("created_at", { ascending: true });
      else query = query.order("created_at", { ascending: false });

      const from = (nextPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const res = await query.range(from, to);

      if (res.error) {
        const msg = res.error.message || "Unknown error";
        setLoadError(msg);

        if (
          msg.includes("published") ||
          msg.includes("approved") ||
          msg.includes("questions_count") ||
          msg.includes("time_limit_minutes") ||
          msg.includes("semester")
        ) {
          setSchemaHint(
            "Some optional columns are missing (e.g., semester/time_limit/questions_count/published). The page still works — add them later for richer UX."
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
        view: viewParam !== "for_you" ? viewParam : null,
      })
    );
    setDrawerOpen(false);
  }

  function clearAll() {
    setQ("");
    router.replace(buildHref(pathname, { view: viewParam !== "for_you" ? viewParam : null }));
  }

  function setView(v: ViewKey) {
    router.replace(
      buildHref(pathname, {
        q: qParam || null,
        course: courseParam || null,
        level: levelParam || null,
        semester: semesterParam || null,
        sort: sortParam !== "newest" ? sortParam : null,
        published: publishedOnly ? "1" : null,
        view: v !== "for_you" ? v : null,
      })
    );
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

  // derived view data
  const forYouSets = useMemo(() => {
    // lightweight "for you": prefer sets matching active level/semester/course filters if present
    // (later you can replace with actual user profile dept/level logic)
    if (!sets.length) return [];
    const wantCourse = courseParam.trim().toUpperCase();
    const wantLevel = Number(levelParam || NaN);
    const wantSem = semesterParam.trim().toLowerCase();

    const scored = sets.map((s) => {
      let score = 0;
      const code = (s.course_code ?? "").toString().trim().toUpperCase();
      if (wantCourse && code === wantCourse) score += 3;
      if (Number.isFinite(wantLevel) && typeof s.level === "number" && s.level === wantLevel) score += 2;
      if (wantSem && (s.semester ?? "").toString().trim().toLowerCase() === wantSem) score += 1;
      // small bias to newer
      if (s.created_at) score += 0.2;
      return { s, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.s);
  }, [sets, courseParam, levelParam, semesterParam]);

  const visibleSets = useMemo(() => {
    if (viewParam === "for_you") return forYouSets.length ? forYouSets : sets;
    return sets;
  }, [viewParam, forYouSets, sets]);

  const showRecentEmpty = viewParam === "recent" && recentAttempts.length === 0;

  function openPreview(s: QuizSetRow) {
    setPreviewSet(s);
    setPreviewOpen(true);
  }

  function startSet(id: string) {
    router.push(`/study/practice/${id}`);
  }

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <StudyTabs />

      {/* Top bar */}
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

      {/* Header */}
      <Card className="rounded-3xl">
        <PageHeader
          title="Practice"
          subtitle="Pick a set, preview it, and start in one tap."
          right={
            <span className="hidden sm:inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4" />
              {activeSortLabel}
            </span>
          }
        />
      </Card>

      {/* Continue card */}
      {latestAttempt?.set_id ? (
        <Card className="rounded-3xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground">Continue</p>
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

            <button
              type="button"
              onClick={() => startSet(String(latestAttempt.set_id))}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground",
                "hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              <Play className="h-4 w-4" />
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </Card>
      ) : null}

      {/* Tabs: For you / Recent / All */}
      <MiniTabs value={viewParam} onChange={setView} />

      {/* Sticky search + filters */}
      <div className="sticky top-16 z-30">
        <Card className="rounded-3xl border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search course code, title, topic…"
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
              Tip: try <span className="font-semibold">GST101</span> or “Anatomy”.
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
                      view: viewParam !== "for_you" ? viewParam : null,
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
                      view: viewParam !== "for_you" ? viewParam : null,
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
                      view: viewParam !== "for_you" ? viewParam : null,
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

      {/* RECENT VIEW */}
      {viewParam === "recent" ? (
        showRecentEmpty ? (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No recent attempts yet"
            description="Start any practice set and your recent attempts will show here."
            action={
              <Link
                href="/study/materials"
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground no-underline",
                  "hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              >
                <Flame className="h-4 w-4" />
                Browse Materials
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {recentAttempts.map((a) => (
              <Card key={a.id} className="rounded-3xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">
                      {(a.study_quiz_sets?.title ?? "Practice set").trim() || "Practice set"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {a.study_quiz_sets?.course_code ? (
                        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                          {String(a.study_quiz_sets.course_code).toUpperCase()}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatWhen(a.updated_at ?? a.created_at)}
                      </span>
                    </div>
                  </div>

                  {a.set_id ? (
                    <button
                      type="button"
                      onClick={() => startSet(String(a.set_id))}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground",
                        "hover:opacity-90",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      )}
                    >
                      <Play className="h-4 w-4" />
                      Open
                    </button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <>
          {/* RESULTS */}
          <div className="grid gap-3 sm:grid-cols-2">
            {loading ? (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} className="rounded-3xl" />
                ))}
              </>
            ) : visibleSets.length === 0 ? (
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
                      <Flame className="h-4 w-4" />
                      Browse Materials
                    </Link>
                  }
                />
              </div>
            ) : (
              visibleSets.map((s) => (
                <QuizSetCard
                  key={s.id}
                  s={s}
                  onStart={() => startSet(s.id)}
                  onPreview={() => openPreview(s)}
                />
              ))
            )}
          </div>

          {/* Load more (only on All sets view) */}
          {!loading && sets.length > 0 && viewParam === "all" ? (
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
        </>
      )}

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

        {/* Course: mobile-first typed input (better than empty select) */}
        <div className="mt-3 rounded-3xl border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Course</p>
          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <input
              value={draftCourse}
              onChange={(e) => setDraftCourse(e.target.value)}
              placeholder="e.g., GST101 or CSC201"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {draftCourse ? (
              <button
                type="button"
                onClick={() => setDraftCourse("")}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl border border-border bg-background hover:bg-secondary/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
                aria-label="Clear course"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            You can also search course codes in the main search bar.
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

      {/* Preview sheet */}
      <Drawer
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview"
        footer={
          previewSet ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewOpen(false);
                  startSet(previewSet.id);
                }}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground",
                  "hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                )}
              >
                <Play className="h-4 w-4" />
                Start
              </button>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground",
                  "hover:bg-secondary/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                )}
              >
                Close
              </button>
            </div>
          ) : null
        }
      >
        {previewSet ? (
          <div className="space-y-3">
            <div className="rounded-3xl border border-border bg-background p-4">
              <p className="text-base font-semibold text-foreground">
                {(previewSet.title ?? "Untitled set").trim() || "Untitled set"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {previewSet.description ? previewSet.description : "Practice past questions and test yourself."}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {previewSet.course_code ? pill(String(previewSet.course_code).toUpperCase(), <Hash className="h-3.5 w-3.5" />) : null}
                {typeof previewSet.level === "number" ? pill(`${previewSet.level}L`) : null}
                {previewSet.semester ? pill(`${safeSemesterLabel(previewSet.semester)} sem`, <Clock className="h-3.5 w-3.5" />) : null}
                {typeof previewSet.questions_count === "number" ? pill(`${previewSet.questions_count} questions`) : null}
                {typeof previewSet.time_limit_minutes === "number" ? pill(`${previewSet.time_limit_minutes} min`) : pill("Untimed")}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-muted/40 p-4">
              <p className="text-sm font-semibold text-foreground">Before you start</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>• Answer carefully and review after.</li>
                <li>• Use “History” to track your improvement.</li>
                <li>• If a set is missing, check Materials or try later.</li>
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing to preview.</p>
        )}
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