# Fix: Study Plan API Timeout

## Phase 1: Read & Summarise

Read `app/api/ai/study-plan/route.ts` (or wherever the study plan API route lives — confirm the full path from project root). Check if `maxDuration` is already set.

## Phase 2: Implement

Add the following at the top-level of the route file (outside any function):

```ts
export const maxDuration = 60
```

This increases the Vercel serverless function timeout from the default 10s to 60s.

## Verification Checklist
- [ ] `maxDuration = 60` added to the correct route file
- [ ] Placed at module level, not inside a function
- [ ] Full file path from project root confirmed