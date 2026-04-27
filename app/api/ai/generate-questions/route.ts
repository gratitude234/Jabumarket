// app/api/ai/generate-questions/route.ts
// POST /api/ai/generate-questions
// Generates MCQ practice questions from a study material using Gemini.
// Supports: PDF, JPG/PNG/WEBP images, DOCX, PPTX.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { adminSupabase } from "@/lib/supabase/admin";
import {
  extractMaterialContent,
  truncateText,
} from "@/lib/extractMaterialContent";

const MODEL = "gemini-2.5-flash-lite";
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

type StudyMaterialRow = {
  id: string;
  title: string | null;
  file_url: string | null;
  file_path: string | null;
  material_type: string | null;
};

type RateLimitRow = {
  last_called_at: string;
};

async function checkRateLimit(
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

  if (error) return { allowed: false, error: error.message };

  const row = data as RateLimitRow | null;
  const now = Date.now();
  if (row?.last_called_at) {
    const nextAllowedAt = new Date(row.last_called_at).getTime() + cooldownMs;
    if (Number.isFinite(nextAllowedAt) && nextAllowedAt > now) {
      return { allowed: false, retryAfterSeconds: Math.ceil((nextAllowedAt - now) / 1000) };
    }
  }
  return { allowed: true };
}

async function writeRateLimit(
  admin: typeof adminSupabase,
  userId: string,
  endpoint: string
): Promise<string | null> {
  const { error } = await admin
    .from("ai_rate_limits")
    .upsert(
      { user_id: userId, endpoint, last_called_at: new Date().toISOString() },
      { onConflict: "user_id,endpoint" }
    );
  return error?.message ?? null;
}

// GET — returns remaining cooldown seconds for the current user
export async function GET(_req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ retryAfterSeconds: 0 });

  const { data } = await adminSupabase
    .from("ai_rate_limits")
    .select("last_called_at")
    .eq("user_id", user.id)
    .eq("endpoint", "generate-questions")
    .maybeSingle();

  const row = data as RateLimitRow | null;
  if (row?.last_called_at) {
    const nextAllowedAt = new Date(row.last_called_at).getTime() + 5 * 60 * 1000;
    const remaining = nextAllowedAt - Date.now();
    if (remaining > 0) return NextResponse.json({ retryAfterSeconds: Math.ceil(remaining / 1000) });
  }
  return NextResponse.json({ retryAfterSeconds: 0 });
}

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { materialId?: string; count?: number; difficulty?: "easy" | "mixed" | "hard"; focus?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { materialId, count = 10, difficulty = "mixed", focus } = body;
  if (!materialId) return NextResponse.json({ error: "Missing materialId" }, { status: 400 });

  // ── Fetch material ─────────────────────────────────────────────────────────
  const admin = adminSupabase;
  const { data: mat, error: matErr } = await admin
    .from("study_materials")
    .select("id, title, file_url, file_path, material_type, study_courses(id, course_code)")
    .eq("id", materialId)
    .maybeSingle();

  if (matErr || !mat) return NextResponse.json({ error: "Material not found." }, { status: 404 });

  const material = mat as StudyMaterialRow;
  const filePath = material.file_path;
  if (!filePath) return NextResponse.json({ error: "No file attached to this material." }, { status: 400 });

  // ── Resolve signed download URL ────────────────────────────────────────────
  const { data: signed } = await admin.storage
    .from("study-materials")
    .createSignedUrl(filePath, 300);
  const downloadUrl = signed?.signedUrl ?? null;
  if (!downloadUrl) return NextResponse.json({ error: "File URL not available." }, { status: 404 });

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const rateLimit = await checkRateLimit(admin, user.id, "generate-questions", 5 * 60 * 1000);
  if ("error" in rateLimit) {
    return NextResponse.json({ error: "Failed to check rate limit." }, { status: 500 });
  }
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Please wait ${rateLimit.retryAfterSeconds} seconds before generating more questions.` },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  // ── Fetch file bytes ───────────────────────────────────────────────────────
  let fileBuffer: ArrayBuffer;
  try {
    const fetchRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
    if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`);
    fileBuffer = await fetchRes.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to fetch file." }, { status: 502 });
  }

  if (fileBuffer.byteLength > 15 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File is too large for AI question generation (max 15 MB). Try a shorter document." },
      { status: 422 }
    );
  }

  // ── Extract content (PDF/image → inline, DOCX/PPTX → text) ────────────────
  const content = await extractMaterialContent(fileBuffer, filePath);
  if (content.kind === "unsupported") {
    return NextResponse.json({ error: content.message }, { status: 422 });
  }

  // ── Build Gemini request ───────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI service not configured." }, { status: 500 });

  const difficultyInstruction = {
    easy: "Generate straightforward recall and definition questions.",
    mixed: "Mix of recall, application, and analysis questions.",
    hard: "Generate exam-style questions requiring deep understanding and application.",
  }[difficulty] ?? "Mix of recall, application, and analysis questions.";

  const focusInstruction = focus ? `Focus specifically on: ${focus}` : "";

  const systemPrompt = `You are an exam question generator for Nigerian university students.
Generate exactly ${count} multiple choice questions strictly from the provided document content.
Do not add any knowledge from outside the document.
${difficultyInstruction}${focusInstruction ? `\n${focusInstruction}` : ""}
Each question must have 4 options (A, B, C, D) with exactly one correct answer.
Include a short explanation (1-2 sentences) for each correct answer, citing the part of the document it came from.

Return ONLY a valid JSON object with no markdown, no backticks, no preamble:
{
  "questions": [
    {
      "question": "string",
      "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
      "answer": "A" | "B" | "C" | "D",
      "explanation": "string"
    }
  ]
}`;

  // Build parts array depending on content kind
  type GeminiPart =
    | { inline_data: { mime_type: string; data: string } }
    | { text: string };

  let parts: GeminiPart[];
  if (content.kind === "inline") {
    parts = [
      { inline_data: { mime_type: content.mimeType, data: content.base64 } },
      { text: systemPrompt },
    ];
  } else {
    // Text-extracted (DOCX / PPTX)
    const truncated = truncateText(content.text);
    parts = [
      { text: `DOCUMENT CONTENT:\n\n${truncated}` },
      { text: systemPrompt },
    ];
  }

  const geminiBody = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: Math.min(4096, count * 300),
    },
  };

  // ── Call Gemini ────────────────────────────────────────────────────────────
  let rawText: string;
  try {
    const geminiRes = await fetch(`${BASE_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
      signal: AbortSignal.timeout(60_000),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => geminiRes.statusText);
      console.error("[generate-questions] Gemini error:", errText);
      return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawText.trim()) return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
  } catch (e: unknown) {
    console.error("[generate-questions] Gemini fetch error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
  }

  // ── Parse response ─────────────────────────────────────────────────────────
  try {
    const clean = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(clean) as { questions: unknown[] };
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
    }
    const rateLimitError = await writeRateLimit(admin, user.id, "generate-questions");
    if (rateLimitError) {
      console.error("[generate-questions] rate limit write error:", rateLimitError);
    }
    return NextResponse.json({ questions: parsed.questions });
  } catch (e: unknown) {
    console.error("[generate-questions] JSON parse error:", e instanceof Error ? e.message : e, rawText.slice(0, 200));
    return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
  }
}
