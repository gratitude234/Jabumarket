Fix 6 bugs in the Jabumarket Study Hub. Minimal, surgical changes only.
Do not rewrite unrelated logic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 7 — CRITICAL: Dept filter chip is invisible when mine=0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/study/materials/MaterialsClient.tsx

Problem: The dept chip is conditionally rendered like this:
  {mineOnly && !mineExplicitOff && scopeDept ? (
    <button>{scopeDept} ×</button>
  ) : null}

When mine=0, mineOnly is false so the chip never renders. The
department filter is silently active with no visible chip and no
way to remove it except "Clear all". This is why the user sees
"No materials found" with only a "Clear all" button — the dept
filter is invisible.

Fix: Replace the condition entirely. The chip should render
whenever deptParam OR deptIdParam is present in the URL,
regardless of mine status:

  {(deptParam || deptIdParam) ? (
    <button type="button" onClick={() => router.replace(buildHref(pathname, {
      q: qParam || null, level: levelParam || null,
      semester: semesterParam || null,
      faculty: facultyParam || null, faculty_id: facultyIdParam || null,
      dept: null, dept_id: null,
      course: courseParam || null, session: sessionParam || null,
      type: typeParam !== "all" ? typeParam : null,
      sort: sortParam !== "newest" ? sortParam : null,
      verified: verifiedOnly ? "1" : null,
      featured: featuredOnly ? "1" : null,
      mine: mineParam || null,
    }))}
      className="shrink-0 inline-flex items-center gap-1.5 ...">
      {deptParam || scopeDept} <span>×</span>
    </button>
  ) : null}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 8 — HIGH: Filter options dropdown scopes by dept name text
              instead of department_id UUID
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/study/materials/MaterialsClient.tsx

Problem: In the "Load filter options" useEffect, when scoping
the courses dropdown for mineOnly mode:
  if (scopeDept) q = q.eq("department", scopeDept);

This uses the department display name (text) which may not match
the study_courses.department column exactly — same text-mismatch
bug as the main filter.

Fix: Replace with UUID filtering:
  if (scopeDeptId) q = q.eq("department_id", scopeDeptId);
  if (scopeFacultyId) q = q.eq("faculty_id", scopeFacultyId);

Remove the text-based scopeDept/scopeFaculty fallbacks in this
specific block since we now always have the UUID in scopeDeptId.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 9 — HIGH: hasAnyFilters missing deptIdParam and facultyIdParam
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/study/materials/MaterialsClient.tsx

Problem: The hasAnyFilters boolean only checks deptParam (text)
but not deptIdParam or facultyIdParam:
  const hasAnyFilters = Boolean(
    qParam || levelParam || semesterParam ||
    facultyParam ||   // ← checks text only
    deptParam ||      // ← checks text only
    // deptIdParam is MISSING
    // facultyIdParam is MISSING
    ...
  );

When the URL has ?dept_id=<uuid> but no ?dept=, hasAnyFilters
is false so the "Clear all" button never appears even though
an active filter exists.

Fix: Add the missing params:
  const hasAnyFilters = Boolean(
    qParam || levelParam || semesterParam ||
    facultyParam || facultyIdParam ||
    deptParam || deptIdParam ||
    courseParam || sessionParam ||
    (typeParam && typeParam !== "all") ||
    verifiedOnly || featuredOnly ||
    (sortParam && sortParam !== "newest") ||
    mineOnly
  );

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 10 — HIGH: Approval route doesn't re-sync denormalized
               columns from the linked course
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/api/study-admin/materials/[id]/approve/route.ts

Problem: When approving a material, only these columns are updated:
  { approved: true, updated_at, approved_by, approved_at }

The denormalized columns — department_id, department, faculty_id,
faculty, level, semester, course_code — are never re-synced from
the linked study_courses row. If those columns were corrupted at
upload time (wrong dept, wrong level), approving the material
permanently locks in the bad data.

Fix: Before updating approved=true, fetch the linked course row
and include its denormalized fields in the same update patch:

  // Fetch course to re-sync denormalized fields
  const { data: courseRow } = await admin
    .from("study_courses")
    .select("course_code, department, department_id, faculty, faculty_id, level, semester")
    .eq("id", matRow.course_id)
    .maybeSingle();

  const patch = {
    approved: true,
    updated_at: nowIso,
    approved_by: moderatorId,
    approved_at: nowIso,
    // Re-sync denormalized fields from course
    ...(courseRow ? {
      course_code:   courseRow.course_code   ?? null,
      department:    courseRow.department    ?? null,
      department_id: courseRow.department_id ?? null,
      faculty:       courseRow.faculty       ?? null,
      faculty_id:    courseRow.faculty_id    ?? null,
      level:         courseRow.level != null ? String(courseRow.level) : null,
      semester:      courseRow.semester      ?? null,
    } : {}),
  };

Apply the same fix to bulk-approve/route.ts — when bulk approving,
fetch all course rows for the material IDs in one query and include
the denormalized fields in the bulk update.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 11 — MEDIUM: bulk-approve has broken baseUrl construction
                 due to JS operator precedence
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/api/study-admin/materials/bulk-approve/route.ts

Problem:
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

Due to JS operator precedence, || evaluates before ?. This means
even when NEXT_PUBLIC_SITE_URL is set, the ternary always uses
VERCEL_URL in the template string. Dept notifications and AI
summary generation fire to the wrong URL on every bulk approve.

Fix: Add parentheses to enforce correct evaluation:
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUG 12 — MEDIUM: Onboarding skip() saves empty prefs row,
                 permanently breaking the "For You" section
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/study/onboarding/OnboardingClient.tsx

Problem: The skip() function upserts a prefs row with only
user_id and updated_at — no faculty_id, department_id, level,
or semester:
  await supabase.from("study_preferences").upsert({
    user_id: user.id,
    updated_at: new Date().toISOString(),
  });

Now hasPrefs is true (a row exists) but scopeDeptId is empty.
The onboarding nudge ("Set your department") will never show
again because the check is if (!hasPrefs). The "For You"
section shows nothing. The student is permanently stuck.

Fix: Do NOT upsert a prefs row on skip. Instead, use a separate
localStorage flag to mark that the user has dismissed the
onboarding nudge:
  localStorage.setItem("jabuStudy_skipOnboarding", "1");

Then in the onboarding nudge check (in MaterialsClient.tsx and
StudyHomeClient.tsx), also check:
  !localStorage.getItem("jabuStudy_skipOnboarding")

This way skipping hides the nudge without corrupting the prefs
table with an empty row. If the user later goes to onboarding
and saves properly, remove the localStorage flag.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALSO: Write a one-time DB cleanup SQL script
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Save as: scripts/fix-denormalized-materials.sql

Write a SQL UPDATE that fixes all corrupted study_materials rows
by re-syncing their denormalized columns from their linked
study_courses row, for any material where the department_id on
the material does not match the department_id on its linked course:

  UPDATE study_materials sm
  SET
    department_id = sc.department_id,
    department    = sc.department,
    faculty_id    = sc.faculty_id,
    faculty       = sc.faculty,
    level         = sc.level::text,
    semester      = sc.semester,
    course_code   = sc.course_code,
    updated_at    = now()
  FROM study_courses sc
  WHERE sm.course_id = sc.id
    AND (
      sm.department_id IS DISTINCT FROM sc.department_id OR
      sm.faculty_id    IS DISTINCT FROM sc.faculty_id    OR
      sm.level         IS DISTINCT FROM sc.level::text   OR
      sm.semester      IS DISTINCT FROM sc.semester      OR
      sm.course_code   IS DISTINCT FROM sc.course_code
    );

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILES TO EDIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- app/study/materials/MaterialsClient.tsx           (Bugs 7, 8, 9)
- app/api/study-admin/materials/[id]/approve/route.ts  (Bug 10)
- app/api/study-admin/materials/bulk-approve/route.ts  (Bug 10, 11)
- app/study/onboarding/OnboardingClient.tsx         (Bug 12)
- scripts/fix-denormalized-materials.sql            (new file)

Do NOT touch any other files.