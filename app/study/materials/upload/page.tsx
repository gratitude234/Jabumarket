// app/study/materials/upload/page.tsx
"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  ArrowRight,
  UploadCloud,
  Loader2,
  X,
  Check,
  Plus,
  Search,
  ShieldCheck,
  AlertTriangle,
  Hash,
  FileText,
  Image as ImageIcon,
  Presentation,
  BookOpen,
} from "lucide-react";

import { Card, EmptyState, PageHeader, SkeletonCard } from "../../_components/StudyUI";

type Semester = "first" | "second" | "summer";
type MaterialType = "past_question" | "handout" | "slides" | "note" | "timetable" | "other";

type CourseRow = {
  id: string;
  faculty: string;
  department: string;
  level: number;
  course_code: string;
  course_title: string | null;
  semester: Semester;
};

type FacultyRow = { id: string; name: string; sort_order?: number | null };
type DeptRow = {
  id: string;
  faculty_id: string;
  display_name?: string | null;
  official_name?: string | null;
  sort_order?: number | null;
};

const BUCKET = "study-materials";
const MAX_MB = 25;

// ✅ IMPORTANT: this is the height of your GLOBAL bottom nav (the icon bar).
// If yours is different, adjust this number until the wizard buttons sit perfectly above it.
const APP_BOTTOM_NAV_H = 72; // px

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function safeUuid() {
  // crypto.randomUUID is supported in modern browsers
  // fallback is fine for path uniqueness in MVP
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = typeof crypto !== "undefined" ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeFilename(name: string) {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120);
}

function normalizeText(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function normalizeCourseCode(v: string) {
  return normalizeText(v).toUpperCase().replace(/\s+/g, "");
}

function isValidSession(v: string) {
  if (!v.trim()) return true;
  return /^\d{4}\/\d{4}$/.test(v.trim());
}

function prettyMaterialType(t: MaterialType) {
  if (t === "past_question") return "Past Questions";
  if (t === "handout") return "Handout";
  if (t === "slides") return "Slides";
  if (t === "note") return "Note";
  if (t === "timetable") return "Timetable";
  return "Other";
}

function allowedForType(type: MaterialType, f: File) {
  // Mobile-first policy:
  // - Past questions: PDF/images only (most common + safe for scanning)
  // - Slides: allow pptx too
  const n = (f.name || "").toLowerCase();
  const isPdf = f.type === "application/pdf" || n.endsWith(".pdf");
  const isImg = f.type.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(n);
  const isPptx =
    f.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || n.endsWith(".pptx");

  if (type === "past_question") return isPdf || isImg;
  if (type === "slides") return isPdf || isImg || isPptx;

  // Others: PDF/images/pptx
  return isPdf || isImg || isPptx;
}

function fileBadge(f: File) {
  const t = (f.type || "").toLowerCase();
  const n = (f.name || "").toLowerCase();
  if (t.includes("pdf") || n.endsWith(".pdf")) return "PDF";
  if (t.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(n)) return "IMAGE";
  if (t.includes("presentation") || n.endsWith(".pptx")) return "PPTX";
  return "FILE";
}

async function sha256Hex(file: File): Promise<string | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const bytes = Array.from(new Uint8Array(hash));
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

type Banner = { type: "error" | "success" | "info" | "warn"; text: string } | null;

function BannerBox({ banner, onClose }: { banner: Banner; onClose: () => void }) {
  if (!banner) return null;

  const tone =
    banner.type === "error"
      ? "border-red-200/70 bg-red-50/60 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
      : banner.type === "success"
      ? "border-emerald-200/70 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200"
      : banner.type === "warn"
      ? "border-amber-200/70 bg-amber-50/60 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
      : "border-border bg-card text-foreground";

  const icon =
    banner.type === "success" ? (
      <Check className="h-4 w-4" />
    ) : banner.type === "warn" ? (
      <AlertTriangle className="h-4 w-4" />
    ) : banner.type === "error" ? (
      <AlertTriangle className="h-4 w-4" />
    ) : (
      <ShieldCheck className="h-4 w-4" />
    );

  return (
    <div className={cn("rounded-2xl border p-4 text-sm shadow-sm", tone)} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5">{icon}</div>
          <p className="leading-relaxed">{banner.text}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-1 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Close banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StepPill({
  n,
  label,
  active,
  done,
  clickable,
  onClick,
}: {
  n: number;
  label: string;
  active?: boolean;
  done?: boolean;
  clickable?: boolean;
  onClick?: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Box: any = clickable ? "button" : "div";
  return (
    <Box
      type={clickable ? "button" : undefined}
      onClick={clickable ? onClick : undefined}
      className={cn(
        "flex flex-col items-center gap-1",
        clickable ? "cursor-pointer" : "cursor-default",
        "focus-visible:outline-none"
      )}
      aria-current={active ? "step" : undefined}
      aria-label={label}
    >
      <div
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full border text-sm font-extrabold transition",
          done
            ? "border-border bg-foreground text-background"
            : active
            ? "border-border bg-card text-foreground"
            : "border-border/60 bg-background text-muted-foreground",
          clickable && !active && !done ? "hover:bg-secondary/50" : ""
        )}
      >
        {done ? <Check className="h-4 w-4" /> : n}
      </div>
      <span className={cn("text-[11px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
    </Box>
  );
}

function ModalShell({
  open,
  title,
  subtitle,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl p-3 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-6">
        <div className="w-full rounded-3xl border border-border bg-card p-4 shadow-xl sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-extrabold tracking-tight text-foreground">{title}</p>
              {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl p-2 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-2">
        <p className="text-sm font-bold text-foreground">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
      {error ? <p className="text-xs font-semibold text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}

function Button({
  children,
  variant = "primary",
  loading,
  disabled,
  onClick,
  type,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-extrabold transition " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  const tone =
    variant === "primary"
      ? "bg-secondary text-foreground hover:opacity-90"
      : variant === "secondary"
      ? "border border-border bg-background text-foreground hover:bg-secondary/50"
      : variant === "danger"
      ? "bg-red-600 text-white hover:opacity-90 dark:bg-red-500"
      : "text-foreground hover:bg-secondary/50";

  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        base,
        tone,
        (disabled || loading) ? "opacity-60 cursor-not-allowed" : ""
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function TypeTile({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-3xl border p-4 shadow-sm transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active ? "border-border bg-secondary/60" : "border-border/70 bg-card hover:bg-secondary/40"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border bg-background", active ? "border-border" : "border-border/70")}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

type DuplicateInfo = {
  id: string;
  title?: string | null;
  material_type?: string | null;
  session?: string | null;
  created_at?: string | null;
  course_code?: string | null;
  course_level?: number | null;
  course_semester?: string | null;
};

export default function StudyUploadMaterialPage() {
  const router = useRouter();

  const [banner, setBanner] = useState<Banner>(null);

  // Wizard step: 1 course, 2 details, 3 file, 4 review
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Course selection (debounced search)
  const [courseId, setCourseId] = useState<string>("");
  const [selectedCourse, setSelectedCourse] = useState<CourseRow | null>(null);

  const [courseSearch, setCourseSearch] = useState("");
  const [courseLevelFilter, setCourseLevelFilter] = useState<string>("");
  const [courseSemesterFilter, setCourseSemesterFilter] = useState<"" | Semester>("");

  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Course request modal
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const [faculties, setFaculties] = useState<FacultyRow[]>([]);
  const [departments, setDepartments] = useState<DeptRow[]>([]);

  const [reqFacultyId, setReqFacultyId] = useState<string>("");
  const [reqDepartmentId, setReqDepartmentId] = useState<string>("");
  const [reqLevel, setReqLevel] = useState<string>("");
  const [reqSemester, setReqSemester] = useState<Semester>("first");
  const [reqCourseCode, setReqCourseCode] = useState<string>("");
  const [reqCourseTitle, setReqCourseTitle] = useState<string>("");

  // Material details
  const [title, setTitle] = useState("");
  const [materialType, setMaterialType] = useState<MaterialType>("past_question");
  const [session, setSession] = useState("");
  const [description, setDescription] = useState("");

  // File
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hash + submission stages
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<"idle" | "hashing" | "uploading" | "saving" | "done">("idle");

  // Duplicate modal
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);

  // Keep selectedCourse in sync
  useEffect(() => {
    if (!courseId) {
      setSelectedCourse(null);
      return;
    }
    const found = courses.find((c) => c.id === courseId);
    if (found) setSelectedCourse(found);
  }, [courseId, courses]);

  // Load a small starter list (fast) so user can pick without typing
  useEffect(() => {
    let cancelled = false;

    async function loadStarter() {
      if (initialLoaded) return;
      setLoadingCourses(true);

      const res = await supabase
        .from("study_courses")
        .select("id, faculty, department, level, course_code, course_title, semester")
        .order("course_code", { ascending: true })
        .limit(40);

      if (cancelled) return;

      if (res.error) {
        setCourses([]);
        setBanner({ type: "warn", text: "Couldn’t load courses yet. Try searching by course code." });
      } else {
        setCourses((res.data ?? []) as CourseRow[]);
      }
      setLoadingCourses(false);
      setInitialLoaded(true);
    }

    void loadStarter();
    return () => {
      cancelled = true;
    };
  }, [initialLoaded]);

  // Debounced course search (fast + mobile-friendly)
  useEffect(() => {
    let cancelled = false;
    const term = normalizeText(courseSearch);

    const t = setTimeout(async () => {
      // If user hasn't typed and no filters, keep starter list
      const hasFilters = !!courseLevelFilter || !!courseSemesterFilter;
      if (!term && !hasFilters) return;

      setLoadingCourses(true);

      let q = supabase
        .from("study_courses")
        .select("id, faculty, department, level, course_code, course_title, semester")
        .order("course_code", { ascending: true })
        .limit(60);

      if (term) {
        const safe = term.replace(/[%_]/g, ""); // reduce wildcard weirdness
        q = q.or(`course_code.ilike.%${safe}%,course_title.ilike.%${safe}%`);
      }
      if (courseLevelFilter) q = q.eq("level", Number(courseLevelFilter));
      if (courseSemesterFilter) q = q.eq("semester", courseSemesterFilter);

      const res = await q;
      if (cancelled) return;

      if (res.error) {
        setCourses([]);
        setBanner({ type: "error", text: res.error.message ?? "Failed to search courses." });
      } else {
        setBanner(null);
        setCourses((res.data ?? []) as CourseRow[]);
      }

      setLoadingCourses(false);
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [courseSearch, courseLevelFilter, courseSemesterFilter]);

  // Load faculties/departments when request modal opens (fallback to deriving from courses)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!requestOpen) return;
      if (faculties.length && departments.length) return;

      setRequestLoading(true);
      setBanner(null);

      const [fRes, dRes] = await Promise.all([
        supabase
          .from("study_faculties_clean")
          .select("id,name,sort_order")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("study_departments_clean")
          .select("id,faculty_id,display_name,official_name,sort_order")
          .order("sort_order", { ascending: true })
          .order("display_name", { ascending: true }),
      ]);

      if (cancelled) return;

      if (fRes.error || dRes.error) {
        // Fallback derive from courses list
        const facs = Array.from(new Set((courses ?? []).map((c) => normalizeText(c.faculty)).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b))
          .map((name, i) => ({ id: name, name, sort_order: i }));

        const depts: DeptRow[] = [];
        const seen = new Set<string>();
        for (const c of courses ?? []) {
          const f = normalizeText(c.faculty);
          const d = normalizeText(c.department);
          const key = `${f}::${d}`;
          if (!f || !d || seen.has(key)) continue;
          seen.add(key);
          depts.push({ id: key, faculty_id: f, display_name: d, official_name: d, sort_order: depts.length });
        }

        setFaculties(facs);
        setDepartments(depts);
        setRequestLoading(false);
        return;
      }

      setFaculties((fRes.data ?? []) as FacultyRow[]);
      setDepartments((dRes.data ?? []) as DeptRow[]);
      setRequestLoading(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [requestOpen, faculties.length, departments.length, courses]);

  const selectedFacultyDepts = useMemo(() => {
    if (!reqFacultyId) return departments;
    return departments.filter((d) => d.faculty_id === reqFacultyId);
  }, [departments, reqFacultyId]);

  const filteredCoursesPreview = useMemo(() => {
    // small helper for title preview
    const c = selectedCourse;
    const pieces = [
      c?.course_code ? normalizeCourseCode(c.course_code) : "",
      prettyMaterialType(materialType),
      session.trim() ? `(${session.trim()})` : "",
    ].filter(Boolean);
    return pieces.join(" — ");
  }, [selectedCourse, materialType, session]);

  function resetFile() {
    setFile(null);
    setFileHash(null);
    setHashing(false);
    setStage("idle");
  }

  async function onPickFile(f: File) {
    setBanner(null);

    if (!allowedForType(materialType, f)) {
      setBanner({
        type: "error",
        text:
          materialType === "past_question"
            ? "Past questions must be a PDF or an image (PNG/JPG/WebP)."
            : "Please upload a PDF, image (PNG/JPG/WebP), or PPTX.",
      });
      return;
    }

    const sizeMb = f.size / (1024 * 1024);
    if (sizeMb > MAX_MB) {
      setBanner({ type: "error", text: `File is too large. Max size is ${MAX_MB}MB.` });
      return;
    }

    setFile(f);
    setFileHash(null);
    setHashing(true);
    setStage("hashing");

    const h = await sha256Hex(f);
    setFileHash(h);
    setHashing(false);
    setStage("idle");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void onPickFile(f);
  }

  async function fetchDuplicateDetailsByHash(hash: string): Promise<DuplicateInfo | null> {
    // Attempt: with join
    const withJoin = await supabase
      .from("study_materials")
      .select("id,title,material_type,session,created_at,study_courses:course_id(course_code,level,semester)")
      .eq("file_hash", hash)
      .limit(1)
      .maybeSingle();

    if (!withJoin.error && withJoin.data) {
      const d: any = withJoin.data;
      return {
        id: d.id,
        title: d.title ?? null,
        material_type: d.material_type ?? null,
        session: d.session ?? null,
        created_at: d.created_at ?? null,
        course_code: d.study_courses?.course_code ?? null,
        course_level: d.study_courses?.level ?? null,
        course_semester: d.study_courses?.semester ?? null,
      };
    }

    // Fallback without join
    const plain = await supabase
      .from("study_materials")
      .select("id,title,material_type,session,created_at")
      .eq("file_hash", hash)
      .limit(1)
      .maybeSingle();

    if (!plain.error && plain.data) {
      const d: any = plain.data;
      return {
        id: d.id,
        title: d.title ?? null,
        material_type: d.material_type ?? null,
        session: d.session ?? null,
        created_at: d.created_at ?? null,
      };
    }

    return null;
  }

  async function checkDuplicateByHash() {
    if (!fileHash) return false;
    const info = await fetchDuplicateDetailsByHash(fileHash);
    if (info?.id) {
      setDuplicateInfo(info);
      setDuplicateOpen(true);
      return true;
    }
    return false;
  }

  async function checkDuplicateByMetadata(materialCourseId: string) {
    const t = normalizeText(title);
    if (!t) return false;

    let q = supabase
      .from("study_materials")
      .select("id,title,material_type,session,created_at,study_courses:course_id(course_code,level,semester)")
      .eq("course_id", materialCourseId)
      .eq("material_type", materialType)
      .ilike("title", t);

    const s = normalizeText(session);
    if (s) q = q.eq("session", s);

    const res = await q.limit(1).maybeSingle();
    if (!res.error && res.data?.id) {
      const d: any = res.data;
      setDuplicateInfo({
        id: d.id,
        title: d.title ?? null,
        material_type: d.material_type ?? null,
        session: d.session ?? null,
        created_at: d.created_at ?? null,
        course_code: d.study_courses?.course_code ?? null,
        course_level: d.study_courses?.level ?? null,
        course_semester: d.study_courses?.semester ?? null,
      });
      setDuplicateOpen(true);
      return true;
    }

    return false;
  }

  function step1Valid() {
    return Boolean(courseId);
  }

  function step2Errors() {
    const errors: Record<string, string> = {};
    const t = normalizeText(title);
    if (!t) errors.title = "Title is required.";
    else if (t.length < 6) errors.title = "Make the title a bit longer (min 6 chars).";

    if (session.trim() && !isValidSession(session)) errors.session = "Use format like 2023/2024.";

    if (!materialType) errors.materialType = "Select a material type.";

    return errors;
  }

  function step2Valid() {
    return Object.keys(step2Errors()).length === 0;
  }

  function step3Valid() {
    if (!file) return false;
    // If hashing is supported, strongly prefer having a hash before submission
    if (hashing) return false;
    return true;
  }

  async function nextStep() {
    setBanner(null);

    if (step === 1) {
      if (!step1Valid()) {
        setBanner({ type: "error", text: "Please select a course to continue." });
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      const errs = step2Errors();
      if (Object.keys(errs).length) {
        setBanner({ type: "error", text: "Please fix the highlighted fields before continuing." });
        return;
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!step3Valid()) {
        setBanner({ type: "error", text: "Please add a valid file before continuing." });
        return;
      }

      // Friendly duplicate checks before review
      const dupHash = await checkDuplicateByHash();
      if (dupHash) return;

      const dupMeta = await checkDuplicateByMetadata(courseId);
      if (dupMeta) return;

      setStep(4);
      return;
    }
  }

  function prevStep() {
    setBanner(null);
    if (step === 1) {
      router.push("/study/materials");
      return;
    }
    setStep((s) => (s === 4 ? 3 : s === 3 ? 2 : 1));
  }

  async function submitRequest() {
    setBanner(null);

    const code = normalizeCourseCode(reqCourseCode);
    const titleT = normalizeText(reqCourseTitle);

    if (!reqFacultyId || !reqDepartmentId || !reqLevel || !reqSemester || !code) {
      setBanner({ type: "error", text: "Please fill faculty, department, level, semester and course code." });
      return;
    }

    if (code.length < 3) {
      setBanner({ type: "error", text: "Course code looks too short." });
      return;
    }

    try {
      setRequestSubmitting(true);

      // If you have a request table, insert there.
      // If not, this will fail gracefully and we show a message.
      const res = await supabase.from("study_course_requests").insert({
        faculty_id: reqFacultyId,
        department_id: reqDepartmentId,
        level: Number(reqLevel),
        semester: reqSemester,
        course_code: code,
        course_title: titleT || null,
        status: "pending",
      });

      if (res.error) {
        setBanner({
          type: "warn",
          text: "Request table not found or not permitted. Tell your admin to enable course requests, or add the course in admin.",
        });
        setRequestSubmitting(false);
        return;
      }

      setRequestSubmitting(false);
      setRequestOpen(false);
      setBanner({ type: "success", text: "Request submitted! An admin will review it soon." });

      // Reset
      setReqFacultyId("");
      setReqDepartmentId("");
      setReqLevel("");
      setReqSemester("first");
      setReqCourseCode("");
      setReqCourseTitle("");
    } catch {
      setRequestSubmitting(false);
      setBanner({ type: "error", text: "Failed to submit request. Please try again." });
    }
  }

  async function submitUpload() {
    setBanner(null);

    if (!step1Valid()) {
      setBanner({ type: "error", text: "Please select a course." });
      setStep(1);
      return;
    }
    if (!step2Valid()) {
      setBanner({ type: "error", text: "Please fix the form fields first." });
      setStep(2);
      return;
    }
    if (!file) {
      setBanner({ type: "error", text: "Please add a file to upload." });
      setStep(3);
      return;
    }

    // One more duplicate check right before upload (race safety)
    const dupHash = await checkDuplicateByHash();
    if (dupHash) return;

    const dupMeta = await checkDuplicateByMetadata(courseId);
    if (dupMeta) return;

    setSubmitting(true);
    setStage("uploading");

    try {
      // Auth
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      const uploaderId = user?.id ?? null;
      const uploaderEmail = user?.email ?? null;

      const ext = (() => {
        const n = (file.name || "").toLowerCase();
        if (n.endsWith(".pdf")) return "pdf";
        if (n.endsWith(".png")) return "png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "jpg";
        if (n.endsWith(".webp")) return "webp";
        if (n.endsWith(".pptx")) return "pptx";
        // fallback
        return "bin";
      })();

      const code = selectedCourse?.course_code ? normalizeCourseCode(selectedCourse.course_code) : "COURSE";
      const safeName = sanitizeFilename(file.name || "file");
      const hashPart = fileHash ? fileHash.slice(0, 12) : safeUuid();
      const path = `materials/${code}/${materialType}/${session.trim() || "na"}/${hashPart}-${safeName}.${ext}`;

      const uploadRes = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });

      if (uploadRes.error) {
        setSubmitting(false);
        setStage("idle");
        setBanner({ type: "error", text: uploadRes.error.message ?? "Upload failed." });
        return;
      }

      setStage("saving");

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

      // Pull metadata from course
      const c = selectedCourse ?? courses.find((x) => x.id === courseId) ?? null;

      const payload = {
        title: normalizeText(title),
        description: normalizeText(description) || null,
        material_type: materialType,
        course_id: courseId,
        course_code: c?.course_code ?? null,
        level: c?.level ?? null,
        semester: c?.semester ?? null,
        faculty: c?.faculty ?? null,
        department: c?.department ?? null,
        session: normalizeText(session) || null,
        file_path: path,
        file_url: pub?.publicUrl ?? null,
        uploader_id: uploaderId,
        uploader_email: uploaderEmail,
        file_hash: fileHash,
        approved: false,
      };

      const insertRes = await supabase.from("study_materials").insert(payload);

      if (insertRes.error) {
        // If DB insert fails, the file might already be uploaded; show a helpful message.
        setSubmitting(false);
        setStage("idle");
        setBanner({
          type: "error",
          text:
            insertRes.error.message ??
            "Uploaded file, but failed to save record. Please contact admin or try again.",
        });
        return;
      }

      setSubmitting(false);
      setStage("done");

      setBanner({
        type: "success",
        text: "Uploaded successfully! Your submission will appear after approval.",
      });

      // Reset + success UX
      setTimeout(() => {
        router.push("/study/materials");
      }, 700);
    } catch {
      setSubmitting(false);
      setStage("idle");
      setBanner({ type: "error", text: "Something went wrong. Please try again." });
    }
  }

  const stepDone = useMemo(() => {
    return {
      s1: step > 1 && step1Valid(),
      s2: step > 2 && step2Valid(),
      s3: step > 3 && step3Valid(),
    };
  }, [step, courseId, title, session, materialType, file, hashing]);

  const step2Errs = useMemo(() => step2Errors(), [title, session, materialType]);

  const selectedCourseCard = selectedCourse ? (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-foreground">{normalizeCourseCode(selectedCourse.course_code)}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {selectedCourse.course_title ?? "Course"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-background px-2 py-1">{selectedCourse.level}L</span>
            <span className="rounded-full border border-border bg-background px-2 py-1">
              {String(selectedCourse.semester).toUpperCase()}
            </span>
            <span className="rounded-full border border-border bg-background px-2 py-1">
              {normalizeText(selectedCourse.department)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setCourseId("");
            setSelectedCourse(null);
          }}
          className="rounded-2xl border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Change
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <PageHeader
        title="Upload material"
        subtitle="Submit files for review. Keep titles clear so students can find them fast."
        right={
          <Link
            href="/study/materials"
            className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        }
      />

      <BannerBox banner={banner} onClose={() => setBanner(null)} />

      {/* Stepper */}
      <Card className="rounded-3xl">
        <div className="flex items-center justify-between gap-2">
          <StepPill
            n={1}
            label="Course"
            active={step === 1}
            done={stepDone.s1}
            clickable={step > 1}
            onClick={() => setStep(1)}
          />
          <div className="h-[2px] flex-1 rounded bg-border/60" />
          <StepPill
            n={2}
            label="Details"
            active={step === 2}
            done={stepDone.s2}
            clickable={step > 2}
            onClick={() => setStep(2)}
          />
          <div className="h-[2px] flex-1 rounded bg-border/60" />
          <StepPill
            n={3}
            label="File"
            active={step === 3}
            done={stepDone.s3}
            clickable={step > 3}
            onClick={() => setStep(3)}
          />
          <div className="h-[2px] flex-1 rounded bg-border/60" />
          <StepPill n={4} label="Review" active={step === 4} done={false} clickable={false} />
        </div>

        {/* Micro progress */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-background px-2 py-1">
            Stage:{" "}
            <span className="font-bold text-foreground">
              {stage === "idle"
                ? "Ready"
                : stage === "hashing"
                ? "Hashing"
                : stage === "uploading"
                ? "Uploading"
                : stage === "saving"
                ? "Saving"
                : "Done"}
            </span>
          </span>
          <span className="rounded-full border border-border bg-background px-2 py-1">
            Max file size: <span className="font-bold text-foreground">{MAX_MB}MB</span>
          </span>
          <span className="rounded-full border border-border bg-background px-2 py-1">
            Past questions: <span className="font-bold text-foreground">PDF / Images</span>
          </span>
        </div>
      </Card>

      {/* Step content */}
      {step === 1 ? (
        <Card className="rounded-3xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-foreground">Step 1 — Select course</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Search by course code or title. Use filters to narrow results.
              </p>
            </div>

            <Button variant="secondary" onClick={() => setRequestOpen(true)}>
              <Plus className="h-4 w-4" />
              Request course
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            {selectedCourseCard}

            {!selectedCourse ? (
              <>
                {/* Search + filters */}
                <div className="grid gap-2 sm:grid-cols-[1fr,160px,180px]">
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      value={courseSearch}
                      onChange={(e) => setCourseSearch(e.target.value)}
                      placeholder="Search course code or title…"
                      className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {courseSearch ? (
                      <button
                        type="button"
                        onClick={() => setCourseSearch("")}
                        className="rounded-xl p-1 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        aria-label="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  <select
                    value={courseLevelFilter}
                    onChange={(e) => setCourseLevelFilter(e.target.value)}
                    className="rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none"
                  >
                    <option value="">Any level</option>
                    <option value="100">100L</option>
                    <option value="200">200L</option>
                    <option value="300">300L</option>
                    <option value="400">400L</option>
                    <option value="500">500L</option>
                  </select>

                  <select
                    value={courseSemesterFilter}
                    onChange={(e) => setCourseSemesterFilter(e.target.value as any)}
                    className="rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none"
                  >
                    <option value="">Any semester</option>
                    <option value="first">First</option>
                    <option value="second">Second</option>
                    <option value="summer">Summer</option>
                  </select>
                </div>

                {/* Results */}
                <div className="mt-2">
                  {loadingCourses ? (
                    <div className="grid gap-3">
                      <SkeletonCard />
                      <SkeletonCard />
                      <SkeletonCard lines={3} />
                    </div>
                  ) : courses.length === 0 ? (
                    <EmptyState
                      title="No courses found"
                      description="Try a different search term, or request this course to be added."
                      action={
                        <Button variant="secondary" onClick={() => setRequestOpen(true)}>
                          <Plus className="h-4 w-4" />
                          Request course
                        </Button>
                      }
                      icon={<BookOpen className="h-5 w-5 text-muted-foreground" />}
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {courses.map((c) => {
                        const active = c.id === courseId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCourseId(c.id);
                              setSelectedCourse(c);
                              setBanner(null);
                            }}
                            className={cn(
                              "text-left rounded-3xl border p-4 shadow-sm transition",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                              active ? "border-border bg-secondary/60" : "border-border/70 bg-card hover:bg-secondary/40"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-extrabold text-foreground">
                                  {normalizeCourseCode(c.course_code)}
                                </p>
                                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                  {c.course_title ?? "Course"}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <span className="rounded-full border border-border bg-background px-2 py-1">
                                    {c.level}L
                                  </span>
                                  <span className="rounded-full border border-border bg-background px-2 py-1">
                                    {String(c.semester).toUpperCase()}
                                  </span>
                                  <span className="rounded-full border border-border bg-background px-2 py-1">
                                    {normalizeText(c.department)}
                                  </span>
                                </div>
                              </div>
                              <div
                                className={cn(
                                  "mt-0.5 grid h-9 w-9 place-items-center rounded-2xl border bg-background",
                                  active ? "border-border" : "border-border/70"
                                )}
                              >
                                {active ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="rounded-3xl">
          <p className="text-sm font-extrabold text-foreground">Step 2 — Details</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Make the title descriptive so students can find it quickly.
          </p>

          <div className="mt-4 grid gap-4">
            {selectedCourseCard}

            <div className="grid gap-3 sm:grid-cols-2">
              <TypeTile
                active={materialType === "past_question"}
                icon={<FileText className="h-5 w-5 text-muted-foreground" />}
                title="Past Questions"
                subtitle="PDF/images only (recommended)"
                onClick={() => setMaterialType("past_question")}
              />
              <TypeTile
                active={materialType === "handout"}
                icon={<BookOpen className="h-5 w-5 text-muted-foreground" />}
                title="Handout"
                subtitle="Lecture handouts or guides"
                onClick={() => setMaterialType("handout")}
              />
              <TypeTile
                active={materialType === "slides"}
                icon={<Presentation className="h-5 w-5 text-muted-foreground" />}
                title="Slides"
                subtitle="PDF/images/PPTX"
                onClick={() => setMaterialType("slides")}
              />
              <TypeTile
                active={materialType === "note"}
                icon={<BookOpen className="h-5 w-5 text-muted-foreground" />}
                title="Note"
                subtitle="Personal notes / summaries"
                onClick={() => setMaterialType("note")}
              />
              <TypeTile
                active={materialType === "timetable"}
                icon={<ClockIcon />}
                title="Timetable"
                subtitle="Schedules or calendars"
                onClick={() => setMaterialType("timetable")}
              />
              <TypeTile
                active={materialType === "other"}
                icon={<Plus className="h-5 w-5 text-muted-foreground" />}
                title="Other"
                subtitle="Any other study material"
                onClick={() => setMaterialType("other")}
              />
            </div>

            <Field label="Title" hint="Required" error={step2Errs.title ?? null}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selectedCourse ? `${normalizeCourseCode(selectedCourse.course_code)} ${prettyMaterialType(materialType)}…` : "e.g. BCH 201 Past Questions"}
                className={cn(
                  "w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Session" hint="Optional — 2023/2024" error={step2Errs.session ?? null}>
                <input
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  placeholder="2023/2024"
                  className={cn(
                    "w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                />
              </Field>

              <Field label="Preview" hint="How it will appear">
                <div className="rounded-2xl border border-border bg-card px-3 py-2 text-sm">
                  <p className="font-extrabold text-foreground">{filteredCoursesPreview || "—"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedCourse ? normalizeText(selectedCourse.department) : "Select a course first"}
                  </p>
                </div>
              </Field>
            </div>

            <Field label="Description" hint="Optional">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add helpful context (topics covered, year, lecturer, etc.)"
                className={cn(
                  "min-h-[100px] w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              />
            </Field>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="rounded-3xl">
          <p className="text-sm font-extrabold text-foreground">Step 3 — File</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag & drop or pick a file. For past questions: PDF/images only.
          </p>

          <div className="mt-4 grid gap-4">
            {selectedCourseCard}

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "rounded-3xl border border-dashed p-4 transition",
                dragOver ? "border-border bg-secondary/40" : "border-border/70 bg-card"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background">
                  <UploadCloud className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-foreground">Drop your file here</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Accepted: PDF, images (PNG/JPG/WebP){materialType === "slides" ? ", PPTX" : ""}. Max {MAX_MB}MB.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onPickFile(f);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    />
                    <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                      <Plus className="h-4 w-4" />
                      Choose file
                    </Button>

                    {file ? (
                      <Button variant="ghost" onClick={resetFile}>
                        <X className="h-4 w-4" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* File card */}
            {file ? (
              <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-foreground line-clamp-1">{file.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border bg-background px-2 py-1">{fileBadge(file)}</span>
                      <span className="rounded-full border border-border bg-background px-2 py-1">
                        {(file.size / (1024 * 1024)).toFixed(2)}MB
                      </span>
                      <span className="rounded-full border border-border bg-background px-2 py-1">
                        {prettyMaterialType(materialType)}
                      </span>
                    </div>

                    {/* Hash status */}
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      {hashing ? (
                        <span className="font-semibold text-muted-foreground">Hashing file…</span>
                      ) : fileHash ? (
                        <span className="font-semibold text-muted-foreground">
                          Hash: <span className="font-extrabold text-foreground">{fileHash.slice(0, 12)}…</span>
                        </span>
                      ) : (
                        <span className="font-semibold text-muted-foreground">Hash not available (browser limitation).</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background">
                    {fileBadge(file) === "PDF" ? (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    ) : fileBadge(file) === "IMAGE" ? (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Presentation className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card className="rounded-3xl">
          <p className="text-sm font-extrabold text-foreground">Step 4 — Review & submit</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Double-check everything. Submissions are reviewed before appearing publicly.
          </p>

          <div className="mt-4 grid gap-3">
            {selectedCourseCard}

            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-bold text-muted-foreground">TITLE</p>
              <p className="mt-1 text-sm font-extrabold text-foreground">{normalizeText(title) || "—"}</p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold text-muted-foreground">TYPE</p>
                  <p className="mt-1 text-sm font-extrabold text-foreground">{prettyMaterialType(materialType)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground">SESSION</p>
                  <p className="mt-1 text-sm font-extrabold text-foreground">{normalizeText(session) || "—"}</p>
                </div>
              </div>

              {description.trim() ? (
                <>
                  <p className="mt-4 text-xs font-bold text-muted-foreground">DESCRIPTION</p>
                  <p className="mt-1 text-sm text-foreground">{normalizeText(description)}</p>
                </>
              ) : null}

              <div className="mt-4 rounded-2xl border border-border bg-background p-3">
                <p className="text-xs font-bold text-muted-foreground">FILE</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">{file?.name ?? "—"}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <p className="text-sm font-extrabold text-foreground">What happens next?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your upload is saved and marked <span className="font-bold text-foreground">Pending approval</span>. Once approved,
                it appears in Materials.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setStep(3)} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" />
                Back to file
              </Button>

              <Button variant="primary" onClick={submitUpload} loading={submitting}>
                <UploadCloud className="h-4 w-4" />
                Submit upload
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Sticky footer nav (mobile-first) */}
      <div
        className="sticky bottom-0 z-40 -mx-4 border-t border-border bg-background/80 backdrop-blur md:mx-0 md:rounded-2xl md:border md:bg-card"
        style={{ paddingBottom: APP_BOTTOM_NAV_H }}
      >
        <div className="px-4 py-3 md:py-2">
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={prevStep} disabled={submitting}>
              <ArrowLeft className="h-4 w-4" />
              {step === 1 ? "Back" : "Previous"}
            </Button>

            <div className="flex items-center gap-2">
              {step < 4 ? (
                <Button
                  variant="primary"
                  onClick={nextStep}
                  disabled={
                    submitting ||
                    (step === 1 && !step1Valid()) ||
                    (step === 2 && !step2Valid()) ||
                    (step === 3 && !step3Valid())
                  }
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="primary" onClick={submitUpload} loading={submitting}>
                  <UploadCloud className="h-4 w-4" />
                  Submit
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Duplicate modal */}
      <ModalShell
        open={duplicateOpen}
        title="Duplicate detected"
        subtitle="This looks like it already exists in the library."
        onClose={() => setDuplicateOpen(false)}
      >
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-foreground">
                {duplicateInfo?.title ?? "A similar material already exists"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {duplicateInfo?.course_code ? (
                  <>
                    {duplicateInfo.course_code}
                    {duplicateInfo.course_level ? ` • ${duplicateInfo.course_level}L` : ""}
                    {duplicateInfo.course_semester ? ` • ${String(duplicateInfo.course_semester).toUpperCase()}` : ""}
                  </>
                ) : (
                  "Duplicate found via hash or metadata."
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {duplicateInfo?.material_type ? (
                  <span className="rounded-full border border-border bg-background px-2 py-1">
                    {String(duplicateInfo.material_type).replaceAll("_", " ")}
                  </span>
                ) : null}
                {duplicateInfo?.session ? (
                  <span className="rounded-full border border-border bg-background px-2 py-1">{duplicateInfo.session}</span>
                ) : null}
                {duplicateInfo?.id ? (
                  <span className="rounded-full border border-border bg-background px-2 py-1">ID: {duplicateInfo.id}</span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDuplicateOpen(false);
                    setBanner({ type: "info", text: "Duplicate blocked. You can change the file/title and try again." });
                    setStep(3);
                  }}
                >
                  Fix & try again
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => {
                    // Allow user to proceed to review anyway (sometimes false positive)
                    setDuplicateOpen(false);
                    setBanner({ type: "warn", text: "Proceeding anyway. Please ensure this isn’t a duplicate." });
                    setStep(4);
                  }}
                >
                  Upload anyway
                </Button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Tip: if you’re uploading a past-question image that already exists, this page will flag it as a duplicate (by hash).
              </p>
            </div>
          </div>
        </div>
      </ModalShell>

      {/* Request course modal */}
      <ModalShell
        open={requestOpen}
        title="Request a course"
        subtitle="If you can’t find it, request it and an admin can add it."
        onClose={() => setRequestOpen(false)}
      >
        {requestLoading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Faculty" hint="Required">
                <select
                  value={reqFacultyId}
                  onChange={(e) => {
                    setReqFacultyId(e.target.value);
                    setReqDepartmentId("");
                  }}
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none"
                >
                  <option value="">Select faculty</option>
                  {faculties.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Department" hint="Required">
                <select
                  value={reqDepartmentId}
                  onChange={(e) => setReqDepartmentId(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none"
                  disabled={!reqFacultyId}
                >
                  <option value="">{reqFacultyId ? "Select department" : "Select faculty first"}</option>
                  {selectedFacultyDepts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.display_name ?? d.official_name ?? "Department"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Level" hint="Required">
                <select
                  value={reqLevel}
                  onChange={(e) => setReqLevel(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none"
                >
                  <option value="">Select level</option>
                  <option value="100">100L</option>
                  <option value="200">200L</option>
                  <option value="300">300L</option>
                  <option value="400">400L</option>
                  <option value="500">500L</option>
                </select>
              </Field>

              <Field label="Semester" hint="Required">
                <select
                  value={reqSemester}
                  onChange={(e) => setReqSemester(e.target.value as Semester)}
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none"
                >
                  <option value="first">First</option>
                  <option value="second">Second</option>
                  <option value="summer">Summer</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Course code" hint="Required">
                <input
                  value={reqCourseCode}
                  onChange={(e) => setReqCourseCode(e.target.value)}
                  placeholder="e.g. BCH 201"
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
                />
              </Field>

              <Field label="Course title" hint="Optional">
                <input
                  value={reqCourseTitle}
                  onChange={(e) => setReqCourseTitle(e.target.value)}
                  placeholder="e.g. Biochemistry II"
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setRequestOpen(false)} disabled={requestSubmitting}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submitRequest} loading={requestSubmitting}>
                <Plus className="h-4 w-4" />
                Submit request
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              If your project doesn’t have <span className="font-bold text-foreground">study_course_requests</span> yet,
              this will show a warning. You can add it later.
            </p>
          </div>
        )}
      </ModalShell>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="text-muted-foreground">
      <path
        fill="currentColor"
        d="M12 1a11 11 0 1 0 11 11A11.012 11.012 0 0 0 12 1m0 20a9 9 0 1 1 9-9a9.01 9.01 0 0 1-9 9m.5-14H11v6l5.25 3.15l.75-1.23l-4.5-2.67Z"
      />
    </svg>
  );
}