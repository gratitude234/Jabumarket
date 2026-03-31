# Study Hub — Full Audit Implementation Prompt

23 findings. Organized into 4 priority tiers. Complete all of Tier 1 before starting Tier 2.

---

## Phase 1 — Read files first, summarize each, flag conflicts

Read **every file listed below** in full before writing a single line of code. After reading all of them, output a one-sentence summary per file and flag any conflicts or shared state dependencies.

```
lib/utils.ts
app/study/_components/StudyTabs.tsx
app/study/_components/StreakCard.tsx
app/study/_components/DueTodayWidget.tsx
app/study/practice/PracticeHomeClient.tsx
app/study/practice/[setId]/PracticeTakeClient.tsx
app/study/practice/[setId]/usePracticeEngine.ts   ← if it exists; skip if not
app/study/materials/MaterialsClient.tsx
app/study/materials/[id]/MaterialDetailClient.tsx
app/study/questions/QuestionsClient.tsx
app/study/questions/[id]/QuestionDetailClient.tsx
app/study/history/HistoryClient.tsx
app/study/history/[attemptId]/AttemptReviewClient.tsx
app/study/gpa/page.tsx
app/study/leaderboard/page.tsx
```

---

## Phase 2 — Implement tasks in order

Complete each task fully before starting the next. After each task output the full modified file(s). Do not batch multiple tasks into a single file output.

---

# TIER 1 — Critical: color violations and code quality

---

### Task 1 — Consolidate duplicate utility functions into `lib/utils.ts`

**Files to modify:** `lib/utils.ts`
**Files to update imports in:** `app/study/practice/PracticeHomeClient.tsx`, `app/study/materials/MaterialsClient.tsx`, `app/study/questions/QuestionsClient.tsx`, `app/study/history/HistoryClient.tsx`, `app/study/questions/[id]/QuestionDetailClient.tsx`, `app/study/history/[attemptId]/AttemptReviewClient.tsx`

**Problem:** `formatWhen()`, `normalizeQuery()`, `buildHref()`, and `pctToColor()` are each declared locally in 4-6 different files and are already diverging in behavior. `lib/utils.ts` already exports `formatWhen` (as an alias of `timeAgo`) and `normalizeQuery` — but the local declarations shadow them.

**What to add to `lib/utils.ts`:**

Add the following exports if they don't already exist. If a variant already exists, consolidate into the most complete version:

```ts
// ── Study-specific color helpers ──────────────────────────────────────────────

/** Score percentage → indigo-brand accent color (for rings, text, bars) */
export function pctToColor(pct: number): string {
  if (pct >= 70) return "#1D9E75";   // teal  — mastered
  if (pct >= 60) return "#378ADD";   // blue  — good
  if (pct >= 50) return "#BA7517";   // amber — passing
  if (pct >= 45) return "#E8762A";   // orange-amber — borderline
  return "#A32D2D";                  // red   — needs work
}

/** Score percentage → background fill color (for cards, pills) */
export function pctToBg(pct: number): string {
  if (pct >= 70) return "#EAF3DE";
  if (pct >= 50) return "#FAEEDA";
  return "#FCEBEB";
}

/** Duration in seconds → human-readable string */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m";
  const m = Math.floor(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

/** Score / total → percentage string with % symbol */
export function fmtPct(score: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((score / total) * 100)}%`;
}
```

The existing `formatWhen` / `timeAgo` in `lib/utils.ts` already handles all cases including 7d+ formatting. Use it everywhere.

The existing `buildHref` in `lib/utils.ts` is the canonical version. Use it everywhere.

**After adding the exports:** Remove the local declarations of all four functions from every Study Hub client file listed above. Replace with imports from `@/lib/utils`. Verify each file still builds (no type errors from the import change).

---

### Task 2 — Replace all `violet-*` Tailwind classes with indigo brand tokens

**Files to modify:**
- `app/study/practice/PracticeHomeClient.tsx`
- `app/study/practice/[setId]/PracticeTakeClient.tsx`
- `app/study/_components/StreakCard.tsx`

**Do NOT touch:** `app/study/ai-plan/page.tsx` — it is intentionally violet (it's a separate AI feature with its own identity; leave it for a separate design review).

**Substitution table — apply globally in each file:**

| Old (violet Tailwind) | New (indigo brand token) |
|---|---|
| `bg-violet-500/10` | `bg-[#5B35D5]/[0.07]` |
| `bg-violet-500/15` | `bg-[#5B35D5]/[0.10]` |
| `bg-violet-50` or `bg-violet-50/60` | `bg-[#EEEDFE]` |
| `bg-violet-100/60` | `bg-[#EEEDFE]` |
| `bg-violet-600` | `bg-[#5B35D5]` |
| `bg-violet-700` | `bg-[#4526B8]` |
| `bg-violet-950/20` or `/30` or `/40` | `dark:bg-[#5B35D5]/10` |
| `border-violet-200/70` | `border-[#5B35D5]/20` |
| `border-violet-300/50` or `/60` | `border-[#5B35D5]/25` |
| `border-violet-700/30` or `/50` | `dark:border-[#5B35D5]/30` |
| `border-violet-800/40` | `dark:border-[#5B35D5]/30` |
| `text-violet-600` | `text-[#5B35D5]` |
| `text-violet-700` | `text-[#3B24A8]` |
| `text-violet-800` | `text-[#3B24A8]` |
| `text-violet-300` or `text-violet-400` (dark mode) | `dark:text-indigo-300` |
| `text-violet-500/80` | `text-[#5B35D5]/70` |
| `text-violet-400/70` or `/80` | `dark:text-[#5B35D5]/60` |
| `ring-violet-500` | `ring-[#5B35D5]` |
| `hover:bg-violet-100` or `/60` | `hover:bg-[#EEEDFE]` |
| `hover:bg-violet-700` | `hover:bg-[#4526B8]` |
| `hover:bg-violet-950/30` | `dark:hover:bg-[#5B35D5]/15` |

Apply the table row by row. After applying, do a final search for any remaining `violet-` in each file to confirm none are left (except in comments, if any).

---

### Task 3 — Fix `MILESTONE_STYLES["great"]` orange violation in `PracticeTakeClient.tsx`

**File:** `app/study/practice/[setId]/PracticeTakeClient.tsx`

**Problem:** When a student scores 80-89%, they get an orange milestone toast. Orange is the Marketplace color. This is a brand violation.

**Find this exact string:**
```ts
great: "border-orange-300/50 bg-orange-50  text-orange-900 dark:border-orange-700/50 dark:bg-orange-950/60 dark:text-orange-200",
```

**Replace with:**
```ts
great: "border-teal-300/50 bg-teal-50/80 text-teal-900 dark:border-teal-700/50 dark:bg-teal-950/60 dark:text-teal-200",
```

Also check `StreakCard.tsx` line ~128 for `milestone: "border-orange-200..."` and `line ~207` for `bg-orange-500/10`. Replace both:
- `milestone` variant in StreakCard: replace orange with teal (same pattern as above)
- `bg-orange-500/10 border-orange-500/20` streak dot/indicator: replace with `bg-[#5B35D5]/[0.07] border-[#5B35D5]/20`

Do not touch `app/study/gpa/page.tsx` orange references — those are used for grade letters (D grade visual coding) and are semantically correct as warning-amber. Leave them.

Do not touch `app/study/leaderboard/page.tsx` orange reference — audit that separately.

---

### Task 4 — Fix `StudyOnboardingBanner` amber colors in `StudyTabs.tsx`

**File:** `app/study/_components/StudyTabs.tsx`

**Problem:** The onboarding nudge banner inside `StudyOnboardingBannerInner` uses amber — which reads as a warning/error in Study Hub context. It should be indigo (an invitation, not an alert).

**Find the `StudyOnboardingBannerInner` function return.** Replace the JSX with:

```tsx
return (
  <div className="rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE] p-3 flex items-center justify-between gap-3">
    <p className="text-sm text-[#3B24A8] dark:text-indigo-200">
      Complete your study profile to get personalised content.
    </p>
    <Link
      href="/study/onboarding"
      className="shrink-0 rounded-xl bg-[#5B35D5] px-3 py-1.5 text-xs font-semibold text-white no-underline hover:bg-[#4526B8]"
    >
      Set up →
    </Link>
  </div>
);
```

Also in `StudyTabs.tsx`, the Tutors overflow item has:
```
color: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400"
```
This is a Study Hub feature getting orange. Replace with:
```
color: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
```
Amber is acceptable for Tutors (it's a standalone service, not the marketplace food/delivery wing).

---

### Task 5 — Remove all `bg-gradient-to-br` from Study Hub components

**Files to check and modify:** `app/study/practice/PracticeHomeClient.tsx`

Run a search for `gradient` across all Study Hub files. For each gradient found:

In `PracticeHomeClient.tsx`, the Due Today card has:
```
bg-gradient-to-br from-violet-50/60 to-background
```

Remove the gradient entirely. Replace the full `className` on that Card with:
```
className="w-full max-w-full overflow-hidden rounded-3xl border-[#5B35D5]/20 bg-[#EEEDFE] p-4 dark:border-[#5B35D5]/30 dark:bg-[#5B35D5]/10"
```

This also fixes the violet → indigo color on this card. Task 2 should have already handled the inner elements; this handles the card container itself.

---

# TIER 2 — High priority: navigation, UX gaps, and practice flow

---

### Task 6 — Reorder the More sheet items in `StudyTabs.tsx`

**File:** `app/study/_components/StudyTabs.tsx`

**Problem:** The More sheet lists items in admin-first order. High-frequency student tools are buried after rare rep-only actions.

**Find the `overflowItems` array** inside `StudyTabs`. Reorder the items to this sequence (do not change the existing item definitions, only their order in the array):

1. History
2. Bookmarks
3. GPA Calculator
4. Leaderboard
5. AI Study Plan
6. Upload Materials ← (rep/contributor action, lower frequency)
7. Apply as Course Rep ← (one-time action, lowest frequency; keep at bottom)

The conditional spread for `apply-rep` (only shown when `contributorStatus !== "approved"`) stays as-is — just move the whole block to the bottom.

---

### Task 7 — Remove the `backdrop-blur-sm` from the More sheet backdrop

**File:** `app/study/_components/StudyTabs.tsx`

**Find the backdrop div** inside `MoreSheet` — the one with `className="absolute inset-0 bg-black/50 backdrop-blur-sm"`.

Remove `backdrop-blur-sm`. The line becomes:
```tsx
<div className="absolute inset-0 bg-black/60" onClick={onClose} />
```

Increase opacity slightly from `/50` to `/60` to compensate for the removed blur.

---

### Task 8 — Fix Practice tab visual hierarchy in `StudyTabs.tsx`

**File:** `app/study/_components/StudyTabs.tsx`

**Problem:** All four mobile tabs (Home / Materials / Practice / Q&A) are visually identical in their inactive state. Practice is the highest-engagement feature and should signal primacy.

In `MOBILE_TABS`, find the Practice tab entry:
```ts
{ href: "/study/practice", label: "Practice", icon: <Zap className="h-3.5 w-3.5" />, match: "prefix" }
```

In the mobile tab rendering loop, add a special case for the Practice tab's **inactive** state. Instead of rendering all tabs with the same `cn()` class, check `tab.href === "/study/practice"` and when inactive apply a slightly differentiated style:

```tsx
active
  ? "border-primary/30 bg-primary/10 text-primary"
  : tab.href === "/study/practice"
    ? "border-[#5B35D5]/25 bg-[#EEEDFE]/60 text-[#5B35D5] hover:bg-[#EEEDFE]"
    : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```

This gives Practice a faint indigo wash even when not the current tab — signaling it as the primary action — without being distracting.

---

### Task 9 — Remove redundant Back button and reposition CTA in `PracticeHomeClient.tsx`

**File:** `app/study/practice/PracticeHomeClient.tsx`

**Problem:** A "Back ← /study" button is rendered at the top. StudyTabs already provides this navigation. The button wastes space and creates two paths to the same destination.

**Action:**

Remove the entire top bar `<div className="flex items-center justify-between gap-3">` that contains the Back `<Link>` and the History link + Create set button. This is the block that renders `<ArrowLeft />` Back.

After removing it, the "Create set" button (currently inside this block, gated by `repStatus === "approved"`) needs a new home. Move it to immediately below `MiniTabs` as a standalone right-aligned row, only rendered when `repStatus === "approved"`:

```tsx
{repStatus === "approved" && (
  <div className="flex justify-end">
    <button
      type="button"
      onClick={() => setCreateOpen(true)}
      className={cn(
        "inline-flex items-center gap-2 rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE] px-3 py-2 text-sm font-semibold text-[#3B24A8]",
        "hover:bg-[#5B35D5]/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B35D5] focus-visible:ring-offset-2"
      )}
    >
      <Plus className="h-4 w-4" />
      Create set
    </button>
  </div>
)}
```

Also move the `History` link — instead of the old top bar, add History as an item already reachable via the More sheet (it's already there). Remove the standalone History button entirely.

---

### Task 10 — Reposition `SuggestedTodayWidget` in `PracticeHomeClient.tsx`

**File:** `app/study/practice/PracticeHomeClient.tsx`

**Problem:** `SuggestedTodayWidget` renders before the page introduces itself (before the Practice header card). It's a contextual recommendation that belongs near the content it recommends.

Move `<SuggestedTodayWidget />` from its current position (near the top, after the onboarding nudge) to **below `<MiniTabs />`** and **above the search/filter Card**. The order in the return should be:

```
StudyTabs
Onboarding nudge (if !hasPrefs)
Practice header Card          ← stays
Due Today card (SRS)          ← stays
Continue card                 ← stays
MiniTabs                      ← stays
SuggestedTodayWidget          ← MOVED HERE
Search + filters Card         ← stays
Results grid                  ← stays
```

---

### Task 11 — Fix the preview drawer Study mode active state colors in `PracticeHomeClient.tsx`

**File:** `app/study/practice/PracticeHomeClient.tsx`

Inside the Preview `<Drawer>` footer, find the Study mode toggle button active state:
```
"bg-violet-100 text-violet-800 border border-violet-300/60 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-700/50"
```

Replace with:
```
"bg-[#EEEDFE] text-[#3B24A8] border border-[#5B35D5]/25 dark:bg-[#5B35D5]/10 dark:text-indigo-200 dark:border-[#5B35D5]/30"
```

Also fix the Start button when `previewMode === "study"`:
```
"bg-violet-600 text-white border border-violet-500 dark:bg-violet-700"
```
Replace with:
```
"bg-[#5B35D5] text-white border border-[#4526B8] hover:bg-[#4526B8]"
```

Also fix the Study mode description text:
```
"text-violet-700 dark:text-violet-400"
```
Replace with:
```
"text-[#3B24A8] dark:text-indigo-300"
```

---

### Task 12 — Remove the duplicate Continue card from `PracticeHomeClient.tsx`

**File:** `app/study/practice/PracticeHomeClient.tsx`

**Problem:** The Home page already has a `ContinueCard` component. The Practice page also renders a "Continue" card showing `latestAttempt`. This is the same information shown twice on consecutive pages.

**Action:** Remove the entire Continue card block from `PracticeHomeClient.tsx` — the Card that renders `latestAttempt?.set_id ? (...)` with the "Continue" heading and Play button.

Also remove these now-unused state and effects if they become unused after the removal:
- `latestAttempt` state
- The `useEffect` that fetches `latestAttempt` and `recentAttempts` — **but only** the `latestAttempt` part. `recentAttempts` is still needed for the "Recent" view tab. Keep the `recentAttempts` fetch.

Refactor the effect to only set `recentAttempts`, not `latestAttempt`.

---

### Task 13 — Add question navigator drawer to `PracticeTakeClient.tsx`

**File:** `app/study/practice/[setId]/PracticeTakeClient.tsx`

**Problem:** There is no way to jump to a specific question. Students on 40-question exams are stuck going next/previous.

Read `usePracticeEngine.ts` (or wherever the practice engine exposes its state) to understand what data is available: specifically `questions`, `currentIndex`, `answers` (or `selectedOptionIds`), and `flagged` state (if any). Read the file first and base the implementation on actual available fields.

**Add the following:**

**1. A "Questions" button in the exam header** — place it next to the timer, styled as:
```tsx
<button
  type="button"
  onClick={() => setNavOpen(true)}
  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/50"
>
  <LayoutGrid className="h-3.5 w-3.5" />
  {currentIndex + 1}/{questions.length}
</button>
```

**2. A `navOpen` boolean state** (default `false`).

**3. A question navigator drawer** — rendered at the bottom of the component return using the existing `Drawer` component pattern (or reimplement using the same fixed+overlay pattern already in this file):

```tsx
{/* Question navigator */}
{navOpen && (
  <div className="fixed inset-0 z-50 flex items-end" onClick={() => setNavOpen(false)}>
    <div
      className="w-full rounded-t-3xl border-t border-border bg-card p-4 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Jump to question</p>
        <button onClick={() => setNavOpen(false)} className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-background hover:bg-secondary/50">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto">
        {questions.map((q, i) => {
          const isAnswered = /* check if question i has an answer in engine state */;
          const isCurrent  = i === currentIndex;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => { jumpToQuestion(i); setNavOpen(false); }}
              className={cn(
                "grid h-9 w-full place-items-center rounded-xl border text-xs font-semibold transition",
                isCurrent
                  ? "border-[#5B35D5] bg-[#5B35D5] text-white"
                  : isAnswered
                    ? "border-emerald-300/50 bg-emerald-50 text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary/50"
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-[#5B35D5] bg-[#5B35D5] border inline-block" /> Current</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-emerald-300/50 bg-emerald-50 border inline-block" /> Answered</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-border bg-background border inline-block" /> Not yet</span>
      </div>
    </div>
  </div>
)}
```

You need to check how `usePracticeEngine` exposes a `jumpToQuestion` or `goToQuestion` function. If it doesn't exist, add it to the engine. The implementation should set `currentIndex` directly. Confirm by reading the engine file first.

---

### Task 14 — Add keyboard shortcuts to `PracticeTakeClient.tsx`

**File:** `app/study/practice/[setId]/PracticeTakeClient.tsx`

Add a `useEffect` that listens for keyboard input during the practice session. Read the engine to understand the exact function names for selecting options and submitting.

```tsx
useEffect(() => {
  function onKey(e: KeyboardEvent) {
    // Don't fire when user is typing in an input/textarea
    if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
    // Don't fire if answer already confirmed (study mode) or submitted (exam mode)
    if (answerIsConfirmed) return;

    const keyMap: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };
    const optionIndex = keyMap[e.key.toLowerCase()];

    if (optionIndex !== undefined && options[optionIndex]) {
      selectOption(options[optionIndex].id); // use the engine's real function name
      return;
    }

    if (e.key === "Enter" && selectedOptionId) {
      submitAnswer(); // use the engine's real function name
    }

    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      // next/previous navigation — check engine for goNext/goPrev functions
    }
  }

  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [options, selectedOptionId, answerIsConfirmed]);
```

Adapt `answerIsConfirmed`, `selectedOptionId`, `options`, `selectOption`, `submitAnswer` to whatever the actual engine variables and functions are called. Read the engine file before writing this.

---

### Task 15 — Add timer urgency state to `PracticeTakeClient.tsx`

**File:** `app/study/practice/[setId]/PracticeTakeClient.tsx`

Find where the timer display renders (the element showing remaining time with the `Timer` icon). Add urgency coloring when time is low.

Read the engine or local state to find: `timeRemainingMs` or equivalent, and `timeLimitMinutes` (total time). If total time is set, calculate `pct = timeRemainingMs / (timeLimitMinutes * 60 * 1000)`.

In the timer pill's `className`, add a condition:

```tsx
const isUrgent = timeLimitMinutes && timeRemainingMs != null
  ? timeRemainingMs / (timeLimitMinutes * 60 * 1000) < 0.20
  : false;

// On the timer container element:
className={cn(
  "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold",
  isUrgent
    ? "border-rose-300/50 bg-rose-50 text-rose-800 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300 animate-pulse"
    : "border-border bg-background text-foreground"
)}
```

Only add `animate-pulse` when `isUrgent`. Do not add it otherwise.

---

### Task 16 — Add "Share result" to `PracticeTakeClient.tsx` result screen

**File:** `app/study/practice/[setId]/PracticeTakeClient.tsx`

After a session is submitted, the milestone toast / result screen renders. Add a Share button to this screen.

Find where the result/milestone UI renders. Add a Share button below the score display:

```tsx
<button
  type="button"
  onClick={async () => {
    const setTitle = /* get quiz set title from engine or local state */;
    const text = `I scored ${score}/${totalQuestions} on "${setTitle}" on Jabumarket Study Hub!`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text, title: "My Practice Score" });
      } else {
        await navigator.clipboard.writeText(text);
        // show a brief "Copied!" toast using existing toast state
      }
    } catch { /* user cancelled — ignore */ }
  }}
  className={cn(
    "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground",
    "hover:bg-secondary/50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  )}
>
  <Share2 className="h-4 w-4" />
  Share result
</button>
```

Add `Share2` to the lucide-react import if not already present.

---

# TIER 3 — Medium priority: materials, Q&A, history improvements

---

### Task 17 — Fix Materials page filter overflow + surface download sort

**File:** `app/study/materials/MaterialsClient.tsx`

**Problem 1:** The 7 MATERIAL_TYPES chips cause horizontal scroll on small screens.

Find the type filter chips row. Replace the 7 chips with 4 visible options — add a "More" chip that opens the filter drawer for the rest:

Show only: `All` · `Past Q` · `Handout` · `More ↓` (the last one opens `setDrawerOpen(true)`).

Move `Lecture note`, `Slides`, `Timetable`, `Other` filters inside the existing filters drawer under a "Type" section.

**Problem 2:** "Most downloaded" sort is buried in the drawer.

Add a sort chip next to the search bar — right side of the search bar row — that cycles between `newest` and `downloads_desc`:

```tsx
<button
  type="button"
  onClick={() => {
    const next = sortParam === "downloads_desc" ? "newest" : "downloads_desc";
    router.replace(buildHref(pathname, { /* current params */ sort: next }));
  }}
  className={cn(
    "inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground",
    sortParam === "downloads_desc" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50"
  )}
>
  {sortParam === "downloads_desc" ? <SortDesc className="h-4 w-4" /> : <SortAsc className="h-4 w-4" />}
  {sortParam === "downloads_desc" ? "Popular" : "Newest"}
</button>
```

---

### Task 18 — Add Verified and Featured badges to MaterialCard in `MaterialsClient.tsx`

**File:** `app/study/materials/MaterialsClient.tsx`

Find the `MaterialCard`-equivalent card rendering in the materials list (the inline card JSX, or a named `MaterialCard` function if one exists in this file).

In the meta pills row (the `flex flex-wrap items-center gap-2` div), add after the existing pills:

```tsx
{m.verified && (
  <span className="inline-flex items-center gap-1 rounded-full border border-teal-300/50 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800 dark:border-teal-700/40 dark:bg-teal-950/30 dark:text-teal-300">
    <CheckCircle2 className="h-3 w-3" />
    Verified
  </span>
)}
{m.featured && (
  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/50 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
    <Star className="h-3 w-3" />
    Featured
  </span>
)}
```

`CheckCircle2` and `Star` are already imported in this file. Confirm before adding to imports.

---

### Task 19 — Move AI summary above file viewer in `MaterialDetailClient.tsx`

**File:** `app/study/materials/[id]/MaterialDetailClient.tsx`

Find where `m.ai_summary` is rendered (it's currently below the PDF/image viewer). Move it to **above** the viewer, directly below the title/meta/vote row.

Style it as:
```tsx
{m.ai_summary && (
  <div className="rounded-2xl border-l-[3px] border-[#5B35D5] bg-[#EEEDFE] px-4 py-3"
    style={{ borderRadius: "0 12px 12px 0" }}>
    <div className="flex items-center gap-2 mb-1.5">
      <Sparkles className="h-3.5 w-3.5 text-[#5B35D5]" />
      <p className="text-xs font-semibold text-[#3B24A8]">AI Summary</p>
    </div>
    <p className="text-sm text-[#3B24A8]/80 leading-relaxed dark:text-indigo-200">{m.ai_summary}</p>
  </div>
)}
```

Note: `border-radius: "0 12px 12px 0"` is inline because Tailwind can't do one-sided rounded corners correctly without a workaround.

---

### Task 20 — Add "More from this course" section to `MaterialDetailClient.tsx`

**File:** `app/study/materials/[id]/MaterialDetailClient.tsx`

At the bottom of the detail page, after all existing content, add a related materials section.

Add state:
```ts
const [related, setRelated] = useState<Array<{ id: string; title: string | null; material_type: string | null; downloads: number | null }>>([]);
```

Add a `useEffect` that fires when `m.study_courses?.id` is available:
```ts
useEffect(() => {
  if (!m?.study_courses?.id) return;
  supabase
    .from("study_materials")
    .select("id, title, material_type, downloads")
    .eq("course_id", m.study_courses.id)
    .eq("approved", true)
    .neq("id", m.id) // exclude current material
    .order("downloads", { ascending: false })
    .limit(4)
    .then(({ data }) => setRelated((data as any[]) ?? []));
}, [m?.study_courses?.id, m?.id]);
```

Render below the existing content:
```tsx
{related.length > 0 && (
  <div className="mt-6">
    <p className="text-sm font-semibold text-foreground mb-3">
      More from {m.study_courses?.course_code ?? "this course"}
    </p>
    <div className="space-y-2">
      {related.map((r) => (
        <Link
          key={r.id}
          href={`/study/materials/${encodeURIComponent(r.id)}`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-3 py-2.5 hover:bg-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{r.title ?? "Material"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatMaterialType(r.material_type)} · {r.downloads ?? 0} downloads</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  </div>
)}
```

`formatMaterialType` already exists in this file. Confirm before use.

---

### Task 21 — Add question body preview + floating Ask button to `QuestionsClient.tsx`

**File:** `app/study/questions/QuestionsClient.tsx`

**Part A — Body preview in QuestionCard:**

In the `QuestionCard` function, find the title `<p>` element. Directly below it, add:

```tsx
{q.body && q.body.trim() && (
  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
    {q.body.trim()}
  </p>
)}
```

**Part B — Floating Ask button:**

At the very bottom of the `QuestionsClient` return (before the closing `</div>`), add:

```tsx
<div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-end px-4 md:bottom-6">
  <Link
    href="/study/questions/ask"
    className={cn(
      "pointer-events-auto inline-flex items-center gap-2 rounded-2xl bg-[#5B35D5] px-4 py-3 text-sm font-semibold text-white shadow-lg no-underline",
      "hover:bg-[#4526B8]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B35D5] focus-visible:ring-offset-2"
    )}
  >
    <MessageSquarePlus className="h-4 w-4" />
    Ask a question
  </Link>
</div>
```

The `bottom-24` keeps it above the mobile bottom nav. `pointer-events-none` on the outer div means only the button itself is interactive. `MessageSquarePlus` is already imported.

**Part C — Move "unanswered" from sort to filter:**

In the `SortKey` type, remove `"unanswered"` from the type union.

In the filter drawer, remove the "Unanswered" sort option from wherever it appears in the sorts list.

Add a `ToggleRow` filter for unanswered:
```tsx
<ToggleRow
  label="Unanswered only"
  desc="Show questions with no answers yet"
  checked={draftUnanswered}
  onChange={setDraftUnanswered}
/>
```

Add `draftUnanswered` state (boolean, default from URL param `sp.get("unanswered") === "1"`).

In the Supabase query, when `unanswered` is active, add `.eq("answers_count", 0)` filter.

---

### Task 22 — Fix accepted answer display in `QuestionDetailClient.tsx`

**File:** `app/study/questions/[id]/QuestionDetailClient.tsx`

Find where answers are rendered in the list. Apply these two changes:

**1. Sort accepted answer first:**

When setting answers state (or in a `useMemo`), sort so that `is_accepted === true` answers always come first:

```ts
const sortedAnswers = useMemo(() =>
  [...answers].sort((a, b) => {
    if (a.is_accepted && !b.is_accepted) return -1;
    if (!a.is_accepted && b.is_accepted) return 1;
    return 0;
  }),
[answers]);
```

Use `sortedAnswers` in the render loop.

**2. Visual callout for accepted answer:**

For the accepted answer card, add a teal header and left border. Wrap the answer card `<div>` with:

```tsx
{a.is_accepted && (
  <div className="mb-1.5 flex items-center gap-2 rounded-t-2xl bg-teal-50 border border-teal-300/50 px-3 py-1.5 -mb-2 dark:bg-teal-950/30 dark:border-teal-700/40">
    <CheckCircle2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
    <p className="text-xs font-semibold text-teal-800 dark:text-teal-300">Accepted answer</p>
  </div>
)}
<div className={cn(
  "rounded-2xl border bg-background p-4",
  a.is_accepted
    ? "border-l-[3px] border-teal-400 border-t-0 rounded-tl-none rounded-tr-none" // attach to header above
    : "border-border"
)}>
  {/* existing answer content */}
</div>
```

Note: you may need to adjust the exact border radius on the header/card combination to make them look joined. Read the existing answer card structure carefully before implementing.

---

### Task 23 — Add "Retry" button and score delta to `HistoryClient.tsx` + `AttemptReviewClient.tsx`

**Part A — Retry button in `HistoryClient.tsx`:**

**File:** `app/study/history/HistoryClient.tsx`

Find the history item card rendering. Each card has an "Open → Review" action. Add a secondary "Retry" button that links directly to a new practice session:

```tsx
{a.status === "submitted" && a.set_id && (
  <Link
    href={`/study/practice/${encodeURIComponent(String(a.set_id))}`}
    className={cn(
      "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground no-underline",
      "hover:bg-secondary/50",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    )}
  >
    <RotateCcw className="h-4 w-4" />
    Retry
  </Link>
)}
```

Place it next to the existing "Review" / "Open" button. `RotateCcw` is already imported in this file.

**Part B — Score delta in `AttemptReviewClient.tsx`:**

**File:** `app/study/history/[attemptId]/AttemptReviewClient.tsx`

Add state for the previous attempt:
```ts
const [prevAttempt, setPrevAttempt] = useState<{ score: number; total_questions: number } | null>(null);
```

After fetching the current attempt (and once you have `attempt.set_id` and `attempt.user_id`), fetch the previous submitted attempt for the same set:

```ts
const { data: prev } = await supabase
  .from("study_practice_attempts")
  .select("score, total_questions")
  .eq("user_id", attempt.user_id)
  .eq("set_id", attempt.set_id)
  .eq("status", "submitted")
  .neq("id", attempt.id)
  .order("submitted_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (prev) setPrevAttempt(prev as any);
```

In the score display area, add a delta pill after the main score:

```tsx
{prevAttempt && prevAttempt.total_questions > 0 && attempt.total_questions > 0 && (
  (() => {
    const prevPct = Math.round((prevAttempt.score / prevAttempt.total_questions) * 100);
    const curPct  = Math.round(((attempt.score ?? 0) / attempt.total_questions) * 100);
    const delta   = curPct - prevPct;
    if (delta === 0) return (
      <span className="text-xs font-semibold text-muted-foreground">Same as last time</span>
    );
    return (
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        delta > 0
          ? "bg-teal-50 text-teal-800 border border-teal-300/50 dark:bg-teal-950/30 dark:text-teal-300"
          : "bg-rose-50 text-rose-800 border border-rose-300/50 dark:bg-rose-950/30 dark:text-rose-300"
      )}>
        {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {delta > 0 ? "+" : ""}{delta}% vs last attempt
      </span>
    );
  })()
)}
```

`TrendingUp` and `TrendingDown` are already imported in this file. Confirm before adding to imports.

---

# TIER 4 — Lower priority: GPA, leaderboard, and discoverability

---

### Task 24 — Add GPA trend chart to `app/study/gpa/page.tsx`

**File:** `app/study/gpa/page.tsx`

Read the existing `semesters` state and how CGPA is computed per semester. Understand the `computeSemesterGpa` or equivalent function before building the chart.

Add a chart section **above the semester accordions**. Use raw SVG — no external library needed.

Compute chart data from `semesters`:
```ts
const chartData = semesters
  .map((sem) => ({
    label: sem.name,
    gpa: /* compute this semester's GPA using the existing gradeMap logic */,
  }))
  .filter((d) => d.gpa !== null && d.gpa > 0);
```

Render as a bar chart using SVG:
- Container: `width: 100%`, `height: 140px`
- X axis: semester name labels
- Y axis: 0 to max scale (5 for NG, 4 for US) with 3 horizontal gridlines
- Bars: `fill="#5B35D5"` with `opacity: 0.8`, rounded tops (`rx="4"`)
- Bar width: computed from `chartData.length`
- Value labels above each bar: the GPA value to 2 decimal places

If `chartData.length < 2`, do not render the chart (not enough data to show a trend).

Wrap in a card:
```tsx
{chartData.length >= 2 && (
  <div className="rounded-3xl border border-border bg-card p-4">
    <p className="text-sm font-semibold text-foreground mb-3">GPA trend</p>
    <svg width="100%" height="140" viewBox="0 0 400 140">
      {/* bars, labels, gridlines */}
    </svg>
  </div>
)}
```

---

### Task 25 — Add unauthenticated warning to GPA Calculator

**File:** `app/study/gpa/page.tsx`

Add state to track auth status:
```ts
const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
```

On mount, check auth:
```ts
useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    setIsAuthed(!!data?.user);
  });
}, []);
```

When `isAuthed === false`, render a persistent banner at the top of the page (below the back button, above the calculator):

```tsx
{isAuthed === false && (
  <div className="rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE] px-4 py-3 flex items-start gap-3">
    <AlertCircle className="h-4 w-4 shrink-0 text-[#5B35D5] mt-0.5" />
    <div className="min-w-0">
      <p className="text-sm font-semibold text-[#3B24A8]">Your data is only saved locally</p>
      <p className="text-xs text-[#3B24A8]/70 mt-0.5">Sign in to back up your GPA data to the cloud — local storage can be cleared by your browser.</p>
    </div>
    <Link
      href="/login"   // adjust to actual login route
      className="shrink-0 rounded-xl bg-[#5B35D5] px-3 py-1.5 text-xs font-semibold text-white no-underline hover:bg-[#4526B8]"
    >
      Sign in
    </Link>
  </div>
)}
```

`AlertCircle` is already imported in this file. Confirm before adding to imports.

---

### Task 26 — Improve What-if mode discoverability in `app/study/gpa/page.tsx`

**File:** `app/study/gpa/page.tsx`

Find where the What-if mode toggle currently lives (it may be a button or toggle somewhere in the semester accordion). Move or supplement it with a standalone, prominent toggle row above the semesters section:

```tsx
<div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
  <div className="min-w-0">
    <p className="text-sm font-semibold text-foreground">What-if mode</p>
    <p className="text-xs text-muted-foreground mt-0.5">
      Simulate grade changes to see how they'd affect your CGPA
    </p>
  </div>
  <button
    type="button"
    onClick={() => setWhatIfMode((prev) => !prev)}
    className={cn(
      "relative h-6 w-11 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      whatIfMode
        ? "border-[#5B35D5] bg-[#5B35D5]"
        : "border-border bg-background"
    )}
    aria-pressed={whatIfMode}
    aria-label="Toggle what-if mode"
  >
    <span className={cn(
      "absolute top-0.5 h-5 w-5 rounded-full bg-white border border-border/50 shadow-sm transition-transform",
      whatIfMode ? "translate-x-5" : "translate-x-0.5"
    )} />
  </button>
</div>
```

Identify the actual state variable name for what-if mode from reading the file (it may be `whatIfMode` or something else). Adapt accordingly.

---

### Task 27 — Fix points breakdown in `leaderboard/page.tsx` — replace `<details>` with state toggle

**File:** `app/study/leaderboard/page.tsx`

This is a Server Component. The `PointsBreakdown` component uses `<details>/<summary>` which can't be animated and is inconsistent with the rest of the app.

Convert `PointsBreakdown` to a Client Component:

1. Create `app/study/leaderboard/PointsBreakdown.tsx` as a separate `"use client"` file.
2. Move the `PointsBreakdown` function and its `POINT_RULES` constant there.
3. Replace `<details>/<summary>` with `useState`:

```tsx
"use client";
import { useState } from "react";
import { Star, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
// ... types

export function PointsBreakdown({ row }: { row: LeaderRow }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <Star className="h-3 w-3" />
        {open ? "Hide breakdown" : "Show breakdown"}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {POINT_RULES.map(({ key, label, multiplier }) => {
            const val = row[key] as number;
            return (
              <div key={key} className="rounded-xl border border-border bg-background px-2 py-1.5 text-center">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-xs font-semibold text-foreground">{val} × {multiplier}</p>
                <p className="text-[10px] font-semibold text-[#5B35D5]">{val * multiplier} pts</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

4. In `leaderboard/page.tsx`, import `PointsBreakdown` from `./PointsBreakdown` and replace the inline component usage.

---

### Task 28 — Add "Your rank" indicator to `leaderboard/page.tsx`

**File:** `app/study/leaderboard/page.tsx`

This is a server component. The current user's `userId` is presumably available from `supabase.auth.getUser()` at the top of the page (check the existing data fetching).

After fetching the leaderboard data, compute the current user's rank:

```ts
const currentUserId = (await supabase.auth.getUser()).data.user?.id ?? null;

const userRow = currentUserId
  ? leaderboard.find((r) => r.user_id === currentUserId) ?? null
  : null;

const userRank = currentUserId && userRow
  ? leaderboard.findIndex((r) => r.user_id === currentUserId) + 1
  : null;
```

Render at the top of the page, below the scope tabs and above the leaderboard list:

```tsx
{userRank && userRow && (
  <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE] px-4 py-3">
    <div>
      <p className="text-xs text-[#3B24A8]/70">Your ranking</p>
      <p className="text-sm font-semibold text-[#3B24A8]">
        #{userRank} · {userRow.points} pts
      </p>
    </div>
    <div className="text-right">
      <p className="text-xs text-[#3B24A8]/70">
        {scope === "dept" ? "In your department" : scope === "level" ? "At your level" : "Overall"}
      </p>
    </div>
  </div>
)}
```

If `userRank` is within the top displayed entries, this card is redundant but not harmful — still render it (it confirms their position).

---

## Verification checklist

After completing all tasks, confirm:

**Tier 1 — Color:**
- [ ] Zero `violet-*` Tailwind classes in any `/app/study/` file except `ai-plan/page.tsx`
- [ ] Zero `bg-gradient-to-br` or any `gradient` class in any Study Hub file
- [ ] `MILESTONE_STYLES["great"]` uses teal, not orange
- [ ] StreakCard milestone/orange streak indicator uses teal / indigo
- [ ] `StudyOnboardingBanner` uses indigo, not amber
- [ ] Due Today card in `PracticeHomeClient` is flat indigo, no gradient

**Tier 1 — Code quality:**
- [ ] `pctToColor`, `pctToBg`, `formatDuration`, `fmtPct` exported from `lib/utils.ts`
- [ ] No local re-declaration of `formatWhen`, `normalizeQuery`, `buildHref`, `pctToColor` in any Study Hub client file

**Tier 2 — Navigation & practice:**
- [ ] More sheet order: History → Bookmarks → GPA → Leaderboard → AI Study Plan → Upload → Apply
- [ ] More sheet backdrop has no blur
- [ ] Practice tab has faint indigo wash in inactive state
- [ ] Back button removed from Practice home
- [ ] `SuggestedTodayWidget` positioned below `MiniTabs`
- [ ] Duplicate Continue card removed from Practice home
- [ ] Preview drawer Study mode uses indigo, not violet
- [ ] Question navigator opens on "Questions X/Y" button tap
- [ ] Keyboard shortcuts A/B/C/D + Enter work during practice
- [ ] Timer turns red + pulses when < 20% time remaining
- [ ] Share button present on result screen (uses `navigator.share()`)

**Tier 3 — Page improvements:**
- [ ] Materials page shows 4 chips max (All / Past Q / Handout / More ↓)
- [ ] "Popular" sort chip visible next to search bar
- [ ] Verified badge (teal) and Featured badge (amber) appear on material cards
- [ ] AI summary appears above file viewer in `MaterialDetailClient`
- [ ] "More from this course" section renders at bottom of `MaterialDetailClient`
- [ ] Question body preview (2 lines) shows in `QuestionCard`
- [ ] Floating Ask button present in `QuestionsClient`
- [ ] "Unanswered" is a toggle filter, not a sort key
- [ ] Accepted answer renders first with teal callout header
- [ ] History items have "Retry" button
- [ ] `AttemptReviewClient` shows score delta vs previous attempt

**Tier 4 — GPA & leaderboard:**
- [ ] GPA trend chart renders when ≥ 2 semesters have data
- [ ] Unauthenticated users see sign-in banner on GPA page
- [ ] What-if mode has prominent toggle above semester list
- [ ] Leaderboard breakdown uses state toggle, not `<details>`
- [ ] "Your rank" card renders at top of leaderboard

**Global:**
- [ ] No `amber-*` classes used as primary accents in Study Hub (amber is acceptable for warning states and the Tutors icon only)
- [ ] All new indigo references use `#5B35D5` / `#EEEDFE` / `#3B24A8` — never Tailwind `indigo-*` classes