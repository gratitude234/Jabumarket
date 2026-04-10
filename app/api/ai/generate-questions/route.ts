// app/api/ai/generate-questions/route.ts
// POST /api/ai/generate-questions
// Generates 15 MCQ practice questions from a PDF material using Gemini.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const MODEL = "gemini-2.5-flash-lite";
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

type StudyMaterialRow = {
  id: string;
  title: string | null;
  file_url: string | null;
  file_path: string | null;
  material_type: string | null;
};

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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
  let body: { materialId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { materialId } = body;
  if (!materialId) {
    return NextResponse.json({ error: "Missing materialId" }, { status: 400 });
  }

  // Fetch material
  const admin = adminClient();
  const { data: mat, error: matErr } = await admin
    .from("study_materials")
    .select("id, title, file_url, file_path, material_type, study_courses(id, course_code)")
    .eq("id", materialId)
    .maybeSingle();

  if (matErr || !mat) {
    return NextResponse.json({ error: "Material not found." }, { status: 404 });
  }

  const material = mat as StudyMaterialRow;
  const fileUrl = material.file_url;
  const filePath = material.file_path;

  // PDF check
  const urlStr = ((fileUrl ?? "") + " " + (filePath ?? "")).toLowerCase();
  if (!urlStr.includes(".pdf")) {
    return NextResponse.json({ error: "Only PDF materials are supported." }, { status: 400 });
  }

  // Resolve download URL
  let downloadUrl: string | null = fileUrl;

  if (!downloadUrl && filePath) {
    const { data: signed } = await admin.storage
      .from("study-materials")
      .createSignedUrl(filePath, 300);
    downloadUrl = signed?.signedUrl ?? null;
  }

  if (!downloadUrl) {
    return NextResponse.json({ error: "File URL not available." }, { status: 404 });
  }

  // Fetch PDF bytes
  let pdfBuffer: ArrayBuffer;
  try {
    const fetchRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
    if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`);
    pdfBuffer = await fetchRes.arrayBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to fetch PDF file." }, { status: 502 });
  }

  // Call Gemini with PDF inline data
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI service not configured." }, { status: 500 });
  }

  const base64Pdf = Buffer.from(pdfBuffer).toString("base64");

  const systemPrompt = `You are an exam question generator for Nigerian university students.
Generate exactly 15 multiple choice questions strictly from the provided PDF content.
Do not add any knowledge from outside the document.
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

  const geminiBody = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: "application/pdf", data: base64Pdf } },
          { text: systemPrompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
    },
  };

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

    const geminiData = (await geminiRes.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };
    rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawText.trim()) {
      return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[generate-questions] Gemini fetch error:", message);
    return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
  }

  // Parse JSON response
  try {
    const clean = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(clean) as { questions: unknown[] };
    return NextResponse.json({ questions: parsed.questions });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[generate-questions] JSON parse error:", message, rawText.slice(0, 200));
    return NextResponse.json({ error: "Failed to generate questions." }, { status: 500 });
  }
}
