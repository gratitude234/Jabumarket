// app/study/ai-plan/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  Target,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import StudyTabs from "../_components/StudyTabs";

// ── Types ─────────────────────────────────────────────────────────────────────

type StudyDay = { day: string; focus: string; tasks: string[]; hours: number };
type StudyWeek = { week: number; theme: string; weeklyGoal: string; days: StudyDay[] };
type StudyPlan = { summary: string; totalWeeks: number; weeks: StudyWeek[]; generalTips: string[] };

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_COLORS: Record<string, string> = {
  Monday:    "bg-violet-50 border-violet-200/60 dark:bg-violet-950/20 dark:border-violet-700/30",
  Tuesday:   "bg-indigo-50 border-indigo-200/60 dark:bg-indigo-950/20 dark:border-indigo-700/30",
  Wednesday: "bg-blue-50 border-blue-200/60 dark:bg-blue-950/20 dark:border-blue-700/30",
  Thursday:  "bg-cyan-50 border-cyan-200/60 dark:bg-cyan-950/20 dark:border-cyan-700/30",
  Friday:    "bg-emerald-50 border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-700/30",
  Saturday:  "bg-amber-50 border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-700/30",
  Sunday:    "bg-rose-50 border-rose-200/60 dark:bg-rose-950/20 dark:border-rose-700/30",
};

// ── Week Card ─────────────────────────────────────────────────────────────────

function WeekCard({ week }: { week: StudyWeek }) {
  const [open, setOpen] = useState(week.week === 1);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-extrabold text-white">
              {week.week}
            </span>
            <p className="text-sm font-extrabold text-foreground">{week.theme}</p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{week.weeklyGoal}</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {open ? (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground mb-3">
            Goal: <span className="text-foreground">{week.weeklyGoal}</span>
          </p>
          {week.days.map((d) => (
            <div
              key={d.day}
              className={cn("rounded-xl border p-3", DAY_COLORS[d.day] ?? "bg-background border-border")}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-extrabold text-foreground">{d.day}</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  <Clock className="h-3 w-3" /> {d.hours}h
                </span>
              </div>
              <p className="text-xs font-semibold text-foreground mb-1.5">{d.focus}</p>
              <ul className="space-y-1">
                {d.tasks.map((t, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AiStudyPlanPage() {
  const router = useRouter();

  // Form state
  const [courses, setCourses] = useState<string[]>(["", ""]);
  const [currentCgpa, setCurrentCgpa] = useState("");
  const [targetCgpa, setTargetCgpa] = useState("");
  const [weeksUntilExam, setWeeksUntilExam] = useState("4");
  const [dailyHours, setDailyHours] = useState("4");
  const [weakCourses, setWeakCourses] = useState("");

  // Prefill state
  const [prefilling, setPrefilling] = useState(true);
  const [prefillSource, setPrefillSource] = useState<string | null>(null);

  // Generation state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<StudyPlan | null>(null);

  // Pre-fill courses from study_preferences + study_courses
  useEffect(() => {
    let cancelled = false;
    async function prefill() {
      setPrefilling(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        // Fetch user's study preferences
        const { data: prefs } = await supabase
          .from("study_preferences")
          .select("level, department, department_id, faculty")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!prefs || cancelled) return;

        // Fetch courses matching their level and department
        let q = supabase
          .from("study_courses")
          .select("course_code, course_title")
          .eq("status", "approved")
          .order("course_code", { ascending: true })
          .limit(10);

        if (prefs.level) q = q.eq("level", prefs.level);
        if (prefs.department_id) {
          q = q.eq("department_id", prefs.department_id);
        } else if (prefs.department) {
          q = q.ilike("department", `%${prefs.department}%`);
        }

        const { data: courseRows } = await q;
        if (cancelled) return;

        if (courseRows && courseRows.length > 0) {
          const codes = courseRows.map((c: any) => c.course_code as string);
          setCourses(codes.length > 0 ? codes : ["", ""]);
          setPrefillSource(
            prefs.department
              ? `${prefs.level ? `${prefs.level}L · ` : ""}${prefs.department}`
              : prefs.level
              ? `${prefs.level}L`
              : null
          );
        }
      } catch {
        // silently fail — user can still type manually
      } finally {
        if (!cancelled) setPrefilling(false);
      }
    }
    prefill();
    return () => { cancelled = true; };
  }, []);

  function addCourse() {
    setCourses((prev) => [...prev, ""]);
  }
  function removeCourse(i: number) {
    setCourses((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateCourse(i: number, val: string) {
    setCourses((prev) => prev.map((c, idx) => (idx === i ? val : c)));
  }

  async function generate() {
    const validCourses = courses.map((c) => c.trim()).filter(Boolean);
    if (!validCourses.length) {
      setError("Add at least one course.");
      return;
    }
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch("/api/ai/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courses: validCourses,
          currentCgpa: currentCgpa ? parseFloat(currentCgpa) : null,
          targetCgpa: targetCgpa ? parseFloat(targetCgpa) : null,
          weeksUntilExam: parseInt(weeksUntilExam) || 4,
          dailyHours: parseInt(dailyHours) || 4,
          weakCourses: weakCourses
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? "Failed to generate plan.");
      } else {
        setPlan(json.plan);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <StudyTabs />

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/study"
          className="grid h-10 w-10 place-items-center rounded-2xl border bg-card hover:bg-secondary/50"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-extrabold text-foreground">AI Study Plan</p>
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-extrabold text-violet-600 dark:border-violet-700/40 dark:bg-violet-950/30 dark:text-violet-400">
              <Sparkles className="h-3 w-3" /> Gemini
            </span>
          </div>
          <p className="text-sm text-muted-foreground">Personalised week-by-week study schedule</p>
        </div>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-5">
        {/* Prefill status */}
        {prefilling ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading your courses…</p>
          </div>
        ) : prefillSource ? (
          <div className="flex items-center gap-2 rounded-xl border border-violet-200/60 bg-violet-50/50 px-3 py-2 dark:border-violet-700/30 dark:bg-violet-950/20">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              Pre-filled from your profile · <span className="font-normal">{prefillSource}</span>
            </p>
          </div>
        ) : null}

        {/* Courses */}
        <div>
          <label className="text-xs font-extrabold text-muted-foreground uppercase tracking-wide">
            Your Courses
          </label>
          <div className="mt-2 space-y-2">
            {courses.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={c}
                  onChange={(e) => updateCourse(i, e.target.value)}
                  placeholder={`e.g. MTH 201, PHY 301`}
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition"
                />
                {courses.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeCourse(i)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition"
                    aria-label="Remove course"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addCourse}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-extrabold text-violet-600 hover:text-violet-700 dark:text-violet-400"
          >
            <Plus className="h-3.5 w-3.5" /> Add course
          </button>
        </div>

        {/* GPA + Timeline */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-extrabold text-muted-foreground">Current CGPA</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="5"
              value={currentCgpa}
              onChange={(e) => setCurrentCgpa(e.target.value)}
              placeholder="e.g. 3.45"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition"
            />
          </div>
          <div>
            <label className="text-xs font-extrabold text-muted-foreground">Target CGPA</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="5"
              value={targetCgpa}
              onChange={(e) => setTargetCgpa(e.target.value)}
              placeholder="e.g. 4.00"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition"
            />
          </div>
          <div>
            <label className="text-xs font-extrabold text-muted-foreground">Weeks Until Exam</label>
            <select
              value={weeksUntilExam}
              onChange={(e) => setWeeksUntilExam(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition"
            >
              {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((w) => (
                <option key={w} value={w}>{w} week{w > 1 ? "s" : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-extrabold text-muted-foreground">Daily Study Hours</label>
            <select
              value={dailyHours}
              onChange={(e) => setDailyHours(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition"
            >
              {[1, 2, 3, 4, 5, 6, 8].map((h) => (
                <option key={h} value={h}>{h}h/day</option>
              ))}
            </select>
          </div>
        </div>

        {/* Weak courses */}
        <div>
          <label className="text-xs font-extrabold text-muted-foreground">
            Weak Courses <span className="font-normal">(optional — comma separated)</span>
          </label>
          <input
            type="text"
            value={weakCourses}
            onChange={(e) => setWeakCourses(e.target.value)}
            placeholder="e.g. MTH 201, CHM 101"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">These courses get extra days in your plan.</p>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold transition",
            "bg-violet-600 text-white hover:bg-violet-700",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
            loading && "opacity-70 cursor-not-allowed"
          )}
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating your plan…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Generate Study Plan</>
          )}
        </button>
      </div>

      {/* Plan output */}
      {plan ? (
        <div className="space-y-3">
          {/* Summary card */}
          <div className={cn("rounded-2xl border p-4", "border-violet-200/70 bg-violet-50/50 dark:border-violet-700/30 dark:bg-violet-950/20")}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <p className="text-sm font-extrabold text-violet-700 dark:text-violet-300">Your Plan</p>
              <span className="ml-auto text-xs font-semibold text-violet-400/80">{plan.totalWeeks} weeks · Gemini</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground">{plan.summary}</p>
          </div>

          {/* General tips */}
          {plan.generalTips?.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-extrabold text-foreground">General Tips</p>
              </div>
              <ul className="space-y-2">
                {plan.generalTips.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Week-by-week */}
          <div className="flex items-center gap-2 px-1">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-extrabold text-foreground">Week-by-Week Schedule</p>
          </div>
          {plan.weeks.map((w) => (
            <WeekCard key={w.week} week={w} />
          ))}

          <p className="text-center text-[11px] text-muted-foreground px-4">
            AI can make mistakes. Adjust this plan based on your actual syllabus and exam schedule.
          </p>

          {/* Regenerate */}
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 py-2.5 text-sm font-extrabold text-violet-600",
              "hover:bg-violet-50 dark:border-violet-700/40 dark:text-violet-400 dark:hover:bg-violet-950/30 transition",
              loading && "opacity-60 cursor-not-allowed"
            )}
          >
            <Sparkles className="h-4 w-4" /> Regenerate Plan
          </button>
        </div>
      ) : null}
    </div>
  );
}