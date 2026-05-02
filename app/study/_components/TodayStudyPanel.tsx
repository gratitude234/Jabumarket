"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Flame,
  GraduationCap,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/studyAnalytics";

type PrimaryKind = "due" | "continue" | "practice" | "material" | "onboarding";

type TodayPayload = {
  ok: true;
  primaryAction: {
    kind: PrimaryKind;
    label: string;
    href: string;
    meta?: string;
  };
  weekly: {
    sessions: number;
    avgScore: number | null;
    streak: number;
  };
  due: {
    count: number;
    topCourses: string[];
  };
  recommendations: {
    practiceSets: Array<{
      id: string;
      title: string;
      courseCode: string | null;
      questionsCount: number | null;
    }>;
    materials: Array<{
      id: string;
      title: string;
      courseCode: string | null;
      materialType: string | null;
    }>;
    weakCourses: Array<{
      courseCode: string;
      accuracy: number;
    }>;
  };
};

type Props = {
  userId: string | null;
  hasPrefs: boolean;
  loading: boolean;
};

function primaryTone(kind: PrimaryKind) {
  if (kind === "due") return "bg-[#5B35D5] text-white hover:bg-[#4526B8]";
  if (kind === "continue") return "bg-[#0F6E56] text-white hover:bg-[#0A5845]";
  if (kind === "onboarding") return "bg-[#1F2937] text-white hover:bg-[#111827]";
  return "bg-[#5B35D5] text-white hover:bg-[#4526B8]";
}

function primaryIcon(kind: PrimaryKind) {
  if (kind === "due") return <Target className="h-5 w-5" />;
  if (kind === "continue") return <Clock className="h-5 w-5" />;
  if (kind === "material") return <BookOpen className="h-5 w-5" />;
  if (kind === "onboarding") return <GraduationCap className="h-5 w-5" />;
  return <Zap className="h-5 w-5" />;
}

function formatMaterialType(value: string | null) {
  if (!value) return "Material";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Skeleton() {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-7 w-52 animate-pulse rounded bg-muted" />
      <div className="mt-4 h-24 animate-pulse rounded-2xl bg-muted" />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
      </div>
    </section>
  );
}

export default function TodayStudyPanel({ userId, hasPrefs, loading }: Props) {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const viewedRef = useRef(false);
  const weeklyViewedRef = useRef(false);

  useEffect(() => {
    if (loading || !userId) return;

    let cancelled = false;
    async function loadToday() {
      setFetching(true);
      setError(null);
      try {
        const response = await fetch("/api/study/today", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message ?? "Could not load today's study plan.");
        }
        setData(payload as TodayPayload);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "Could not load today's study plan.");
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    }

    void loadToday();
    return () => {
      cancelled = true;
    };
  }, [loading, userId]);

  useEffect(() => {
    if (!data || viewedRef.current) return;
    viewedRef.current = true;
    track("study_today_viewed", {
      primary_kind: data.primaryAction.kind,
      due_count: data.due.count,
      weekly_sessions: data.weekly.sessions,
      weak_courses: data.recommendations.weakCourses.length,
      has_prefs: hasPrefs,
    });
  }, [data, hasPrefs]);

  useEffect(() => {
    if (!data || weeklyViewedRef.current) return;
    weeklyViewedRef.current = true;
    track("study_weekly_progress_viewed", {
      sessions: data.weekly.sessions,
      avg_score: data.weekly.avgScore,
      streak: data.weekly.streak,
    });
  }, [data]);

  const title = useMemo(() => {
    if (!data) return "Today's Study";
    if (data.primaryAction.kind === "onboarding") return "Set Up Study Hub";
    if (data.primaryAction.kind === "due") return "Today's Review";
    if (data.primaryAction.kind === "continue") return "Continue Today";
    return "Today's Study";
  }, [data]);

  if (loading || (userId && fetching)) return <Skeleton />;

  if (error || !data) {
    return (
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#EEEDFE] text-[#5B35D5]">
            <Loader2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-extrabold text-foreground">Today&apos;s Study</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We could not load your study plan right now. You can still continue from Practice.
            </p>
          </div>
        </div>
        <Link
          href="/study/practice"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5B35D5] px-4 py-3 text-sm font-extrabold text-white no-underline transition hover:bg-[#4526B8]"
        >
          Open Practice <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    );
  }

  const primary = data.primaryAction;
  const hasRecommendations =
    data.recommendations.practiceSets.length > 0 || data.recommendations.materials.length > 0;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#5B35D5]">
            Today&apos;s Study
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One clear next step, then your best recommendations for the week.
          </p>
        </div>
        {data.due.count > 0 ? (
          <span className="shrink-0 rounded-full border border-[#5B35D5]/20 bg-[#EEEDFE] px-3 py-1 text-xs font-extrabold text-[#3B24A8]">
            {data.due.count} due
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            On track
          </span>
        )}
      </div>

      <Link
        href={primary.href}
        onClick={() =>
          track("study_today_primary_clicked", {
            kind: primary.kind,
            href: primary.href,
            due_count: data.due.count,
          })
        }
        className={cn(
          "mt-5 flex items-center justify-between gap-4 rounded-3xl px-4 py-4 no-underline shadow-sm transition active:scale-[0.99]",
          primaryTone(primary.kind)
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/20">
            {primaryIcon(primary.kind)}
          </div>
          <div className="min-w-0">
            <p className="text-base font-extrabold text-white">{primary.label}</p>
            {primary.meta ? (
              <p className="mt-1 line-clamp-2 text-xs font-medium text-white/75">{primary.meta}</p>
            ) : null}
          </div>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-white" />
      </Link>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-border bg-background px-3 py-3">
          <p className="text-base font-extrabold text-foreground">{data.weekly.sessions}</p>
          <p className="text-[10px] font-semibold text-muted-foreground">sessions</p>
        </div>
        <div className="rounded-2xl border border-border bg-background px-3 py-3">
          <p className="text-base font-extrabold text-foreground">
            {data.weekly.avgScore != null ? `${data.weekly.avgScore}%` : "--"}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground">avg score</p>
        </div>
        <div className="rounded-2xl border border-border bg-background px-3 py-3">
          <div className="flex items-center gap-1">
            <Flame className="h-4 w-4 text-orange-500" />
            <p className="text-base font-extrabold text-foreground">{data.weekly.streak}</p>
          </div>
          <p className="text-[10px] font-semibold text-muted-foreground">streak</p>
        </div>
      </div>

      {data.recommendations.weakCourses.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-700" />
            <p className="text-xs font-extrabold text-amber-800">Weak courses to revisit</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.recommendations.weakCourses.map((course) => (
              <Link
                key={course.courseCode}
                href={`/study/practice?course=${encodeURIComponent(course.courseCode)}`}
                onClick={() =>
                  track("study_today_recommendation_clicked", {
                    kind: "weak_course",
                    course_code: course.courseCode,
                    accuracy: course.accuracy,
                  })
                }
                className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-extrabold text-amber-800 no-underline"
              >
                {course.courseCode} - {Math.round(course.accuracy * 100)}%
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-foreground">Recommended next</p>
          <Link href="/study/practice" className="text-xs font-bold text-[#5B35D5] no-underline">
            See all
          </Link>
        </div>

        {hasRecommendations ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {data.recommendations.practiceSets.slice(0, 2).map((set) => (
              <Link
                key={set.id}
                href={`/study/practice/${encodeURIComponent(set.id)}`}
                onClick={() =>
                  track("study_today_recommendation_clicked", {
                    kind: "practice",
                    set_id: set.id,
                    course_code: set.courseCode,
                  })
                }
                className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-3 no-underline transition hover:bg-secondary/30"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EEEDFE] text-[#5B35D5]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-foreground">{set.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[set.courseCode, set.questionsCount ? `${set.questionsCount} questions` : null]
                      .filter(Boolean)
                      .join(" - ") || "Practice set"}
                  </p>
                </div>
              </Link>
            ))}

            {data.recommendations.materials.slice(0, 2).map((material) => (
              <Link
                key={material.id}
                href={`/study/materials/${encodeURIComponent(material.id)}`}
                onClick={() =>
                  track("study_today_recommendation_clicked", {
                    kind: "material",
                    material_id: material.id,
                    course_code: material.courseCode,
                  })
                }
                className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-3 no-underline transition hover:bg-secondary/30"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-foreground">{material.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[material.courseCode, formatMaterialType(material.materialType)].filter(Boolean).join(" - ")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-background px-4 py-4">
            <p className="text-sm font-extrabold text-foreground">Nothing matched yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Explore materials or upload the first useful file for your classmates.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href="/study/materials"
                className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground no-underline"
              >
                Browse
              </Link>
              <Link
                href="/study/materials/upload"
                className="inline-flex items-center justify-center rounded-xl bg-[#5B35D5] px-3 py-2 text-xs font-bold text-white no-underline"
              >
                Upload
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
