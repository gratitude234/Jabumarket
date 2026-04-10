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

type MaterialTitleRow = {
  id: string;
  title: string | null;
};

type QuizSetRow = {
  id: string;
};

type InsertedQuestionRow = {
  id: string;
  position: number | null;
};

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

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

  const admin = adminClient();
  const { data: mat, error: matErr } = await admin
    .from("study_materials")
    .select("id, title")
    .eq("id", materialId)
    .maybeSingle();

  if (matErr || !mat) {
    return NextResponse.json({ error: "Material not found." }, { status: 404 });
  }

  const material = mat as MaterialTitleRow;
  const title = `AI Generated - ${material.title ?? "Practice Set"}`;

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

  const quizSet = set as QuizSetRow;

  const questionPayload = questions.map((question, index) => ({
    set_id: quizSet.id,
    prompt: question.question,
    position: index,
  }));

  const { data: insertedQuestions, error: questionsError } = await admin
    .from("study_quiz_questions")
    .insert(questionPayload)
    .select("id, position");

  if (questionsError || !insertedQuestions) {
    console.error("[save-generated-questions] question insert error:", questionsError);
    return NextResponse.json({ error: "Failed to save questions." }, { status: 500 });
  }

  const orderedQuestions = [...(insertedQuestions as InsertedQuestionRow[])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  );

  const optionPayload = orderedQuestions.flatMap((questionRow) => {
    if (typeof questionRow.position !== "number") {
      return [];
    }

    const question = questions[questionRow.position];
    if (!question) {
      return [];
    }

    return (["A", "B", "C", "D"] as const).map((key, index) => ({
      question_id: questionRow.id,
      text: question.options[key],
      is_correct: question.answer === key,
      position: index,
    }));
  });

  if (optionPayload.length !== questions.length * 4) {
    console.error("[save-generated-questions] option payload build error");
    return NextResponse.json({ error: "Failed to save questions." }, { status: 500 });
  }

  const { error: optionsError } = await admin
    .from("study_quiz_options")
    .insert(optionPayload);

  if (optionsError) {
    console.error("[save-generated-questions] options insert error:", optionsError);
    return NextResponse.json({ error: "Failed to save questions." }, { status: 500 });
  }

  return NextResponse.json({ setId: quizSet.id });
}
