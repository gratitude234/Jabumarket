# GPA Calculator Redesign — Implementation Prompt

Reference: interactive demo at `/mnt/user-data/outputs/gpa_redesign_demo.html`

---

## Phase 1 — Read first

Read the full file before writing anything:

```
app/study/gpa/page.tsx
```

Confirm after reading:
- The `canCalculate` boolean, `totals.cgpa`, `scaleMax`, `honours`, and `whatIfTotals` are all derived in the main `GpaPage` component
- `getHonours(cgpa, scaleMax)` returns `HonoursInfo | null`
- The existing `honours` section is inside `{canCalculate && honours && (...)}`
- `resetAll` function already exists

---

## Phase 2 — Implement tasks in order. Output the full modified file after each task.

---

### Task 1 — Remove the header card and replace with a hero CGPA card

**File:** `app/study/gpa/page.tsx`

**Remove the entire `<header>` block** (from `<header className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">` to its closing `</header>`). This removes:
- The "← Back to Study" back link
- The "GPA / CGPA Calculator" title and description
- The Reset button (it will move into the hero card below)
- The 2-column grid with grade scale selector and CGPA panel
- The custom scale editor

**Then insert the new hero CGPA card** at the top of the return (directly after `<div className="space-y-4 pb-24 md:pb-6">`):

```tsx
{/* ── Hero CGPA card ─────────────────────────────────────────────────── */}
<div className="overflow-hidden rounded-3xl bg-[#5B35D5]">
  {/* Top section */}
  <div className="p-5 pb-4">
    {/* Scale selector row */}
    <div className="mb-4 flex items-center justify-between gap-3">
      <label className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Scale</span>
        <select
          value={scaleKey}
          onChange={(e) => setScaleKey(e.target.value as ScaleKey)}
          className="rounded-xl bg-white/15 px-2.5 py-1.5 text-xs font-semibold text-white outline-none"
        >
          <option value="ng_5">Nigeria 5.0</option>
          <option value="us_4">4.0 scale</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <button
        type="button"
        onClick={resetAll}
        className="rounded-xl border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
      >
        Reset
      </button>
    </div>

    {/* CGPA + classification */}
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
          CGPA
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="font-mono text-5xl font-extrabold leading-none tracking-tight text-white">
            {canCalculate ? format2(totals.cgpa) : "—"}
          </span>
          <span className="text-lg font-semibold text-white/50">
            / {scaleMax}
          </span>
        </div>
        {/* What-if CGPA */}
        {whatIfMode && hasWhatIfChanges && whatIfTotals.cgpa !== totals.cgpa && (
          <span className="mt-1 inline-flex items-center rounded-full border border-amber-300/50 bg-amber-50/20 px-2 py-0.5 text-xs font-bold text-amber-100">
            What-if: {format2(whatIfTotals.cgpa)}
          </span>
        )}
      </div>

      <div className="flex flex-col items-end gap-2">
        {canCalculate && honours && (
          <div className="inline-flex items-center gap-1.5 rounded-2xl border border-white/25 bg-white/15 px-3 py-1.5 text-sm font-bold text-white">
            <Award className="h-3.5 w-3.5" />
            {honours.abbr}
          </div>
        )}
        <p className="text-right text-sm font-semibold text-white/70">
          {canCalculate ? cgpaTone.label : "No data yet"}
        </p>
      </div>
    </div>

    {/* Stats row */}
    <div className="mt-4 grid grid-cols-3 gap-2">
      <div className="rounded-2xl bg-white/10 px-3 py-2.5">
        <p className="font-mono text-lg font-extrabold leading-none text-white">
          {totals.unitsTotal}
        </p>
        <p className="mt-1 text-[10px] text-white/55">total units</p>
      </div>
      <div className="rounded-2xl bg-white/10 px-3 py-2.5">
        <p className="font-mono text-lg font-extrabold leading-none text-white">
          {totals.validRows}
        </p>
        <p className="mt-1 text-[10px] text-white/55">courses</p>
      </div>
      <div className="rounded-2xl bg-white/10 px-3 py-2.5">
        <p className="font-mono text-lg font-extrabold leading-none text-white">
          {semesters.length}
        </p>
        <p className="mt-1 text-[10px] text-white/55">
          semester{semesters.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  </div>

  {/* Progress to next class strip */}
  {canCalculate && (() => {
    // Calculate the next classification threshold above current CGPA
    type NextThreshold = { label: string; value: number } | null;
    let nextThreshold: NextThreshold = null;

    if (scaleMax >= 4.5) {
      // Nigerian 5.0 scale — thresholds in ascending order
      const ng5Thresholds = [
        { label: "Pass",        value: 1.0 },
        { label: "Third Class", value: 1.5 },
        { label: "2nd Class Lower", value: 2.4 },
        { label: "2nd Class Upper", value: 3.5 },
        { label: "First Class", value: 4.5 },
      ];
      nextThreshold = ng5Thresholds.find((t) => t.value > totals.cgpa) ?? null;
    } else {
      // 4.0 scale
      const us4Thresholds = [
        { label: "Good Standing", value: 2.0 },
        { label: "Dean's List",   value: 3.0 },
        { label: "Cum Laude",     value: 3.5 },
        { label: "Magna Cum Laude", value: 3.7 },
        { label: "Summa Cum Laude", value: 3.9 },
      ];
      nextThreshold = us4Thresholds.find((t) => t.value > totals.cgpa) ?? null;
    }

    if (!nextThreshold) return null; // already at the highest class

    // Find the lower bound of the current class (the threshold just below current CGPA)
    let lowerBound = 0;
    if (scaleMax >= 4.5) {
      if (totals.cgpa >= 4.5) lowerBound = 4.5;
      else if (totals.cgpa >= 3.5) lowerBound = 3.5;
      else if (totals.cgpa >= 2.4) lowerBound = 2.4;
      else if (totals.cgpa >= 1.5) lowerBound = 1.5;
      else if (totals.cgpa >= 1.0) lowerBound = 1.0;
    } else {
      if (totals.cgpa >= 3.9) lowerBound = 3.9;
      else if (totals.cgpa >= 3.7) lowerBound = 3.7;
      else if (totals.cgpa >= 3.5) lowerBound = 3.5;
      else if (totals.cgpa >= 3.0) lowerBound = 3.0;
      else if (totals.cgpa >= 2.0) lowerBound = 2.0;
    }

    const rangeSize = nextThreshold.value - lowerBound;
    const progress = rangeSize > 0
      ? Math.min(100, ((totals.cgpa - lowerBound) / rangeSize) * 100)
      : 100;
    const gap = Math.max(0, nextThreshold.value - totals.cgpa);

    return (
      <div className="border-t border-white/15 px-5 py-3 pb-4">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold text-white/60">
          <span>Progress to {nextThreshold.label}</span>
          <span>{format2(totals.cgpa)} / {format2(nextThreshold.value)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] font-semibold text-white/65">
          {format2(gap)} point{gap !== 1 ? "s" : ""} away from {nextThreshold.label}
        </p>
      </div>
    );
  })()}

  {/* Custom scale editor — shown inline when custom selected */}
  {scaleKey === "custom" && (
    <div className="border-t border-white/15 px-5 py-4">
      <p className="text-xs font-semibold text-white/70 mb-3">Custom grade scale</p>
      <div className="grid grid-cols-3 gap-2">
        {Object.keys(customScale).sort().map((g) => (
          <label key={g} className="rounded-xl bg-white/10 px-2.5 py-2">
            <span className="text-[10px] font-semibold text-white/55">{g}</span>
            <input
              value={String(customScale[g])}
              onChange={(e) => {
                const v = toNum(e.target.value);
                setCustomScale((prev) => ({ ...prev, [g]: Number.isFinite(v) ? v : prev[g] }));
              }}
              inputMode="decimal"
              className="mt-0.5 w-full bg-transparent text-sm font-semibold text-white outline-none"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setCustomScale({ ...NG_5 })} className="rounded-xl border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25">Nigeria 5.0 preset</button>
        <button type="button" onClick={() => setCustomScale({ ...US_4 })} className="rounded-xl border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25">4.0 preset</button>
      </div>
    </div>
  )}
</div>
```

**Imports to add:** `Award` is already imported. Confirm before adding anything.

---

### Task 2 — Fix the honours section

**File:** `app/study/gpa/page.tsx`

The existing honours section (around `{canCalculate && honours && (...)`) uses coloured backgrounds derived from `honours.bgClass`, `honours.borderClass` etc. This is fine — keep all the colour logic. The only two changes needed are:

**A. Move the threshold chips from the bottom of the section to replace the section's layout.** The threshold display currently renders inside an IIFE at the bottom of the section. **Keep it exactly as is** — no changes to the threshold chip rendering.

**B. The section's own border/background already uses semantic colours** (emerald for First Class, blue for 2:1, etc.) — these are acceptable status colours. **Do not change them.**

No code changes needed to the honours section itself — it's already good. Skip to Task 3.

---

### Task 3 — Fix "Add semester" button color

**File:** `app/study/gpa/page.tsx`

Find the Add semester button (around line 1401):
```tsx
className="inline-flex items-center gap-2 rounded-2xl border border-foreground bg-foreground px-3 py-2 text-sm font-semibold text-background hover:opacity-90"
```

Replace with:
```tsx
className="inline-flex items-center gap-2 rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE] px-3 py-2 text-sm font-semibold text-[#3B24A8] hover:bg-[#5B35D5]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B35D5] focus-visible:ring-offset-2"
```

---

### Task 4 — Fix "Add course row" button

**File:** `app/study/gpa/page.tsx`

Find the Add course row button (around line 1604):
```tsx
className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-foreground bg-foreground px-4 py-3 text-sm font-semibold text-background hover:opacity-90"
```

Replace with a dashed-border invitation style that matches the demo:
```tsx
className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-[#5B35D5]/40 hover:bg-[#EEEDFE] hover:text-[#3B24A8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B35D5] focus-visible:ring-offset-2"
```

---

### Task 5 — Fix the sticky footer sync status button

**File:** `app/study/gpa/page.tsx`

The sync status is currently a disabled `<button>` styled as a solid black primary button. It looks like something the user can click but can't, and the solid black conflicts with Study Hub's indigo brand.

**Find:**
```tsx
<button
  type="button"
  disabled
  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-foreground bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-80"
>
  {syncStatus === "syncing" ? (
    <><Cloud className="h-4 w-4 animate-pulse" />Syncing…</>
  ) : syncStatus === "synced" ? (
    <><Cloud className="h-4 w-4" />Synced ✓</>
  ) : syncStatus === "offline" ? (
    <><CloudOff className="h-4 w-4" />Saved locally</>
  ) : (
    <><Calculator className="h-4 w-4" />Saved ✓</>
  )}
</button>
```

**Replace with a non-interactive status pill:**
```tsx
<div
  className={cn(
    "inline-flex flex-none items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold",
    syncStatus === "syncing"
      ? "border-[#5B35D5]/20 bg-[#EEEDFE] text-[#3B24A8]"
      : syncStatus === "synced"
      ? "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-700/40 dark:bg-teal-950/20 dark:text-teal-300"
      : syncStatus === "offline"
      ? "border-border bg-background text-muted-foreground"
      : "border-border bg-background text-muted-foreground"
  )}
  role="status"
  aria-live="polite"
>
  {syncStatus === "syncing" ? (
    <><Cloud className="h-4 w-4 animate-pulse" /> Syncing…</>
  ) : syncStatus === "synced" ? (
    <><Cloud className="h-4 w-4" /> Synced</>
  ) : syncStatus === "offline" ? (
    <><CloudOff className="h-4 w-4" /> Saved locally</>
  ) : (
    <><Calculator className="h-4 w-4" /> Saved</>
  )}
</div>
```

This turns the fake-button into an honest status indicator. Syncing = indigo pulsing, synced = teal, offline/idle = neutral.

---

### Task 6 — Fix CGPA dashed line colour in `SemesterChart`

**File:** `app/study/gpa/page.tsx`

Inside the `SemesterChart` function, find the CGPA average dashed line (around line 381):
```tsx
stroke="#6366f1"
```

Replace with the Study Hub indigo:
```tsx
stroke="#5B35D5"
```

Also find the legend line below it (around line 405):
```tsx
<line x1={0} y1={0} x2={14} y2={0} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4,3" />
```

Replace:
```tsx
<line x1={0} y1={0} x2={14} y2={0} stroke="#5B35D5" strokeWidth={1.5} strokeDasharray="4,3" />
```

---

## Verification checklist

**Hero card**
- [ ] Old `<header>` block is gone — no "← Back to Study", no "GPA / CGPA Calculator" title, no description text
- [ ] Hero card has `bg-[#5B35D5]` background
- [ ] Scale selector (`<select>`) inside hero — still functional, same `scaleKey` state
- [ ] Reset button inside hero — calls `resetAll()`, same as before
- [ ] CGPA shown in `text-5xl font-extrabold font-mono text-white`
- [ ] What-if CGPA shown if `whatIfMode && hasWhatIfChanges && whatIfTotals.cgpa !== totals.cgpa`
- [ ] Honours abbreviation badge shown if `canCalculate && honours`
- [ ] Three stat tiles: units / courses / semesters — all white on indigo
- [ ] Progress-to-next-class strip: only renders when `canCalculate` and a next threshold exists
- [ ] Progress bar fill width derived from position within the current classification band
- [ ] "X points away from {NextClass}" hint text shown
- [ ] When student is already at the highest classification (First Class / Summa), strip does NOT render
- [ ] Custom scale editor moved into the hero card, shown only when `scaleKey === "custom"`

**Buttons**
- [ ] "Add semester" button: `bg-[#EEEDFE] text-[#3B24A8]` — not black
- [ ] "Add course row" button: dashed border, neutral, hovers to indigo — not black
- [ ] Zero `border-foreground bg-foreground text-background` remaining in the file (run a search to confirm — the ImportModal confirm button at line ~757 also uses this pattern — fix it too: `className="rounded-2xl border border-[#5B35D5]/20 bg-[#EEEDFE] px-4 py-2.5 text-sm font-semibold text-[#3B24A8] hover:bg-[#5B35D5]/10"`)

**Sync status**
- [ ] Sync status is a `<div role="status">` not a `<button disabled>`
- [ ] Syncing: indigo bg
- [ ] Synced: teal bg
- [ ] Offline / idle: neutral

**Chart**
- [ ] CGPA dashed line in `SemesterChart` uses `#5B35D5`, not `#6366f1`
- [ ] Legend line uses `#5B35D5`

**Honours section**
- [ ] Unchanged — no modifications needed to the existing honours section

**Global**
- [ ] `ArrowLeft` import — check if still used anywhere in the file after removing the header. If not, remove from import list.
- [ ] All new indigo: `#5B35D5` / `#EEEDFE` / `#3B24A8` — never `indigo-*` Tailwind