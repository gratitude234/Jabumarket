# Fix: Streaming Study Plan Parse Error

## Context

The Gemini `streamGenerateContent` API sends **cumulative** text in each chunk, not deltas.
So each chunk already contains the full generated text up to that point.

The frontend is currently doing `accumulated += chunk`, which concatenates all the
cumulative snapshots together — producing invalid JSON that fails to parse.

## Phase 1: Read & Confirm

Read the frontend study plan component. Confirm the exact line where chunks are
accumulated (the `accumulated += chunk` pattern or equivalent). Report the full file
path from project root.

## Phase 2: Implement

**Fix 1 — Frontend (primary fix)**

Change the accumulation line from:
```ts
accumulated += chunk
```
to:
```ts
accumulated = chunk
```

This means the state always holds the latest cumulative snapshot, which is already
the complete text so far — and the final chunk is the complete valid JSON.

**Fix 2 — Backend (secondary fix)**

In the API route streaming loop, after `if (done) break`, flush any remaining content
in the `buffer` variable before calling `controller.close()`. Ensure the last SSE
line is not silently dropped if it arrives without a trailing newline.

## Verification Checklist
- [ ] `accumulated = chunk` (not `+=`) in the frontend reader loop
- [ ] Backend flushes remaining buffer before closing the stream
- [ ] Study plan generates successfully on production without parse error
- [ ] All modified file paths listed from project root