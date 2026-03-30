# Study Hub Homepage Redesign — Implementation Prompt

## Phase 1 — Read files, summarise each, flag conflicts

Read the following files in full before writing a single line of code. After reading all of them, output a one-sentence summary of each file and flag any conflicts or dependencies between them.

```
app/study/StudyHomeClient.tsx
app/study/_components/DueTodayWidget.tsx
app/study/_components/StreakSection.tsx
app/study/_components/StreakCard.tsx
app/study/_components/ContinueCard.tsx
app/study/_components/ForYouSection.tsx
app/study/_components/StudyUI.tsx
app/study/_components/UnifiedSearch.tsx
```

---

## Phase 2 — Implement tasks in order

Do not skip ahead. Complete each task fully before starting the next. After each task, output the full modified file.

---

### Task 1 — Remove duplicate search bar from `StudyHomeClient.tsx`

**File:** `app/study/StudyHomeClient.tsx`

The global navigation already includes a search bar. The `<UnifiedSearch>` component rendered inside `StudyHomeClient` is a duplicate and should be removed.

- Delete the `<UnifiedSearch ... />` JSX line from the return statement.
- Remove the `UnifiedSearch` import if it is no longer used after this deletion.
- Do not touch any other logic in this file. This task is scoped to this one removal.

---

### Task 2 — Fix `DueTodayWidget.tsx` brand color violation

**File:** `app/study/_components/DueTodayWidget.tsx`

The due-today banner currently uses amber/orange tokens. Study Hub brand color is indigo (`#5B35D5`). Orange (`#FF5C00`) and amber are exclusively for the Marketplace/food wing and must never appear in Study Hub components.

Make the following replacements:

**When `count > 0` (the active banner):**
- Container: replace `border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/40` with `border-[#5B35D5]/20 bg-[#5B35D5]/[0.07] dark:border-[#5B35D5]/30 dark:bg-[#5B35D5]/10`
- Icon `BookOpen`: replace `text-amber-600 dark:text-amber-400` with `text-[#5B35D5]`
- Text `p`: replace `text-amber-900 dark:text-amber-200` with `text-[#3B24A8] dark:text-indigo-200`
- CTA `Link`: replace `bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400` with `bg-[#5B35D5] hover:bg-[#4526B8] focus-visible:ring-[#5B35D5] dark:bg-[#5B35D5] dark:hover:bg-[#4526B8]`

Do not change the zero-state (the green "Nothing due today" pill) — it is correct as-is.

---

### Task 3 — Build `HeroCard` component and integrate into `StudyHomeClient.tsx`

This task has two parts: (A) create a new component, (B) integrate it.

#### Part A — Create `app/study/_components/HeroCard.tsx`

Create a new file. This component is the new top-of-page greeting block. It consolidates: the greeting/name, streak stat, a mastery stat, and the due-today count — all in one card.

**Component signature:**
```tsx
export function HeroCard({
  displayName,
  streak,
  dueCount,
  masteryPct,        // optional — pass null if not yet computed
  hasPrefs,
  userId,
}: {
  displayName: string;
  streak: number;
  dueCount: number | null;   // null = still loading
  masteryPct: number | null;
  hasPrefs: boolean;
  userId: string | null;
})
```

**Layout:**
```
┌──────────────────────────────────────────┐
│ Good morning                              │
│ {displayName} 👋         [Preferences →] │
│                                           │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│ │  {streak}│ │ {mastery}│ │ (blank   │  │  ← stat pills, 3-col grid
│ │ day streak│ │ % mastery│ │ for now) │  │
│ └──────────┘ └──────────┘ └──────────┘  │
│                                           │
│ [indigo pill] {n} cards due · Review now→ │  ← only if dueCount > 0
└──────────────────────────────────────────┘
```

**Styling rules:**
- Outer card: `rounded-3xl border border-border bg-card p-4 shadow-sm`
- Greeting line: `text-xs text-muted-foreground`
- Name line: `text-lg font-extrabold text-foreground`
- Preferences link: `text-sm font-semibold text-foreground hover:bg-secondary/50 rounded-2xl border border-border bg-background px-3 py-1.5` — only render if `hasPrefs` is true; if `!hasPrefs`, show a "Set up →" link pointing to `/study/onboarding`
- Stat grid: `mt-3 grid grid-cols-3 gap-2`
- Each stat tile: `rounded-2xl bg-secondary/60 px-3 py-2`
  - Number: `text-base font-extrabold text-foreground`
  - Label: `text-[10px] text-muted-foreground mt-0.5`
- Streak tile: number = `{streak}`, label = `day streak${streak === 1 ? '' : 's'} 🔥`
- Mastery tile: number = `{masteryPct !== null ? masteryPct + '%' : '—'}`, label = `mastery this week`
- Third tile: leave empty for now — render `null` in that grid cell (reserved for future)
- Due pill (only if `dueCount !== null && dueCount > 0`):
  ```
  mt-3 flex items-center justify-between gap-3 rounded-2xl
  bg-[#5B35D5]/[0.07] border border-[#5B35D5]/20 px-3 py-2.5
  dark:bg-[#5B35D5]/10 dark:border-[#5B35D5]/30
  ```
  - Left text: `text-sm font-semibold text-[#3B24A8] dark:text-indigo-200` → `{dueCount} {dueCount === 1 ? 'card' : 'cards'} due today`
  - Right CTA: `Link` to `/study/practice?due=1` — `text-xs font-bold text-white bg-[#5B35D5] hover:bg-[#4526B8] rounded-xl px-3 py-1.5` → "Review now →"
- If `dueCount === 0`: render a small inline success note instead:
  ```
  mt-3 inline-flex items-center gap-2 rounded-full border border-border
  bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground
  ```
  With `<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />` → "All caught up today"

**Data for `masteryPct`:** For now, pass `null` — it will always render `—`. The mastery calculation is a future task.

#### Part B — Integrate `HeroCard` into `StudyHomeClient.tsx`

In `StudyHomeClient.tsx`:

1. Import `HeroCard` from `./_components/HeroCard`.
2. Import `StreakSection` is already imported — read `StreakSection` to understand what data it fetches. You need the `streak` count from it. The cleanest approach: inline the streak fetch directly inside `StudyHomeClient` (you already have a `useEffect` pattern) and pass it down to `HeroCard`, instead of rendering `<StreakSection />` separately.
   - Specifically: move the streak + activeDays fetch that currently lives in `StreakSection.tsx` into `StudyHomeClient.tsx`. Store `streak` as `number` in state (default `0`).
3. Remove the `<StreakSection />` JSX render from `StudyHomeClient`.
4. Remove the `DueTodayWidget` JSX render from `StudyHomeClient` (its color-fixed version is now embedded in `HeroCard`).
5. Pass `userId` to `HeroCard` — it's available from `useStudyPrefs()`.
6. The `dueCount` for `HeroCard` needs to come from a fetch. Move the Supabase query currently in `DueTodayWidget.tsx` into `StudyHomeClient.tsx` (same pattern as streak fetch). Store as `dueCount: number | null` (null = loading).
7. Replace the old greeting card block (the Card containing "What do you want to study today?" + filter chips) with:
   ```tsx
   <HeroCard
     displayName={displayName}
     streak={streak}
     dueCount={dueCount}
     masteryPct={null}
     hasPrefs={hasPrefs}
     userId={userId}
   />
   ```
8. Keep the filter chips — move them out of the removed greeting card and render them as a standalone `<div className="flex flex-wrap gap-2">` directly below `HeroCard`, exactly as they are now. Do not change their logic.

---

### Task 4 — Add Quick Actions grid to `StudyHomeClient.tsx`

**File:** `app/study/StudyHomeClient.tsx`

Add a `QuickActions` block directly below the filter chips row (after the moved chips from Task 3). This is a 2×2 grid of navigation tiles.

**Render this JSX block** (insert it as a named constant `QuickActionsGrid` inline in the return, or as a small internal component — your call):

```tsx
<div className="grid grid-cols-2 gap-3">
  {/* Practice — accent tile */}
  <Link
    href="/study/practice"
    className="flex flex-col gap-3 rounded-3xl bg-[#5B35D5] p-4
               hover:bg-[#4526B8] focus-visible:outline-none
               focus-visible:ring-2 focus-visible:ring-[#5B35D5] focus-visible:ring-offset-2"
  >
    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
      <LayoutGrid className="h-4 w-4 text-white" />
    </div>
    <div>
      <p className="text-sm font-extrabold text-white">Practice</p>
      <p className="text-xs text-white/70">Start a session</p>
    </div>
  </Link>

  {/* Materials */}
  <Link
    href="/study/materials"
    className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm
               hover:bg-secondary/20 focus-visible:outline-none
               focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background">
      <BookOpen className="h-4 w-4 text-[#5B35D5]" />
    </div>
    <div>
      <p className="text-sm font-extrabold text-foreground">Materials</p>
      <p className="text-xs text-muted-foreground">Notes &amp; PDFs</p>
    </div>
  </Link>

  {/* Q&A Forum */}
  <Link
    href="/study/questions"
    className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm
               hover:bg-secondary/20 focus-visible:outline-none
               focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background">
      <MessageCircle className="h-4 w-4 text-[#5B35D5]" />
    </div>
    <div>
      <p className="text-sm font-extrabold text-foreground">Q&amp;A Forum</p>
      <p className="text-xs text-muted-foreground">Ask or answer</p>
    </div>
  </Link>

  {/* GPA Calculator */}
  <Link
    href="/study/gpa"
    className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm
               hover:bg-secondary/20 focus-visible:outline-none
               focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background">
      <Star className="h-4 w-4 text-[#5B35D5]" />
    </div>
    <div>
      <p className="text-sm font-extrabold text-foreground">GPA Calculator</p>
      <p className="text-xs text-muted-foreground">Track grades</p>
    </div>
  </Link>
</div>
```

Add the following to the lucide-react import in `StudyHomeClient.tsx`:
`LayoutGrid, MessageCircle, Star`

(`BookOpen` is likely already imported — check before adding it again.)

Also, **remove** the standalone GPA Calculator `<Link>` block that currently sits at the very bottom of the return statement (the one that says "Track your grades and plan for your target GPA.") — it is now redundant.

---

### Task 5 — Remove `ContributorStatusHub` from the main feed

**File:** `app/study/StudyHomeClient.tsx`

The `ContributorStatusHub` component currently renders in the main content feed, interrupting the study content flow. It should not appear on the home page at all.

- Remove the `<ContributorStatusHub ... />` JSX render from `StudyHomeClient.tsx`.
- Remove the `ContributorStatusHub` import if it becomes unused.
- Do NOT delete or modify `ContributorStatusHub` in `StudyUI.tsx` — it may be used elsewhere or moved to the Profile/More sheet in a future task.
- The `rep` data from `useStudyPrefs()` can remain — it is also used for `contributorStatus` passed to `StudyTabs`. Do not touch `StudyTabs`.

---

### Task 6 — Improve `ContinueCard.tsx` — progress context

**File:** `app/study/_components/ContinueCard.tsx`

The in-progress attempt items currently show only the set title and a bare "Resume →" text. Improve each in-progress item to show:

1. **Progress fraction** — e.g., "18 / 40 questions"
2. **Progress bar** — a thin bar showing completion percentage
3. **Estimated time remaining** — e.g., "~8 min left" (calculate as: remaining questions × 12 seconds, formatted as minutes, rounded up)

**Check the `PracticeAttemptRow` type** (in `lib/studyPractice.ts` or wherever it's defined) for available fields before writing any code. You need to find:
- The field that holds questions answered so far (likely `answered_count`, `current_question`, or similar)
- The field for total questions in the set (likely `total_questions`)

If neither field is reliably populated on in-progress attempts, fall back to showing just the set title + "Resume →" with no progress bar (do not show "0 / 0"). Only render the progress fraction and bar when both `answered` and `total` are non-null and `total > 0`.

**Updated JSX for each in-progress attempt item:**
```tsx
<Link key={a.id} href={...} className={...}>
  <div className="flex items-center gap-3">
    {/* Icon */}
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#5B35D5]/[0.07] border border-[#5B35D5]/20">
      <Bookmark className="h-4 w-4 text-[#5B35D5]" />
    </div>

    {/* Info */}
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-foreground">
        {a.study_quiz_sets?.title ?? "Practice set"}
        {a.study_quiz_sets?.course_code ? ` · ${a.study_quiz_sets.course_code}` : ""}
      </p>

      {/* Only render if data is available */}
      {answered !== null && total !== null && total > 0 && (
        <>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {answered} / {total} questions · ~{Math.ceil(((total - answered) * 12) / 60)} min left
          </p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-[#5B35D5]"
              style={{ width: `${Math.round((answered / total) * 100)}%` }}
            />
          </div>
        </>
      )}

      {(answered === null || total === null || total === 0) && (
        <p className="mt-0.5 text-xs text-muted-foreground">Resume →</p>
      )}
    </div>
  </div>
</Link>
```

---

### Task 7 — Differentiate `MaterialCard` between "For You" and "Trending" contexts

**File:** `app/study/_components/ForYouSection.tsx`

Currently `MaterialCard` receives a `trending` boolean but the visual difference is minimal (just a small TrendingUp icon). The redesign requires:

**For "For You" cards** — show a contextual badge on the right instead of the arrow:
- If the material is a weak area (`isWeak === true`): existing amber "Needs work" badge (no change needed here)
- If the material was uploaded in the last 7 days (`created_at` is within 7 days of now): show an indigo "New" badge
- Otherwise: show a subtle "Dept. pick" badge

**For "Trending" cards** — show the download count right-aligned, styled as:
```tsx
<div className="shrink-0 text-right">
  <p className="text-sm font-extrabold text-foreground">{m.downloads ?? 0}</p>
  <p className="text-[10px] text-muted-foreground">downloads</p>
</div>
```
Remove the `ArrowRight` from trending cards — the download count replaces it.

**Implementation:**
- Add a `context?: 'for-you' | 'trending'` prop to `MaterialCard` (default `'for-you'` to avoid breaking other call sites)
- When `context === 'trending'`: replace the `ArrowRight` with the download count block above. Remove the `trending` prop usage (it becomes redundant once `context` exists — keep it for one version for backwards compat, but derive behavior from `context`).
- When `context === 'for-you'` and `!isWeak`: add a right-side badge:
  ```tsx
  const isNew = Date.now() - new Date(m.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
  // badge: isNew → indigo "New" | else → muted "Dept. pick"
  ```
  Badge styles:
  - New: `text-[10px] font-semibold rounded-full px-2 py-1 bg-[#5B35D5]/[0.07] text-[#3B24A8] border border-[#5B35D5]/20 dark:text-indigo-300`
  - Dept. pick: `text-[10px] font-semibold rounded-full px-2 py-1 bg-secondary text-muted-foreground border border-border`

Update all `MaterialCard` usages in `StudyHomeClient.tsx`:
- For You grid: add `context="for-you"`
- Trending grid: add `context="trending"`

---

## Verification checklist

After completing all tasks, confirm the following before finishing:

- [ ] No `<UnifiedSearch />` component renders inside `StudyHomeClient.tsx`
- [ ] No amber/orange color tokens exist anywhere in `DueTodayWidget.tsx`
- [ ] `HeroCard` renders with indigo due-today pill (not amber/orange)
- [ ] `StreakSection` is no longer rendered in `StudyHomeClient.tsx`
- [ ] `DueTodayWidget` is no longer rendered as a standalone in `StudyHomeClient.tsx`
- [ ] Quick actions 2×2 grid renders below filter chips
- [ ] GPA Calculator standalone link at bottom of page is removed (it's now in the quick actions grid)
- [ ] `ContributorStatusHub` is no longer rendered in `StudyHomeClient.tsx`
- [ ] In-progress ContinueCard items show progress bar and fraction (when data is available)
- [ ] For You and Trending cards are visually distinct (badge vs download count)
- [ ] No orange/amber accent (`#FF5C00`, `amber-*`, `orange-*`) appears anywhere in any Study Hub component touched by this task
- [ ] All new indigo references use `#5B35D5` (not Tailwind `indigo-*` — we use the custom hex to stay consistent with the brand token)