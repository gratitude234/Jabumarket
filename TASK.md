
---

**In `app/study/materials/MaterialsClient.tsx`, fix two bugs:**

**Bug 1 (critical) — `window.history.replaceState` bypasses Next.js router:**

Find the auto-enable effect that runs after `prefsLoaded` (around the block that builds a `href` with `mine: "1"` and calls `window.history.replaceState`). Replace the entire `if (typeof window !== "undefined") { window.history.replaceState(...) } else { router.replace(...) }` block with just:

```ts
router.replace(href, { scroll: false });
```

**Bug 2 (secondary) — course dropdown in filter drawer ignores selected level:**

In the `courseOptions` useMemo, inside the `courses.filter((c) => { ... })` callback, add this check alongside the existing `draftFaculty` and `draftDept` checks:

```ts
if (draftLevel && String(c.level) !== String(draftLevel)) return false;
```

No other changes. Do not touch the `clearAll`, `applyFilters`, or `fetchPage` functions.

---

