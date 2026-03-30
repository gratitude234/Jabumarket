"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bookmark, Filter, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { EmptyState } from "./StudyUI";
import { useStudyPrefs } from "./StudyPrefsContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MaterialMini = {
  id: string;
  title: string | null;
  course_code: string | null;
  level: string | null;
  semester: string | null;
  material_type: string;
  downloads: number | null;
  created_at: string;
};

export type Chips = {
  level?: number;
  semester?: string;
  type?: string;
};

// ── Weak-area helpers ─────────────────────────────────────────────────────────

/** Accuracy threshold below which a course is considered a weak area (0–1). */
const WEAK_THRESHOLD = 0.60;

/** Minimum number of submitted attempts needed before we flag a course as weak. */
const MIN_ATTEMPTS = 2;

type WeakAreaMap = Map<string, number>; // course_code (upper) → accuracy 0–1

/**
 * Fetch the user's last 50 submitted attempts, group by course_code,
 * and return a map of course codes whose average score is below WEAK_THRESHOLD.
 * Returns an empty Map if the user is not logged in or has no attempts.
 */
async function fetchWeakAreas(): Promise<WeakAreaMap> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return new Map();

  const { data, error } = await supabase
    .from("study_practice_attempts")
    .select("score, total_questions, study_quiz_sets(course_code)")
    .eq("user_id", userId)
    .eq("status", "submitted")
    .not("total_questions", "is", null)
    .gt("total_questions", 0)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data?.length) return new Map();

  // Aggregate per course_code
  const acc = new Map<string, { totalScore: number; totalQs: number; count: number }>();

  for (const row of data as any[]) {
    const code = (row.study_quiz_sets?.course_code ?? "").toString().trim().toUpperCase();
    if (!code) continue;
    const score = Number(row.score ?? 0);
    const total = Number(row.total_questions ?? 0);
    if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) continue;

    const cur = acc.get(code) ?? { totalScore: 0, totalQs: 0, count: 0 };
    acc.set(code, { totalScore: cur.totalScore + score, totalQs: cur.totalQs + total, count: cur.count + 1 });
  }

  const weak = new Map<string, number>();
  for (const [code, { totalScore, totalQs, count }] of acc) {
    if (count < MIN_ATTEMPTS) continue;
    const accuracy = totalScore / totalQs;
    if (accuracy < WEAK_THRESHOLD) weak.set(code, accuracy);
  }

  return weak;
}

// ── ForYouSection ─────────────────────────────────────────────────────────────

interface ForYouSectionProps {
  chips: Chips;
  onClearFilters: () => void;
}

/**
 * "For you" section on the Study home page.
 *
 * Step 5.4 addition: weak-area boosting.
 * In parallel to the materials fetch, we pull the user's recent practice
 * attempt scores and identify course codes where their accuracy < 60%.
 * Those materials are sorted to the top and tagged with a "Needs work" badge.
 */
export function ForYouSection({ chips, onClearFilters }: ForYouSectionProps) {
  const { prefs, hasPrefs, loading: prefsLoading } = useStudyPrefs();

  const [items, setItems]           = useState<MaterialMini[]>([]);
  const [fetching, setFetching]     = useState(false);
  const [weakAreas, setWeakAreas]   = useState<WeakAreaMap>(new Map());
  const [weakLoading, setWeakLoading] = useState(true);

  // Fetch weak areas once on mount (independent of chips/prefs)
  useEffect(() => {
    let cancelled = false;
    setWeakLoading(true);
    fetchWeakAreas().then((map) => {
      if (!cancelled) { setWeakAreas(map); setWeakLoading(false); }
    }).catch(() => {
      if (!cancelled) setWeakLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Re-query whenever prefs or chips change
  useEffect(() => {
    if (prefsLoading || !hasPrefs || !prefs) {
      setItems([]);
      return;
    }

    let cancelled = false;

    async function fetchForYou() {
      setFetching(true);

      let q = supabase
        .from("study_materials")
        .select(
          "id,title,course_code,level,semester,material_type,downloads,created_at"
        )
        .eq("approved", true)
        .order("created_at", { ascending: false })
        .limit(12);

      // ── Prefs filters ──────────────────────────────────────────────────────
      if (prefs!.department_id) {
        q = q.eq("department_id", prefs!.department_id);
      } else if (prefs!.department) {
        q = q.ilike("department", `%${prefs!.department}%`);
      }

      if (!prefs!.department_id) {
        if (prefs!.faculty_id) q = q.eq("faculty_id", prefs!.faculty_id);
        else if (prefs!.faculty) q = q.ilike("faculty", `%${prefs!.faculty}%`);
      }

      if (prefs!.level) q = q.eq("level", String(prefs!.level));

      // ── Chip filters — applied server-side ────────────────────────────────
      if (chips.level)    q = q.eq("level", String(chips.level));
      if (chips.semester) q = q.eq("semester", chips.semester);
      if (chips.type)     q = q.eq("material_type", chips.type);

      const { data, error } = await q;
      if (cancelled) return;

      setItems(!error ? ((data as MaterialMini[]) ?? []) : []);
      setFetching(false);
    }

    fetchForYou();
    return () => { cancelled = true; };
  }, [
    prefsLoading,
    hasPrefs,
    prefs,
    chips.level,
    chips.semester,
    chips.type,
  ]);

  // Sort: weak-area course codes first, then by recency
  const sortedItems = useMemo(() => {
    if (!weakAreas.size || !items.length) return items;

    return [...items].sort((a, b) => {
      const aWeak = weakAreas.has((a.course_code ?? "").toUpperCase());
      const bWeak = weakAreas.has((b.course_code ?? "").toUpperCase());
      if (aWeak && !bWeak) return -1;
      if (!aWeak && bWeak) return 1;
      return 0; // preserve existing order within each group
    });
  }, [items, weakAreas]);

  const isBoostingActive = !weakLoading && weakAreas.size > 0 &&
    sortedItems.some((m) => weakAreas.has((m.course_code ?? "").toUpperCase()));

  if (prefsLoading || !hasPrefs) return null;

  const hasChips = !!(chips.level || chips.semester || chips.type);
  const loading  = prefsLoading || fetching;

  return (
    <Section
      title="For you"
      subtitle={
        isBoostingActive
          ? "Weak-area courses boosted to the top — more practice = higher scores."
          : "Fresh uploads matching your preferences."
      }
      href="/study/materials"
      hrefLabel="See all"
    >
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton />
          <Skeleton />
        </div>
      ) : sortedItems.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {sortedItems.map((m) => (
            <MaterialCard
              key={m.id}
              m={m}
              weakAccuracy={weakAreas.get((m.course_code ?? "").toUpperCase())}
              context="for-you"
            />
          ))}
        </div>
      ) : hasChips ? (
        <EmptyState
          variant="compact"
          title="No matches for these filters"
          description="Try clearing the filters above to see your recommendations."
          action={
            <button
              type="button"
              onClick={onClearFilters}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2",
                "text-sm font-semibold text-foreground hover:bg-secondary/50"
              )}
            >
              <X className="h-4 w-4" /> Clear filters
            </button>
          }
          icon={Filter}
        />
      ) : (
        <EmptyState
          variant="compact"
          title="No recommendations yet"
          description="Check Materials or search for a course code."
          action={
            <Link
              href="/study/materials"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2",
                "text-sm font-semibold text-foreground hover:bg-secondary/50"
              )}
            >
              Browse materials <ArrowRight className="h-4 w-4" />
            </Link>
          }
          icon={Bookmark}
        />
      )}
    </Section>
  );
}

// ── Shared sub-components (also exported for use in StudyHomeClient Step 3.4) ─

interface SectionProps {
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}

export function Section({ title, subtitle, href, hrefLabel, children }: SectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-foreground">{title}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className={cn(
              "shrink-0 inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
              "text-sm font-semibold text-foreground hover:bg-secondary/50"
            )}
          >
            {hrefLabel ?? "See all"} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

export function MaterialCard({
  m,
  trending,
  weakAccuracy,
  context = 'for-you',
}: {
  m: MaterialMini;
  trending?: boolean;
  weakAccuracy?: number;
  context?: 'for-you' | 'trending';
}) {
  const href = `/study/materials/${encodeURIComponent(m.id)}`;
  const isWeak = weakAccuracy !== undefined;
  const accuracyPct = isWeak ? Math.round(weakAccuracy * 100) : null;
  const isNew = Date.now() - new Date(m.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;

  let rightElement: React.ReactNode;
  if (context === 'trending') {
    rightElement = (
      <div className="shrink-0 text-right">
        <p className="text-sm font-extrabold text-foreground">{m.downloads ?? 0}</p>
        <p className="text-[10px] text-muted-foreground">downloads</p>
      </div>
    );
  } else if (!isWeak) {
    rightElement = isNew ? (
      <span className="shrink-0 text-[10px] font-semibold rounded-full px-2 py-1 bg-[#5B35D5]/[0.07] text-[#3B24A8] border border-[#5B35D5]/20 dark:text-indigo-300">
        New
      </span>
    ) : (
      <span className="shrink-0 text-[10px] font-semibold rounded-full px-2 py-1 bg-secondary text-muted-foreground border border-border">
        Dept. pick
      </span>
    );
  } else {
    rightElement = <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }

  return (
    <Link
      href={href}
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-sm hover:bg-secondary/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isWeak ? "border-amber-300/50 dark:border-amber-700/40" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-foreground line-clamp-1">
            {m.title ?? m.course_code ?? "Material"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {(m.course_code ? `${m.course_code} • ` : "") + (m.material_type ?? "material")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {m.level && (
              <span className="rounded-full border border-border bg-background px-2 py-1">
                {m.level}
              </span>
            )}
            {m.semester && (
              <span className="rounded-full border border-border bg-background px-2 py-1">
                {m.semester}
              </span>
            )}
            {isWeak && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                Needs work · {accuracyPct}%
              </span>
            )}
          </div>
        </div>
        {rightElement}
      </div>
    </Link>
  );
}

export function Skeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm animate-pulse">
      <div className="h-4 w-2/3 rounded bg-muted" />
      <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-16 rounded-full bg-muted" />
        <div className="h-6 w-20 rounded-full bg-muted" />
      </div>
    </div>
  );
}