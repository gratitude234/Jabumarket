I have a bug in my Jabumarket Study Hub materials filtering. Here's the full context:

## The Problem

1. The `study_materials` table has a `department` text column that stores raw department 
   name strings (e.g. "Nursing Science"). But `study_preferences` stores `department_id` 
   (a UUID foreign key to `study_departments`). When the filter URL is built from prefs, 
   the dept name passed as `?dept=` may not exactly match what's stored in 
   `study_materials.department`, so the filter returns zero results.

2. Both `study_materials` and `study_courses` have `department_id` (UUID) columns. 
   The materials API at `app/api/study/materials/route.ts` currently filters with:
     `if (dept) query = query.eq("department", dept)` — text match, unreliable.
   It should filter by `department_id` UUID instead, which is exact and consistent.

3. Same issue applies to `faculty` — it's also a raw text column. Should also switch 
   to `faculty_id` UUID filtering where possible.

## What needs to change

### 1. `app/api/study/materials/route.ts`
- Add a new query param `dept_id` (UUID) alongside the existing `dept` (text).
- Add a new query param `faculty_id` (UUID) alongside the existing `faculty` (text).
- In the query builder:
  - If `dept_id` is provided, filter by `.eq("department_id", dept_id)` instead of 
    `.eq("department", dept)`.
  - If only `dept` text is provided (no `dept_id`), keep the existing text fallback 
    so nothing breaks.
  - Same logic for `faculty_id` vs `faculty`.

### 2. `app/study/materials/MaterialsClient.tsx`
- Read `dept_id` and `faculty_id` from URL search params alongside the existing 
  `dept` and `faculty` params.
- In `fetchPage()`, pass `dept_id` and `faculty_id` to the API URL when available.
- In the auto-redirect `useEffect` (the one that fires after `prefsLoaded`), pass 
  `dept_id` using `scopeDeptId` (the UUID from prefs) instead of/alongside the 
  dept name string.
- Add `scopeDeptId` state — populate it from `study_preferences.department_id` 
  in the prefs-loading `useEffect`.
- In `applyFilters()` and the filter drawer, when the user selects a department from 
  the `SelectRow`, also capture and store its corresponding `department_id` UUID so 
  it gets written to the URL.
- Update `filtersKey` to include `dept_id` and `faculty_id` so filter changes 
  correctly trigger refetches.
- Update `buildHref` calls throughout to include `dept_id` and `faculty_id`.

### 3. Filter drawer department options
- The `deptOptions` array is built from `courses` (study_courses rows). Each course 
  has both `department` (text) and `department_id` (UUID). Update the SelectRow for 
  Department so the option `value` is the `department_id` UUID (not the name string), 
  and the `label` remains the department name. Store the selected value as `draftDeptId`.
- Same for Faculty: use `faculty_id` UUID as the option value.

### 4. Backward compat
- Keep all existing `dept` / `faculty` text params working as fallback. Don't remove 
  them — old bookmarked URLs should still work, just less precisely.

## Files to edit
- `app/api/study/materials/route.ts`
- `app/study/materials/MaterialsClient.tsx`

Please make the minimal, surgical changes needed. Don't rewrite unrelated logic.