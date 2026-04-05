// app/api/ai/study-plan/route.ts
// POST /api/ai/study-plan
// Generates a personalised study plan based on courses, GPA goals, and exam timeline.
// Not cached — fully personalised per request.

export const maxDuration = 60

import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MODEL = "gemma-4-26b-a4b-it";

function jsonErr(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonErr("Unauthorised", 401);

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
    return jsonErr("Invalid JSON body", 400);
  }

  const {
    courses = [],
    currentCgpa,
    targetCgpa,
    weeksUntilExam = 4,
    weakCourses = [],
    dailyHours = 4,
  } = body;

  if (!courses.length) return jsonErr("At least one course is required", 400);

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

  // ── Call Gemini streaming ──────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return jsonErr("GEMINI_API_KEY is not configured.", 500);

  const tokenBudget = Math.min(6000, weeks * includedDays.length * 150 + 500);

  const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  let geminiRes: Response;
  try {
    geminiRes = await fetch(streamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: tokenBudget,
        },
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e: any) {
    return jsonErr(e?.message ?? "Network error calling Gemini.", 502);
  }

  if (!geminiRes.ok) {
    const err = await geminiRes.text().catch(() => geminiRes.statusText);
    return jsonErr(`Gemini API error ${geminiRes.status}: ${err}`, 502);
  }

  // Pipe SSE chunks → raw text deltas → client
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const reader = geminiRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function processLines(lines: string[]) {
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;
          try {
            const chunk = JSON.parse(jsonStr);
            const text: string =
              chunk?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            if (text) controller.enqueue(encoder.encode(text));
          } catch {
            // skip malformed chunk
          }
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          processLines(lines);
        }
        // Flush any remaining content in buffer that arrived without trailing newline
        if (buffer.trim()) processLines([buffer]);
      } catch {
        // stream aborted or network error — close cleanly
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
