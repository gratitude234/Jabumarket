# Study Hub — Full Audit Fix Implementation
# Claude Code Prompt
#
# Source: Full Study Hub audit — 37 issues across 8 Critical, 10 High, 12 Medium, 7 Polish.
# Implement all fixes in the order given. Do not skip. Do not reorder.
# Every fix references its audit ID (C-1, H-2, M-4, P-6, etc.) for traceability.

---

## PHASE 1 — READ ALL TARGET FILES FIRST

Read every file below before writing a single line of code. After reading,
write one line per file confirming you understand what it does and what gap
needs to close.

**Core libs:**
- `lib/studyPractice.ts` — streak, activity, attempt helpers
- `lib/studyNotify.ts` — in-app notification helpers
- `lib/webPush.ts` — sendUserPush, sendVendorPush, sendRiderPush

**API routes:**
- `app/api/study/materials/route.ts` — materials list + search
- `app/api/study/materials/upload/route.ts` — upload init
- `app/api/study/materials/[id]/download/route.ts` — download + counter
- `app/api/study/questions/[id]/upvote/route.ts` — question upvote
- `app/api/study/notify-new-material/route.ts` — new material notifications
- `app/api/study-admin/rep-applications/[id]/approve/route.ts`
- `app/api/study-admin/rep-applications/[id]/reject/route.ts`
- `app/api/admin/study/materials/approve/route.ts`

**Student-facing pages/components:**
- `app/study/StudyHomeClient.tsx`
- `app/study/_components/StreakCard.tsx`
- `app/study/_components/StreakSection.tsx`
- `app/study/_components/DueTodayWidget.tsx`
- `app/study/materials/MaterialsClient.tsx`
- `app/study/materials/[id]/MaterialDetailClient.tsx`
- `app/study/materials/my/page.tsx`
- `app/study/practice/PracticeHomeClient.tsx`
- `app/study/practice/[setId]/usePracticeEngine.ts`
- `app/study/practice/[setId]/PracticeTakeClient.tsx`
- `app/study/questions/QuestionsClient.tsx`
- `app/study/questions/[id]/QuestionDetailClient.tsx`
- `app/study/leaderboard/page.tsx`
- `app/study/onboarding/OnboardingClient.tsx`
- `app/study/apply-rep/page.tsx`
- `app/study/gpa/page.tsx`
- `app/study/_components/StudyTabs.tsx`

Only proceed to Phase 2 after reading all files.

---

## PHASE 2 — DB MIGRATIONS

Create these migration files. Run them in the Supabase SQL editor in order
before any code changes go live.

### Migration 1 — `supabase/migrations/20260326_study_materials_denorm.sql`

```sql
-- C-1 / C-2: Ensure study_materials columns that already exist in the schema
-- are populated from the joined course row so search and level/semester filters
-- work directly on study_materials without PostgREST join-filter limitations.
-- These columns already exist (course_code, department, faculty, level, semester)
-- but may be null for older rows. This migration backfills them.

UPDATE public.study_materials m
SET
  course_code = c.course_code,
  department  = c.department,
  faculty     = c.faculty,
  level       = c.level::text,
  semester    = c.semester
FROM public.study_courses c
WHERE m.course_id = c.id
  AND (
    m.course_code IS NULL OR
    m.department  IS NULL OR
    m.faculty     IS NULL OR
    m.level       IS NULL OR
    m.semester    IS NULL
  );
```

### Migration 2 — `supabase/migrations/20260326_study_materials_search_index.sql`

```sql
-- C-1: Add GIN index on study_materials for fast text search across
-- title, course_code, department, faculty columns.

CREATE INDEX IF NOT EXISTS study_materials_search_idx
ON public.study_materials
USING gin (
  (
    to_tsvector('english', coalesce(title, '')) ||
    to_tsvector('simple',  coalesce(course_code, '')) ||
    to_tsvector('simple',  coalesce(department, '')) ||
    to_tsvector('simple',  coalesce(faculty, ''))
  )
);
```

### Migration 3 — `supabase/migrations/20260326_study_activity_day_audit.sql`

```sql
-- M-4: The study_daily_activity table has both activity_date and day columns.
-- activity_date is canonical. This migration syncs day -> activity_date for
-- any rows where they diverge, then drops the day column.

UPDATE public.study_daily_activity
SET activity_date = day
WHERE day IS NOT NULL AND activity_date IS NULL;

ALTER TABLE public.study_daily_activity DROP COLUMN IF EXISTS day;
```

---

## PHASE 3 — IMPLEMENT IN ORDER

Work through each fix sequentially. Read the relevant file immediately
before editing it — do not rely on earlier reads.

---

### FIX C-3 — WAT timezone for streak and activity date

**Files:** `lib/studyPractice.ts`, `app/study/_components/StreakCard.tsx`,
`app/study/_components/StreakSection.tsx`

Nigeria uses WAT (UTC+1). All date calculations use `toISOString()` which
returns UTC. Any student practicing between midnight and 1am WAT loses their
streak because the date resolves to yesterday.

**Add a shared WAT date helper at the top of `lib/studyPractice.ts`:**

```ts
/** Returns today's date string (YYYY-MM-DD) in WAT (UTC+1) */
function watToday(): string {
  return new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
}
```

**In `upsertDailyPracticeActivity()`:** Replace every occurrence of
`today.toISOString().slice(0, 10)` and `new Date().toISOString().slice(0, 10)`
with `watToday()`.

**In `getPracticeStreak()`:** Replace every date string built from
`new Date()` or `Date.now()` with WAT-offset equivalents:
```ts
const todayKey     = watToday();
const yesterdayKey = new Date(Date.now() + 3_600_000 - 86_400_000)
                       .toISOString().slice(0, 10);
```

**In `StreakCard.tsx`:** Replace:
```ts
const now = new Date();
const todayStr     = now.toISOString().slice(0, 10);
const yesterday    = new Date(now.getTime() - 86_400_000);
const yesterdayStr = yesterday.toISOString().slice(0, 10);
```
With:
```ts
const todayStr     = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const yesterdayStr = new Date(Date.now() + 3_600_000 - 86_400_000).toISOString().slice(0, 10);
```

**In `StreakSection.tsx`:** The 28-day activity grid `since` date:
```ts
const since = new Date(Date.now() + 3_600_000 - 28 * 86_400_000)
                .toISOString().slice(0, 10);
```

---

### FIX C-1 + C-2 — Fix materials search and level/semester filters

**File:** `app/api/study/materials/route.ts`

PostgREST join-column filters inside `.or()` only filter the embedded object —
they do NOT exclude the parent row. The existing search and level/semester
filter chips silently do nothing.

**Replace the search block entirely.** Find the block starting with
`if (q) {` and the PostgREST `.or()` comment. Replace with:

```ts
if (q) {
  // Search on study_materials' own denormalised columns — NOT on embedded join columns.
  const qSafe = q
    .replace(/[%_]/g, '')
    .replace(/[(),]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const like = `*${qSafe.replace(/\s+/g, '*')}*`;
  query = query.or(
    `title.ilike.${like},course_code.ilike.${like},department.ilike.${like},faculty.ilike.${like}`
  );
}
```

**Replace the level filter block:**
```ts
// BEFORE (broken — filters on join column):
if (level) {
  const lv = Number(level);
  if (Number.isFinite(lv)) query = query.eq('study_courses.level', lv);
}

// AFTER (correct — filters on study_materials.level directly):
if (level) {
  const lv = Number(level);
  if (Number.isFinite(lv)) query = query.eq('level', String(lv));
}
```

**Replace the semester filter block:**
```ts
// BEFORE:
if (semester) {
  const sem = mapSemesterParamToDb(semester);
  if (sem) query = query.eq('study_courses.semester', sem);
}

// AFTER:
if (semester) {
  const sem = mapSemesterParamToDb(semester);
  if (sem) query = query.eq('semester', sem);
}
```

**Replace the faculty/dept filter blocks:**
```ts
// BEFORE:
if (faculty) query = query.eq('study_courses.faculty', faculty);
if (dept)    query = query.eq('study_courses.department', dept);

// AFTER:
if (faculty) query = query.eq('faculty', faculty);
if (dept)    query = query.eq('department', dept);
```

**Replace the course filter:**
```ts
// BEFORE:
if (course) query = query.eq('study_courses.course_code', course.trim().toUpperCase());

// AFTER:
if (course) query = query.eq('course_code', course.trim().toUpperCase());
```

---

### FIX C-1 + C-2 (continued) — Populate denormalised columns on upload

**File:** `app/api/study/materials/upload/route.ts`

Update the courseRow select to include all needed fields:
```ts
.select('id, faculty_id, department_id, level, semester, course_code, faculty, department')
```

Add these fields to the insert payload:
```ts
course_code:   (courseRow as any)?.course_code   ?? null,
department:    (courseRow as any)?.department    ?? null,
faculty:       (courseRow as any)?.faculty       ?? null,
level:         (courseRow as any)?.level != null
                 ? String((courseRow as any).level)
                 : null,
semester:      (courseRow as any)?.semester      ?? null,
faculty_id:    (courseRow as any)?.faculty_id    ?? null,
department_id: (courseRow as any)?.department_id ?? null,
```

---

### FIX C-4 — Block self-vote on question upvotes

**File:** `app/api/study/questions/[id]/upvote/route.ts`

After fetching the question and before the existing-vote check, add:

```ts
if (question.author_id && question.author_id === user.id) {
  return NextResponse.json(
    { ok: false, error: 'You cannot upvote your own question.' },
    { status: 403 }
  );
}
```

---

### FIX C-5 — Audit trail on rep approve and reject routes

**File:** `app/api/study-admin/rep-applications/[id]/approve/route.ts`

Add to the `updatePayload` before the `.update()` call:
```ts
updatePayload.reviewed_at = new Date().toISOString();
updatePayload.reviewed_by = auth.userId;
updatePayload.decided_at  = new Date().toISOString();
```

**File:** `app/api/study-admin/rep-applications/[id]/reject/route.ts`

Apply the same three fields to the equivalent `updatePayload`.

---

### FIX C-6 — Notify applicant on rep approval and rejection

**File:** `app/api/study-admin/rep-applications/[id]/approve/route.ts`

After the successful `study_reps` upsert, before returning:
```ts
try {
  const roleLabel = role === 'dept_librarian' ? 'Dept Librarian' : 'Course Rep';
  await adminDb.from('notifications').insert({
    user_id: appRow.user_id,
    type:    'rep_approved',
    title:   `You're now a ${roleLabel}!`,
    body:    'Your application was approved. You can now upload and manage materials for your department.',
    href:    '/study/materials/upload',
  });
} catch { /* non-critical */ }
```

**File:** `app/api/study-admin/rep-applications/[id]/reject/route.ts`

After the status is updated to 'rejected':
```ts
try {
  await adminDb.from('notifications').insert({
    user_id: appRow.user_id,
    type:    'rep_rejected',
    title:   'Application not approved',
    body:    decision_reason
      ? `Reason: ${decision_reason}`
      : 'Your rep application was not approved. Contact the study admin for details.',
    href:    '/study/apply-rep',
  });
} catch { /* non-critical */ }
```

---

### FIX C-7 — AI summary + dept notification in admin approval path

**File:** `app/api/admin/study/materials/approve/route.ts`

Read the study-admin approval route (`app/api/study-admin/materials/[id]/approve/route.ts`)
to see exactly how it triggers AI summary. Then replicate that pattern here.

After the successful `.update({ approved })` call, when `approved === true`:

```ts
if (approved) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    void fetch(`${baseUrl}/api/ai/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ material_id: id }),
    });
    void fetch(`${baseUrl}/api/study/notify-new-material`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ material_id: id }),
    });
  } catch { /* non-critical */ }
}
```

---

### FIX C-8 — Atomic download counter everywhere

**Files:** `app/study/materials/MaterialsClient.tsx`,
`app/study/materials/[id]/MaterialDetailClient.tsx`

Search both files for any read-then-write pattern on the downloads counter:
```ts
// Any variation of:
update({ downloads: nextDownloads })
update({ downloads: (row.downloads ?? 0) + 1 })
```

Delete every such block. Replace with:
```ts
await supabase.rpc('increment_material_downloads', { material_id: materialId });
```

Where `materialId` is the material's id string in scope. If the client is
also calling the download API route which already handles the increment
atomically, remove the client-side increment entirely — do not double-count.

---

### FIX H-1 — Wire RequestCourseModal to materials empty state

**File:** `app/study/materials/MaterialsClient.tsx`

Add state: `const [requestModalOpen, setRequestModalOpen] = useState(false)`

Find the empty state block when `items.length === 0`. Replace or augment it
so that when the student has preferences set (department is known), the
empty state includes a CTA:

```tsx
{items.length === 0 && (
  <EmptyState
    title="No materials found"
    description={hasPrefs
      ? "Nothing here yet. Request a course and we'll notify you when materials are uploaded."
      : "No materials match your filters."}
    action={hasPrefs ? (
      <button
        type="button"
        onClick={() => setRequestModalOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-semibold text-foreground hover:opacity-90"
      >
        Request a course →
      </button>
    ) : undefined}
    icon={BookOpen}
  />
)}
<RequestCourseModal
  open={requestModalOpen}
  onClose={() => setRequestModalOpen(false)}
/>
```

`RequestCourseModal` is already imported in this file — confirm and use it.

---

### FIX H-2 — Show AI summary on material detail page

**File:** `app/study/materials/[id]/MaterialDetailClient.tsx`

Ensure `ai_summary` is included in the material fetch select string. Then,
after the download button section, add:

```tsx
{material.ai_summary ? (
  <div className="rounded-3xl border bg-card p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">AI Summary</p>
      <span className="ml-auto rounded-full border bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        Verify before your exam
      </span>
    </div>
    <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
      {material.ai_summary}
    </p>
  </div>
) : (
  <div className="rounded-3xl border border-dashed bg-card p-4">
    <div className="flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        AI summary not yet available for this material.
      </p>
    </div>
  </div>
)}
```

Import `Sparkles` from `lucide-react` if not already present.

---

### FIX H-3 — Difficulty filter and badge on practice home

**File:** `app/study/practice/PracticeHomeClient.tsx`

Add state: `const [difficulty, setDifficulty] = useState('')`

Add difficulty chips in the filter chip row alongside the existing level/semester chips:

```tsx
{(['easy', 'medium', 'hard'] as const).map((d) => (
  <button
    key={d}
    type="button"
    onClick={() => setDifficulty(prev => prev === d ? '' : d)}
    className={cn(
      'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition',
      difficulty === d
        ? 'border-border bg-secondary text-foreground'
        : 'border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
    )}
  >
    {d === 'easy' ? '🟢' : d === 'medium' ? '🟡' : '🔴'} {d.charAt(0).toUpperCase() + d.slice(1)}
  </button>
))}
```

Apply to the quiz sets query when `difficulty !== ''`:
```ts
if (difficulty) query = query.eq('difficulty', difficulty);
```

Add a difficulty badge to each QuizSetCard:
```tsx
{set.difficulty && (
  <span className={cn(
    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
    set.difficulty === 'easy'   && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    set.difficulty === 'medium' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    set.difficulty === 'hard'   && 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  )}>
    {set.difficulty}
  </span>
)}
```

---

### FIX H-4 — Pin own rank on leaderboard

**File:** `app/study/leaderboard/page.tsx`

This is a Server Component. Read the full file carefully before editing.

**H-4a — After building the ranked `rows` array, check if the current user
is in it. If not, compute their rank separately:**

```ts
const currentUserInTop = rows.some(r => r.user_id === currentUserId);
let currentUserRow: (typeof rows[0]) | null = null;
let currentUserRank: number | null = null;

if (!currentUserInTop && currentUserId) {
  // Find the user's own stats from the same data source used for the leaderboard.
  // Replicate the same aggregation query scoped to currentUserId.
  // Then count users with strictly more points to determine rank.
  // Read the leaderboard query carefully and mirror it for a single user.
  // The exact implementation depends on whether the leaderboard uses a view,
  // an RPC, or an inline aggregation — adapt accordingly.
}
```

**H-4b — "You" badge on own row:**

In the row render (wherever each LeaderRow is rendered), check
`row.user_id === currentUserId` and add:
```tsx
{row.user_id === currentUserId && (
  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">
    You
  </span>
)}
```

**H-4c — Pinned row below the top N:**

After the main list render, add:
```tsx
{!currentUserInTop && currentUserRow && (
  <>
    <div className="my-2 flex items-center gap-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-semibold text-muted-foreground">Your rank</span>
      <div className="h-px flex-1 bg-border" />
    </div>
    {/* Render same row component, passing isCurrentUser=true and rank=currentUserRank */}
  </>
)}
```

---

### FIX H-5 — Push notifications for new materials

**File:** `app/api/study/notify-new-material/route.ts`

Read the existing notification insertion loop. After the in-app `notifications`
rows are inserted, add a push fan-out:

```ts
try {
  const { sendUserPush } = await import('@/lib/webPush');
  const pushPayload = {
    title: `New material: ${title}`,
    body:  course_code
      ? `${course_code} — tap to download`
      : 'New study material for your department',
    href:  '/study/materials',
    tag:   `new-material-${material_id}`,
  };
  await Promise.allSettled(
    (users ?? []).map((u: any) => sendUserPush(u.user_id, pushPayload))
  );
} catch { /* push failures must never crash the notification route */ }
```

---

### FIX H-6 — Auto-apply department filter on Q&A forum

**File:** `app/study/questions/QuestionsClient.tsx`

Read the file. Find where filter state is initialised and where
`useStudyPrefs` is consumed. The component likely wraps in `StudyPrefsProvider`.

**H-6a — Seed department filter from preferences on mount:**

Add a `useEffect` that runs once after prefs load:
```ts
const { prefs, hasPrefs } = useStudyPrefs();

useEffect(() => {
  if (!hasPrefs || !prefs?.department) return;
  // Only pre-apply if no dept filter is already in the URL
  if (!searchParams.get('dept') && !dept) {
    setDept(prefs.department);
  }
  if (!searchParams.get('level') && !level && prefs.level) {
    setLevel(String(prefs.level));
  }
}, [hasPrefs, prefs]);
```

Match `dept` and `level` to whatever the actual state variable names are.

**H-6b — Show active filter context label:**
```tsx
{dept && (
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <span>
      Showing: <strong className="text-foreground">{dept}</strong>
    </span>
    <button
      type="button"
      onClick={() => { setDept(''); setLevel(''); }}
      className="underline underline-offset-2"
    >
      Show all
    </button>
  </div>
)}
```

---

### FIX H-7 — Personalised content counts on onboarding completion screen

**File:** `app/study/onboarding/OnboardingClient.tsx`

Read the file. Find the final step render (the "all done" / "you're ready"
screen). Add content count state and fetch:

```ts
const [contentCounts, setContentCounts] = useState<{
  materials: number; sets: number;
} | null>(null);
```

Immediately after preferences are saved successfully, run:
```ts
async function fetchContentCounts(deptId: string | null, levelVal: number | null) {
  try {
    const [matRes, setRes] = await Promise.all([
      supabase
        .from('study_materials')
        .select('id', { count: 'exact', head: true })
        .eq('approved', true)
        .eq('department_id', deptId ?? ''),
      supabase
        .from('study_quiz_sets')
        .select('id', { count: 'exact', head: true })
        .eq('published', true),
    ]);
    setContentCounts({
      materials: matRes.count ?? 0,
      sets:      setRes.count ?? 0,
    });
  } catch {
    setContentCounts({ materials: 0, sets: 0 });
  }
}
fetchContentCounts(selectedDeptId, selectedLevel);
```

In the completion step JSX:
```tsx
{contentCounts === null ? (
  <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted" />
) : contentCounts.materials > 0 || contentCounts.sets > 0 ? (
  <p className="mt-2 text-sm text-muted-foreground">
    Found{' '}
    <strong className="text-foreground">{contentCounts.materials} materials</strong>
    {contentCounts.sets > 0 && (
      <> and <strong className="text-foreground">{contentCounts.sets} practice sets</strong></>
    )}{' '}
    ready for your level.
  </p>
) : (
  <p className="mt-2 text-sm text-muted-foreground">
    No content yet for your department — you can be the first to upload,
    or request what you need.
  </p>
)}
```

---

### FIX H-8 — Rep application submit feedback (and M-8 rejection reason)

**File:** `app/study/apply-rep/page.tsx`

**Success state** — replace the generic success message:
```tsx
<div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800/40 dark:bg-emerald-950/30">
  <div className="mb-2 flex items-center gap-2">
    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
    <p className="text-sm font-extrabold text-foreground">Application submitted!</p>
  </div>
  <p className="text-sm text-muted-foreground">
    Our team usually reviews applications within 2–3 days. You'll receive a
    notification as soon as a decision is made.
  </p>
  <div className="mt-3 rounded-2xl border bg-background p-3 text-xs text-muted-foreground">
    <p className="mb-1 font-semibold text-foreground">What Course Reps can do:</p>
    <ul className="list-disc space-y-1 pl-4">
      <li>Upload past questions and materials (auto-approved)</li>
      <li>Manage materials for your department and level</li>
      <li>Earn a Course Rep badge on the leaderboard</li>
    </ul>
  </div>
</div>
```

**Rejected state (M-8)** — find where `meStatus === 'rejected'` is shown.
Ensure `decision_reason` is fetched (add to the application row select if
needed). Replace the rejection display with:
```tsx
{meStatus === 'rejected' && (
  <div className="rounded-3xl border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-950/30">
    <p className="text-sm font-semibold text-foreground">Application not approved</p>
    <p className="mt-1 text-sm text-muted-foreground">
      {applicationRow?.decision_reason
        ? applicationRow.decision_reason
        : 'No reason provided — contact the study admin for details.'}
    </p>
    <p className="mt-2 text-xs text-muted-foreground">
      You may reapply once the issue is resolved.
    </p>
  </div>
)}
```

---

### FIX H-9 — Show streak on practice results screen

**File:** `app/study/practice/[setId]/PracticeTakeClient.tsx`

Add state and import:
```ts
import { getPracticeStreak } from '@/lib/studyPractice';
const [streakAfter, setStreakAfter] = useState<{ streak: number } | null>(null);
```

Add a useEffect that triggers when the attempt is submitted:
```ts
useEffect(() => {
  if (!submitted) return;
  getPracticeStreak().then(setStreakAfter).catch(() => {});
}, [submitted]);
```

In the results screen JSX, after the score display:
```tsx
{streakAfter && streakAfter.streak > 0 && (
  <div className={cn(
    'flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold',
    streakAfter.streak >= 7
      ? 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800/40 dark:bg-orange-950/30 dark:text-orange-300'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300'
  )}>
    <Flame className="h-4 w-4 shrink-0" />
    {streakAfter.streak === 1
      ? 'Streak started! Practice again tomorrow to build it.'
      : `${streakAfter.streak}-day streak! Come back tomorrow to keep it.`}
  </div>
)}
```

Import `Flame` from `lucide-react`.

---

### FIX H-10 — Show up_votes on material cards and detail page

**File:** `app/study/materials/MaterialsClient.tsx`

In the material card render, add alongside the download count:
```tsx
{(m.up_votes ?? 0) > 0 && (
  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
    <ThumbsUp className="h-3 w-3" />
    {m.up_votes}
  </span>
)}
```

**File:** `app/study/materials/[id]/MaterialDetailClient.tsx`

Add vote state and handler:
```ts
const [hasUpvoted, setHasUpvoted] = useState(false);
const [upvoteCount, setUpvoteCount] = useState(material.up_votes ?? 0);

async function handleUpvote() {
  const res = await fetch(`/api/study/materials/${material.id}/vote`, {
    method: 'POST',
  });
  const json = await res.json();
  if (json.ok) {
    setHasUpvoted(json.voted);
    setUpvoteCount(prev => json.voted ? prev + 1 : Math.max(0, prev - 1));
  }
}
```

Add vote button in the action area:
```tsx
<button
  type="button"
  onClick={handleUpvote}
  className={cn(
    'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition',
    hasUpvoted
      ? 'border-border bg-secondary text-foreground'
      : 'border-border/60 bg-background text-muted-foreground hover:bg-secondary/50'
  )}
>
  <ThumbsUp className="h-4 w-4" />
  {hasUpvoted ? 'Helpful' : 'Mark as helpful'}
  {upvoteCount > 0 && ` · ${upvoteCount}`}
</button>
```

**Create: `app/api/study/materials/[id]/vote/route.ts`**
```ts
// POST — Toggle an upvote on a study material.
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorised' }, { status: 401 });

  const { id: materialId } = await params;
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('study_material_ratings')
    .select('id')
    .eq('material_id', materialId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    await admin.from('study_material_ratings').delete()
      .eq('material_id', materialId).eq('user_id', user.id);
    // Decrement: read-modify-write is acceptable here (non-critical counter)
    const { data: mat } = await admin
      .from('study_materials').select('up_votes').eq('id', materialId).maybeSingle();
    await admin.from('study_materials')
      .update({ up_votes: Math.max(0, ((mat as any)?.up_votes ?? 1) - 1) })
      .eq('id', materialId);
    return NextResponse.json({ ok: true, voted: false });
  } else {
    await admin.from('study_material_ratings')
      .insert({ material_id: materialId, user_id: user.id, vote: 1 });
    const { data: mat } = await admin
      .from('study_materials').select('up_votes').eq('id', materialId).maybeSingle();
    await admin.from('study_materials')
      .update({ up_votes: ((mat as any)?.up_votes ?? 0) + 1 })
      .eq('id', materialId);
    return NextResponse.json({ ok: true, voted: true });
  }
}
```

---

### FIX M-1 — Server-side MIME type validation on upload

**File:** `app/api/study/materials/upload/route.ts`

After extracting `mime_type`, before the file size check, add:

```ts
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

if (mime_type && !ALLOWED_MIME_TYPES.has(mime_type)) {
  return jsonError(
    'File type not allowed. Accepted: PDF, images, Office documents.',
    400,
    'MIME_NOT_ALLOWED'
  );
}
```

---

### FIX M-2 — Compute time_spent_seconds on attempt submission

**File:** `app/study/practice/[setId]/usePracticeEngine.ts`

Read the `finalizeAttempt` function. Find where the attempt update is built.
Add elapsed time computation using the attempt's `started_at` timestamp:

```ts
// Read started_at from the loaded attempt or from meta — match the exact
// variable name used in this file. started_at is stored as an ISO string.
const startedAtMs = meta?.started_at
  ? new Date(meta.started_at).getTime()
  : null;
const timeSpentSeconds = startedAtMs
  ? Math.max(1, Math.round((Date.now() - startedAtMs) / 1000))
  : null;
```

Include `time_spent_seconds: timeSpentSeconds` in the attempt update payload.

---

### FIX M-3 — "Mark as understood" button on wrong answers

**File:** `app/study/practice/[setId]/PracticeTakeClient.tsx`

Add state and handler (in addition to H-9 changes above):
```ts
const [understood, setUnderstood] = useState<Record<string, boolean>>({});

async function handleMarkUnderstood(questionId: string) {
  setUnderstood(prev => ({ ...prev, [questionId]: true }));
  try {
    await supabase
      .from('study_attempt_answers')
      .update({ understood: true })
      .eq('attempt_id', attemptId)
      .eq('question_id', questionId);
  } catch { /* non-critical */ }
}
```

On the results screen, for each wrong answer row:
```tsx
<button
  type="button"
  onClick={() => handleMarkUnderstood(q.id)}
  className={cn(
    'mt-2 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition',
    understood[q.id]
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30'
      : 'border-border/60 bg-background text-muted-foreground hover:bg-secondary/50'
  )}
>
  <CheckCircle2 className="h-3.5 w-3.5" />
  {understood[q.id] ? 'Understood' : 'Got it'}
</button>
```

---

### FIX M-4 — study_daily_activity.day column (covered by Migration 3)

After running Migration 3, search the codebase for any TypeScript type
definitions referencing the `day` property on `study_daily_activity` rows.
Remove those references. Run `npm run build` to surface any resulting type
errors and fix them.

---

### FIX M-5 — Remove non-existent DeptRow columns from onboarding

**File:** `app/study/onboarding/OnboardingClient.tsx`

Find and update:
```ts
// BEFORE:
type DeptRow = {
  id: string;
  faculty_id: string;
  display_name?: string;
  official_name?: string;
  sort_order?: number | null;
};

// AFTER:
type DeptRow = {
  id: string;
  faculty_id: string;
  name: string;
  sort_order?: number | null;
};
```

Replace every usage of `dept.display_name` and `dept.official_name` with
`dept.name`. Also ensure the departments Supabase select includes `name`.

---

### FIX M-6 — Q&A question state visual badges

**File:** `app/study/questions/QuestionsClient.tsx`

In the question list item, find the answer count / icon area and replace
with three-state badges:

```tsx
{question.solved ? (
  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
    <CheckCircle2 className="h-3 w-3" /> Solved
  </span>
) : (question.answers_count ?? 0) > 0 ? (
  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
    <MessagesSquare className="h-3 w-3" /> {question.answers_count}
  </span>
) : (
  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
    <MessageSquarePlus className="h-3 w-3" /> Answer
  </span>
)}
```

Import `CheckCircle2` and `MessageSquarePlus` from `lucide-react`.

---

### FIX M-7 — Onboarding nudge banner on Materials, Practice, Q&A pages

**Files:** `app/study/materials/MaterialsClient.tsx`,
`app/study/practice/PracticeHomeClient.tsx`,
`app/study/questions/QuestionsClient.tsx`

In each file, read how `useStudyPrefs` is consumed. Add `hasPrefs` to the
destructure if not present. Then add a slim banner at the top of the page
content area (below the tab bar, above any search bar):

```tsx
{!hasPrefs && (
  <Link
    href="/study/onboarding"
    className={cn(
      'flex items-center justify-between gap-3 rounded-2xl border border-border',
      'bg-secondary/40 px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary/60'
    )}
  >
    <span>
      <strong className="text-foreground">Tip:</strong>{' '}
      Set your department to see only your courses.
    </span>
    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
  </Link>
)}
```

---

### FIX M-8 — Decision reason on rejected rep application

(Handled inside FIX H-8 above — confirmed implemented there.)

---

### FIX M-9 — Leaderboard link from StreakCard and Study Hub home

**File:** `app/study/_components/StreakCard.tsx`

At the bottom of the card, after the activity grid:
```tsx
<div className="flex justify-end">
  <Link
    href="/study/leaderboard"
    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
  >
    See leaderboard <ArrowRight className="h-3 w-3" />
  </Link>
</div>
```

Import `Link` from `next/link` and `ArrowRight` from `lucide-react` if not present.

**File:** `app/study/StudyHomeClient.tsx`

After the `<StreakSection />` block:
```tsx
<div className="-mt-2 flex justify-end">
  <Link
    href="/study/leaderboard"
    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
  >
    <Trophy className="h-3.5 w-3.5" /> Leaderboard
  </Link>
</div>
```

Import `Trophy` from `lucide-react`.

---

### FIX M-10 — Guard against overwriting existing rep

**File:** `app/api/study-admin/rep-applications/[id]/approve/route.ts`

Before the `study_reps` upsert, add:
```ts
const { data: existingRep } = await adminDb
  .from('study_reps')
  .select('user_id, department_id, role')
  .eq('user_id', appRow.user_id)
  .maybeSingle();

if (existingRep && existingRep.department_id !== department_id) {
  return jsonError(
    `This user is already a ${existingRep.role} for a different department. ` +
    `Revoke their current role first before approving this application.`,
    409,
    'REP_ALREADY_EXISTS'
  );
}
```

---

### FIX M-11 — Link GPA from Study Hub home and StudyTabs

**File:** `app/study/_components/StudyTabs.tsx`

Read the file. Add a GPA entry to the tabs or secondary nav. If there is a
"more" overflow section, add GPA there. If there is room in the main tab
row, add it as a tab. Match the visual pattern of existing tabs exactly.

**File:** `app/study/StudyHomeClient.tsx`

After the Courses section, add:
```tsx
<Link
  href="/study/gpa"
  className={cn(
    'flex items-center justify-between gap-3 rounded-3xl border bg-card p-4 shadow-sm',
    'hover:bg-secondary/20'
  )}
>
  <div className="min-w-0">
    <p className="text-sm font-extrabold text-foreground">GPA Calculator</p>
    <p className="mt-0.5 text-xs text-muted-foreground">
      Track your grades and plan for your target GPA.
    </p>
  </div>
  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
</Link>
```

---

### FIX M-12 — Dept notification from admin approval path

(Already handled in FIX C-7 — the fetch to `/api/study/notify-new-material`
is included there. No additional changes needed.)

---

### FIX P-1 — Visible countdown timer during timed quizzes

**File:** `app/study/practice/[setId]/PracticeTakeClient.tsx`

In the sticky quiz header, add a timer display when a time limit is active:
```tsx
{meta?.time_limit_minutes && timeLeftMs !== null && !submitted && (
  <div className={cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold tabular-nums',
    timeLeftMs <= 30_000
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300'
      : timeLeftMs <= 120_000
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300'
      : 'border-border bg-background text-foreground'
  )}>
    <Clock className="h-3.5 w-3.5" />
    {msToClock(timeLeftMs)}
  </div>
)}
```

`msToClock` is used in the engine file — confirm it's importable from
`@/lib/utils` and import it in PracticeTakeClient. Import `Clock` from
`lucide-react`.

---

### FIX P-2 — Verified and featured badges on material cards

**File:** `app/study/materials/MaterialsClient.tsx`

In the material card, after the type badge:
```tsx
{m.verified && (
  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
    <ShieldCheck className="h-3 w-3" /> Verified
  </span>
)}
{m.featured && (
  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
    <Star className="h-3 w-3" /> Featured
  </span>
)}
```

Import `ShieldCheck` and `Star` from `lucide-react` if not present.

---

### FIX P-3 — My Materials impact dashboard

**File:** `app/study/materials/my/page.tsx`

Read the file. Ensure the materials query selects `downloads` and `up_votes`.
At the top of the materials list, add:

```tsx
{materials.length > 0 && (
  <div className="grid grid-cols-3 gap-3">
    {[
      { label: 'Uploaded',   value: materials.length },
      { label: 'Downloads',  value: materials.reduce((s, m) => s + (m.downloads ?? 0), 0) },
      { label: 'Upvotes',    value: materials.reduce((s, m) => s + (m.up_votes  ?? 0), 0) },
    ].map(({ label, value }) => (
      <div key={label} className="rounded-2xl border bg-card p-3 text-center shadow-sm">
        <p className="text-xl font-extrabold text-foreground">{value}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
      </div>
    ))}
  </div>
)}
```

---

### FIX P-4 — AI answer visual distinction in Q&A

**File:** `app/study/questions/[id]/QuestionDetailClient.tsx`

Find the answer render. For answers where `answer.is_ai === true`, add a
badge and background:

```tsx
{answer.is_ai && (
  <div className="mb-2 flex items-center gap-2">
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      <Sparkles className="h-3 w-3" /> Generated by AI
    </span>
    <span className="text-[10px] text-muted-foreground">Verify before your exam</span>
  </div>
)}
```

Wrap the AI answer card in a slightly different bg:
```tsx
className={cn(
  'rounded-3xl border p-4',
  answer.is_ai ? 'border-border/60 bg-secondary/30' : 'bg-card'
)}
```

Import `Sparkles` from `lucide-react`.

---

### FIX P-5 — Exam countdown banner from academic calendar

**File:** `app/study/StudyHomeClient.tsx`

Add state and fetch:
```ts
const [examCountdown, setExamCountdown] = useState<{
  daysLeft: number; semester: string;
} | null>(null);

useEffect(() => {
  async function checkExamSeason() {
    try {
      const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from('study_academic_calendar')
        .select('session, semester, ends_on')
        .gte('ends_on', today)
        .order('ends_on', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!data?.ends_on) return;
      const daysLeft = Math.ceil(
        (new Date(data.ends_on).getTime() - (Date.now() + 3_600_000)) / 86_400_000
      );
      if (daysLeft <= 21) setExamCountdown({ daysLeft, semester: data.semester });
    } catch { /* non-critical */ }
  }
  checkExamSeason();
}, []);
```

Add banner in JSX (after semester-mismatch banner, before PageHeader):
```tsx
{examCountdown && (
  <Link
    href="/study/practice"
    className={cn(
      'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3',
      examCountdown.daysLeft <= 7
        ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30'
        : 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30'
    )}
  >
    <div className="min-w-0">
      <p className={cn(
        'text-sm font-extrabold',
        examCountdown.daysLeft <= 7
          ? 'text-red-900 dark:text-red-200'
          : 'text-amber-900 dark:text-amber-200'
      )}>
        {examCountdown.daysLeft <= 1
          ? 'Exams start tomorrow!'
          : `Finals in ${examCountdown.daysLeft} days`}
      </p>
      <p className={cn(
        'text-xs',
        examCountdown.daysLeft <= 7
          ? 'text-red-700 dark:text-red-300'
          : 'text-amber-700 dark:text-amber-300'
      )}>
        Practice now to be ready — tap to start.
      </p>
    </div>
    <ArrowRight className={cn(
      'h-4 w-4 shrink-0',
      examCountdown.daysLeft <= 7 ? 'text-red-700' : 'text-amber-700'
    )} />
  </Link>
)}
```

---

### FIX P-6 — Contextual tutor referral

**File:** `app/study/questions/[id]/QuestionDetailClient.tsx`

When the question has zero answers AND was created more than 24 hours ago:
```tsx
{answers.length === 0 && question.created_at &&
 (Date.now() - new Date(question.created_at).getTime()) > 86_400_000 && (
  <Link
    href={`/study/tutors${question.course_code ? `?course=${encodeURIComponent(question.course_code)}` : ''}`}
    className="mt-3 inline-flex items-center gap-2 rounded-2xl border bg-background px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/50"
  >
    <GraduationCap className="h-4 w-4" />
    Find a tutor for {question.course_code ?? 'this course'} →
  </Link>
)}
```

**File:** `app/study/practice/[setId]/PracticeTakeClient.tsx`

On the results screen, when `stats.total > 0 && stats.correct / stats.total < 0.5`:
```tsx
{submitted && stats.total > 0 && (stats.correct / stats.total) < 0.5 && (
  <Link
    href={`/study/tutors${meta?.course_code ? `?course=${encodeURIComponent(meta.course_code)}` : ''}`}
    className="flex items-center justify-between gap-3 rounded-2xl border bg-background px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50"
  >
    <div className="min-w-0">
      <p className="text-sm font-semibold text-foreground">Need help?</p>
      <p className="text-xs text-muted-foreground">
        Browse tutors for {meta?.course_code ?? 'this course'}.
      </p>
    </div>
    <GraduationCap className="h-4 w-4 shrink-0" />
  </Link>
)}
```

Import `GraduationCap` from `lucide-react` in both files.

---

### FIX P-7 — Duplicate warning in study-admin materials review

Find the study-admin material list/review component. This is likely rendered
through one of the study-admin pages. Read it, then add a per-material
duplicate check effect and warning badge:

```ts
const [duplicateOf, setDuplicateOf] = useState<{
  id: string; title: string; created_at: string;
} | null>(null);

useEffect(() => {
  if (!material.file_hash) return;
  supabase
    .from('study_materials')
    .select('id, title, created_at')
    .eq('file_hash', material.file_hash)
    .neq('id', material.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(({ data }) => { if (data) setDuplicateOf(data as any); });
}, [material.file_hash, material.id]);
```

```tsx
{duplicateOf && (
  <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800/40 dark:bg-amber-950/30">
    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
    <span className="text-amber-800 dark:text-amber-300">
      Possible duplicate of &quot;{duplicateOf.title}&quot; — uploaded{' '}
      {new Date(duplicateOf.created_at).toLocaleDateString('en-NG')}.
    </span>
  </div>
)}
```

---

## PHASE 4 — MIGRATION DEPLOYMENT CHECKLIST

Run in Supabase SQL editor in this exact order before deploying code:

```
[ ] 20260326_study_materials_denorm.sql
    Backfills course_code, department, faculty, level, semester onto
    study_materials rows where null.
    Verify: SELECT count(*) FROM study_materials
            WHERE course_code IS NULL AND course_id IS NOT NULL;
            → should return 0.

[ ] 20260326_study_materials_search_index.sql
    Creates GIN full-text search index on title, course_code, dept, faculty.
    Verify: \d study_materials → new index should be visible.

[ ] 20260326_study_activity_day_audit.sql
    Drops the legacy 'day' column from study_daily_activity.
    Verify: SELECT column_name FROM information_schema.columns
            WHERE table_name = 'study_daily_activity';
            → 'day' should NOT appear in the list.
```

---

## PHASE 5 — VERIFICATION CHECKLIST

**Critical fixes:**
- [ ] C-3: Student practicing at 12:30am WAT is credited to today, not yesterday
- [ ] C-1: Searching "CSC 209" returns only materials with that course code
- [ ] C-2: Level "300" chip on materials page returns only 300L materials
- [ ] C-2: Upload route sets course_code, department, faculty, level, semester on new insert
- [ ] C-4: Self-upvoting a question returns 403
- [ ] C-5: Approve + reject routes set reviewed_at, reviewed_by, decided_at
- [ ] C-6: Approved applicant gets in-app notification (type: rep_approved)
- [ ] C-6: Rejected applicant gets in-app notification (type: rep_rejected)
- [ ] C-7: Material approved via admin panel triggers AI summary AND dept notification
- [ ] C-8: No read-then-write download counter anywhere — only atomic RPC

**High fixes:**
- [ ] H-1: Materials empty state shows RequestCourseModal CTA when dept is known
- [ ] H-2: ai_summary renders on material detail page when not null
- [ ] H-3: Difficulty filter chips on practice home; difficulty badge on set cards
- [ ] H-4: Leaderboard pins own row at bottom when outside top N; "You" badge in top N
- [ ] H-5: New material approval pushes notification to dept users' devices
- [ ] H-6: Q&A pre-applies department filter from preferences on load
- [ ] H-7: Onboarding completion shows materials + practice set counts for dept
- [ ] H-8: Rep application success message explains 2–3 day review timeline
- [ ] H-8/M-8: Rejected status shows decision_reason text
- [ ] H-9: Practice results screen shows streak count after submission
- [ ] H-10: Material cards show up_votes count; detail page has vote button

**Medium fixes:**
- [ ] M-1: Upload route rejects non-allowlisted MIME types with 400
- [ ] M-2: time_spent_seconds is populated correctly on attempt submission
- [ ] M-3: Wrong answer rows have "Got it" button that persists understood flag
- [ ] M-4: study_daily_activity.day column dropped; no TypeScript errors remain
- [ ] M-5: DeptRow type uses `name` only; no display_name / official_name references
- [ ] M-6: Q&A list shows Solved / Answered / Unanswered badges with distinct colours
- [ ] M-7: Materials, Practice, Q&A pages show onboarding nudge when !hasPrefs
- [ ] M-9: StreakCard has "See leaderboard →" link; Study Hub home has leaderboard link
- [ ] M-10: Approving a rep for a different dept than their existing one returns 409
- [ ] M-11: GPA Calculator linked from Study Hub home and StudyTabs

**Polish fixes:**
- [ ] P-1: Timed quiz shows MM:SS countdown; amber at 2 min, red at 30 sec
- [ ] P-2: Verified materials show "Verified ✓" badge; featured show "Featured"
- [ ] P-3: My Materials page shows uploaded count, total downloads, total upvotes
- [ ] P-4: AI answers have "Generated by AI" badge and distinct background
- [ ] P-5: Exam countdown banner on Study Hub home when finals ≤ 21 days away
- [ ] P-6: Q&A shows tutor link when 0 answers after 24h
- [ ] P-6: Practice results shows tutor link when score < 50%
- [ ] P-7: Study-admin review shows duplicate warning when file_hash matches

**No regressions:**
- [ ] Existing material upload flow still works end-to-end (upload → approval queue)
- [ ] Rep uploads are still auto-approved without review queue
- [ ] Practice attempt submit still updates study_weak_questions (SRS intact)
- [ ] Admin panel approve/reject still works after adding audit fields
- [ ] `npm run build` passes with zero TypeScript errors

---

## FILES MODIFIED SUMMARY

```
# New migration files
supabase/migrations/20260326_study_materials_denorm.sql
supabase/migrations/20260326_study_materials_search_index.sql
supabase/migrations/20260326_study_activity_day_audit.sql

# New API route
app/api/study/materials/[id]/vote/route.ts

# Modified API routes
app/api/study/materials/route.ts
app/api/study/materials/upload/route.ts
app/api/study/questions/[id]/upvote/route.ts
app/api/study/notify-new-material/route.ts
app/api/study-admin/rep-applications/[id]/approve/route.ts
app/api/study-admin/rep-applications/[id]/reject/route.ts
app/api/admin/study/materials/approve/route.ts

# Modified lib
lib/studyPractice.ts

# Modified components and pages
app/study/StudyHomeClient.tsx
app/study/_components/StreakCard.tsx
app/study/_components/StreakSection.tsx
app/study/_components/StudyTabs.tsx
app/study/materials/MaterialsClient.tsx
app/study/materials/[id]/MaterialDetailClient.tsx
app/study/materials/my/page.tsx
app/study/practice/PracticeHomeClient.tsx
app/study/practice/[setId]/usePracticeEngine.ts
app/study/practice/[setId]/PracticeTakeClient.tsx
app/study/questions/QuestionsClient.tsx
app/study/questions/[id]/QuestionDetailClient.tsx
app/study/leaderboard/page.tsx
app/study/onboarding/OnboardingClient.tsx
app/study/apply-rep/page.tsx
```