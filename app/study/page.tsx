// app/study/page.tsx
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import StudyHomeClient from "./StudyHomeClient";
import { Card, SkeletonCard } from "./_components/StudyUI";

// Non-user-specific data (counts + trending) cached for 60 s on the server.
// Every individual user's prefs/streak/forYou are still fetched client-side.
export const revalidate = 60;

// ─── Shared types ─────────────────────────────────────────────────────────────

export type StudyCounts = {
  courses: number;
  approvedMaterials: number;
  tutors: number;
};

export type MaterialMiniStatic = {
  id: string;
  title: string | null;
  course_code: string | null;
  level: number | null;
  semester: string | null;
  material_type: string | null;
  downloads: number | null;
  created_at: string | null;
};

// ─── Prefetch (runs server-side, result is baked into HTML for 60 s) ──────────

async function fetchStaticData(): Promise<{
  counts: StudyCounts;
  trending: MaterialMiniStatic[];
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const [coursesRes, materialsRes, tutorsRes, trendingRes] =
      await Promise.all([
        supabase
          .from("study_courses")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("study_materials")
          .select("id", { count: "exact", head: true })
          .eq("approved", true),
        supabase
          .from("study_tutors")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("study_materials")
          .select(
            "id,title,course_code,level,semester,material_type,downloads,created_at"
          )
          .eq("approved", true)
          .order("downloads", { ascending: false, nullsFirst: false })
          .limit(6),
      ]);

    return {
      counts: {
        courses: coursesRes.count ?? 0,
        approvedMaterials: materialsRes.count ?? 0,
        tutors: tutorsRes.count ?? 0,
      },
      trending: (trendingRes.data as MaterialMiniStatic[]) ?? [],
    };
  } catch {
    return {
      counts: { courses: 0, approvedMaterials: 0, tutors: 0 },
      trending: [],
    };
  }
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function StudyHomeFallback() {
  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <Card className="rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="h-6 w-40 rounded bg-muted" />
            <div className="mt-2 h-4 w-72 max-w-full rounded bg-muted" />
            <div className="mt-2 h-3 w-52 rounded bg-muted" />
          </div>
          <div className="h-10 w-28 rounded-2xl bg-muted" />
        </div>
        <div className="mt-4 h-11 w-full rounded-2xl bg-muted" />
        <div className="mt-4 flex gap-2 overflow-hidden">
          <div className="h-9 w-24 rounded-full bg-muted" />
          <div className="h-9 w-28 rounded-full bg-muted" />
          <div className="h-9 w-24 rounded-full bg-muted" />
          <div className="h-9 w-28 rounded-full bg-muted" />
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-3xl border border-border bg-card shadow-sm"
          />
        ))}
      </div>
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}

// ─── Async data → client bridge ───────────────────────────────────────────────

async function StudyHomeWithData() {
  const { counts, trending } = await fetchStaticData();
  return <StudyHomeClient initialCounts={counts} initialTrending={trending} />;
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function StudyPage() {
  return (
    <Suspense fallback={<StudyHomeFallback />}>
      <StudyHomeWithData />
    </Suspense>
  );
}