
**"You are a senior full-stack engineer implementing a prioritised Study Hub overhaul on Jabu Market — a Next.js + Supabase campus super-app. You have a full product and UX audit. Your job is to implement every fix in order, surgically, without breaking anything.**

**Before touching a single file:**
1. Read `CLAUDE.md` fully
2. Scan every file under `/study`, `/study-admin`, `app/study/_components/`, every API route touching study data, every hook and context the study system uses
3. List every file you'll touch across all fixes before starting
4. Flag any file that doesn't exist yet — confirm you'll create it
5. Confirm you understand the Supabase client rules — browser vs server vs admin — before writing a single query
6. Run all migrations first and confirm before touching any UI

---

## 🔴 CRITICAL — Implement These First

**FIX 1 — Upload accessible to all authenticated students**
File: `app/study/_components/StudyTabs.tsx` (MoreSheet section)

Currently "Upload" is only shown when `contributorStatus === 'approved'`. Change this:
- Show "Upload Materials" for ALL authenticated users — move it to the top of the MoreSheet
- Below it, keep "Apply as Course Rep" as a separate entry — label it clearly: "Apply as Course Rep → get elevated upload permissions"
- The "Apply Rep" entry should only show when `contributorStatus !== 'approved'`
- Never remove or hide the upload path from any authenticated student

---

**FIX 2 — Fix onboarding to query real tables directly**
Files: Every file in the onboarding flow that queries `study_faculties_clean` or `study_departments_clean`

Search the entire codebase for `study_faculties_clean` and `study_departments_clean`. Replace every reference with the real tables:
- `study_faculties_clean` → `study_faculties` (filter: `.eq('is_active', true).order('sort_order')`)
- `study_departments_clean` → `study_departments` (filter: `.eq('is_active', true).order('sort_order')`)

Remove all view-dependent fallback logic. If the real tables return empty, show a proper empty state — not a manual text input fallback. This is a one-line change per query but must be applied consistently across every onboarding step.

---

**FIX 3 — Block unpublished quiz sets in the practice engine**
File: `usePracticeEngine.ts` (or wherever the set fetch lives)

After fetching a set by ID, add:
```ts
if (!set.published) {
  // Check if caller is admin or rep
  const isPrivileged = roles.isStudyAdmin || roles.isStudyContributor;
  if (!isPrivileged) {
    return { error: 'This practice set is not available yet.', set: null };
  }
}
```
The practice home should already filter to `published: true` — add that filter there too if missing. No student should reach an unpublished set.

---

**FIX 4 — "Due Today" widget on Study Home**
Files:
- `app/study/_components/StudyHomeClient.tsx` (add widget)
- Create: `app/study/_components/DueTodayWidget.tsx`

Create a `DueTodayWidget` component:
- Query `study_weak_questions` where `user_id = currentUser` AND `next_due_at <= now()` AND `graduated_at IS NULL`
- Show count of due questions
- If count > 0: render a prominent card — amber or primary color — "You have {n} questions due today" with a single CTA button: "Start review →" linking to `/study/practice?due=1`
- If count === 0: render a quiet "Nothing due today — you're on track ✓" chip
- Place this widget immediately below the streak card on the home page — above the For You / Trending section
- Use the browser Supabase client — this is a client component

---

**FIX 5 — Auto-apply department and level filter post-onboarding**
File: `app/study/materials/page.tsx` or `MaterialsClient.tsx`

After a student completes onboarding, their `study_preferences` has `faculty_id`, `department_id`, `level`, `semester`. On the materials page:
- On first load with no URL params, automatically apply filters from `useStudyPrefs()`: department and level
- Set these as the default filter state — not as locked filters, but as pre-selected ones the student can change
- Update the URL params to reflect the applied filters so the page is shareable and bookmarkable
- Show a small chip: "Showing results for your department · Change" that links to filter controls

---

**FIX 6 — Add "Request missing content" path for students**
Files:
- Create: `app/study/_components/RequestCourseModal.tsx`
- File: `app/study/materials/page.tsx` (empty state)
- File: `app/study/practice/page.tsx` (empty state)
- Create: `app/api/study/course-requests/route.ts`

When a student sees an empty state on `/study/materials` or `/study/practice`:
- Replace the generic "No materials found" with: "No content yet for this course. Help us grow — request it."
- Add a "Request this course" button that opens `RequestCourseModal`
- Modal collects: course code, course title (optional), and a note
- On submit, insert into `study_course_requests` table using an API route with the server Supabase client
- Show success: "Request submitted — we'll notify you when content is available"
- The admin already has a review UI for this table — no admin changes needed

---

**FIX 7 — Surface "new in your department" notifications**
Files:
- Create: `app/api/study/notify-new-material/route.ts`
- File: wherever material approval is confirmed in the admin flow

When a material is approved (status flips to `approved: true`):
- Trigger the new route which:
  - Finds all users whose `study_preferences.department_id` matches the material's `department_id` AND `level` matches (or is null)
  - Inserts a `notifications` row for each: `{ type: 'study_new_material', title: 'New material in your department', body: '{material.title} — {material.course_code}', href: '/study/materials/{material.id}' }`
- Cap at 200 notifications per approval to avoid spam
- Use the admin Supabase client — this is a server-side route
- Wrap the entire notification loop in try/catch — notification failure must never block material approval

---

## 🟡 IMPORTANT — Implement After Criticals

**FIX 8 — Promote search bar above the fold on Study Home**
File: `app/study/_components/StudyHomeClient.tsx`

Move `UnifiedSearch` to be the very first element inside the page body — above the streak card, above the For You section, above everything except the page header. On mobile this means it's visible without any scroll. Add placeholder text: "Search courses, past questions, topics..."

---

**FIX 9 — Auto-filter Q&A forum to student's department on load**
File: `app/study/questions/QuestionsClient.tsx`

On component mount, if `study_preferences` has `department_id` and no URL filters are set:
- Apply `department_id` and `level` as default filters
- Update the URL: `/study/questions?dept={department_id}&level={level}`
- Show a chip: "Filtered to your department · Show all" that clears filters
- Do NOT lock the filter — students must be able to browse all departments

---

**FIX 10 — Surface difficulty on practice set cards and add difficulty filter**
Files:
- `app/study/practice/PracticeHomeClient.tsx` or the practice set card component
- The filter bar on the practice home

On each practice set card, add a difficulty badge:
- `easy` → green pill "Easy"
- `medium` → amber pill "Medium"  
- `hard` → red pill "Hard"
- `null` → no badge

Add a difficulty filter to the practice home filter bar alongside the existing course/level filters. Filter options: All / Easy / Medium / Hard. Apply via URL param `?difficulty=easy`.

---

**FIX 11 — Wire streak feedback into practice results screen**
File: The practice results/submission screen component

After a student submits a practice attempt:
- Fetch their current streak from `study_daily_activity` where `activity_date = today`
- If `did_practice` just became true for the first time today (the attempt they just submitted), show:
  ```
  🔥 {streak_count}-day streak — keep it going!
  ```
  as a highlighted banner at the top of the results screen
- If streak is 1 (first day): "You started a streak today — come back tomorrow!"
- If streak >= 7: "🔥 {n}-day streak — you're on a roll!"
- This is read-only — just fetch and display, don't update streak here (that should already happen on submission)

---

**FIX 12 — Connect tutors to Q&A "no answer" state**
Files:
- `app/study/questions/[id]/page.tsx` or the question detail component
- The "no answers yet" empty state component

When a question has `answers_count === 0`:
- Below the "No answers yet" empty state, add: "Need help now? Find a tutor for this course →"
- Link to `/study/tutors?course={question.course_code}` (or `/study/tutors` if no course code)
- Also add a tutor link from the practice results screen when score < 50%: "Struggling? Connect with a tutor for {course_code} →"

---

**FIX 13 — Trigger AI summary on material approval**
Files:
- Wherever material approval happens in the admin flow (likely `app/study-admin/` or an API route)
- `app/api/ai/summarize/route.ts` (already exists — just call it)
- Material detail page — display the summary

Step 1: In the material approval flow, after setting `approved: true`, call `/api/ai/summarize` with the `material_id`. Store the result in `study_materials.ai_summary`.

Step 2: In the material detail page, if `material.ai_summary` is not null, render it in a card:
```tsx
<div className="rounded-2xl border bg-amber-50 p-4">
  <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-2">AI Summary</p>
  <p className="text-sm text-zinc-700">{material.ai_summary}</p>
</div>
```
If null, render nothing — no placeholder.

---

**FIX 14 — Show rep application decision reason on rejection**
File: `app/study/apply-rep/page.tsx` or the rep status component

When `study_rep_applications.status === 'rejected'` AND `decision_reason` is not null:
- Show the reason clearly: "Your application was not approved. Reason: {decision_reason}"
- Add a "Apply again" button that resets the form — pre-fill their previous faculty/department/level selections
- When `status === 'pending'`, show: "Your application is under review. This usually takes 2-3 working days."

---

**FIX 15 — Add download count and vote count to all material cards**
File: The `MaterialCard` component (wherever it renders in lists)

Always show:
- `{m.downloads} downloads` — as a small stat below the material type badge
- `{m.up_votes}` upvotes — only if > 0, shown as a green thumbs-up count
- For high-download materials (> 50), add a "Popular" badge in amber
Remove the conditional that only shows downloads for trending items — it should always be visible as social proof.

---

## 🟢 POLISH — Do These Last

**FIX 16 — Smarter CTA on onboarding completion screen**
File: The Step 4 / completion screen of `/study/onboarding`

Instead of three equal-weight flat cards, make the CTA dynamic:
- If `practice_sets_count > 0`: hero CTA → "Start practising ({n} sets available)" → `/study/practice`
- Else if `materials_count > 0`: hero CTA → "Browse materials ({n} available)" → `/study/materials`
- Else: hero CTA → "Explore Study Hub" → `/study`
- Secondary CTA always: "Ask a question" → `/study/questions/new`
- Tertiary: "Upload materials" → `/study/upload`

---

**FIX 17 — Show up to 3 active sessions in the Continue card**
File: `app/study/_components/ContinueCard.tsx`

Instead of fetching one latest attempt, fetch up to 3 in-progress attempts (`status === 'in_progress'`), ordered by `updated_at` descending. Render each as a compact row in the card. If only 1: current behaviour. If 2+: stack them in the card with course code and progress visible per row.

---

**FIX 18 — Add "next action" CTAs to practice results screen**
File: The practice results/submission screen

After the score, weak questions, and streak feedback, add a "What next?" section with:
- "Retry weak questions" → `/study/practice/{set_id}?due=1` (only if weak questions exist)
- "Browse materials for {course_code}" → `/study/materials?course={course_code}`
- "Try another set" → `/study/practice` 
Each as a bordered card/button — equal weight, student picks their path.

---

**FIX 19 — Compact activity grid on home streak card**
File: `app/study/_components/StudyHomeClient.tsx` or the streak card component

Below the streak count on the home streak card, add a compact 2-row × 14-column dot grid showing the last 28 days of `study_daily_activity`. Each day is a small dot:
- `did_practice === true` → filled dot in primary color
- `did_practice === false` → empty dot in zinc-200
- Today → outlined dot with a ring
Fetch from `study_daily_activity` where `user_id = me` and `activity_date >= 28 days ago`. This is a read-only display — no new data writes.

---

**FIX 20 — Fold AI Study Plan into Practice Home as a widget**
Files:
- `app/study/practice/PracticeHomeClient.tsx` (add suggested session widget)
- Keep `/study/ai-plan` as-is — don't remove it

Add a "Suggested for today" widget at the top of the practice home that calls the same Gemini endpoint as the AI plan but returns a single focused session recommendation: "Based on your weak areas in CSC 201, try this 10-question set." Link directly to the recommended set. Show this only if the student has at least one completed attempt and at least one weak question flagged. If not, hide the widget entirely.

---

## IMPLEMENTATION RULES:
1. Read `CLAUDE.md` before starting
2. Read every file before editing it — never assume structure
3. Use the correct Supabase client — browser for client components, server for RSCs, admin for privileged writes
4. Never use `any` for new TypeScript — define proper types for all new data shapes
5. All new `Link` hrefs must point to pages that actually exist or that you're creating in this sprint
6. After each fix confirm: which files were changed, what was added, what was removed
7. Do not combine unrelated edits into a single file change
8. Run migrations before implementing any UI that depends on them
9. Never touch RLS policies or any system outside the Study Hub scope
10. If a component you need to edit doesn't exist yet, create it — don't skip
11. Every empty state must have a coaching action — never leave a blank screen
12. Every new data-fetching component needs a loading skeleton and an error state

**Implement in order 1–20. Criticals first. Confirm each fix before moving to the next.**

**The goal: A 200L Engineering student opens Study Hub, finds a past question for their exact course in under 5 taps, practices MCQs, sees their due questions on the home screen every day, and has a reason to come back tomorrow — without needing WhatsApp or Google Drive for anything Study Hub covers."**

---
