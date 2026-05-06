// app/api/ai/generate-questions/route.ts
// POST /api/ai/generate-questions
// Generates MCQ practice questions from a study material using Gemini.
// Supports: PDF, JPG/PNG/WEBP images, DOCX, PPTX.

export const maxDuration = 180;
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateJson, userMessage } from "@/lib/ai";
import { adminSupabase } from "@/lib/supabase/admin";
import {
  extractMaterialContent,
  truncateText,
} from "@/lib/extractMaterialContent";

const MODEL = "gemini-2.5-flash-lite";
const QUESTION_GEN_TEXT_CHARS = 24_000;
const GEMINI_QUESTION_TIMEOUT_MS = parsePositiveInt(process.env.GEMINI_QUESTION_TIMEOUT_MS) ?? 60_000;

function parsePositiveInt(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function geminiModelName() {
  return process.env.GEMINI_MODEL?.trim() || MODEL;
}

function geminiGenerateUrl() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelName()}:generateContent`;
}

type StudyMaterialRow = {
  id: string;
  title: string | null;
  file_url: string | null;
  file_path: string | null;
  material_type: string | null;
};

function routeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return `Failed to generate questions: ${error.message}`;
  }
  return "Failed to generate questions.";
}

export async function POST(req: NextRequest) {
  try {
    return await handleGenerateQuestionsRequest(req);
  } catch (error) {
    console.error("[generate-questions] unhandled route error:", error);
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 500 });
  }
}

async function handleGenerateQuestionsRequest(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { materialId?: string; count?: number; difficulty?: "easy" | "mixed" | "hard"; focus?: string; coveredQuestions?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { materialId, count = 10, difficulty = "mixed", focus, coveredQuestions = [] } = body;
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
  const difficultyInstruction = {
    easy: "Generate straightforward recall and definition questions.",
    mixed: "Mix of recall, application, and analysis questions.",
    hard: "Generate exam-style questions requiring deep understanding and application.",
  }[difficulty] ?? "Mix of recall, application, and analysis questions.";

  const focusInstruction = focus ? `Focus specifically on: ${focus}` : "";

  const coveredInstruction = coveredQuestions.length > 0
    ? `\n\nThe following questions have ALREADY been generated from this document. Do NOT repeat these topics or ask similar questions. Identify sections or concepts in the document that are NOT covered by these questions and generate new questions from those parts:\n${coveredQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "";

  const systemPrompt = `You are an exam question generator for Nigerian university students.
Generate exactly ${count} multiple choice questions strictly from the provided document content.
Do not add any knowledge from outside the document.
${difficultyInstruction}${focusInstruction ? `\n${focusInstruction}` : ""}${coveredInstruction}
Each question must have 4 options (A, B, C, D) with exactly one correct answer.
Include a short explanation (1-2 sentences) for each correct answer, citing the part of the document it came from.
Include a hint (1 sentence) that nudges the student toward the right concept without naming the correct option or giving away the answer directly.

Return ONLY a valid JSON object with no markdown, no backticks, no preamble:
{
  "questions": [
    {
      "question": "string",
      "options": { "A": "string", "B": "string", "C": "string", "D": "string" },
      "answer": "A" | "B" | "C" | "D",
      "explanation": "string",
      "hint": "string"
    }
  ]
}`;

  if (content.kind === "text") {
    const truncated = truncateText(content.text, QUESTION_GEN_TEXT_CHARS);
    const result = await generateJson<{ questions: unknown[] }>({
      messages: [userMessage(`DOCUMENT CONTENT:\n\n${truncated}\n\n${systemPrompt}`)],
      temperature: 0.3,
      maxTokens: Math.min(6000, count * 380),
      timeoutMs: GEMINI_QUESTION_TIMEOUT_MS,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
    }
    if (!Array.isArray(result.data.questions) || result.data.questions.length === 0) {
      return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
    }
    return NextResponse.json({
      questions: result.data.questions,
      ai: {
        provider: result.provider,
        model: geminiModelName(),
        inputMode: "extracted-text",
      },
    });
  }

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
    return NextResponse.json({ error: "Unexpected content kind." }, { status: 500 });
  }

  const geminiBody = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: Math.min(6000, count * 380),
    },
  };

  // ── Call Gemini ────────────────────────────────────────────────────────────
  let rawText: string;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI service not configured." }, { status: 500 });

    const geminiRes = await fetch(`${geminiGenerateUrl()}?key=${apiKey}`, {
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
    return NextResponse.json({
      questions: parsed.questions,
      ai: {
        provider: "gemini",
        model: geminiModelName(),
        inputMode: "inline-file",
        reason: content.reason ?? "Inline files are handled by Gemini.",
      },
    });
  } catch (e: unknown) {
    console.error("[generate-questions] JSON parse error:", e instanceof Error ? e.message : e, rawText.slice(0, 200));
    return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
  }
}
