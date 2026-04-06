// app/api/ai/save-generated-questions/route.ts
// POST /api/ai/save-generated-questions
// Saves AI-generated MCQ questions to study_quiz_sets and linked tables.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

type MCQ = {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
  explanation: string;
};

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { materialId?: string; courseId?: string; questions?: MCQ[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { materialId, courseId, questions } = body;
  if (!materialId || !courseId || !Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // ── Fetch material title ───────────────────────────────────────────────────
  const admin = adminClient();
  const { data: mat, error: matErr } = await admin
    .from("study_materials")
    .select("id, title")
    .eq("id", materialId)
    .maybeSingle();

  if (matErr || !mat) {
    return NextResponse.json({ error: "Material not found." }, { status: 404 });
  }

  const title = `AI Generated — ${(mat as any).title}`;

  // ── Insert quiz set ────────────────────────────────────────────────────────
  const { data: set, error: setErr } = await admin
    .from("study_quiz_sets")
    .insert({
      title,
      source: "ai_generated",
      course_id: courseId,
      created_by: user.id,
      published: true,
    })
    .select("id")
    .single();

  if (setErr || !set) {
    console.error("[save-generated-questions] quiz set insert error:", setErr);
    return NextResponse.json({ error: "Failed to save questions." }, { status: 500 });
  }

  const setId = (set as any).id as string;

  // ── Insert questions and options ───────────────────────────────────────────
  for (const q of questions) {
    const { data: qRow, error: qErr } = await admin
      .from("study_quiz_questions")
      .insert({ set_id: setId, prompt: q.question })
      .select("id")
      .single();

    if (qErr || !qRow) {
      console.error("[save-generated-questions] question insert error:", qErr);
      return NextResponse.json({ error: "Failed to save questions." }, { status: 500 });
    }

    const questionId = (qRow as any).id as string;
    const optionKeys = ["A", "B", "C", "D"] as const;
    const options = optionKeys.map((key, idx) => ({
      question_id: questionId,
      text: q.options[key],
      is_correct: q.answer === key,
      position: idx,
    }));

    const { error: optErr } = await admin
      .from("study_quiz_options")
      .insert(options);

    if (optErr) {
      console.error("[save-generated-questions] options insert error:", optErr);
      return NextResponse.json({ error: "Failed to save questions." }, { status: 500 });
    }
  }

  return NextResponse.json({ setId });
}
