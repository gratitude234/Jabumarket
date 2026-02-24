// lib/studyPractice.ts
// Practice attempts + streak helpers (Phase 1.2)

import { supabase } from "@/lib/supabase";
import { getAuthedUserId } from "@/lib/studySaved";

export type PracticeAttemptRow = {
  id: string;
  user_id: string;
  set_id: string;
  status: "in_progress" | "submitted" | "abandoned";
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  total_questions: number | null;
  time_spent_seconds: number | null;
};

export async function getLatestAttempt(): Promise<PracticeAttemptRow | null> {
  const userId = await getAuthedUserId();
  if (!userId) return null;

  // Prefer in-progress first, then most recent submitted.
  const { data, error } = await supabase
    .from("study_practice_attempts")
    .select("id,user_id,set_id,status,started_at,submitted_at,score,total_questions,time_spent_seconds")
    .eq("user_id", userId)
    .order("status", { ascending: true })
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) return null;
  const row = (data as any[])?.[0];
  if (!row?.id) return null;
  return row as PracticeAttemptRow;
}

export async function upsertDailyPracticeActivity(points: number) {
  const userId = await getAuthedUserId();
  if (!userId) return;

  const today = new Date();
  const activityDate = today.toISOString().slice(0, 10); // YYYY-MM-DD

  // Try to upsert; ignore errors if table isn't created yet.
  await supabase
    .from("study_daily_activity")
    .upsert(
      {
        user_id: userId,
        activity_date: activityDate,
        did_practice: true,
        points: points,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "user_id,activity_date" }
    );
}

export async function getPracticeStreak(): Promise<{ streak: number; didPracticeToday: boolean }> {
  const userId = await getAuthedUserId();
  if (!userId) return { streak: 0, didPracticeToday: false };

  // Fetch last 14 days to compute streak.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const sinceDate = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("study_daily_activity")
    .select("activity_date,did_practice")
    .eq("user_id", userId)
    .gte("activity_date", sinceDate)
    .order("activity_date", { ascending: false });

  if (error || !Array.isArray(data)) return { streak: 0, didPracticeToday: false };

  const map = new Map<string, boolean>();
  for (const r of data as any[]) {
    if (r?.activity_date) map.set(String(r.activity_date), Boolean(r.did_practice));
  }

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const didToday = map.get(todayKey) === true;

  let streak = 0;
  // streak counts consecutive days up to today (or yesterday if not practiced today)
  let cursor = new Date(today);
  if (!didToday) cursor = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  for (let i = 0; i < 14; i++) {
    const k = cursor.toISOString().slice(0, 10);
    if (map.get(k) === true) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    } else {
      break;
    }
  }

  return { streak, didPracticeToday: didToday };
}
