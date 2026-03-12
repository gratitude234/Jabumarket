// app/api/ai/study-plan/route.ts
// POST /api/ai/study-plan
// Generates a personalised study plan based on courses, GPA goals, and exam timeline.
// Not cached — fully personalised per request.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { geminiJson } from "@/lib/gemini";

type StudyDay = {
  day: string;           // e.g. "Monday"
  focus: string;         // e.g. "MTH 201 — Integration"
  tasks: string[];       // 2-4 specific tasks
  hours: number;         // suggested study hours
};

type StudyWeek = {
  week: number;
  theme: string;         // e.g. "Foundation Review"
  days: StudyDay[];
  weeklyGoal: string;
};

type StudyPlan = {
  summary: string;
  totalWeeks: number;
  weeks: StudyWeek[];
  generalTips: string[];
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
    courses?: string[];
    currentCgpa?: number | null;
    targetCgpa?: number | null;
    weeksUntilExam?: number;
    weakCourses?: string[];
    dailyHours?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    courses = [],
    currentCgpa,
    targetCgpa,
    weeksUntilExam = 4,
    weakCourses = [],
    dailyHours = 4,
  } = body;

  if (!courses.length) {
    return NextResponse.json({ error: "At least one course is required" }, { status: 400 });
  }

  const weeks = Math.max(1, Math.min(weeksUntilExam, 12));

  // ── Build prompt ───────────────────────────────────────────────────────────
  const gpaLine =
    currentCgpa != null && targetCgpa != null
      ? `Current CGPA: ${currentCgpa.toFixed(2)} → Target: ${targetCgpa.toFixed(2)}`
      : currentCgpa != null
      ? `Current CGPA: ${currentCgpa.toFixed(2)}`
      : "";

  const weakLine =
    weakCourses.length > 0
      ? `Weak courses needing extra attention: ${weakCourses.join(", ")}`
      : "";

  // To keep the response within token limits, only include weekdays (Mon–Fri)
  // for multi-week plans. Weekend rest is implied. This cuts output by ~28%.
  const includedDays =
    weeks <= 2
      ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
      : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  const prompt = `You are a study coach for Nigerian university students preparing for exams.

Student Profile:
- Courses: ${courses.join(", ")}
- Available study time: ${dailyHours} hours/day
- Weeks until exams: ${weeks}
${gpaLine ? `- ${gpaLine}` : ""}
${weakLine ? `- ${weakLine}` : ""}

Create a ${weeks}-week study plan. Prioritise weak courses.
IMPORTANT: Respond ONLY with a single raw JSON object. No markdown, no backticks, no explanation before or after.

Schema (follow exactly):
{
  "summary": "1-2 sentences personalised to this student",
  "totalWeeks": ${weeks},
  "weeks": [
    {
      "week": 1,
      "theme": "short theme",
      "weeklyGoal": "one sentence goal",
      "days": [
        {
          "day": "Monday",
          "focus": "COURSE — Topic",
          "tasks": ["task 1", "task 2"],
          "hours": ${dailyHours}
        }
      ]
    }
  ],
  "generalTips": ["tip 1", "tip 2", "tip 3"]
}

Include these days per week: ${includedDays.join(", ")}.
Keep tasks short (under 10 words each). Keep theme and weeklyGoal under 12 words each.`;

  // ── Call Gemini ────────────────────────────────────────────────────────────
  // Token budget: weeks * days * ~150 tokens/day + overhead. Cap at 6000.
  const tokenBudget = Math.min(6000, weeks * includedDays.length * 150 + 500);

  const result = await geminiJson<StudyPlan>(prompt, {
    temperature: 0.5,
    maxOutputTokens: tokenBudget,
  });

  if (!result.ok) {
    // If geminiJson couldn't parse, surface a helpful message
    const isJsonError = result.error.includes("not valid JSON");
    return NextResponse.json(
      {
        error: isJsonError
          ? "The AI response was too long or malformed. Try fewer weeks or fewer courses."
          : result.error,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ plan: result.data });
}