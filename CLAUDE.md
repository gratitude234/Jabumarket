# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint check
```

No test suite is configured. There is no test command.

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=          # for AI Study Plan feature
```

## Architecture Overview

**Jabumarket** is a Next.js 16 (App Router) marketplace + study platform for JABU (Ja'iz) university students. It has two main domains:

1. **Marketplace** — vendors, product/service listings, couriers, delivery requests
2. **Study Hub** — course materials, MCQ practice sets, Q&A, tutors, leaderboard, GPA calculator, AI study plan

### Supabase Client Pattern

Three distinct clients — always use the right one:

| Client | File | When to use |
|--------|------|-------------|
| Browser | `lib/supabase.ts` | Client components, `"use client"` hooks |
| Server | `lib/supabase/server.ts` → `createSupabaseServerClient()` | Server Components, Route Handlers (must `await`) |
| Admin / Service Role | `lib/supabase/admin.ts` → `createSupabaseAdminClient()` | Route Handlers that bypass RLS — **never import in client components** |

Session cookies are refreshed by `proxy.ts` (acts as Next.js middleware — `middleware.ts` is intentionally unused).

### Layout System

`AppChrome` (`components/layout/AppChrome.tsx`) wraps all non-admin pages with `TopNav`, `MobileTopBar`, and `BottomNav`. Admin pages (`/admin/*`) render children directly — **do not add AppChrome wrappers to admin routes**.

### Authorization Guards

- **`lib/admin/requireAdmin.ts`** — checks `admins` table via service-role client; throws 401/403
- **`lib/studyAdmin/requireStudyModerator.ts`** — checks `study_admins` (super) or `study_reps` (scoped); returns `{ userId, scope }`
- **`lib/studyAdmin/scope.ts` → `isWithinScope(scope, entity)`** — enforces department/level restrictions for course reps and dept librarians

Study moderator roles: `super` (unrestricted), `dept_librarian` (department-wide), `course_rep` (department + specific levels array).

### Study Hub — Practice Engine

`app/study/practice/[setId]/usePracticeEngine.ts` is a large client-side hook that manages the full quiz lifecycle: parallel data loading (auth + quiz set + questions+options in one shot), attempt creation/restore, localStorage draft autosave, countdown timer, answer persistence via Supabase upsert, and soft-reset without page navigation.

Key tables: `study_quiz_sets`, `study_quiz_questions`, `study_quiz_options`, `study_practice_attempts`, `study_attempt_answers`, `study_daily_activity`.

### AI Integration

`lib/gemini.ts` wraps Gemini 2.5 Flash-Lite via direct REST calls (no SDK). Server-only — never import in client components. Exports `gemini(prompt)` and `geminiJson<T>(prompt)` for structured responses.

### Material Upload Flow

Two-step signed-upload flow:
1. `POST /api/study/materials/upload` — validates scope, inserts pending row (`approved: false`), returns a Supabase Storage signed upload token
2. `POST /api/study/materials/upload/complete` — client calls after direct-to-storage upload to finalize the row

Storage bucket: `study-materials`. Path pattern: `materials/{dept_id}/{course_code}/{material_id}-{filename}`.

### UI Components

shadcn/ui components live in `components/ui/`. Tailwind CSS v4 with `tw-animate-css`. Utility: `lib/utils.ts` exports `cn()` (clsx + tailwind-merge).

### Key Type Definitions

All shared types are in `lib/types.ts`: `ListingRow`, `VendorRow`, `QuizSet`, `QuizQuestion`, `QuizOption`, `ReviewTab`, `CourierRow`, etc.

### API Response Convention

Route Handlers return `{ ok: true, ...data }` on success and `{ ok: false, code, message }` on error. Error helper: `jsonError(message, status, code)`.

### Notification Pattern

`lib/studyNotify.ts` sends fire-and-forget notifications (errors swallowed so failures don't break the main action). Self-notifications are skipped. Uses service-role client.
