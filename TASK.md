# Feature: Streaming Study Plan Generation (Gemma 4)

## Phase 1: Read & Summarise

Read the following files and summarise before touching any code:

1. `app/api/ai/study-plan/route.ts` — full current implementation
2. The frontend component that calls this endpoint and renders the study plan result (search for where `/api/ai/study-plan` is fetched)

Summarise:
- How the API route currently calls Gemma and returns the response
- How the frontend currently handles the response (does it wait for full JSON? parse a specific shape?)
- What the response data structure looks like

Do not write any code yet.

---

## Phase 2: Implement

### Backend — `app/api/ai/study-plan/route.ts`

1. Switch from a standard `Response` to a **streaming response** using the Gemini API's stream endpoint:
   - Change the API call to use `streamGenerateContent` instead of `generateContent`
   - Use `TransformStream` or `ReadableStream` to pipe the streamed chunks back to the client
   - Set response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
   - Keep `maxDuration = 60`

2. Stream format: send each chunk as a plain text delta (not SSE with `data:` prefix unless the frontend already handles SSE)

### Frontend — study plan component

1. Replace the current `fetch` + `await response.json()` pattern with a **streaming reader**:
   ```ts
   const reader = response.body.getReader()
   const decoder = new TextDecoder()
   while (true) {
     const { done, value } = await reader.read()
     if (done) break
     const chunk = decoder.decode(value)
     // append chunk to state
   }
   ```
2. Show the study plan content progressively as chunks arrive — append to a state variable and render in real time
3. Show a loading/generating indicator while streaming is in progress
4. Only mark generation as complete when the stream closes

## Verification Checklist
- [ ] Backend streams chunks instead of buffering full response
- [ ] Frontend reads stream and renders progressively
- [ ] No timeout errors on production
- [ ] Loading state shown during generation
- [ ] Full paths of all modified files listed from project root