# Claude Code Prompt — Material Chat (Ask AI About This Document)

## Context
Jabumarket Study Hub. Stack: Next.js, TypeScript, Tailwind CSS, Supabase, Gemini AI.
Study Hub brand tokens: `#5B35D5` (primary), `#EEEDFE` (light bg), `#3B24A8` (dark).
Never use `indigo-*`, `violet-*`, or `amber-*` Tailwind classes. Never use `#FF5C00`.

No pgvector. No chunking. No embeddings.
MVP approach: extract full PDF text server-side → stuff into Gemini context window → stream response.

---

## Phase 1 — Read & Audit (do this before writing any code)

Read each file below. For each, write a one-paragraph summary and flag conflicts relevant to this task.

1. `app/api/ai/summarize/route.ts`
   - Note: Gemini client initialisation, how PDF bytes are sent, streaming vs non-streaming response pattern.

2. `app/api/ai/explain/route.ts`
   - Note: whether this route streams. If it does, note exactly how the stream is constructed and returned (we will mirror this pattern for chat).

3. `app/study/materials/[id]/MaterialDetailClient.tsx`
   - Note: existing state variables, the AI Summary strip location, component structure below the action buttons, and any existing chat or expandable section patterns.

4. `app/api/ai/qa-answer/route.ts`
   - Note: how conversation history is handled if at all — we need a multi-turn chat pattern.

After reading, summarise:
- Whether Gemini streaming is already used anywhere in the codebase and which pattern to follow
- Any existing state variable names in `MaterialDetailClient.tsx` that could clash with new chat state

---

## Phase 2 — Implementation (in this exact order)

### Task 1 — New API route: `app/api/ai/material-chat/route.ts`

Create this file. It must:

1. Accept `POST` with JSON body:
```ts
{
  materialId: string;
  message: string;
  history: { role: "user" | "model"; text: string }[];
}
```

2. Authenticate the user via Supabase (same pattern as other AI routes).

3. Fetch the material record to get `file_url`, `file_path`, and `title`.

4. Return `400` with `{ error: "Only PDF materials are supported." }` if not a PDF.

5. Fetch the PDF as `ArrayBuffer` from the file URL.

6. Word-count guard: if extracted text exceeds **20,000 words**, return `400` with:
`{ error: "This document is too large for chat. Try a shorter material." }`

7. Build the Gemini conversation using this system instruction:
```
You are a study assistant for Nigerian university students.
Answer questions strictly based on the provided document.
If the answer cannot be found in the document, say: "I couldn't find that in this material."
Keep answers concise and student-friendly.
Do not invent information outside the document.
```

8. Include the full conversation `history` as prior turns so the model has multi-turn context.

9. **Stream** the Gemini response back using the same streaming pattern found in Phase 1 audit.
   - If no streaming pattern exists in the codebase, use `ReadableStream` with `TextEncoder` and return with `Content-Type: text/plain; charset=utf-8`.

10. Return `500` with `{ error: "Chat failed." }` on any unhandled error.

---

### Task 2 — UI changes in `app/study/materials/[id]/MaterialDetailClient.tsx`

Do not modify any existing logic.

**A. New type** (add near the other types at the top):
```ts
type ChatMessage = {
  role: "user" | "model";
  text: string;
};
```

**B. New state variables** (add alongside existing state):
```ts
const [chatOpen, setChatOpen] = useState(false);
const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
const [chatInput, setChatInput] = useState("");
const [chatLoading, setChatLoading] = useState(false);
const [chatError, setChatError] = useState<string | null>(null);
const messagesEndRef = useRef<HTMLDivElement>(null);
```

**C. New handler**:
```ts
async function handleChatSend() {
  const message = chatInput.trim();
  if (!message || chatLoading) return;

  const userMsg: ChatMessage = { role: "user", text: message };
  const updatedHistory = [...chatHistory, userMsg];
  setChatHistory(updatedHistory);
  setChatInput("");
  setChatLoading(true);
  setChatError(null);

  try {
    const res = await fetch("/api/ai/material-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialId: m.id,
        message,
        history: chatHistory, // send history before the new message
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Chat failed.");
    }

    // Stream the response token by token
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let modelText = "";

    // Add an empty model message to update progressively
    setChatHistory([...updatedHistory, { role: "model", text: "" }]);

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        modelText += decoder.decode(value, { stream: true });
        setChatHistory([
          ...updatedHistory,
          { role: "model", text: modelText },
        ]);
      }
    }
  } catch (e: unknown) {
    setChatError(e instanceof Error ? e.message : "Something went wrong.");
    // Remove the optimistically added user message on error
    setChatHistory(chatHistory);
  } finally {
    setChatLoading(false);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }
}
```

**D. Chat section UI** — add directly below the AI Summary strip in the JSX. Only render when `kind === "pdf"`:

```tsx
{kind === "pdf" && (
  <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
    {/* Header / toggle */}
    <button
      type="button"
      onClick={() => setChatOpen((v) => !v)}
      className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/20 transition"
    >
      <span className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#5B35D5]" />
        Ask AI about this material
      </span>
      {chatOpen ? (
        <ChevronUp className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      )}
    </button>

    {chatOpen && (
      <div className="border-t border-border/60">
        {/* Message list */}
        <div className="flex flex-col gap-3 max-h-72 overflow-y-auto px-4 py-3">
          {chatHistory.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              Ask anything about this document. AI answers only from its content.
            </p>
          )}
          {chatHistory.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed max-w-[88%]",
                msg.role === "user"
                  ? "ml-auto bg-[#5B35D5] text-white"
                  : "mr-auto bg-[#EEEDFE] text-[#3B24A8]"
              )}
            >
              {msg.text || (
                <span className="flex items-center gap-1.5 text-[#5B35D5]/60">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                </span>
              )}
            </div>
          ))}
          {chatError && (
            <p className="text-center text-xs text-red-500">{chatError}</p>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input row */}
        <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2.5">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleChatSend(); }}
            placeholder="Ask a question…"
            disabled={chatLoading}
            className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#5B35D5] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleChatSend}
            disabled={chatLoading || !chatInput.trim()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#5B35D5] text-white transition hover:bg-[#3B24A8] disabled:opacity-50"
          >
            {chatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    )}
  </div>
)}
```

**E. Import check** — ensure `ChevronUp`, `ChevronDown`, `ArrowRight`, `Loader2`, and `Sparkles` are all present in the existing lucide-react import at the top of the file. Add any that are missing — do not remove existing ones.

---

## Verification Checklist

- [ ] `POST /api/ai/material-chat` returns 400 for non-PDF materials
- [ ] `POST /api/ai/material-chat` returns 400 for oversized PDFs
- [ ] Multi-turn history is passed correctly — AI remembers earlier messages in the same session
- [ ] Response streams token by token (not a single JSON blob)
- [ ] Each new user message appends to `chatHistory` before the API call
- [ ] Model response updates progressively as tokens arrive
- [ ] Sending an empty input is a no-op
- [ ] Enter key triggers send
- [ ] Chat section only renders when `kind === "pdf"`
- [ ] Collapsible toggle works — open/closed state persists while on the page
- [ ] Chat history resets when user navigates away (no persistence needed for MVP)
- [ ] No `indigo-*`, `violet-*`, or `amber-*` Tailwind classes used
- [ ] No `#FF5C00` used anywhere in new UI
- [ ] TypeScript compiles with no new errors (`tsc --noEmit`)