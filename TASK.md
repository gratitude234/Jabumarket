# Study Hub Nav Bars Redesign — Implementation Prompt

Reference: interactive demo at `/mnt/user-data/outputs/nav_redesign_demo.html`

---

## Phase 1 — Read files first. Summarise each. Flag conflicts.

Read both files in full before writing a single line of code. Output one sentence per file and flag any shared dependencies.

```
app/study/_components/StudyTabs.tsx
components/layout/BottomNav.tsx
```

---

## Phase 2 — Implement tasks in order. Output the full modified file after each task.

---

### Task 1 — Fix mobile tab active state in `StudyTabs.tsx`

**File:** `app/study/_components/StudyTabs.tsx`

**Root cause:** Every active state in `StudyTabs` uses `border-primary/30 bg-primary/10 text-primary`. In the Jabumarket codebase, `--color-primary` resolves to the marketplace primary color (near-black in light mode), not indigo. This makes active Study Hub tabs visually indistinguishable from a barely-visible grey tint instead of the clear indigo brand color they should show.

**Find the mobile tab Link** (inside the `{/* Mobile */}` block, inside `MOBILE_TABS.map`):
```tsx
active
  ? "border-primary/30 bg-primary/10 text-primary"
  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```
**Replace with:**
```tsx
active
  ? "border-[#5B35D5]/30 bg-[#EEEDFE] text-[#5B35D5] font-semibold"
  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```

**Find the mobile More button** (the `overflowActive` ternary, inside `{/* More button */}`):
```tsx
overflowActive
  ? "border-primary/30 bg-primary/10 text-primary"
  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```
**Replace with:**
```tsx
overflowActive
  ? "border-[#5B35D5]/30 bg-[#EEEDFE] text-[#5B35D5]"
  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```

**Find the mobile More button active dot** (the `{overflowActive && ...}` span inside the mobile More button):
```tsx
{overflowActive && (
  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
)}
```
**Replace with:**
```tsx
{overflowActive && (
  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#5B35D5] ring-2 ring-background" />
)}
```

---

### Task 2 — Fix desktop tab active state in `StudyTabs.tsx`

**File:** `app/study/_components/StudyTabs.tsx`

Same fix for the `{/* Desktop */}` block.

**Find the desktop tab Link** (inside `DESKTOP_TABS.map`):
```tsx
active
  ? "border-primary/30 bg-primary/10 text-primary"
  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```
**Replace with:**
```tsx
active
  ? "border-[#5B35D5]/30 bg-[#EEEDFE] text-[#5B35D5] font-semibold"
  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```

**Find the desktop More button** (the `overflowActive` ternary in the desktop More `<button>`):
```tsx
overflowActive
  ? "border-primary/30 bg-primary/10 text-primary"
  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```
**Replace with:**
```tsx
overflowActive
  ? "border-[#5B35D5]/30 bg-[#EEEDFE] text-[#5B35D5]"
  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```

**Find the desktop More button active dot** (the `{overflowActive && ...}` span at the end of the desktop More button):
```tsx
{overflowActive && (
  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
)}
```
**Replace with:**
```tsx
{overflowActive && (
  <span className="h-1.5 w-1.5 rounded-full bg-[#5B35D5]" />
)}
```

---

### Task 3 — Fix More sheet active item styles in `StudyTabs.tsx`

**File:** `app/study/_components/StudyTabs.tsx`

Inside the `MoreSheet` component, the scrollable grid renders items. Three places use primary tokens.

**Find the sheet Link active className** (the `active ? ... : ...` inside the Link's `className={cn(...)}`):
```tsx
active
  ? "border-primary/20 bg-primary/5"
  : "border-border/60 bg-background hover:bg-secondary/50 hover:border-border"
```
**Replace with:**
```tsx
active
  ? "border-[#5B35D5]/20 bg-[#EEEDFE]"
  : "border-border/60 bg-background hover:bg-secondary/50 hover:border-border"
```

**Find the item label active color** (the `<p className={cn("text-sm font-bold", active ? ...)}>`):
```tsx
active ? "text-primary" : "text-foreground"
```
**Replace with:**
```tsx
active ? "text-[#3B24A8]" : "text-foreground"
```

**Find the active dot at the end of each item:**
```tsx
{active && (
  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
)}
```
**Replace with:**
```tsx
{active && (
  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#5B35D5]" />
)}
```

---

### Task 4 — Fix the "AI" badge and AI Study Plan icon in `StudyTabs.tsx`

**File:** `app/study/_components/StudyTabs.tsx`

**A. The generic badge fallback** — when `item.badge` is not "Pending" or "Reapply", it falls through to `bg-foreground text-background` (solid black). This is used for the "AI" and "Rep" badges. Both should be indigo in Study Hub.

Find the badge ternary inside the item label row:
```tsx
item.badge === "Pending"
  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
  : item.badge === "Reapply"
  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
  : "bg-foreground text-background"
```
**Replace the final fallback:**
```tsx
item.badge === "Pending"
  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
  : item.badge === "Reapply"
  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
  : "bg-[#EEEDFE] text-[#3B24A8] border border-[#5B35D5]/20"
```

**B. The AI Study Plan icon color** — find the `ai-plan` overflow item (around the `href: "/study/ai-plan"` line):
```tsx
color:
  "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
```
**Replace with:**
```tsx
color:
  "bg-[#EEEDFE] text-[#5B35D5]",
```

**C. The Bookmarks icon color** — find the `library` overflow item:
```tsx
color:
  "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
```
**Replace with explicit tokens** (indigo-100 is a Tailwind approximation; use the exact brand color):
```tsx
color:
  "bg-[#EEEDFE] text-[#5B35D5]",
```

**D. The Tutors icon color** — `bg-orange-100 text-orange-600` is the marketplace orange. Tutors is a Study Hub feature; it should not use the marketplace brand color. Change to a neutral purple:
```tsx
// BEFORE
color:
  "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",

// AFTER
color:
  "bg-purple-50 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400",
```

---

### Task 5 — Fix `StudyOnboardingBanner` in `StudyTabs.tsx`

**File:** `app/study/_components/StudyTabs.tsx`

Find `StudyOnboardingBannerInner`:
```tsx
function StudyOnboardingBannerInner() {
  const { shouldShowBanner } = useStudyOnboardingBanner();
  if (!shouldShowBanner) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
      <p className="text-sm text-amber-800">Complete your study profile to get personalised content.</p>
      <Link
        href="/study/onboarding"
        className="shrink-0 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white no-underline hover:bg-amber-700"
      >
        Set up →
      </Link>
    </div>
  );
}
```

**Replace entire return with indigo:**
```tsx
function StudyOnboardingBannerInner() {
  const { shouldShowBanner } = useStudyOnboardingBanner();
  if (!shouldShowBanner) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE] px-4 py-3 dark:border-[#5B35D5]/30 dark:bg-[#5B35D5]/10">
      <p className="text-sm font-medium text-[#3B24A8] dark:text-indigo-200">
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
}
```

---

### Task 6 — Fix `BottomNav.tsx` active color

**File:** `components/layout/BottomNav.tsx`

**Problem:** The BottomNav uses `text-primary` for all active items. Every tab — Home (marketplace), Explore (marketplace), Study, Messages, Me — lights up the same color when active. There is no visual signal about which wing of the app you're in.

**Fix:** The Study tab should use indigo when active (Study Hub brand). All other items should use the marketplace orange `#FF5C00` when active.

**Find the Link className inside `items.map`:**
```tsx
className={[
  "flex flex-col items-center justify-center gap-1 text-xs no-underline",
  active ? "text-primary font-medium" : "text-muted-foreground",
].join(" ")}
```

**Replace with a ternary that branches on which item is active:**
```tsx
className={[
  "flex flex-col items-center justify-center gap-1 text-xs no-underline",
  active
    ? item.href === "/study"
      ? "text-[#5B35D5] font-semibold"
      : "text-[#FF5C00] font-semibold"
    : "text-muted-foreground",
].join(" ")}
```

This means:
- Study tab active → indigo `#5B35D5`
- Home, Explore, Messages, Me, Orders, Rider active → marketplace orange `#FF5C00`
- All inactive items → `text-muted-foreground` (unchanged)

---

## Verification checklist

After completing all 6 tasks, confirm every item:

**`StudyTabs.tsx` — tab bar**
- [ ] Zero `border-primary` / `bg-primary` / `text-primary` remaining in the file
- [ ] Zero `border-violet` / `bg-violet` / `text-violet` remaining in the file
- [ ] Mobile active tab: `border-[#5B35D5]/30 bg-[#EEEDFE] text-[#5B35D5]`
- [ ] Mobile More button active: `border-[#5B35D5]/30 bg-[#EEEDFE] text-[#5B35D5]`
- [ ] Mobile More button active dot: `bg-[#5B35D5]`
- [ ] Desktop active tab: same indigo tokens as mobile
- [ ] Desktop More button active: same indigo tokens
- [ ] Desktop More button active dot: `bg-[#5B35D5]`

**`StudyTabs.tsx` — More sheet**
- [ ] Active item background: `border-[#5B35D5]/20 bg-[#EEEDFE]`
- [ ] Active item label text: `text-[#3B24A8]`
- [ ] Active item dot: `bg-[#5B35D5]`
- [ ] "AI" badge: `bg-[#EEEDFE] text-[#3B24A8] border border-[#5B35D5]/20` — not black
- [ ] "Rep" badge: same indigo style — not black
- [ ] AI Study Plan icon: `bg-[#EEEDFE] text-[#5B35D5]` — not violet
- [ ] Bookmarks icon: `bg-[#EEEDFE] text-[#5B35D5]` — not `indigo-100/indigo-600`
- [ ] Tutors icon: `bg-purple-50 text-purple-600` — not marketplace orange

**`StudyTabs.tsx` — onboarding banner**
- [ ] Zero `amber-*` classes in `StudyOnboardingBannerInner`
- [ ] Banner uses `bg-[#EEEDFE]` / `border-[#5B35D5]/20` / `text-[#3B24A8]`
- [ ] "Set up" button uses `bg-[#5B35D5]` / `hover:bg-[#4526B8]`

**`BottomNav.tsx`**
- [ ] Zero `text-primary` remaining in the file
- [ ] Study tab active: `text-[#5B35D5] font-semibold`
- [ ] All other items active (Home, Explore, Messages, Me, Orders, Rider): `text-[#FF5C00] font-semibold`
- [ ] Inactive state unchanged: `text-muted-foreground`

**Global**
- [ ] All new indigo uses `#5B35D5` / `#EEEDFE` / `#3B24A8` — never `indigo-*` Tailwind
- [ ] `#FF5C00` used only in `BottomNav.tsx` for marketplace items — never inside Study Hub components