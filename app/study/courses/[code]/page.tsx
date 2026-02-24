// app/study/courses/[code]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getWhatsAppLink } from "@/lib/whatsapp";
import { Card, EmptyState, SkeletonCard } from "../../_components/StudyUI";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  FileText,
  GraduationCap,
  Loader2,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  UploadCloud,
  LayoutGrid,
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
  title: string | null;
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
  file_url: string | null;
  file_type: string | null;
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

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normalize(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function formatWhen(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });
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

function typeIcon(t: string) {
  if (t === "past_question") return <Sparkles className="h-4 w-4" />;
  if (t === "slides") return <LayoutGrid className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "bad" | "soft";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-300/40 bg-emerald-100/30 dark:bg-emerald-950/20"
      : tone === "bad"
      ? "border-rose-300/40 bg-rose-100/30 dark:bg-rose-950/20"
      : tone === "soft"
      ? "border-border/60 bg-secondary/50"
      : "border-border bg-background";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-extrabold", cls)}>
      {children}
    </span>
  );
}

function PrimaryCta({
  href,
  children,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm font-extrabold text-foreground no-underline",
        "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {icon}
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function GhostCta({
  href,
  children,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-extrabold text-foreground no-underline",
        "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

function MaterialRow({
  m,
  onOpen,
}: {
  m: Material;
  onOpen: (m: Material) => void;
}) {
  const title = normalize(String(m.title ?? "Untitled material")) || "Untitled material";
  const href = m.file_url || "#";
  const badge =
    m.file_type?.toLowerCase().includes("pdf") || (m.file_url ?? "").toLowerCase().includes(".pdf")
      ? "PDF"
      : m.file_type
      ? String(m.file_type).toUpperCase()
      : "FILE";

  const meta = [m.level ? `${m.level}L` : "", m.semester ? `${m.semester} sem` : "", m.session ? String(m.session) : ""].filter(
    Boolean
  );

  return (
    <Card className="rounded-3xl bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-foreground">{title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.description || " "}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone="soft">{badge}</Pill>
            {meta.map((b) => (
              <Pill key={b}>{b}</Pill>
            ))}
            {m.created_at ? (
              <Pill>
                <Clock className="h-3.5 w-3.5" />
                {formatWhen(m.created_at)}
              </Pill>
            ) : null}
          </div>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background">
          <FileText className="h-5 w-5 text-foreground" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(m)}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            href === "#"
              ? "cursor-not-allowed border border-border/60 bg-background text-muted-foreground opacity-70"
              : "bg-secondary text-foreground hover:opacity-90"
          )}
          disabled={href === "#"}
        >
          <BookOpen className="h-4 w-4" />
          Open
        </button>

        <Link
          href={`/study/report?material=${encodeURIComponent(String(m.id))}`}
          className="inline-flex items-center justify-center rounded-2xl border border-border bg-background px-4 py-3 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
        >
          Report
        </Link>
      </div>

      {typeof m.downloads === "number" ? (
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
          {m.downloads.toLocaleString("en-NG")} downloads
        </p>
      ) : null}
    </Card>
  );
}

function TutorMiniCard({ t, courseCode }: { t: any; courseCode: string }) {
  const name = normalize(String(t?.name ?? t?.full_name ?? t?.display_name ?? "Tutor"));
  const verified = Boolean(t?.verified);
  const phone = normalize(String(t?.phone ?? t?.whatsapp ?? t?.contact ?? ""));
  const location = normalize(String(t?.location ?? t?.campus ?? ""));
  const headline = normalize(String(t?.headline ?? t?.bio_headline ?? ""));

  const wa = getWhatsAppLink(
    phone,
    `Hi ${name}, I found you on Jabu Study. I need help with ${courseCode}.\n\nLevel: \nTopic: \nPreferred time: \nMode (online/physical): \n\nThanks!`
  );

  return (
    <Card className="rounded-3xl bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-extrabold text-foreground">{name}</p>
            {verified ? (
              <Pill tone="good">
                <ShieldCheck className="h-3.5 w-3.5" /> Verified
              </Pill>
            ) : null}
            {typeof t?.rating === "number" ? (
              <Pill>
                <Star className="h-3.5 w-3.5" /> {Number(t.rating).toFixed(1)}
              </Pill>
            ) : null}
          </div>

          {headline ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{headline}</p> : null}
          {location ? <p className="mt-2 text-xs font-semibold text-muted-foreground">{location}</p> : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm font-extrabold text-foreground no-underline",
            "hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>

        <a
          href={phone ? `tel:${phone.replace(/\s+/g, "")}` : "#"}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-extrabold no-underline",
            phone
              ? "border-border bg-background text-foreground hover:bg-secondary/50"
              : "cursor-not-allowed border-border/60 bg-background text-muted-foreground opacity-70"
          )}
        >
          <Phone className="h-4 w-4" /> Call
        </a>
      </div>
    </Card>
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
  const [tutors, setTutors] = useState<any[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simple, mobile-first filters (no clutter)
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");
  const [sort, setSort] = useState<"top" | "new">("top");

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
          id,course_code,title,department_id,
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
        setTutors([]);
        setQuestions([]);
        setLoading(false);
        return;
      }

      const courseRow = cRes.data as any as Course;
      setCourse(courseRow);

      // 2) Load everything else in parallel (faster)
      const [mRes, pRes, qRes, tRes] = await Promise.all([
        supabase
          .from("study_materials")
          .select("id,title,description,file_url,file_type,level,session,semester,created_at,downloads,material_type")
          .eq("approved", true)
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

        // NOTE: schema seems to store tutor courses in an array/text field,
        // so we still pull a larger set then filter client-side.
        // Later improvement: normalize tutor_courses into a join table.
        supabase.from("study_tutors").select("*").limit(400),
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

      if (tRes.error) {
        setTutors([]);
      } else {
        const list = ((tRes.data as any[]) ?? []).filter(Boolean);
        const codeN = code.toLowerCase();
        const filtered = list.filter((t) => {
          if (t?.active === false) return false;
          const c = t?.courses ?? t?.course_codes ?? t?.subjects ?? "";
          const hay = (Array.isArray(c) ? c.join(" ") : String(c)).toLowerCase();
          return hay.includes(codeN);
        });

        filtered.sort((a, b) => {
          const va = Boolean(a?.verified);
          const vb = Boolean(b?.verified);
          if (va !== vb) return vb ? 1 : -1;
          const ra = Number(a?.rating ?? 0);
          const rb = Number(b?.rating ?? 0);
          if (ra !== rb) return rb - ra;
          const da = new Date(a?.created_at ?? 0).getTime();
          const db = new Date(b?.created_at ?? 0).getTime();
          return db - da;
        });

        setTutors(filtered.slice(0, 12));
      }

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

  const availableSemesters = useMemo(() => {
    const set = new Set<string>();
    materials.forEach((m) => {
      const s = normalize(String(m.semester ?? ""));
      if (s) set.add(s);
    });
    return Array.from(set);
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const lvlOk = (m: Material) => levelFilter === "all" || normalize(String(m.level ?? "")) === levelFilter;
    const semOk = (m: Material) => semesterFilter === "all" || normalize(String(m.semester ?? "")) === semesterFilter;
    const list = materials.filter((m) => lvlOk(m) && semOk(m));

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
  }, [materials, levelFilter, semesterFilter, sort]);

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

  const topPractice = practiceSets[0]?.id ? `/study/practice/${encodeURIComponent(String(practiceSets[0].id))}` : `/study/practice?course=${encodeURIComponent(code)}`;

  async function onOpenMaterial(m: Material) {
    const href = m.file_url || "#";
    if (href === "#") return;

    // best-effort downloads increment (don’t block opening)
    try {
      const nextDownloads = Number(m.downloads ?? 0) + 1;
      setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, downloads: nextDownloads } : x)));
      await supabase.from("study_materials").update({ downloads: nextDownloads }).eq("id", m.id);
    } catch {
      // ignore
    }

    window.open(href, "_blank", "noopener,noreferrer");
  }

  const pageTitle = code || "Course";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4">
      {/* Top nav */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground",
            "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <Link
          href="/study/materials"
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
        >
          Browse library
        </Link>
      </div>

      {/* Hero */}
      <div className="mt-4">
        <Card className="rounded-3xl bg-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-muted-foreground">Course Hub</p>
              <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight text-foreground">{pageTitle}</h1>
              {course?.title ? <p className="mt-1 text-sm text-muted-foreground">{normalize(course.title)}</p> : null}
              {dept || faculty ? (
                <p className="mt-2 text-xs font-semibold text-muted-foreground">
                  {dept}
                  {dept && faculty ? " • " : ""}
                  {faculty}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Pill tone="soft">{materials.length.toLocaleString("en-NG")} materials</Pill>
                <Pill tone="soft">{practiceSets.length.toLocaleString("en-NG")} CBT set(s)</Pill>
                <Pill tone="soft">{questions.length.toLocaleString("en-NG")} Q&amp;A</Pill>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <PrimaryCta href={topPractice} icon={<GraduationCap className="h-4 w-4" />}>
                Start Practice
              </PrimaryCta>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                <GhostCta
                  href={`/study/materials/upload?course_code=${encodeURIComponent(code)}`}
                  icon={<UploadCloud className="h-4 w-4" />}
                >
                  Upload
                </GhostCta>
                <GhostCta
                  href={`/study/questions/ask?course=${encodeURIComponent(code)}`}
                  icon={<MessageCircle className="h-4 w-4" />}
                >
                  Ask
                </GhostCta>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-300/40 bg-rose-100/30 p-4 text-sm font-semibold text-foreground dark:bg-rose-950/20">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading course hub…
            </div>
          ) : null}

          {!loading && !error && !course ? (
            <div className="mt-4">
              <EmptyState
                title="Course not found"
                description={`No course matches “${code}”. Try searching the library.`}
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
        </Card>
      </div>

      {/* Loading skeletons */}
      {loading ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {!loading && course ? (
        <>
          {/* Materials */}
          <section className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-foreground">Materials</h2>
                <p className="mt-1 text-sm text-muted-foreground">Past questions, notes, slides and more for {code}.</p>
              </div>

              <Link
                href={`/study/materials?q=${encodeURIComponent(code)}`}
                className="text-sm font-extrabold text-muted-foreground no-underline hover:text-foreground"
              >
                Search this course in library →
              </Link>
            </div>

            {/* Filters (compact, mobile-first) */}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-extrabold text-muted-foreground">Level</span>
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className={cn(
                    "mt-1 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                >
                  <option value="all">All levels</option>
                  {availableLevels.map((lv) => (
                    <option key={lv} value={lv}>
                      {lv}L
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-muted-foreground">Semester</span>
                <select
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                  className={cn(
                    "mt-1 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                >
                  <option value="all">All semesters</option>
                  {availableSemesters.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-muted-foreground">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className={cn(
                    "mt-1 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                >
                  <option value="top">Top downloads</option>
                  <option value="new">Newest</option>
                </select>
              </label>
            </div>

            {filteredMaterials.length === 0 ? (
              <div className="mt-3">
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
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                {grouped.map(([t, list]) => (
                  <Card key={t} className="rounded-3xl bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 place-items-center rounded-2xl border border-border bg-background text-foreground">
                          {typeIcon(t)}
                        </span>
                        <div>
                          <p className="text-sm font-extrabold text-foreground">{labelType(t)}</p>
                          <p className="text-xs font-semibold text-muted-foreground">{list.length.toLocaleString("en-NG")} item(s)</p>
                        </div>
                      </div>

                      <Link
                        href={`/study/materials?type=${encodeURIComponent(t)}&q=${encodeURIComponent(code)}`}
                        className="text-sm font-extrabold text-muted-foreground no-underline hover:text-foreground"
                      >
                        View in library →
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {list.slice(0, 6).map((m) => (
                        <MaterialRow key={m.id} m={m} onOpen={onOpenMaterial} />
                      ))}
                    </div>

                    {list.length > 6 ? (
                      <div className="mt-4">
                        <Link
                          href={`/study/materials?type=${encodeURIComponent(t)}&q=${encodeURIComponent(code)}`}
                          className="inline-flex items-center justify-center rounded-2xl border border-border bg-background px-4 py-3 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
                        >
                          See more ({list.length - 6})
                        </Link>
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Practice */}
          <section className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-foreground">Practice (CBT)</h2>
                <p className="mt-1 text-sm text-muted-foreground">Timed practice sets for {code}. Great for revision.</p>
              </div>
              <Link
                href={`/study/practice?course=${encodeURIComponent(code)}`}
                className="inline-flex items-center justify-center rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
              >
                View all
              </Link>
            </div>

            {practiceSets.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="No practice sets yet"
                  description={`You can still use Materials for revision. Admin/department can publish CBT sets for ${code}.`}
                  action={
                    <Link
                      href={`/study/practice?course=${encodeURIComponent(code)}`}
                      className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground no-underline hover:opacity-90"
                    >
                      Go to Practice Mode <ArrowRight className="h-4 w-4" />
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                {practiceSets.map((s) => (
                  <Link
                    key={String(s.id)}
                    href={`/study/practice/${encodeURIComponent(String(s.id))}`}
                    className="block rounded-3xl border border-border bg-card p-4 shadow-sm no-underline transition hover:bg-secondary/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-extrabold text-foreground">{normalize(String(s.title ?? "Practice set"))}</p>
                        {s.description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{normalize(String(s.description))}</p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {typeof s.questions_count === "number" ? (
                            <Pill tone="soft">{Number(s.questions_count).toLocaleString("en-NG")} questions</Pill>
                          ) : null}
                          {typeof s.time_limit_minutes === "number" ? <Pill tone="soft">{Number(s.time_limit_minutes)} mins</Pill> : null}
                          {s.level ? <Pill>{String(s.level)}L</Pill> : null}
                        </div>
                      </div>

                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background">
                        <Sparkles className="h-5 w-5 text-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Q&A */}
          <section className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-foreground">Q&amp;A for {code}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Ask questions, get answers, and learn faster.</p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/study/questions?course=${encodeURIComponent(code)}`}
                  className="inline-flex items-center justify-center rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground no-underline hover:bg-secondary/50"
                >
                  View all
                </Link>
                <Link
                  href={`/study/questions/ask?course=${encodeURIComponent(code)}`}
                  className="inline-flex items-center justify-center rounded-2xl bg-secondary px-3 py-2 text-sm font-extrabold text-foreground no-underline hover:opacity-90"
                >
                  Ask
                </Link>
              </div>
            </div>

            {questions.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="No questions yet"
                  description={`Be the first to ask a question about ${code}.`}
                  action={
                    <Link
                      href={`/study/questions/ask?course=${encodeURIComponent(code)}`}
                      className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground no-underline hover:opacity-90"
                    >
                      <MessageCircle className="h-4 w-4" /> Ask a question <ArrowRight className="h-4 w-4" />
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {questions.map((q) => (
                  <Link
                    key={q.id}
                    href={`/study/questions/${encodeURIComponent(String(q.id))}`}
                    className="block rounded-3xl border border-border bg-card p-4 shadow-sm no-underline transition hover:bg-secondary/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-extrabold text-foreground">{normalize(String(q.title ?? "Question"))}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {q.solved ? <Pill tone="good">Solved</Pill> : <Pill>Unsolved</Pill>}
                          {q.level ? <Pill>{String(q.level)}L</Pill> : null}
                          <Pill tone="soft">{Number(q.answers_count ?? 0).toLocaleString("en-NG")} answers</Pill>
                          <Pill tone="soft">{Number(q.upvotes_count ?? 0).toLocaleString("en-NG")} upvotes</Pill>
                          {q.created_at ? (
                            <Pill>
                              <Clock className="h-3.5 w-3.5" /> {formatWhenShort(q.created_at)}
                            </Pill>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background">
                        <MessageCircle className="h-5 w-5 text-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Tutors */}
          <section className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-foreground">Tutors for {code}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Connect with tutors who teach this course.</p>
              </div>
              <Link
                href={`/study/tutors?course=${encodeURIComponent(code)}`}
                className="text-sm font-extrabold text-muted-foreground no-underline hover:text-foreground"
              >
                Browse tutors →
              </Link>
            </div>

            {tutors.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="No tutors listed yet"
                  description={`If you can tutor ${code}, list yourself on the Tutors page.`}
                  action={
                    <Link
                      href="/study/tutors"
                      className="inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-extrabold text-foreground no-underline hover:opacity-90"
                    >
                      Go to Tutors <ArrowRight className="h-4 w-4" />
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                {tutors.map((t) => (
                  <TutorMiniCard key={String(t.id ?? t.user_id ?? Math.random())} t={t} courseCode={code} />
                ))}
              </div>
            )}
          </section>

          {/* Bottom mini CTA */}
          <div className="mt-10">
            <Card className="rounded-3xl bg-card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-extrabold text-foreground">Help your classmates</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload a past question / note for {code} or ask a question if you’re stuck.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <GhostCta
                    href={`/study/materials/upload?course_code=${encodeURIComponent(code)}`}
                    icon={<UploadCloud className="h-4 w-4" />}
                  >
                    Upload
                  </GhostCta>
                  <GhostCta
                    href={`/study/questions/ask?course=${encodeURIComponent(code)}`}
                    icon={<MessageCircle className="h-4 w-4" />}
                  >
                    Ask
                  </GhostCta>
                </div>
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </main>
  );
}