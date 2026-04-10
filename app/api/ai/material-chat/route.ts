// app/api/ai/material-chat/route.ts
// POST /api/ai/material-chat
// Streams a Gemini response grounded in a PDF material for multi-turn chat.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";

const MODEL = "gemini-2.5-flash-lite";
const FILE_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;

type HistoryEntry = { role: "user" | "model"; text: string };
type StudyMaterialRow = {
  id: string;
  title: string | null;
  file_url: string | null;
  file_path: string | null;
  gemini_file_uri: string | null;
};
type GeminiFileUploadResponse = {
  file?: {
    uri?: string | null;
  } | null;
};
type GeminiPart =
  | { text: string }
  | { file_data: { mime_type: string; file_uri: string } };
type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};
type GeminiStreamChunk = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};
type RateLimitRow = {
  last_called_at: string;
};

async function uploadPdfToGemini(
  apiKey: string,
  pdfBuffer: ArrayBuffer,
  displayName: string
): Promise<string> {
  const startRes = await fetch(`${FILE_UPLOAD_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(pdfBuffer.byteLength),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
    },
    body: JSON.stringify({
      file: {
        display_name: displayName,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!startRes.ok) {
    const errText = await startRes.text().catch(() => startRes.statusText);
    throw new Error(`Gemini upload init failed: ${errText}`);
  }

  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini upload URL missing.");
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(pdfBuffer.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: Buffer.from(pdfBuffer),
    signal: AbortSignal.timeout(60_000),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => uploadRes.statusText);
    throw new Error(`Gemini upload failed: ${errText}`);
  }

  const uploadData = (await uploadRes.json()) as GeminiFileUploadResponse;
  const fileUri = uploadData.file?.uri?.trim();
  if (!fileUri) {
    throw new Error("Gemini file URI missing.");
  }

  return fileUri;
}

async function enforceRateLimit(
  admin: typeof adminSupabase,
  userId: string,
  endpoint: string,
  cooldownMs: number
): Promise<
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }
  | { allowed: false; error: string }
> {
  const { data, error } = await admin
    .from("ai_rate_limits")
    .select("last_called_at")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (error) {
    return { allowed: false, error: error.message };
  }

  const row = data as RateLimitRow | null;
  const now = Date.now();
  if (row?.last_called_at) {
    const nextAllowedAt = new Date(row.last_called_at).getTime() + cooldownMs;
    if (Number.isFinite(nextAllowedAt) && nextAllowedAt > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((nextAllowedAt - now) / 1000),
      };
    }
  }

  const { error: upsertError } = await admin
    .from("ai_rate_limits")
    .upsert(
      {
        user_id: userId,
        endpoint,
        last_called_at: new Date(now).toISOString(),
      },
      { onConflict: "user_id,endpoint" }
    );

  if (upsertError) {
    return { allowed: false, error: upsertError.message };
  }

  return { allowed: true };
}

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Parse body
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

  // Fetch material
  const admin = adminSupabase;
  const { data: mat, error: matErr } = await admin
    .from("study_materials")
    .select("id, title, file_url, file_path, gemini_file_uri")
    .eq("id", materialId)
    .maybeSingle();

  if (matErr || !mat) {
    return NextResponse.json({ error: "Material not found." }, { status: 404 });
  }

  const material = mat as StudyMaterialRow;
  const fileUrl = material.file_url;
  const filePath = material.file_path;

  // PDF check
  const urlStr = `${fileUrl ?? ""} ${filePath ?? ""}`.toLowerCase();
  if (!urlStr.includes(".pdf")) {
    return NextResponse.json({ error: "Only PDF materials are supported." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI service not configured." }, { status: 500 });
  }

  let fileUri = material.gemini_file_uri?.trim() ?? "";
  let downloadUrl: string | null = null;
  if (!fileUri) {
    downloadUrl = fileUrl;
    if (!downloadUrl && filePath) {
      const { data: signed } = await admin.storage
        .from("study-materials")
        .createSignedUrl(filePath, 300);
      downloadUrl = signed?.signedUrl ?? null;
    }

    if (!downloadUrl) {
      return NextResponse.json({ error: "File URL not available." }, { status: 404 });
    }
  }

  const rateLimit = await enforceRateLimit(admin, user.id, "material-chat", 60_000);
  if ("error" in rateLimit) {
    console.error("[material-chat] rate limit error:", rateLimit.error);
    return NextResponse.json({ error: "Failed to check rate limit." }, { status: 500 });
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Please wait ${rateLimit.retryAfterSeconds} seconds before sending another chat message.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  if (!fileUri) {
    const pdfDownloadUrl = downloadUrl;
    if (!pdfDownloadUrl) {
      return NextResponse.json({ error: "File URL not available." }, { status: 404 });
    }

    let pdfBuffer: ArrayBuffer;
    try {
      const fetchRes = await fetch(pdfDownloadUrl, { signal: AbortSignal.timeout(30_000) });
      if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`);
      pdfBuffer = await fetchRes.arrayBuffer();
    } catch {
      return NextResponse.json({ error: "Failed to fetch PDF file." }, { status: 502 });
    }

    try {
      fileUri = await uploadPdfToGemini(
        apiKey,
        pdfBuffer,
        material.title ?? `material-${material.id}`
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("[material-chat] Gemini file upload error:", message);
      return NextResponse.json({ error: "Chat failed." }, { status: 500 });
    }

    const { error: updateError } = await admin
      .from("study_materials")
      .update({ gemini_file_uri: fileUri })
      .eq("id", material.id);

    if (updateError) {
      console.error("[material-chat] Failed to persist gemini_file_uri:", updateError.message);
      return NextResponse.json({ error: "Chat failed." }, { status: 500 });
    }
  }

  const systemInstruction = `You are a study assistant for Nigerian university students.
Answer questions strictly based on the provided document.
If the answer cannot be found in the document, say: "I couldn't find that in this material."
Keep answers concise and student-friendly.
Do not invent information outside the document.`;

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        { text: "I'm sharing this document with you. Please use it to answer my questions." },
        { file_data: { mime_type: "application/pdf", file_uri: fileUri } },
      ],
    },
    {
      role: "model",
      parts: [{ text: "I've received the document. I'll answer your questions based on its contents." }],
    },
    ...history.map((entry) => ({
      role: entry.role,
      parts: [{ text: entry.text }],
    })),
    {
      role: "user",
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

  let geminiRes: Response;
  try {
    geminiRes = await fetch(`${STREAM_URL}&key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[material-chat] Gemini fetch error:", message);
    return NextResponse.json({ error: "Chat failed." }, { status: 500 });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => geminiRes.statusText);
    console.error("[material-chat] Gemini error:", errText);
    return NextResponse.json({ error: "Chat failed." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const geminiStream = geminiRes.body;

  const stream = new ReadableStream({
    async start(controller) {
      if (!geminiStream) {
        controller.close();
        return;
      }

      const reader = geminiStream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (!json || json === "[DONE]") continue;

            try {
              const chunk = JSON.parse(json) as GeminiStreamChunk;
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            } catch {
              // Ignore malformed chunks and continue streaming.
            }
          }
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        console.error("[material-chat] stream read error:", message);
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
