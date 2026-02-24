"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import StudyTabs from "../_components/StudyTabs";
import { Card, EmptyState } from "../_components/StudyUI";
import { getAuthedUserId, toggleSaved } from "@/lib/studySaved";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Filter,
  Loader2,
  MessageSquarePlus,
  Search,
  SlidersHorizontal,
  ThumbsUp,
  MessagesSquare,
  X,
  AlertTriangle,
} from "lucide-react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type SortKey = "newest" | "upvoted" | "answered" | "unanswered";
type LevelKey = "" | "100" | "200" | "300" | "400" | "500" | "600";

type QuestionRow = {
  id: string;
  title: string | null;
  body: string | null;
  course_code: string | null;
  level: string | null;
  created_at: string | null;
  answers_count: number | null;
  upvotes_count: number | null;
  solved: boolean | null;
};

const PAGE_SIZE = 14;

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

function IconButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background",
        "hover:bg-secondary/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled ? "cursor-not-allowed opacity-60" : ""
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
      const first = root?.querySelector<HTMLElement>(
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
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
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
          <IconButton onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </IconButton>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block rounded-2xl border border-border bg-background p-3">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-transparent text-sm text-foreground outline-none"
      >
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
      <div className={cn("mt-0.5 grid h-6 w-6 place-items-center rounded-full border", checked ? "border-border" : "border-border/60")}>
        {checked ? <span className="h-2.5 w-2.5 rounded-full bg-foreground" /> : null}
      </div>
    </button>
  );
}

function Toast({
  text,
  actionLabel,
  onAction,
  onClose,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-card px-4 py-3 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{text}</p>
          <div className="flex items-center gap-2">
            {actionLabel && onAction ? (
              <button
                type="button"
                onClick={onAction}
                className={cn(
                  "rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground",
                  "hover:bg-secondary/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                )}
              >
                {actionLabel}
              </button>
            ) : null}
            <IconButton onClick={onClose} title="Dismiss">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "muted" | "good" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-700"
      : tone === "warn"
      ? "bg-amber-500/10 text-amber-800"
      : "bg-muted/40 text-muted-foreground";
  return <span className={cn("rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold", cls)}>{children}</span>;
}

function QuestionCard({
  q,
  saved,
  saving,
  onToggleSave,
}: {
  q: QuestionRow;
  saved: boolean;
  saving: boolean;
  onToggleSave: () => void;
}) {
  const title = (q.title ?? "Question").trim() || "Question";
  const snippet = (q.body ?? "").trim();
  const code = (q.course_code ?? "").trim().toUpperCase();
  const lvl = (q.level ?? "").trim();
  const created = q.created_at ?? null;
  const answers = q.answers_count ?? 0;
  const upvotes = q.upvotes_count ?? 0;

  const unanswered = answers === 0;
  const solved = q.solved === true;

  return (
    <Card className="rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {solved ? <Badge tone="good">Solved</Badge> : <Badge tone="warn">{unanswered ? "Unanswered" : "Open"}</Badge>}
            {code ? <Badge tone="muted">{code}</Badge> : null}
            {lvl ? <Badge tone="muted">Level {lvl}</Badge> : null}
            {created ? <Badge tone="muted">{formatWhen(created)}</Badge> : null}
          </div>

          <Link
            href={`/study/questions/${encodeURIComponent(q.id)}`}
            className="mt-2 block text-base font-semibold text-foreground no-underline hover:underline"
          >
            {title}
          </Link>

          {snippet ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{snippet}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1">
              <MessagesSquare className="h-3.5 w-3.5" /> {answers}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1">
              <ThumbsUp className="h-3.5 w-3.5" /> {upvotes}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleSave}
          disabled={saving}
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border bg-background",
            "hover:bg-secondary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            saving ? "cursor-not-allowed opacity-70" : ""
          )}
          aria-label={saved ? "Unsave question" : "Save question"}
          title={saved ? "Saved" : "Save"}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <BookmarkCheck className="h-5 w-5" />
          ) : (
            <Bookmark className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/study/questions/${encodeURIComponent(q.id)}`}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground no-underline",
            "hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          Open <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}

export default function QuestionsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // URL params
  const qParam = sp.get("q") ?? "";
  const courseParam = sp.get("course") ?? "";
  const levelParam = (sp.get("level") ?? "") as LevelKey;
  const unsolvedParam = sp.get("unsolved") === "1";
  const sortParam = (sp.get("sort") ?? "newest") as SortKey;

  // local inputs (debounced -> URL)
  const [q, setQ] = useState(qParam);
  const [course, setCourse] = useState(courseParam);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // draft filters (drawer)
  const [draftLevel, setDraftLevel] = useState<LevelKey>(levelParam);
  const [draftUnsolved, setDraftUnsolved] = useState<boolean>(unsolvedParam);
  const [draftSort, setDraftSort] = useState<SortKey>(sortParam);

  // data
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<QuestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  // saved state
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  // toast + undo
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // keep local inputs synced with URL
  useEffect(() => setQ(qParam), [qParam]);
  useEffect(() => setCourse(courseParam), [courseParam]);

  // debounce typing -> URL
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    const qNorm = normalizeQuery(q);
    const cNorm = normalizeQuery(course).toUpperCase();

    if (qNorm === normalizeQuery(qParam) && cNorm === normalizeQuery(courseParam).toUpperCase()) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      router.replace(
        buildHref(pathname, {
          q: qNorm || null,
          course: cNorm || null,
          level: levelParam || null,
          unsolved: unsolvedParam ? 1 : null,
          sort: sortParam !== "newest" ? sortParam : null,
        })
      );
    }, 350);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, course, qParam, courseParam, router, pathname, levelParam, unsolvedParam, sortParam]);

  function openFilters() {
    setDraftLevel(levelParam);
    setDraftUnsolved(unsolvedParam);
    setDraftSort(sortParam);
    setDrawerOpen(true);
  }

  function applyFilters() {
    router.replace(
      buildHref(pathname, {
        q: normalizeQuery(q) || null,
        course: normalizeQuery(course).toUpperCase() || null,
        level: draftLevel || null,
        unsolved: draftUnsolved ? 1 : null,
        sort: draftSort !== "newest" ? draftSort : null,
      })
    );
    setDrawerOpen(false);
  }

  function clearAll() {
    setQ("");
    setCourse("");
    router.replace(pathname);
  }

  const hasAnyFilters = Boolean(
    normalizeQuery(qParam) ||
      normalizeQuery(courseParam) ||
      levelParam ||
      unsolvedParam ||
      (sortParam && sortParam !== "newest")
  );

  const filtersKey = useMemo(() => {
    return [
      normalizeQuery(qParam).toLowerCase(),
      normalizeQuery(courseParam).toUpperCase(),
      levelParam,
      String(unsolvedParam),
      sortParam,
    ].join("|");
  }, [qParam, courseParam, levelParam, unsolvedParam, sortParam]);

  useEffect(() => {
    setPage(1);
    setItems([]);
    setTotal(0);
    setHasMore(false);
    setErr(null);
  }, [filtersKey]);

  async function fetchSavedForVisible(questionIds: string[]) {
    try {
      const userId = await getAuthedUserId();
      if (!userId) return;

      if (questionIds.length === 0) {
        setSavedIds(new Set());
        return;
      }

      // study_saved_items: item_type='question', question_id
      const { data, error } = await supabase
        .from("study_saved_items")
        .select("question_id")
        .eq("user_id", userId)
        .eq("item_type", "question")
        .in("question_id", questionIds);

      if (error) return;

      const set = new Set<string>();
      (data as any[] | null)?.forEach((r) => {
        if (r?.question_id) set.add(String(r.question_id));
      });
      setSavedIds(set);
    } catch {
      // silent
    }
  }

  async function fetchPage(nextPage: number) {
    const isFirst = nextPage === 1;

    if (isFirst) {
      setLoading(true);
      setErr(null);
    } else {
      setLoadingMore(true);
    }

    try {
      let query = supabase
        .from("study_questions")
        .select(
          "id,title,body,course_code,level,created_at,answers_count,upvotes_count,solved",
          { count: "exact" }
        );

      // search
      const qNorm = normalizeQuery(qParam);
      if (qNorm) {
        // best-effort OR search across title/body
        query = query.or(`title.ilike.%${qNorm}%,body.ilike.%${qNorm}%`);
      }

      // course code filter
      const cNorm = normalizeQuery(courseParam).toUpperCase();
      if (cNorm) query = query.eq("course_code", cNorm);

      // level filter
      if (levelParam) query = query.eq("level", levelParam);

      // unsolved filter
      if (unsolvedParam) {
        // treat null as unsolved as well
        query = query.or("solved.is.null,solved.eq.false");
      }

      // sorting
      if (sortParam === "upvoted") {
        query = query.order("upvotes_count", { ascending: false, nullsFirst: false });
        query = query.order("created_at", { ascending: false });
      } else if (sortParam === "answered") {
        query = query.order("answers_count", { ascending: false, nullsFirst: false });
        query = query.order("created_at", { ascending: false });
      } else if (sortParam === "unanswered") {
        // unanswered first: answers_count asc, then newest
        query = query.order("answers_count", { ascending: true, nullsFirst: true });
        query = query.order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const from = (nextPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const res = await query.range(from, to);

      if (res.error) {
        setErr(res.error.message || "Could not load questions.");
        if (isFirst) {
          setItems([]);
          setTotal(0);
          setHasMore(false);
        }
        return;
      }

      const rows = ((res.data as any[]) ?? []).filter(Boolean) as QuestionRow[];
      const totalCount = res.count ?? 0;

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

      // saved ids for visible items
      const visibleIds = (isFirst ? rows : [...items, ...rows]).map((x) => x.id);
      await fetchSavedForVisible(Array.from(new Set(visibleIds)));
    } catch (e: any) {
      setErr(e?.message ?? "Could not load questions.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  async function onToggleSave(questionId: string) {
    if (!questionId) return;

    const wasSaved = savedIds.has(questionId);
    setSavingId(questionId);

    // optimistic
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(questionId);
      else next.add(questionId);
      return next;
    });

    try {
      await toggleSaved({ itemType: "question", questionId });

      setToast({
        text: wasSaved ? "Removed from Library" : "Saved to Library",
        undo: async () => {
          try {
            // optimistic revert
            setSavedIds((prev) => {
              const next = new Set(prev);
              if (wasSaved) next.add(questionId);
              else next.delete(questionId);
              return next;
            });

            // toggle again in DB
            await toggleSaved({ itemType: "question", questionId });
          } catch {
            // resync saved state
            await fetchSavedForVisible(items.map((x) => x.id));
          }
        },
      });
    } catch (e: any) {
      // revert
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(questionId);
        else next.delete(questionId);
        return next;
      });
      setToast({ text: e?.message ?? "Could not update saved state." });
    } finally {
      setSavingId(null);
    }
  }

  const showingFrom = total === 0 ? 0 : 1;
  const showingTo = Math.min(total, items.length);

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
          href="/study/questions/ask"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground no-underline",
            "hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <MessageSquarePlus className="h-4 w-4" />
          Ask
        </Link>
      </div>

      {/* Header card */}
      <div className="rounded-3xl border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight text-foreground sm:text-xl">Questions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask, answer, and learn. Filter by course and level to find what you need.
            </p>
          </div>

          <span className="hidden sm:inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground">
            Showing <span className="text-foreground">{showingFrom}</span>–<span className="text-foreground">{showingTo}</span> of{" "}
            <span className="text-foreground">{total}</span>
          </span>
        </div>

        {/* Sticky-ish search row */}
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search questions… (e.g., GST101, ‘osmosis’)"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {q ? (
            <IconButton onClick={() => setQ("")} title="Clear search">
              <X className="h-4 w-4" />
            </IconButton>
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

        {/* Quick course input */}
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <input
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            placeholder="Course code (optional)… e.g., GST101"
            className="w-full bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          />
          {course ? (
            <IconButton onClick={() => setCourse("")} title="Clear course">
              <X className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>

        {/* Active filter chips */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {levelParam ? (
            <Chip
              active
              onClick={() =>
                router.replace(
                  buildHref(pathname, {
                    q: qParam || null,
                    course: courseParam || null,
                    level: null,
                    unsolved: unsolvedParam ? 1 : null,
                    sort: sortParam !== "newest" ? sortParam : null,
                  })
                )
              }
            >
              Level {levelParam} <X className="h-4 w-4" />
            </Chip>
          ) : null}

          {unsolvedParam ? (
            <Chip
              active
              onClick={() =>
                router.replace(
                  buildHref(pathname, {
                    q: qParam || null,
                    course: courseParam || null,
                    level: levelParam || null,
                    unsolved: null,
                    sort: sortParam !== "newest" ? sortParam : null,
                  })
                )
              }
            >
              Unsolved <X className="h-4 w-4" />
            </Chip>
          ) : null}

          {sortParam !== "newest" ? (
            <Chip
              active
              onClick={() =>
                router.replace(
                  buildHref(pathname, {
                    q: qParam || null,
                    course: courseParam || null,
                    level: levelParam || null,
                    unsolved: unsolvedParam ? 1 : null,
                    sort: null,
                  })
                )
              }
            >
              Sort: {sortParam} <X className="h-4 w-4" />
            </Chip>
          ) : null}

          {hasAnyFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className={cn(
                "ml-auto inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold",
                "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          ) : (
            <span className="ml-auto text-xs font-semibold text-muted-foreground">
              Tip: open filters to sort and pick level.
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {err ? (
        <div className="rounded-3xl border border-border bg-background p-4">
          <p className="text-sm font-semibold text-foreground">Couldn’t load questions</p>
          <p className="mt-1 text-sm text-muted-foreground">{err}</p>
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
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-border bg-background p-4">
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
              <div className="mt-4 h-10 w-full rounded-2xl bg-muted" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title="No questions found"
          description={hasAnyFilters ? "Try clearing filters or searching a different keyword." : "Be the first to ask something."}
          action={
            <Link
              href="/study/questions/ask"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground no-underline",
                "hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              <MessageSquarePlus className="h-4 w-4" />
              Ask a question
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((qq) => (
              <QuestionCard
                key={qq.id}
                q={qq}
                saved={savedIds.has(qq.id)}
                saving={savingId === qq.id}
                onToggleSave={() => onToggleSave(qq.id)}
              />
            ))}
          </div>

          {/* Load more */}
          <div className="flex justify-center pt-2">
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
                  loadingMore ? "cursor-not-allowed opacity-70" : ""
                )}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </>
                ) : (
                  <>
                    Load more <ChevronDown className="h-4 w-4" />
                  </>
                )}
              </button>
            ) : (
              <p className="text-sm font-semibold text-muted-foreground">You’ve reached the end.</p>
            )}
          </div>
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
                setDraftLevel("");
                setDraftUnsolved(false);
                setDraftSort("newest");
              }}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground",
                "hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              )}
            >
              Reset
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
            label="Sort"
            value={draftSort}
            onChange={(v) => setDraftSort(v as SortKey)}
            options={[
              { value: "newest", label: "Newest" },
              { value: "upvoted", label: "Most upvoted" },
              { value: "answered", label: "Most answered" },
              { value: "unanswered", label: "Unanswered first" },
            ]}
          />

          <SelectRow
            label="Level"
            value={draftLevel}
            onChange={(v) => setDraftLevel(v as LevelKey)}
            options={[
              { value: "", label: "All levels" },
              { value: "100", label: "100" },
              { value: "200", label: "200" },
              { value: "300", label: "300" },
              { value: "400", label: "400" },
              { value: "500", label: "500" },
              { value: "600", label: "600" },
            ]}
          />
        </div>

        <div className="mt-3">
          <ToggleRow
            label="Unsolved only"
            desc="Show questions that are not marked solved."
            checked={draftUnsolved}
            onChange={setDraftUnsolved}
          />
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Search & course updates automatically; filters apply when you tap <span className="font-semibold">Apply</span>.
          </p>
        </div>
      </Drawer>

      {/* Mobile FAB Ask */}
      <Link
        href="/study/questions/ask"
        className={cn(
          "fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground shadow-lg no-underline",
          "hover:opacity-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "sm:hidden"
        )}
        aria-label="Ask a question"
        title="Ask a question"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Ask
      </Link>

      {/* Toast */}
      {toast ? (
        <Toast
          text={toast.text}
          actionLabel={toast.undo ? "Undo" : undefined}
          onAction={toast.undo}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}