# Study Hub Home Page Redesign — Implementation Prompt

Reference: the interactive demo at `/mnt/user-data/outputs/study_home_redesign.html`

---

## Phase 1 — Read files first. Summarise each. Flag conflicts.

Read every file listed below in full before writing a single line of code.
After reading all of them, output one sentence per file and flag any shared
state or import dependencies between them.

```
app/study/StudyHomeClient.tsx
app/study/_components/StreakSection.tsx
app/study/_components/StreakCard.tsx
app/study/_components/DueTodayWidget.tsx
app/study/_components/ContinueCard.tsx
app/study/_components/ForYouSection.tsx
app/study/_components/StudyUI.tsx
app/study/_components/StudyPrefsContext.tsx
app/study/page.tsx
lib/studyPractice.ts
```

---

## Phase 2 — Implement tasks in order. Output the full modified file after each task.

---

### Task 1 — Create `app/study/_components/HeroCard.tsx`

Create this file from scratch. It is the new top-of-page greeting block that
consolidates: greeting + name, three stat tiles (streak, mastery, active
courses), due-today CTA, and 28-day activity dot grid — all in one card.

**Full component:**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { getPracticeStreak } from "@/lib/studyPractice";

export function HeroCard({
  displayName,
  hasPrefs,
  userId,
}: {
  displayName: string | null;
  hasPrefs: boolean;
  userId: string | null;
}) {
  const [streak, setStreak] = useState(0);
  const [activeDays, setActiveDays] = useState<Set<string>>(new Set());
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [streakLoading, setStreakLoading] = useState(true);

  // ── Streak + 28-day activity ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getPracticeStreak().catch(() => null);
        if (!cancelled) setStreak(res?.streak ?? 0);
      } finally {
        if (!cancelled) setStreakLoading(false);
      }

      // 28-day dot grid
      if (!userId) return;
      try {
        const since = new Date(Date.now() + 3_600_000 - 28 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const { data } = await supabase
          .from("study_daily_activity")
          .select("activity_date,did_practice")
          .eq("user_id", userId)
          .gte("activity_date", since);
        if (!cancelled && data) {
          const s = new Set<string>();
          for (const r of data as { activity_date: string; did_practice: boolean }[]) {
            if (r?.did_practice === true && r?.activity_date) s.add(String(r.activity_date));
          }
          setActiveDays(s);
        }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Due today count ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) { setDueCount(0); return; }
    let cancelled = false;
    (async () => {
      try {
        const now = new Date().toISOString();
        const { count, error } = await supabase
          .from("study_weak_questions")
          .select("user_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .lte("next_due_at", now)
          .is("graduated_at", null);
        if (!cancelled && !error) setDueCount(count ?? 0);
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Dot grid helpers ───────────────────────────────────────────────────────
  const now = new Date(Date.now() + 3_600_000);
  const todayStr = now.toISOString().slice(0, 10);
  const dotDays: string[] = [];
  for (let i = 27; i >= 0; i--) {
    dotDays.push(
      new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    );
  }

  const streakColor =
    streak >= 7 ? "text-orange-500" : streak >= 3 ? "text-amber-500" : "text-muted-foreground";

  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {/* ── Top section ── */}
      <div className="p-5 pb-4">
        {/* Greeting row */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{timeGreeting}</p>
            <p className="mt-0.5 text-xl font-extrabold tracking-tight text-foreground">
              {displayName ? `${displayName} 👋` : "Welcome 👋"}
            </p>
          </div>
          <Link
            href="/study/onboarding"
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-border bg-background px-3 py-2",
              "text-sm font-semibold text-foreground hover:bg-secondary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              !hasPrefs && "border-[#5B35D5]/20 bg-[#EEEDFE] text-[#3B24A8]"
            )}
          >
            {hasPrefs ? "Preferences" : "Set up"} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Stat tiles */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-secondary/60 px-3 py-2.5">
            <p className={cn("text-xl font-extrabold leading-none", streakLoading ? "text-muted-foreground" : streakColor)}>
              {streakLoading ? "—" : streak}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              day{streak !== 1 ? "s" : ""} streak 🔥
            </p>
          </div>

          <div className="rounded-2xl bg-secondary/60 px-3 py-2.5">
            <p className="text-xl font-extrabold leading-none text-[#5B35D5]">—</p>
            <p className="mt-1 text-[10px] text-muted-foreground">mastery this wk</p>
          </div>

          <div className="rounded-2xl bg-secondary/60 px-3 py-2.5">
            <p className="text-xl font-extrabold leading-none text-foreground">
              {hasPrefs ? "●●●" : "0"}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">courses active</p>
          </div>
        </div>

        {/* Due today */}
        {dueCount !== null && dueCount > 0 ? (
          <Link
            href="/study/practice?due=1"
            className={cn(
              "mt-3 flex items-center justify-between gap-3 no-underline",
              "rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE] px-3 py-2.5",
              "dark:border-[#5B35D5]/30 dark:bg-[#5B35D5]/10"
            )}
          >
            <p className="text-sm font-semibold text-[#3B24A8] dark:text-indigo-200">
              {dueCount} {dueCount === 1 ? "card" : "cards"} due today
            </p>
            <span className="rounded-xl bg-[#5B35D5] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4526B8]">
              Review now →
            </span>
          </Link>
        ) : dueCount === 0 ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            All caught up today
          </div>
        ) : null}
      </div>

      {/* ── 28-day activity bar ── */}
      <div className="border-t border-border px-5 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          28-day activity
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: "4px" }}>
          {dotDays.map((d) => {
            const isToday = d === todayStr;
            const practiced = activeDays.has(d);
            return (
              <div
                key={d}
                title={d}
                className={cn(
                  "h-2 rounded-sm",
                  isToday
                    ? practiced
                      ? "bg-[#5B35D5] ring-2 ring-[#5B35D5]/35 ring-offset-1"
                      : "bg-muted ring-2 ring-[#5B35D5]/30 ring-offset-1"
                    : practiced
                    ? "bg-[#5B35D5]/60"
                    : "bg-secondary"
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

---

### Task 2 — Create `app/study/_components/QuickActions.tsx`

Create this file from scratch. It is the 2×2 navigation tile grid below the
hero card.

```tsx
"use client";

import Link from "next/link";
import {
  BarChart2,
  BookOpen,
  MessageCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TILES = [
  {
    href: "/study/practice",
    label: "Practice",
    sub: "Start a session",
    icon: Zap,
    primary: true,
  },
  {
    href: "/study/materials",
    label: "Materials",
    sub: "Notes & past Qs",
    icon: BookOpen,
    primary: false,
  },
  {
    href: "/study/questions",
    label: "Q&A Forum",
    sub: "Ask or answer",
    icon: MessageCircle,
    primary: false,
  },
  {
    href: "/study/gpa",
    label: "GPA Calc",
    sub: "Track grades",
    icon: BarChart2,
    primary: false,
  },
] as const;

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {TILES.map(({ href, label, sub, icon: Icon, primary }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex flex-col gap-3 rounded-3xl p-4 no-underline transition active:scale-[0.97]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            primary
              ? "bg-[#5B35D5] hover:bg-[#4526B8]"
              : "border border-border bg-card shadow-sm hover:bg-secondary/20"
          )}
        >
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              primary ? "bg-white/20" : "bg-[#EEEDFE]"
            )}
          >
            <Icon
              className={cn("h-4.5 w-4.5", primary ? "text-white" : "text-[#5B35D5]")}
              style={{ width: 18, height: 18 }}
            />
          </div>
          <div>
            <p
              className={cn(
                "text-sm font-extrabold",
                primary ? "text-white" : "text-foreground"
              )}
            >
              {label}
            </p>
            <p
              className={cn(
                "mt-0.5 text-xs",
                primary ? "text-white/65" : "text-muted-foreground"
              )}
            >
              {sub}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

---

### Task 3 — Rewrite `app/study/_components/ContinueCard.tsx`

Replace the entire file. The new version shows in-progress attempts with a
progress fraction, time estimate, and progress bar. The "Browse materials" link
at the bottom is removed — it's redundant now that Materials is in Quick
Actions.

Key data note: `PracticeAttemptRow` from `lib/studyPractice.ts` has `score`
(questions answered so far in-progress) and `total_questions`. Use those for
the progress fraction. Estimate remaining time as
`Math.ceil(((total - answered) * 12) / 60)` minutes.

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getLatestAttempt,
  getInProgressAttempts,
  type PracticeAttemptRow,
} from "@/lib/studyPractice";

function AttemptItem({ a }: { a: PracticeAttemptRow }) {
  const answered = typeof a.score === "number" ? a.score : null;
  const total = typeof a.total_questions === "number" ? a.total_questions : null;
  const hasProgress = answered !== null && total !== null && total > 0;
  const pct = hasProgress ? Math.round((answered / total) * 100) : 0;
  const minsLeft =
    hasProgress ? Math.ceil(((total - answered) * 12) / 60) : null;

  const setTitle = a.study_quiz_sets?.title ?? "Practice set";
  const courseCode = a.study_quiz_sets?.course_code;
  const displayName = courseCode ? `${courseCode} · ${setTitle}` : setTitle;

  return (
    <Link
      href={`/study/practice/${encodeURIComponent(a.set_id)}?attempt=${encodeURIComponent(a.id)}`}
      className={cn(
        "flex items-center gap-3 px-4 py-3 no-underline transition-colors",
        "hover:bg-secondary/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE]">
        <Zap className="h-4 w-4 text-[#5B35D5]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
        {hasProgress ? (
          <>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {answered} / {total} questions
              {minsLeft !== null && minsLeft > 0 ? ` · ~${minsLeft} min left` : ""}
            </p>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-[#5B35D5] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">Resume →</p>
        )}
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function ContinueCard() {
  const [attempts, setAttempts] = useState<PracticeAttemptRow[]>([]);
  const [fallback, setFallback] = useState<PracticeAttemptRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inProgress = await getInProgressAttempts(3);
        if (cancelled) return;
        if (inProgress.length > 0) {
          setAttempts(inProgress);
        } else {
          const latest = await getLatestAttempt();
          if (!cancelled) setFallback(latest);
        }
      } catch { /* silent */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Nothing to show
  if (!loading && attempts.length === 0 && !fallback) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-extrabold text-foreground">Continue where you left off</p>
        <Link
          href="/study/history"
          className="text-xs font-semibold text-[#5B35D5] hover:underline"
        >
          See all →
        </Link>
      </div>

      {/* Attempt list */}
      {loading ? (
        <div className="animate-pulse px-4 py-3">
          <div className="h-3 w-40 rounded bg-muted" />
          <div className="mt-2 h-2.5 w-56 rounded bg-muted" />
          <div className="mt-2 h-1 w-full rounded-full bg-muted" />
        </div>
      ) : attempts.length > 0 ? (
        <div className="divide-y divide-border">
          {attempts.map((a) => (
            <AttemptItem key={a.id} a={a} />
          ))}
        </div>
      ) : fallback ? (
        <Link
          href={`/study/practice/${encodeURIComponent(fallback.set_id)}?attempt=${encodeURIComponent(fallback.id)}`}
          className={cn(
            "flex items-center gap-3 px-4 py-3 no-underline transition-colors",
            "hover:bg-secondary/40"
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE]">
            <Zap className="h-4 w-4 text-[#5B35D5]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Review last attempt</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {fallback.study_quiz_sets?.title ?? "Practice set"}
              {fallback.study_quiz_sets?.course_code
                ? ` · ${fallback.study_quiz_sets.course_code}`
                : ""}
            </p>
            {fallback.score !== null && fallback.total_questions ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Score: {fallback.score}/{fallback.total_questions}
              </p>
            ) : null}
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : null}
    </div>
  );
}
```

---

### Task 4 — Update `MaterialCard` in `app/study/_components/ForYouSection.tsx`

The existing `MaterialCard` needs two new features from the demo:

**1. A `context` prop** that switches between "for-you" and "trending" display:
- `for-you` (default): shows a contextual badge on the right instead of the arrow
- `trending`: shows download count right-aligned (number + "downloads" label) and removes the arrow

**2. Contextual badge logic for `for-you`:**
- If `isWeak`: existing amber "Needs work · X%" badge (no change)
- If uploaded within 7 days (`created_at` within 7 × 86400 × 1000 ms): indigo "New" badge
- Otherwise: muted "Dept. pick" badge

**Find the `MaterialCard` function signature** (line ~305) and update it:

```tsx
export function MaterialCard({
  m,
  trending,        // keep for backward compat — if true, sets context="trending"
  weakAccuracy,
  context = "for-you",
}: {
  m: MaterialMini;
  trending?: boolean;
  weakAccuracy?: number;
  context?: "for-you" | "trending";
}) {
```

Derive the effective context:
```tsx
const effectiveContext = trending ? "trending" : context;
```

**Inside the card return, replace the bottom-right area** (currently the `<ArrowRight>` or the `TrendingUp` pill) with:

```tsx
{effectiveContext === "trending" ? (
  <div className="shrink-0 text-right">
    <p className="text-sm font-extrabold text-foreground">{m.downloads ?? 0}</p>
    <p className="text-[10px] text-muted-foreground">downloads</p>
  </div>
) : (
  // for-you badge
  (() => {
    if (isWeak) return null; // existing weak badge handles this
    const isNew =
      m.created_at
        ? Date.now() - new Date(m.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
        : false;
    return isNew ? (
      <span className="shrink-0 self-start rounded-full border border-[#5B35D5]/20 bg-[#EEEDFE] px-2 py-0.5 text-[10px] font-semibold text-[#3B24A8] dark:text-indigo-300">
        New
      </span>
    ) : (
      <span className="shrink-0 self-start rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        Dept. pick
      </span>
    );
  })()
)}
```

Also, keep the existing weak `"Needs work"` badge in the meta pills row — it
stays where it is. When `isWeak` is true, the right-side badge slot returns
`null` (handled above).

**Remove the `<ArrowRight>` from the card entirely** — it was the only thing
in the right-side slot before. Do not render it in either context.

**Update the Trending grid in `StudyHomeClient.tsx`** (Task 5 below) to pass
`context="trending"` to its `MaterialCard` calls.

---

### Task 5 — Rewrite `app/study/StudyHomeClient.tsx`

This is the largest task. Replace the entire inner component `StudyHomeInner`.
Read the file fully first — preserve all existing data-fetching logic
(semester prompt, courses fetch, exam countdown, filteredTrending, etc.) but
restructure the JSX return completely.

**New JSX return structure:**

```
StudyTabs
Semester mismatch banner (keep as-is — sticky, shown when needed)
Exam countdown banner (keep as-is)
HeroCard
QuickActions
ContinueCard
ForYouSection  (with filter chips moved inside it — see below)
Trending section
Courses section (keep as-is, only shown when hasPrefs)
```

**Specific changes:**

**A. Remove these entirely from the return:**
- `<UnifiedSearch ... />` — the global nav search handles it
- `<PageHeader title="Study" ... />` and its wrapping elements
- `<ContributorStatusHub ... />` — move it nowhere on this page; the More sheet covers it
- `<StreakSection />` — streak is now inside HeroCard
- The leaderboard link `<div className="-mt-2 flex justify-end">` — leaderboard lives in More sheet
- `<DueTodayWidget userId={userId} />` — due count is now inside HeroCard
- The entire welcome card `<Card className="rounded-3xl">` block (the "What do you want to study today?" card with chips)
- The standalone GPA Calculator `<Link href="/study/gpa" ...>` at the bottom

**B. Add these imports at the top:**
```tsx
import { HeroCard } from "./_components/HeroCard";
import { QuickActions } from "./_components/QuickActions";
```

**C. Remove these imports** (they're no longer used after the above removals):
- `UnifiedSearch` — check it's not used elsewhere in the file first
- `ContributorStatusHub` — check first
- `StreakSection` — check first
- `DueTodayWidget` — check first
- `PageHeader` — check first (it may still be used by StudyUI exports elsewhere, but not in this file)
- `Trophy` from lucide-react — only used for the leaderboard link
- `Filter` from lucide-react — only used for the Search chip
- `GraduationCap` from lucide-react — only used for the chip and EmptyState icon
- `BookOpen` from lucide-react — check first

For each import, **confirm it has no other usage in the file before removing it.**

**D. The filter chips** (Past Questions, 1st Sem, 2nd Sem, 200L, Search) that
were inside the old welcome card need to move. They control `chips` state which
is passed to `<ForYouSection chips={chips} ... />`. Keep the `chips` state and
`clearFilters` handler. Move the chip rendering to **just above
`<ForYouSection>`** as a standalone `<div>`:

```tsx
{/* Filter chips for For You */}
<div className="flex flex-wrap gap-2">
  {([
    {
      label: "Past Questions",
      icon: (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
          PQ
        </span>
      ),
      active: chips.type === "past_question",
      onToggle: () =>
        setChips((p) => ({ ...p, type: p.type === "past_question" ? undefined : "past_question" })),
    },
    {
      label: "1st Sem",
      icon: <Clock className="h-4 w-4" />,
      active: chips.semester === "first",
      onToggle: () =>
        setChips((p) => ({ ...p, semester: p.semester === "first" ? undefined : "first" })),
    },
    {
      label: "2nd Sem",
      icon: <Clock className="h-4 w-4" />,
      active: chips.semester === "second",
      onToggle: () =>
        setChips((p) => ({ ...p, semester: p.semester === "second" ? undefined : "second" })),
    },
    {
      label: `${quickLevel}L`,
      icon: <GraduationCap className="h-4 w-4" />,
      active: chips.level === quickLevel,
      onToggle: () =>
        setChips((p) => ({ ...p, level: p.level === quickLevel ? undefined : quickLevel })),
    },
  ] as const).map(({ label, icon, active, onToggle }) => (
    <button
      key={label}
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "border-[#5B35D5]/25 bg-[#EEEDFE] text-[#3B24A8]"
          : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  ))}
</div>
```

Note: `GraduationCap` and `Clock` are needed for these chips — keep them in
the import list even though other usages are removed.

**E. Update the Trending grid** to pass `context="trending"` to `MaterialCard`:
```tsx
{filteredTrending.map((m) => (
  <MaterialCard key={m.id} m={m} context="trending" />
))}
```
Remove the `trending` boolean prop from this call.

**F. The `!loading && !hasPrefs` EmptyState** (personalise prompt) — remove
it. The HeroCard already handles the "Set up" CTA for new users.

**G. Final JSX return shape** (full structure, abbreviated):

```tsx
return (
  <div className="space-y-4 pb-28 md:pb-6">
    <StudyTabs contributorStatus={rep.status} />

    {/* Semester mismatch banner — keep exactly as-is */}
    {semesterPrompt.show && ( ... )}

    {/* Exam countdown — keep exactly as-is */}
    {examCountdown && ( ... )}

    <HeroCard
      displayName={displayName}
      hasPrefs={hasPrefs}
      userId={userId}
    />

    <QuickActions />

    <ContinueCard />

    {/* Filter chips */}
    <div className="flex flex-wrap gap-2">
      {/* ... chip buttons as defined in D above ... */}
    </div>

    <ForYouSection chips={chips} onClearFilters={clearFilters} />

    {/* Trending */}
    <Section
      title="Trending"
      subtitle={hasPrefs ? "Most downloaded across all departments." : "Most downloaded materials right now."}
      href="/study/materials"
      hrefLabel="Explore"
    >
      {/* ... loading/empty/results — same as before but MaterialCard gets context="trending" ... */}
    </Section>

    {/* Courses — keep exactly as-is, only shown when hasPrefs */}
    {hasPrefs && (
      <Section title="Courses" ... >
        {/* ... exact same as before ... */}
      </Section>
    )}
  </div>
);
```

---

### Task 6 — Update `app/study/page.tsx` loading skeleton

The `StudyHomeFallback` component currently renders skeleton shapes based on
the old layout. Update it to reflect the new structure so the loading state
doesn't flash the wrong shape.

**Replace `StudyHomeFallback`** with:

```tsx
function StudyHomeFallback() {
  return (
    <div className="space-y-4 pb-28 md:pb-6">
      {/* Hero card skeleton */}
      <div className="animate-pulse rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-6 w-36 rounded bg-muted" />
          </div>
          <div className="h-9 w-24 rounded-2xl bg-muted" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="h-14 rounded-2xl bg-muted" />
          <div className="h-14 rounded-2xl bg-muted" />
          <div className="h-14 rounded-2xl bg-muted" />
        </div>
        <div className="mt-3 h-11 rounded-2xl bg-muted" />
        <div className="mt-3 h-px rounded bg-muted" />
        <div className="mt-3 h-8 rounded bg-muted" />
      </div>

      {/* Quick actions skeleton */}
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 animate-pulse rounded-3xl bg-muted" />
        <div className="h-28 animate-pulse rounded-3xl border border-border bg-card shadow-sm" />
        <div className="h-28 animate-pulse rounded-3xl border border-border bg-card shadow-sm" />
        <div className="h-28 animate-pulse rounded-3xl border border-border bg-card shadow-sm" />
      </div>

      {/* Content skeletons */}
      <div className="space-y-3">
        <SkeletonCard className="rounded-3xl" />
        <SkeletonCard className="rounded-3xl" />
        <SkeletonCard className="rounded-3xl" lines={3} />
      </div>
    </div>
  );
}
```

---

## Verification checklist

After completing all 6 tasks, confirm every item:

**New components**
- [ ] `HeroCard.tsx` created — fetches streak, activeDays, dueCount independently
- [ ] `QuickActions.tsx` created — 4 tiles, Practice is indigo accent
- [ ] Both files export named exports (not default)

**`ContinueCard.tsx`**
- [ ] Returns `null` when no attempts and no fallback (no Browse materials link)
- [ ] In-progress items show fraction (18/40), time estimate, progress bar
- [ ] "See all →" links to `/study/history`
- [ ] Progress bar uses `#5B35D5`, not `bg-primary`

**`ForYouSection.tsx` / `MaterialCard`**
- [ ] `context` prop added — accepts `"for-you"` | `"trending"`, defaults to `"for-you"`
- [ ] `trending` boolean prop still works (maps to `context="trending"`)
- [ ] For-you cards show badge: New (indigo) / Dept. pick (muted) / Needs work (amber)
- [ ] Trending cards show download count right-aligned — no badge, no arrow
- [ ] `<ArrowRight>` removed from `MaterialCard` entirely

**`StudyHomeClient.tsx`**
- [ ] `<UnifiedSearch>` removed
- [ ] `<PageHeader title="Study" ...>` removed
- [ ] `<ContributorStatusHub>` removed
- [ ] `<StreakSection>` removed
- [ ] Leaderboard link div removed
- [ ] `<DueTodayWidget>` removed
- [ ] Welcome card ("What do you want to study today?") removed
- [ ] GPA Calculator standalone link at bottom removed
- [ ] `!loading && !hasPrefs` EmptyState personalise prompt removed
- [ ] `<HeroCard>` renders with `displayName`, `hasPrefs`, `userId`
- [ ] `<QuickActions>` renders below hero
- [ ] `<ContinueCard>` renders below quick actions
- [ ] Filter chips render between ContinueCard and ForYouSection
- [ ] Active filter chips use indigo style (not `bg-secondary`)
- [ ] Trending MaterialCards receive `context="trending"` (not `trending` boolean)
- [ ] All removed imports cleaned up (only after confirming no other usage)
- [ ] `Clock` and `GraduationCap` kept in imports (still used for filter chips)

**`page.tsx`**
- [ ] `StudyHomeFallback` matches new 3-block layout (hero + quick grid + content)

**Global**
- [ ] Zero `violet-*` Tailwind classes in any of the touched files
- [ ] Zero `amber-*` / `orange-*` on any Study Hub accent — due-today is indigo only
- [ ] All new indigo references use `#5B35D5` / `#EEEDFE` / `#3B24A8` — never `indigo-*` Tailwind