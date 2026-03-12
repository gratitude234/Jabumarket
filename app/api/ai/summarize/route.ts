// app/api/ai/summarize/route.ts
// POST /api/ai/summarize
// Generates an AI summary for a study material.
// Caches the result in study_materials.ai_summary.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { geminiJson } from "@/lib/gemini";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type MaterialSummary = {
  overview: string;
  keyTopics: string[];
  examTips: string[];
};

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: {
    materialId?: string;
    title?: string;
    description?: string;
    courseCode?: string;
    materialType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { materialId, title, description, courseCode, materialType } = body;

  if (!materialId || !title) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = adminClient();

  // ── Check cache ────────────────────────────────────────────────────────────
  const { data: cached } = await admin
    .from("study_materials")
    .select("ai_summary")
    .eq("id", materialId)
    .maybeSingle();

  if (cached?.ai_summary) {
    try {
      const parsed = JSON.parse(cached.ai_summary) as MaterialSummary;
      return NextResponse.json({ summary: parsed, cached: true });
    } catch {
      // Cached value is malformed — regenerate
    }
  }

  // ── Build prompt ───────────────────────────────────────────────────────────
  const typeLabel: Record<string, string> = {
    past_question: "Past Examination Questions",
    handout: "Course Handout",
    note: "Lecture Notes",
    slides: "Lecture Slides",
    timetable: "Timetable",
    other: "Study Material",
  };

  const readableType = typeLabel[materialType ?? ""] ?? "Study Material";

  const prompt = `You are an academic assistant helping Nigerian university students understand study materials.

Material Details:
- Title: ${title}
- Type: ${readableType}
- Course: ${courseCode ?? "General"}
${description ? `- Description: ${description}` : ""}

Generate a helpful summary for a student deciding whether to download this material.
Respond ONLY with valid JSON — no markdown, no backticks, no explanation outside the JSON.

{
  "overview": "2-3 sentence overview of what this material covers and who it's most useful for",
  "keyTopics": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"],
  "examTips": ["actionable exam tip 1", "actionable exam tip 2", "actionable exam tip 3"]
}`;

  // ── Call Gemini ────────────────────────────────────────────────────────────
  const result = await geminiJson<MaterialSummary>(prompt, {
    temperature: 0.4,
    maxOutputTokens: 500,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const summary = result.data;

  // ── Cache in DB ────────────────────────────────────────────────────────────
  await admin
    .from("study_materials")
    .update({ ai_summary: JSON.stringify(summary) })
    .eq("id", materialId)
    .then(({ error }) => {
      if (error) console.warn("[ai/summarize] cache write failed:", error.message);
    });

  return NextResponse.json({ summary, cached: false });
}