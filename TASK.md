I'm building a feature improvement for the Study Hub in Jabumarket — specifically the 
"Generate Practice Questions" tool on the material detail page.

The codebase is Next.js 14, TypeScript, Tailwind CSS, Supabase. The relevant files are:

- app/study/materials/[id]/MaterialDetailClient.tsx  (the UI)
- app/api/ai/generate-questions/route.ts             (Gemini API call)
- app/api/ai/save-generated-questions/route.ts       (saves to Supabase)

Here is what needs to be built:

---

## 1. Pre-generation config sheet

When the user clicks "Generate Practice Questions", instead of immediately firing 
the API call, open a bottom sheet that lets them configure:
- Number of questions: 5 | 10 | 15 | 20 (default 10)
- Difficulty: "Easy warm-up" | "Mixed" | "Exam-hard" (default Mixed)
- Focus area: optional text input (e.g. "continuity and limits")

The CTA button should read "Generate [N] questions" and dynamically update 
based on the selected count.

---

## 2. Update the API route to accept config params

Update /api/ai/generate-questions/route.ts to accept:
- count: number (default 10)
- difficulty: "easy" | "mixed" | "hard"
- focus?: string

Inject these into the Gemini system prompt. For difficulty:
- easy: "Generate straightforward recall and definition questions"
- mixed: "Mix of recall, application, and analysis questions"
- hard: "Generate exam-style questions requiring deep understanding and application"

If focus is provided, add: "Focus specifically on: [focus]"

---

## 3. Rate limit shown proactively on page load

On page load, check the ai_rate_limits table for the current user + 
"generate-questions" endpoint. If cooling down, show the remaining wait time 
on the button and disable it. Use a countdown that ticks every second.
Don't wait for the user to click and hit a 429.

---

## 4. Replace the bottom sheet list with a quiz mode

Instead of showing all questions in a scrollable list, show one question at a time:
- Progress bar at top (e.g. Q 3/10)
- Running score in header (e.g. "2/2 ✓")
- Question text
- Four tappable option buttons (A, B, C, D)
- On tap: immediately highlight correct (purple) and wrong (red), reveal explanation
- "Next" button to advance, "Skip" to move on without answering
- After last question → show results screen

---

## 5. Results screen (replaces the current sheet footer)

After completing all questions show:
- Score ring (SVG circle) showing X/Y
- Stat row: Correct | Missed | Skipped
- List of missed questions with what the student chose vs correct answer
- Primary CTA: "Retry missed questions (N)" — reruns quiz with only wrong answers
- Secondary CTA: "Save to practice library"

---

## 6. Save flow updates

When saving, update /api/ai/save-generated-questions to also write:
- source_material_id (the material the questions were generated from)
- due_at = now() + 1 day (for spaced repetition)

After saving, show "Saved — view on practice page →" with a link to /study/practice.

---

## 7. Spaced repetition: update due_at after each attempt

When a student completes a practice set from the practice page, write a row to 
practice_attempts (set_id, user_id, score, time_taken_seconds, created_at) 
and update the set's due_at using this rule:
- score >= 80%: due_at = now() + 3 days
- score 60–79%: due_at = now() + 2 days
- score < 60%: due_at = now() + 1 day

---

## State management notes

Use React state in MaterialDetailClient.tsx to manage:
- configSheetOpen: boolean
- quizConfig: { count, difficulty, focus }
- quizState: "idle" | "config" | "loading" | "quiz" | "results"
- currentQuestionIndex: number
- answers: Record<number, { chosen: string, correct: boolean, skipped: boolean }>
- generatedQuestions: Question[]

Keep all existing functionality (AI summary, Ask AI chat, summarize) intact.
Do not break any existing API routes.

The existing generate-questions rate limit is 5 minutes — keep that.
The existing Supabase table structure for quiz_sets and quiz_questions — keep that,
just add source_material_id and due_at columns if they don't exist.