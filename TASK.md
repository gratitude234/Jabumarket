Fix 6 bugs in the Jabumarket Study Hub. Make minimal, surgical changes only.
Don't rewrite unrelated logic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 1 — CRITICAL: Upload page shows ALL courses to all students
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/study/materials/upload/page.tsx

Problem: The course-loading useEffect only scopes courses when isRep is true.
When isRep is false (regular student), the query runs with NO filters and
returns every course in the database across all departments.

Fix:
1. After the auth+rep useEffect loads, also fetch the current user's
   study_preferences row to get their department_id, faculty_id, and level.
   Store as: scopedDeptId, scopedFacultyId, scopedLevel (state).
2. In the course-loading useEffect, add an else branch:
   else if (scopedDeptId) {
     query = query.eq("department_id", scopedDeptId);
     if (scopedLevel) query = query.eq("level", scopedLevel);
   }
   This scopes regular students to their own dept/level from their prefs.
3. If the user has no prefs set (scopedDeptId is null), still add a
   reasonable default: .limit(200).order("course_code") so the list isn't
   3000+ entries. Show a note "Set your department in Study settings to see
   your courses" above the course list in that case.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 2 — CRITICAL: Filename auto-match silently picks wrong department's course
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/study/materials/upload/page.tsx

Problem: In the runConcurrent callback, when a course code is parsed from
the filename, the code does:
  const matched = courses.filter(c => c.course_code === code);
  if (matched.length === 1) setSelectedCourseId(matched[0].id); ← silent auto-select

Because Bug 1 loads ALL courses, matched can pick a course from the wrong
department entirely with no warning to the user.

Fix:
1. Change the auto-select condition from `matched.length === 1` to:
   - Only auto-select if matched.length === 1 AND the course belongs to the
     student's own department (matched[0].department_id === scopedDeptId),
     OR if the user is a rep and it's within their scope.
2. If multiple matches exist across departments, do NOT auto-select. Instead
   just set setQ(code) to pre-fill the search so the student picks manually.
3. If auto-select is skipped due to ambiguity, show a banner:
   "Found multiple courses for [code] — please select the right one below."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 3 — HIGH: Materials filter API uses text match for department (always 0 results)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/api/study/materials/route.ts

Problem: The dept filter does:
  if (dept) query = query.eq("department", dept)
This is a raw text match on a denormalized column. The text never reliably
matches across different upload sessions. The study_materials table already
has a department_id UUID column.

Fix:
1. Add a new query param: dept_id (UUID string).
2. In the query builder:
   if (dept_id) query = query.eq("department_id", dept_id);
   else if (dept) query = query.eq("department", dept); // keep as fallback
3. Do the same for faculty:
   Add faculty_id param → filter by .eq("faculty_id", faculty_id) first,
   fall back to .eq("faculty", faculty) if only text is provided.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 4 — HIGH: Auto-redirect to mine=1 fires for all onboarded users,
               showing "No materials found" to students who never uploaded
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/study/materials/MaterialsClient.tsx

Problem: This useEffect fires for every user who has study_preferences set:
  useEffect(() => {
    if (!prefsLoaded) return;
    if (mineParam) return;
    if (!myBadge) return;
    router.replace(href with mine=1); // ← fires immediately on first load
  }, [prefsLoaded]);

Most students have never uploaded anything, so they land on mine=1 and see
"No materials found" even though hundreds of materials exist.

Fix:
Remove the auto-redirect to mine=1 entirely. The default view should show
ALL approved materials (mine=0 behavior), scoped by the student's dept/level
from study_preferences using dept_id and level params (from Bug 3's fix).

The correct default URL should be:
  /study/materials?dept_id=<uuid>&level=<number>&mine=0
NOT mine=1.

Keep the existing "My uploads" toggle functionality — just don't auto-enable it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 5 — MEDIUM: mine=1 silently ignores dept, level, and other filters
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/api/study/materials/route.ts

Problem: The mineOnly code path is a completely separate query that ignores
all filter params (dept, level, type, sort, search query, etc). The filter
chips show as active in the UI but do nothing — misleading the user.

Fix: In the mineOnly query branch, apply the same filters that the main
branch uses:
  - q (search)
  - level
  - type (material_type)
  - sort order
  - dept_id / dept
  - course (course_code)
Apply these to the uploader_id-filtered query the same way they're applied
in the main query builder below it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 6 — MEDIUM: MaterialsClient uses dept name string instead of dept_id UUID
         for personalization, breaking auto-scoping for all onboarded users
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/study/materials/MaterialsClient.tsx

Problem: In the prefs-loading useEffect, deptName is read from the join:
  deptName = String((prefsData as any)?.department?.name ?? "").trim();
  setScopeDept(deptName); // stored as display name text
  // later used as: dept: deptParam || scopeDept

This passes a display name string as the ?dept= param. But the API filters
on study_materials.department which was denormalized at upload time from a
different source. The text never reliably matches.

Fix:
1. Add scopeDeptId state (string): populate it from
   study_preferences.department_id directly (it's already in the select).
2. Add scopeFacultyId state: from study_preferences.faculty_id.
3. In the auto-redirect URL building (or whichever URL is built from prefs),
   pass dept_id=scopeDeptId and faculty_id=scopeFacultyId instead of the
   dept text name.
4. In fetchPage(), pass dept_id and faculty_id to the API when available.
5. Update filtersKey to include dept_id and faculty_id so filter changes
   correctly trigger refetches.
6. Update all buildHref() calls throughout the file to pass through
   dept_id and faculty_id params alongside the existing dept/faculty params.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY OF FILES TO EDIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- app/study/materials/upload/page.tsx          (Bugs 1, 2)
- app/api/study/materials/route.ts             (Bugs 3, 5)
- app/study/materials/MaterialsClient.tsx      (Bugs 4, 6)

Do NOT touch:
- Any admin routes
- The upload API (app/api/study/materials/upload/route.ts)
- Any other files not listed above

Backward compatibility requirements:
- Old ?dept= text URLs must still work as a fallback (Bug 3)
- mine=1 toggle must still work when the user explicitly clicks it (Bug 4)
- No existing rep/librarian upload flows should break (Bug 1)