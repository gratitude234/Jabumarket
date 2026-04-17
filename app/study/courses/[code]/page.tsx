"use client";
// app/study/courses/[code]/page.tsx
import { cn } from "@/lib/utils";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { EmptyState } from "../../_components/StudyUI";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Loader2,
  MessageCircle,
  Sparkles,
  UploadCloud,
} from "lucide-react";

type MaterialType =
  | "past_question"
  | "handout"
  | "slides"
  | "note"
  | "timetable"
  | "other"
  | string;

type Course = {
  id: string;
  course_code: string;
  course_title: string | null;
  study_departments?: {
    id: string;
    name: string;
    faculty_id: string;
    study_faculties?: { id: string; name: string } | null;
  } | null;
};

type Material = {
  id: string;
  title: string | null;
  description: string | null;
  file_path: string | null;
  level: string | null;
  semester: string | null;
  session: string | null;
  created_at: string | null;
  downloads: number | null;
  material_type: MaterialType | null;
};

type PracticeSet = {
  id: string;
  title: string | null;
  description: string | null;
  course_code: string | null;
  level: string | null;
  time_limit_minutes: number | null;
  questions_count: number | null;
  created_at: string | null;
};

type QuestionRow = {
  id: string;
  title: string;
  course_code: string | null;
  level: string | null;
  created_at: string | null;
  answers_count: number | null;
  upvotes_count: number | null;
  solved: boolean | null;
};

function normalize(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function formatWhenShort(iso?: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function labelType(t: string) {
  const m: Record<string, string> = {
    past_question: "Past Questions",
    handout: "Handouts",
    slides: "Slides",
    note: "Notes",
    timetable: "Timetables",
    other: "Other",
  };
  return m[t] ?? "Materials";
}

function MaterialRow({
  m,
  onOpen,
}: {
  m: Material;
  onOpen: (m: Material) => void;
}) {
  const title = normalize(String(m.title ?? "Untitled material")) || "Untitled material";
  const href = m.file_path ? `/api/study/materials/${m.id}/download` : "#";
  const unavailable = href === "#";

  const typeColor: Record<string, string> = {
    past_question: "bg-[#EEEDFE] text-[#3B24A8]",
    note: "bg-[#EAF3DE] text-[#3B6D11]",
    handout: "bg-[#EAF3DE] text-[#3B6D11]",
    slides: "bg-[#E6F1FB] text-[#0C447C]",
    timetable: "bg-[#FAEEDA] text-[#633806]",
    other: "bg-secondary text-muted-foreground",
  };

  const iconColor = typeColor[String(m.material_type ?? "other")] ?? typeColor.other;
  const meta = [m.level ? `${m.level}L` : "", m.semester ? `${m.semester} sem` : ""].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={() => !unavailable && onOpen(m)}
      disabled={unavailable}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-border bg-background px-3 py-3 text-left transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        unavailable
          ? "cursor-not-allowed opacity-60"
          : "hover:bg-secondary/40 active:scale-[0.99]"
      )}
    >
      <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm", iconColor)}>
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {meta ? <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      {typeof m.downloads === "number" && m.downloads > 0 ? (
        <p className="shrink-0 text-xs text-muted-foreground">↓ {m.downloads.toLocaleString("en-NG")}</p>
      ) : null}
    </button>
  );
}

export default function CourseHubPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();

  const rawCode = Array.isArray((params as any)?.code) ? (params as any).code[0] : (params as any)?.code;
  const code = normalize(decodeURIComponent(String(rawCode ?? ""))).toUpperCase();

  const [course, setCourse] = useState<Course | null>(null);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [practiceSets, setPracticeSets] = useState<PracticeSet[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [sort, setSort] = useState<"top" | "new">("top");
  const [activeTab, setActiveTab] = useState<"materials" | "practice" | "qa">("materials");

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      setError(null);

      if (!code) {
        setError("Invalid course code.");
        setLoading(false);
        return;
      }

      // 1) Load course
      const cRes = await supabase
        .from("study_courses")
        .select(
          `
          id,course_code,course_title,department_id,
          study_departments:department_id(id,name,faculty_id,study_faculties:faculty_id(id,name))
        `
        )
        .eq("course_code", code)
        .maybeSingle();

      if (!mounted) return;

      if (cRes.error) {
        setError(cRes.error.message);
        setLoading(false);
        return;
      }

      if (!cRes.data) {
        setCourse(null);
        setMaterials([]);
        setPracticeSets([]);
        setQuestions([]);
        setLoading(false);
        return;
      }

      const courseRow = cRes.data as any as Course;
      setCourse(courseRow);

      // 2) Load everything else in parallel (faster)
      const [mRes, pRes, qRes] = await Promise.all([
        supabase
          .from("study_materials")
          .select("id,title,description,file_path,level,session,semester,created_at,downloads,material_type")
          .eq("approved", true)
          .eq("upload_status", "live")
          .eq("course_id", courseRow.id)
          .order("downloads", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(250),

        supabase
          .from("study_quiz_sets")
          .select("id,title,description,course_code,level,time_limit_minutes,questions_count,created_at")
          .eq("published", true)
          .ilike("course_code", `${code}%`)
          .order("created_at", { ascending: false })
          .limit(8),

        supabase
          .from("study_questions")
          .select("id,title,course_code,level,created_at,answers_count,upvotes_count,solved")
          .ilike("course_code", `${code}%`)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      if (!mounted) return;

      if (mRes.error) {
        setError(mRes.error.message);
      } else {
        setMaterials(((mRes.data as any[]) ?? []).filter(Boolean));
      }

      if (pRes.error) setPracticeSets([]);
      else setPracticeSets((((pRes.data as any[]) ?? []).filter(Boolean)) as PracticeSet[]);

      if (qRes.error) setQuestions([]);
      else setQuestions((((qRes.data as any[]) ?? []).filter(Boolean)) as QuestionRow[]);

      setLoading(false);
    }

    run();

    return () => {
      mounted = false;
    };
  }, [code]);

  const dept = course?.study_departments?.name ?? "";
  const faculty = course?.study_departments?.study_faculties?.name ?? "";

  const availableLevels = useMemo(() => {
    const set = new Set<string>();
    materials.forEach((m) => {
      const lv = normalize(String(m.level ?? ""));
      if (lv) set.add(lv);
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const lvlOk = (m: Material) => levelFilter === "all" || normalize(String(m.level ?? "")) === levelFilter;
    const list = materials.filter((m) => lvlOk(m));

    if (sort === "new") {
      return list.slice().sort((a, b) => {
        const ta = new Date(a.created_at ?? 0).getTime();
        const tb = new Date(b.created_at ?? 0).getTime();
        return tb - ta;
      });
    }

    // top: downloads desc, then newest
    return list.slice().sort((a, b) => {
      const da = Number(a.downloads ?? 0);
      const db = Number(b.downloads ?? 0);
      if (da !== db) return db - da;
      const ta = new Date(a.created_at ?? 0).getTime();
      const tb = new Date(b.created_at ?? 0).getTime();
      return tb - ta;
    });
  }, [materials, levelFilter, sort]);

  const grouped = useMemo(() => {
    const map = new Map<string, Material[]>();
    for (const m of filteredMaterials) {
      const key = String(m.material_type ?? "other");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }

    const order = ["past_question", "note", "handout", "slides", "timetable", "other"];
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    return entries;
  }, [filteredMaterials]);

  const firstPdfMaterial = useMemo(() => {
    return materials.find((m) => {
      const url = (m.file_path ?? "").toLowerCase();
      return url.includes(".pdf");
    }) ?? null;
  }, [materials]);

  const topPractice = practiceSets[0]?.id ? `/study/practice/${encodeURIComponent(String(practiceSets[0].id))}` : `/study/practice?course=${encodeURIComponent(code)}`;

  async function onOpenMaterial(m: Material) {
    const href = m.file_path ? `/api/study/materials/${m.id}/download` : "#";
    if (href === "#") return;

    window.open(href, "_blank", "noopener,noreferrer");
  }

  const pageTitle = code || "Course";

  return (
    <div className="space-y-0 pb-28 md:pb-6">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        {/* Indigo header */}
        <div className="bg-[#5B35D5] px-5 pt-5 pb-5">
          {/* Top row: back + upload */}
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <Link
              href={`/study/materials/upload?course_code=${encodeURIComponent(code)}`}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white no-underline hover:bg-white/25"
            >
              <UploadCloud className="h-3.5 w-3.5" /> Upload
            </Link>
          </div>

          {/* Course identity */}
          <h1 className="text-3xl font-extrabold tracking-tight text-white leading-none">
            {pageTitle}
          </h1>
          {course?.course_title ? (
            <p className="mt-1.5 text-sm text-white/70 leading-snug">
              {normalize(course.course_title)}
            </p>
          ) : null}
          {(dept || faculty) ? (
            <p className="mt-1 text-xs text-white/50">
              {[dept, faculty].filter(Boolean).join(" · ")}
            </p>
          ) : null}

          {/* Stat tiles */}
          {!loading && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-white/10 px-3 py-2.5 text-center">
                <p className="font-mono text-lg font-extrabold leading-none text-white">
                  {materials.length}
                </p>
                <p className="mt-1 text-[10px] text-white/55">materials</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-3 py-2.5 text-center">
                <p className="font-mono text-lg font-extrabold leading-none text-white">
                  {practiceSets.length}
                </p>
                <p className="mt-1 text-[10px] text-white/55">practice sets</p>
              </div>
              <div className="rounded-2xl bg-white/10 px-3 py-2.5 text-center">
                <p className="font-mono text-lg font-extrabold leading-none text-white">
                  {questions.length}
                </p>
                <p className="mt-1 text-[10px] text-white/55">Q&amp;A</p>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error ? (
          <div className="m-4 rounded-2xl border border-rose-300/40 bg-rose-100/30 p-4 text-sm font-semibold text-foreground dark:bg-rose-950/20">
            {error}
          </div>
        ) : null}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-4 text-sm font-semibold text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading course hub…
          </div>
        ) : null}

        {/* Course not found */}
        {!loading && !error && !course ? (
          <div className="p-5">
            <EmptyState
              title="Course not found"
              description={`No course matches "${code}". Try searching the library.`}
              action={
                <Link
                  href={`/study/materials?q=${encodeURIComponent(code)}`}
                  className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground no-underline hover:opacity-90"
                >
                  Search library <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
          </div>
        ) : null}

        {/* ── Two primary CTAs ── */}
        {!loading && course && (
          <div className="grid grid-cols-2 gap-2 border-t border-border px-4 py-3">
            <Link
              href={topPractice}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5B35D5] px-4 py-3 text-sm font-extrabold text-white no-underline hover:bg-[#4526B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Sparkles className="h-4 w-4" /> Start practice
            </Link>
            <Link
              href={`/study/questions/ask?course=${encodeURIComponent(code)}`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <MessageCircle className="h-4 w-4" /> Ask a question
            </Link>
          </div>
        )}

        {/* ── Section tabs ── */}
        {!loading && course && (
          <div className="flex gap-0 border-t border-border px-4">
            {(["materials", "practice", "qa"] as const).map((tab) => {
              const labels = { materials: "Materials", practice: "Practice", qa: "Q&A" };
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-3 py-3 text-sm font-semibold transition-all border-b-2 focus-visible:outline-none",
                    active
                      ? "border-[#5B35D5] text-[#5B35D5]"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      {!loading && course && (
        <div className="mt-3 space-y-3">

          {/* MATERIALS TAB */}
          {activeTab === "materials" && (
            <div className="space-y-3">
              {/* Level chips + sort */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
                  {(["all", ...availableLevels] as string[]).map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setLevelFilter(lv)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                        levelFilter === lv
                          ? "border-[#5B35D5]/30 bg-[#EEEDFE] text-[#3B24A8]"
                          : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50"
                      )}
                    >
                      {lv === "all" ? "All levels" : `${lv}L`}
                    </button>
                  ))}
                </div>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as "top" | "new")}
                  className="shrink-0 rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground outline-none"
                >
                  <option value="top">Top</option>
                  <option value="new">New</option>
                </select>
              </div>

              {filteredMaterials.length === 0 ? (
                <EmptyState
                  title="No materials yet"
                  description={`Be the first to upload past questions, notes or slides for ${code}.`}
                  action={
                    <Link
                      href={`/study/materials/upload?course_code=${encodeURIComponent(code)}`}
                      className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground no-underline hover:opacity-90"
                    >
                      Upload material <ArrowRight className="h-4 w-4" />
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-4">
                  {grouped.map(([type, list]) => (
                    <div key={type}>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {labelType(type)}
                        </p>
                        {list.length > 5 && (
                          <Link
                            href={`/study/materials?type=${encodeURIComponent(type)}&q=${encodeURIComponent(code)}`}
                            className="text-xs font-semibold text-[#5B35D5] no-underline"
                          >
                            View all {list.length} →
                          </Link>
                        )}
                      </div>
                      <div className="space-y-2">
                        {list.slice(0, 5).map((m) => (
                          <MaterialRow key={m.id} m={m} onOpen={onOpenMaterial} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PRACTICE TAB */}
          {activeTab === "practice" && (
            <div className="space-y-3">
              {practiceSets.length === 0 ? (
                <>
                  {firstPdfMaterial && (
                    <div className={cn(
                      "mb-4 overflow-hidden rounded-2xl border",
                      "border-[#AFA9EC] bg-[#EEEDFE]",
                      "dark:border-[#5B35D5]/40 dark:bg-[#5B35D5]/10"
                    )}>
                      <div className="px-4 py-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-[#5B35D5] dark:text-indigo-300" />
                          <p className="text-sm font-extrabold text-[#3C3489] dark:text-indigo-200">
                            No practice sets yet
                          </p>
                        </div>
                        <p className="mb-3 text-xs text-[#534AB7] dark:text-indigo-300">
                          Generate AI-powered MCQs from the course materials
                          already uploaded.
                        </p>
                        <Link
                          href={`/study/materials/${encodeURIComponent(firstPdfMaterial.id)}`}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-xl",
                            "bg-[#5B35D5] px-3 py-2 text-xs font-extrabold",
                            "text-white no-underline transition hover:bg-[#4526B8]",
                            "focus-visible:outline-none focus-visible:ring-2",
                            "focus-visible:ring-[#5B35D5] focus-visible:ring-offset-2"
                          )}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Generate questions from{" "}
                          {(firstPdfMaterial.title ?? "material").trim().slice(0, 30)}
                          {(firstPdfMaterial.title ?? "").length > 30 ? "…" : ""}
                        </Link>
                      </div>
                    </div>
                  )}

                  <EmptyState
                    title="No practice sets yet"
                    description={`Admin or course reps can publish CBT sets for ${code}. Use Materials for revision in the meantime.`}
                    action={
                      <Link
                        href={`/study/practice?course=${encodeURIComponent(code)}`}
                        className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground no-underline hover:opacity-90"
                      >
                        Browse all practice <ArrowRight className="h-4 w-4" />
                      </Link>
                    }
                  />
                </>
              ) : (
                <>
                  {practiceSets.map((s) => (
                    <Link
                      key={String(s.id)}
                      href={`/study/practice/${encodeURIComponent(String(s.id))}`}
                      className="block rounded-2xl border border-border bg-background px-4 py-3 no-underline transition hover:bg-secondary/30 active:scale-[0.99]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {normalize(String(s.title ?? "Practice set"))}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {typeof s.questions_count === "number" && (
                              <span className="rounded-full border border-border/60 bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                                {Number(s.questions_count)} questions
                              </span>
                            )}
                            {typeof s.time_limit_minutes === "number" && (
                              <span className="rounded-full border border-border/60 bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                                {Number(s.time_limit_minutes)} mins
                              </span>
                            )}
                            {s.level && (
                              <span className="rounded-full border border-border/60 bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                                {String(s.level)}L
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEEDFE]">
                          <Sparkles className="h-4 w-4 text-[#5B35D5]" />
                        </div>
                      </div>
                    </Link>
                  ))}
                  <Link
                    href={`/study/practice?course=${encodeURIComponent(code)}`}
                    className="block text-center text-sm font-semibold text-[#5B35D5] no-underline py-2"
                  >
                    View all practice sets →
                  </Link>
                </>
              )}
            </div>
          )}

          {/* Q&A TAB */}
          {activeTab === "qa" && (
            <div className="space-y-2">
              <Link
                href={`/study/questions/ask?course=${encodeURIComponent(code)}`}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-sm font-semibold text-muted-foreground no-underline transition hover:border-[#5B35D5]/40 hover:bg-[#EEEDFE] hover:text-[#3B24A8]"
              >
                <MessageCircle className="h-4 w-4" />
                Ask a question about {code}
              </Link>

              {questions.length === 0 ? (
                <EmptyState
                  title="No questions yet"
                  description={`Be the first to ask a question about ${code}.`}
                />
              ) : (
                <>
                  <div className="overflow-hidden rounded-2xl border border-border bg-background">
                    {questions.map((q, i) => {
                      const solved = q.solved === true;
                      const unanswered = (q.answers_count ?? 0) === 0 && !solved;
                      return (
                        <Link
                          key={q.id}
                          href={`/study/questions/${encodeURIComponent(String(q.id))}`}
                          className={cn(
                            "flex items-start gap-3 px-4 py-3 no-underline transition hover:bg-secondary/30",
                            i > 0 && "border-t border-border/60"
                          )}
                        >
                          <div
                            className="mt-1 h-full w-1 shrink-0 self-stretch rounded-full"
                            style={{
                              minHeight: 32,
                              backgroundColor: solved
                                ? "#1D9E75"
                                : unanswered
                                ? "#EF9F27"
                                : "var(--color-border-secondary)",
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground leading-snug">
                              {normalize(String(q.title ?? "Question"))}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {solved
                                ? "Solved"
                                : unanswered
                                ? "Unanswered"
                                : `${q.answers_count ?? 0} answer${(q.answers_count ?? 0) !== 1 ? "s" : ""}`}
                              {q.created_at ? ` · ${formatWhenShort(q.created_at)}` : ""}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  <Link
                    href={`/study/questions?course=${encodeURIComponent(code)}`}
                    className="block text-center text-sm font-semibold text-[#5B35D5] no-underline py-2"
                  >
                    View all {questions.length} questions →
                  </Link>
                </>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
