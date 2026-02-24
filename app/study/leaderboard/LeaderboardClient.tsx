// app/study/leaderboard/LeaderboardClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Crown, Loader2, Medal, MessageSquare, Trophy } from "lucide-react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type LeaderRow = {
  email: string;
  questions: number;
  answers: number;
  accepted: number;
  questionUpvotes: number;
  points: number;
};

function pointsOf(r: Omit<LeaderRow, "points">) {
  // Simple, understandable scoring
  // - accepted answer: 5
  // - answer: 2
  // - question: 1
  // - upvotes received on questions: 1 per upvote
  return r.accepted * 5 + r.answers * 2 + r.questions * 1 + r.questionUpvotes * 1;
}

function initials(email: string) {
  const v = (email ?? "").trim();
  if (!v) return "?";
  const name = v.split("@")[0] ?? v;
  const parts = name.split(/[._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? name[0] ?? "?";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

export default function LeaderboardClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LeaderRow[]>([]);

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      setError(null);

      // Keep it fast: only pull minimal fields and aggregate client-side
      const qRes = await supabase
        .from("study_questions")
        .select("author_email,upvotes_count")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (!mounted) return;
      if (qRes.error) {
        setError(qRes.error.message);
        setLoading(false);
        return;
      }

      const aRes = await supabase
        .from("study_answers")
        .select("author_email,is_accepted")
        .order("created_at", { ascending: false })
        .limit(4000);

      if (!mounted) return;
      if (aRes.error) {
        setError(aRes.error.message);
        setLoading(false);
        return;
      }

      const agg = new Map<string, Omit<LeaderRow, "points">>();

      for (const q of (qRes.data as any[]) ?? []) {
        const email = String(q?.author_email ?? "").trim().toLowerCase();
        if (!email) continue;
        if (!agg.has(email)) {
          agg.set(email, { email, questions: 0, answers: 0, accepted: 0, questionUpvotes: 0 });
        }
        const r = agg.get(email)!;
        r.questions += 1;
        r.questionUpvotes += Math.max(0, Number(q?.upvotes_count ?? 0) || 0);
      }

      for (const a of (aRes.data as any[]) ?? []) {
        const email = String(a?.author_email ?? "").trim().toLowerCase();
        if (!email) continue;
        if (!agg.has(email)) {
          agg.set(email, { email, questions: 0, answers: 0, accepted: 0, questionUpvotes: 0 });
        }
        const r = agg.get(email)!;
        r.answers += 1;
        if (Boolean(a?.is_accepted)) r.accepted += 1;
      }

      const list: LeaderRow[] = Array.from(agg.values())
        .map((r) => ({ ...r, points: pointsOf(r) }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 50);

      setRows(list);
      setLoading(false);
    }

    run();

    return () => {
      mounted = false;
    };
  }, []);

  const top3 = useMemo(() => rows.slice(0, 3), [rows]);
  const rest = useMemo(() => rows.slice(3), [rows]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/study"
          className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <Link
          href="/study/questions"
          className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
        >
          <MessageSquare className="h-4 w-4" /> Q&amp;A
        </Link>
      </div>

      <div className="mt-5 rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-600">Community</p>
            <h1 className="mt-1 text-2xl font-extrabold text-zinc-900">Leaderboard</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Top helpers in Jabu Study Q&amp;A. Points = accepted answers (5) + answers (2) + questions (1) + upvotes received.
            </p>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-2xl border bg-zinc-50">
            <Trophy className="h-6 w-6 text-zinc-800" />
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-zinc-700">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading leaderboard…
          </div>
        ) : null}
      </div>

      {!loading ? (
        <section className="mt-6">
          {rows.length === 0 ? (
            <div className="rounded-3xl border bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">No activity yet</p>
              <p className="mt-1 text-sm text-zinc-600">Once people start asking and answering questions, top helpers will show here.</p>
              <div className="mt-4">
                <Link
                  href="/study/questions/ask"
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white no-underline hover:bg-zinc-800"
                >
                  Ask a question
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                {top3.map((r, idx) => (
                  <div key={r.email} className="rounded-3xl border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-zinc-600">#{idx + 1}</p>
                        <p className="mt-1 truncate text-base font-bold text-zinc-900">{r.email}</p>
                        <p className="mt-1 text-sm font-semibold text-zinc-700">{r.points.toLocaleString("en-NG")} pts</p>
                      </div>
                      <div className={cn(
                        "grid h-12 w-12 place-items-center rounded-2xl border",
                        idx === 0 ? "bg-amber-50 border-amber-200" : idx === 1 ? "bg-zinc-50 border-zinc-200" : "bg-rose-50 border-rose-200"
                      )}>
                        {idx === 0 ? <Crown className="h-6 w-6 text-zinc-900" /> : <Medal className="h-6 w-6 text-zinc-900" />}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">{r.accepted} accepted</span>
                      <span className="rounded-full border bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">{r.answers} answers</span>
                      <span className="rounded-full border bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">{r.questions} questions</span>
                      <span className="rounded-full border bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">{r.questionUpvotes} upvotes</span>
                    </div>
                  </div>
                ))}
              </div>

              {rest.length ? (
                <div className="mt-5 rounded-3xl border bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-bold text-zinc-900">Top 50</h2>
                  <div className="mt-4 space-y-2">
                    {rest.map((r, i) => (
                      <div key={r.email} className="flex items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border bg-zinc-50 text-sm font-extrabold text-zinc-900">
                            {initials(r.email)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-900">#{i + 4} • {r.email}</p>
                            <p className="mt-0.5 text-xs font-semibold text-zinc-600">
                              {r.accepted} accepted • {r.answers} answers • {r.questions} questions
                            </p>
                          </div>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-zinc-900">{r.points.toLocaleString("en-NG")} pts</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
