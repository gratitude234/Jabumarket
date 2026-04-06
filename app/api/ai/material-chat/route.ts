// app/api/ai/material-chat/route.ts
// POST /api/ai/material-chat
// Streams a Gemini response grounded in a PDF material for multi-turn chat.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const MODEL = "gemini-2.5-flash-lite";
const STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type HistoryEntry = { role: "user" | "model"; text: string };

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { materialId?: string; message?: string; history?: HistoryEntry[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { materialId, message, history = [] } = body;
  if (!materialId || !message?.trim()) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // ── Fetch material ─────────────────────────────────────────────────────────
  const admin = adminClient();
  const { data: mat, error: matErr } = await admin
    .from("study_materials")
    .select("id, title, file_url, file_path")
    .eq("id", materialId)
    .maybeSingle();

  if (matErr || !mat) {
    return NextResponse.json({ error: "Material not found." }, { status: 404 });
  }

  const fileUrl = (mat as any).file_url as string | null;
  const filePath = (mat as any).file_path as string | null;

  // ── PDF check ──────────────────────────────────────────────────────────────
  const urlStr = ((fileUrl ?? "") + " " + (filePath ?? "")).toLowerCase();
  if (!urlStr.includes(".pdf")) {
    return NextResponse.json({ error: "Only PDF materials are supported." }, { status: 400 });
  }

  // ── Resolve download URL ───────────────────────────────────────────────────
  let downloadUrl: string | null = fileUrl;
  if (!downloadUrl && filePath) {
    const { data: signed } = await admin.storage
      .from("study-materials")
      .createSignedUrl(filePath, 300);
    downloadUrl = (signed as any)?.signedUrl ?? null;
  }

  if (!downloadUrl) {
    return NextResponse.json({ error: "File URL not available." }, { status: 404 });
  }

  // ── Fetch PDF bytes ────────────────────────────────────────────────────────
  let pdfBuffer: ArrayBuffer;
  try {
    const fetchRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
    if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`);
    pdfBuffer = await fetchRes.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to fetch PDF file." }, { status: 502 });
  }

  // ── Word count guard ───────────────────────────────────────────────────────
  try {
    const rawText = new TextDecoder("utf-8", { fatal: false }).decode(pdfBuffer);
    const wordCount = rawText.split(/\s+/).filter((w) => w.length > 1).length;
    if (wordCount > 20_000) {
      return NextResponse.json(
        { error: "This document is too large for chat. Try a shorter material." },
        { status: 400 }
      );
    }
  } catch {
    // Non-critical — proceed
  }

  // ── Build Gemini request ───────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI service not configured." }, { status: 500 });
  }

  const base64Pdf = Buffer.from(pdfBuffer).toString("base64");

  const systemInstruction = `You are a study assistant for Nigerian university students.
Answer questions strictly based on the provided document.
If the answer cannot be found in the document, say: "I couldn't find that in this material."
Keep answers concise and student-friendly.
Do not invent information outside the document.`;

  // Build contents: PDF context pair → history → current message
  type GeminiPart =
    | { text: string }
    | { inline_data: { mime_type: string; data: string } };

  type GeminiContent = {
    role: "user" | "model";
    parts: GeminiPart[];
  };

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        { inline_data: { mime_type: "application/pdf", data: base64Pdf } },
        { text: "I'm sharing this document with you. Please use it to answer my questions." },
      ],
    },
    {
      role: "model",
      parts: [{ text: "I've received the document. I'll answer your questions based on its contents." }],
    },
    ...history.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }] as GeminiPart[],
    })),
    {
      role: "user" as const,
      parts: [{ text: message.trim() }],
    },
  ];

  const geminiBody = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  };

  // ── Call Gemini streaming endpoint ─────────────────────────────────────────
  let geminiRes: Response;
  try {
    geminiRes = await fetch(`${STREAM_URL}&key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    console.error("[material-chat] Gemini fetch error:", e?.message);
    return NextResponse.json({ error: "Chat failed." }, { status: 500 });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => geminiRes.statusText);
    console.error("[material-chat] Gemini error:", errText);
    return NextResponse.json({ error: "Chat failed." }, { status: 500 });
  }

  // ── Stream SSE → plain text stream to client ───────────────────────────────
  const encoder = new TextEncoder();
  const geminiBody2 = geminiRes.body;

  const stream = new ReadableStream({
    async start(controller) {
      if (!geminiBody2) {
        controller.close();
        return;
      }

      const reader = geminiBody2.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last (possibly incomplete) line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (!json || json === "[DONE]") continue;
            try {
              const chunk = JSON.parse(json);
              const text: string =
                chunk?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            } catch {
              // Malformed JSON chunk — skip
            }
          }
        }
      } catch (e: any) {
        console.error("[material-chat] stream read error:", e?.message);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
