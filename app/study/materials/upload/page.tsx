"use client";
// app/study/materials/upload/page.tsx
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  GraduationCap,
  Building2,
  FileText,
  Image as ImageIcon,
  Presentation,
  BookOpen,
  Hash,
  Info,
  X,
  Plus,
  Search,
  ChevronDown,
  Users,
  FileQuestion,
  Calendar,
  Paperclip,
} from "lucide-react";
import { Card, EmptyState, PageHeader } from "../../_components/StudyUI";

// ─── Brand accent ─────────────────────────────────────────────────────────────
const ACCENT      = "#5B35D5";
const ACCENT_BG   = "#EEEDFE";
const ACCENT_TEXT = "#3C3489";

// ─── Types ────────────────────────────────────────────────────────────────────

type Semester     = "first" | "second" | "summer";
type MaterialType = "past_question" | "handout" | "slides" | "note" | "timetable" | "other";
type Role         = "course_rep" | "dept_librarian";
type MeStatus     = "not_applied" | "pending" | "approved" | "rejected";

type CourseRow = {
  id: string;
  faculty_id: string | null;
  department_id: string | null;
  level: number;
  course_code: string;
  course_title: string | null;
  semester: Semester;
};

type RepMeResponse = {
  ok: boolean;
  status?: MeStatus;
  role?: Role | null;
  scope?: {
    faculty_id: string | null;
    department_id: string | null;
    levels: number[] | null;
    all_levels?: boolean;
  } | null;
  application?: {
    decision_reason?: string | null;
    note?: string | null;
    status?: string;
  } | null;
};

type UploadInitResponse =
  | { ok: true; material_id: string; bucket: string; path: string; token: string; auto_approved: boolean }
  | { ok: false; code?: string; message?: string; duplicate_of?: { id: string; title?: string; created_at?: string } | null };

type CreateCourseResponse =
  | { ok: true; course: CourseRow }
  | { ok: false; code?: string; error?: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const MATERIAL_TYPES: Array<{
  key: MaterialType;
  label: string;
  icon: any;
  hint: string;
  accept: string[];
}> = [
  { key: "past_question", label: "Past question", icon: FileQuestion, hint: "Needs year", accept: ["application/pdf", "image/*"] },
  { key: "handout",       label: "Handout",        icon: FileText,    hint: "PDF",        accept: ["application/pdf"] },
  { key: "slides",        label: "Slides",          icon: Presentation,hint: "PDF",        accept: ["application/pdf"] },
  { key: "note",          label: "Lecture note",    icon: BookOpen,    hint: "PDF",        accept: ["application/pdf"] },
  { key: "timetable",     label: "Timetable",       icon: Calendar,    hint: "PDF / img",  accept: ["application/pdf", "image/*"] },
  { key: "other",         label: "Other",            icon: Paperclip,   hint: "PDF / img",  accept: ["application/pdf", "image/*"] },
];

const LEVEL_LABEL = (n: number) => `${n}L`;

// ─── Utilities ────────────────────────────────────────────────────────────────

async function sha256(file: File): Promise<string> {
  const buf     = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function friendlyError(code?: string, message?: string) {
  if (code === "NO_SESSION")              return "Please log in to continue.";
  if (code === "NOT_STUDY_MODERATOR" || code === "NOT_APPROVED") return "You don't have upload access yet.";
  if (code === "REP_SCOPE_MISCONFIGURED") return "Your upload scope isn't set up. Contact admin.";
  if (code === "DUPLICATE_FOUND")         return "This looks like a duplicate of an existing upload.";
  return message || "Something went wrong. Please try again.";
}

function normalizeCourseCode(input: string) {
  const raw = input.trim().toUpperCase().replace(/\s+/g, " ");
  const m = raw.match(/^([A-Z]{2,6})\s*([0-9]{2,4}[A-Z]?)$/);
  if (m) return `${m[1]} ${m[2]}`;
  return raw;
}

function fmtBytes(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UploadMaterialsPage() {
  const router = useRouter();

  // Auth + rep status
  const [loading,  setLoading]  = useState(true);
  const [userId,   setUserId]   = useState<string | null>(null);
  const [me,       setMe]       = useState<RepMeResponse | null>(null);

  const isRep       = me?.ok && me.status === "approved" && !!me.scope?.department_id && !!me.role;
  const role: Role | null = (me?.role as Role) ?? null;
  const departmentId  = me?.scope?.department_id ?? null;
  const allowedLevels = me?.scope?.levels ?? null;

  // Courses
  const [courses,        setCourses]        = useState<CourseRow[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [q,              setQ]              = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [recentCourseIds,  setRecentCourseIds]  = useState<string[]>([]);

  // Create course modal
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [reqCode,     setReqCode]     = useState("");
  const [reqTitle,    setReqTitle]    = useState("");
  const [reqLevel,    setReqLevel]    = useState<number>(0);
  const [reqSemester, setReqSemester] = useState<Semester>("first");
  const [reqLoading,  setReqLoading]  = useState(false);

  // Material form
  const [materialType, setMaterialType] = useState<MaterialType>("past_question");
  const [title,        setTitle]        = useState("");
  const [semester,     setSemester]     = useState<Semester>("first");
  const [description,  setDescription]  = useState("");

  // Past question extras
  const [pqYear,    setPqYear]    = useState<number | "">("");
  const [pqSession, setPqSession] = useState("");

  // File + upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file,           setFile]           = useState<File | null>(null);
  const [fileHash,       setFileHash]       = useState<string | null>(null);
  const [hashing,        setHashing]        = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDragging,     setIsDragging]     = useState(false);

  // Submit + banners
  const [submitting,     setSubmitting]     = useState(false);
  const [banner,         setBanner]         = useState<{ type: "error" | "success" | "info" | "warning"; text: string } | null>(null);
  const [duplicateNote,  setDuplicateNote]  = useState<string | null>(null);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  );

  const acceptStr = useMemo(() => {
    const cfg = MATERIAL_TYPES.find((x) => x.key === materialType);
    return cfg ? cfg.accept.join(",") : "application/pdf,image/*";
  }, [materialType]);

  const scopeBadge = useMemo(() => {
    if (!isRep) return null;
    if (role === "dept_librarian") return "Dept scoped · All levels";
    const lvls = Array.isArray(allowedLevels) && allowedLevels.length
      ? allowedLevels.map(LEVEL_LABEL).join(", ") : "—";
    return `Dept scoped · ${lvls}`;
  }, [isRep, role, allowedLevels]);

  // ── Load auth + rep status ────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setBanner(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          router.replace("/login?next=%2Fstudy%2Fmaterials%2Fupload");
          return;
        }
        if (mounted) setUserId(auth.user.id);
        const meRes: RepMeResponse = await fetch("/api/study/rep-applications/me").then((r) => r.json());
        if (!mounted) return;
        setMe(meRes);
      } catch (e: any) {
        if (!mounted) return;
        setBanner({ type: "error", text: e?.message || "Failed to load." });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  // ── Load recent courses from localStorage ────────────────────────────────

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined"
        ? window.localStorage.getItem("jabuStudy_recentCourseIds") : null;
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr))
          setRecentCourseIds(arr.filter((x) => typeof x === "string").slice(0, 8));
      }
    } catch {}
  }, []);

  // ── Load courses ──────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!userId) return;
      setCoursesLoading(true);
      try {
        let query = supabase
          .from("study_courses")
          .select("id, faculty_id, department_id, level, course_code, course_title, semester")
          .order("level")
          .order("course_code");

        if (isRep && departmentId) {
          query = query.eq("department_id", departmentId);
          if (role === "course_rep") {
            const lvls = Array.isArray(allowedLevels) ? allowedLevels : [];
            if (lvls.length) query = query.in("level", lvls);
          }
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!mounted) return;
        setCourses((data as any) || []);
      } catch (e: any) {
        if (!mounted) return;
        setBanner({ type: "error", text: e?.message || "Failed to load courses." });
      } finally {
        if (mounted) setCoursesLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [userId, isRep, departmentId, role, allowedLevels]);

  // ── Hash file when chosen ─────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDuplicateNote(null);
      setFileHash(null);
      if (!file) return;
      setHashing(true);
      try {
        const h = await sha256(file);
        if (!cancelled) setFileHash(h);
      } catch {
        if (!cancelled) setFileHash(null);
      } finally {
        if (!cancelled) setHashing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredCourses = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      if (!recentCourseIds.length) return courses;
      const set    = new Set(recentCourseIds);
      const recent = recentCourseIds
        .map((id) => courses.find((c) => c.id === id))
        .filter(Boolean) as CourseRow[];
      const rest = courses.filter((c) => !set.has(c.id));
      return [...recent, ...rest];
    }
    return courses.filter((c) => {
      const hay = `${c.course_code} ${c.course_title ?? ""} ${c.level} ${c.semester}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [courses, q, recentCourseIds]);

  const canSubmit = useMemo(() => {
    if (!userId || !selectedCourse || !materialType || !file) return false;
    if (materialType === "past_question") {
      if (!pqYear || typeof pqYear !== "number") return false;
      if (!pqSession || !pqSession.includes("/")) return false;
    }
    return true;
  }, [userId, selectedCourse, materialType, file, pqYear, pqSession]);

  const submitLabel = useMemo(() => {
    if (!selectedCourse) return "Select a course to continue";
    if (!file)           return "Choose a file to continue";
    if (materialType === "past_question" && (!pqYear || !pqSession)) return "Fill year and session to continue";
    return null; // ready — show "Submit upload"
  }, [selectedCourse, file, materialType, pqYear, pqSession]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function resetFile() {
    setFile(null);
    setFileHash(null);
    setDuplicateNote(null);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function materialTitleSuggestion(course: CourseRow | null, type: MaterialType) {
    if (!course) return "";
    const base      = `${course.course_code}${course.course_title ? ` — ${course.course_title}` : ""}`;
    const typeLabel = MATERIAL_TYPES.find((x) => x.key === type)?.label ?? "Material";
    return `${base} (${typeLabel})`;
  }

  function openCreateCourse(prefill?: { code?: string }) {
    const guess = normalizeCourseCode(prefill?.code ?? q.trim());
    if (guess) setReqCode(guess);
    const lvls = Array.isArray(allowedLevels) ? allowedLevels : [];
    setReqLevel(isRep && role === "course_rep" ? (lvls?.[0] ?? 100) : 100);
    setReqSemester(semester);
    setReqTitle("");
    setShowCreateCourse(true);
  }

  function saveRecentCourse(id: string) {
    setRecentCourseIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 8);
      try { window.localStorage.setItem("jabuStudy_recentCourseIds", JSON.stringify(next)); }
      catch {}
      return next;
    });
  }

  function handleFileChange(f: File | null) {
    if (!f) return;
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    if (f) handleFileChange(f);
  }

  async function submitCreateCourse() {
    if (reqLoading) return;
    const code = normalizeCourseCode(reqCode);
    if (!code) { setBanner({ type: "error", text: "Enter a course code." }); return; }
    if (!reqLevel) { setBanner({ type: "error", text: "Select a level." }); return; }
    if (isRep && role === "course_rep" && Array.isArray(allowedLevels) && allowedLevels.length) {
      if (!allowedLevels.includes(reqLevel)) {
        setBanner({ type: "error", text: "You can only create courses for your assigned level(s)." });
        return;
      }
    }
    setReqLoading(true);
    try {
      const res = await fetch("/api/study/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          course_code: code, course_title: reqTitle.trim() || null,
          level: reqLevel, semester: reqSemester,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as CreateCourseResponse;
      if (!res.ok || !data?.ok) {
        const msg = (data as any)?.code === "COURSE_EXISTS"
          ? "That course already exists. Try searching again."
          : (data as any)?.error || "Failed to create course.";
        setBanner({ type: "error", text: msg });
        return;
      }
      const created = (data as any)?.course as CourseRow | undefined;
      if (created?.id) {
        setCourses((prev) => {
          const exists = prev.some((c) => c.id === created.id);
          const next   = exists ? prev : [created, ...prev];
          return next.slice().sort((a, b) => (a.level - b.level) || a.course_code.localeCompare(b.course_code));
        });
        setSelectedCourseId(created.id);
        setQ(created.course_code);
        saveRecentCourse(created.id);
        if (!title.trim()) setTitle(materialTitleSuggestion(created, materialType));
      }
      setBanner({ type: "success", text: "Course created — continue your upload below." });
      setShowCreateCourse(false);
      setReqCode("");
      setReqTitle("");
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message || "Failed to create course." });
    } finally {
      setReqLoading(false);
    }
  }

  async function onSubmit() {
    setBanner(null);
    setDuplicateNote(null);
    if (!userId)        { setBanner({ type: "error", text: "You don't have upload access yet." }); return; }
    if (!selectedCourse){ setBanner({ type: "error", text: "Select a course first." }); return; }
    if (!file)          { setBanner({ type: "error", text: "Choose a file to upload." }); return; }
    if (materialType === "past_question") {
      if (!pqYear || typeof pqYear !== "number") { setBanner({ type: "error", text: "Enter the past question year." }); return; }
      if (!pqSession || !pqSession.includes("/")) { setBanner({ type: "error", text: "Enter session like 2022/2023." }); return; }
    }
    const finalTitle = (title || "").trim() || materialTitleSuggestion(selectedCourse, materialType);
    setSubmitting(true);
    setUploadProgress(null);
    try {
      const initRes = await fetch("/api/study/materials/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          course_id:          selectedCourse.id,
          department_id:      selectedCourse.department_id,
          faculty_id:         selectedCourse.faculty_id,
          level:              selectedCourse.level,
          semester:           selectedCourse.semester,
          material_type:      materialType,
          title:              finalTitle,
          description:        description.trim() || null,
          past_question_year: materialType === "past_question" ? pqYear : null,
          session:            materialType === "past_question" ? pqSession.trim() : null,
          file_name:          file.name,
          file_size:          file.size,
          mime_type:          file.type,
          file_hash:          fileHash,
        }),
      }).then((r) => r.json() as Promise<UploadInitResponse>);

      if (!initRes.ok) {
        if (initRes.code === "DUPLICATE_FOUND") {
          setDuplicateNote(
            initRes.duplicate_of?.title
              ? `Matches "${initRes.duplicate_of.title}".`
              : "This file matches an existing upload."
          );
          setBanner({ type: "error", text: "Duplicate detected. Verify before uploading again." });
          return;
        }
        throw new Error(friendlyError(initRes.code, initRes.message));
      }

      const { bucket, path, token, material_id, auto_approved } = initRes;
      setUploadProgress(0);
      const { error: uploadErr } = await (supabase.storage.from(bucket) as any).uploadToSignedUrl(
        path, token, file,
        {
          onUploadProgress: (progress: { loaded: number; total: number }) => {
            if (progress.total > 0)
              setUploadProgress(Math.round((progress.loaded / progress.total) * 100));
          },
        }
      );
      if (uploadErr) throw new Error((uploadErr as any).message || "File upload failed.");
      setUploadProgress(100);

      setBanner({
        type: "success",
        text: auto_approved
          ? "Uploaded and live — visible to students now."
          : "Uploaded — in the review queue. You'll be notified when approved.",
      });

      try {
        const { data } = await supabase.auth.getSession();
        const bearer   = data.session?.access_token;
        const res = await fetch("/api/study/materials/upload/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
          body: JSON.stringify({ material_id }),
        });
        const j = await res.json().catch(() => null);
        if (j?.ok === true && j?.verified_in_storage === false) {
          setBanner({
            type: "warning",
            text: "Upload recorded but file wasn't found in storage. Please try again.",
          });
        }
      } catch {}

      setTitle("");
      setDescription("");
      setPqYear("");
      setPqSession("");
      resetFile();
      window.scrollTo({ top: 0, behavior: "smooth" });
      void material_id;
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message || "Upload failed." });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-28 md:pb-6">

      {/* Top bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href="/study/materials"
            className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Link
            href="/study/materials/my"
            className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/50"
          >
            My uploads
          </Link>
        </div>

        {/* Rep / student badge — desktop only */}
        {isRep ? (
          <div className="hidden items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground sm:flex">
            {role === "dept_librarian" ? <Building2 className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
            <span className="font-medium">{role === "dept_librarian" ? "Dept librarian" : "Course rep"}</span>
            <span className="opacity-40">·</span>
            <span className="truncate">{scopeBadge}</span>
          </div>
        ) : userId ? (
          <div className="hidden items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground sm:flex">
            <Users className="h-4 w-4" />
            <span>Student upload</span>
          </div>
        ) : null}
      </div>

      {/* Page header */}
      <div>
        <h1 className="text-lg font-medium text-foreground">Upload materials</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Anyone can contribute — uploads go to a review queue before going live.
        </p>
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={cn(
            "rounded-2xl border p-4",
            banner.type === "success" && "border-emerald-300/40 bg-emerald-100/30 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200",
            banner.type === "error"   && "border-rose-300/40 bg-rose-100/30 text-rose-900 dark:bg-rose-950/20 dark:text-rose-200",
            banner.type === "info"    && "border-amber-300/40 bg-amber-100/30 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200",
            banner.type === "warning" && "border-amber-300/40 bg-amber-100/30 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200"
          )}
        >
          <div className="flex items-start gap-2">
            {banner.type === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            {banner.type === "error"   && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            {(banner.type === "info" || banner.type === "warning") && <Info className="mt-0.5 h-4 w-4 shrink-0" />}
            <div className="min-w-0 text-sm">
              <p>{banner.text}</p>
              {duplicateNote && <p className="mt-1 text-xs opacity-75">{duplicateNote}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Loading / auth gate */}
      {loading ? (
        <Card className="rounded-3xl">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        </Card>
      ) : !userId ? (
        <Card className="rounded-3xl">
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Sign in to upload"
            description="You need to be logged in to contribute materials."
            action={
              <Link
                href="/login?next=%2Fstudy%2Fmaterials%2Fupload"
                className="inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium text-white"
                style={{ background: ACCENT }}
              >
                Sign in
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* ── Section: Course ─────────────────────────────────────────── */}
          <section className="space-y-3" id="course-picker">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Course
            </p>

            {/* Search row */}
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search course code or title…"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {coursesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <button
                type="button"
                onClick={() => openCreateCourse({ code: q })}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-medium text-white"
                style={{ background: ACCENT }}
              >
                <Plus className="h-4 w-4" /> Create
              </button>
            </div>

            {/* Selected course chip */}
            {selectedCourse && (
              <div
                className="flex items-center justify-between gap-2 rounded-2xl border px-3 py-2.5"
                style={{ borderColor: ACCENT, background: ACCENT_BG }}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: ACCENT_TEXT }}>
                    {selectedCourse.course_code}
                  </p>
                  <p className="truncate text-xs" style={{ color: "#534AB7" }}>
                    {selectedCourse.course_title ?? "—"} · {LEVEL_LABEL(selectedCourse.level)} · {selectedCourse.semester}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCourseId("")}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border px-2 py-1 text-xs"
                  style={{ borderColor: "#AFA9EC", color: ACCENT_TEXT, background: "#fff" }}
                >
                  Change <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Course results list */}
            {!selectedCourse && (
              <div className="rounded-2xl border border-border bg-background overflow-hidden">
                {filteredCourses.length === 0 && q.trim() ? (
                  <div className="p-4">
                    <p className="text-sm font-medium text-foreground">No matching courses found</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Create the course (within your scope) and upload immediately.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openCreateCourse({ code: q })}
                        className="rounded-2xl px-3 py-2 text-xs font-medium text-white"
                        style={{ background: ACCENT }}
                      >
                        Create course
                      </button>
                      <Link
                        href="/study/materials"
                        className="rounded-2xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground no-underline hover:bg-secondary/50"
                      >
                        Browse materials
                      </Link>
                    </div>
                  </div>
                ) : filteredCourses.length === 0 ? null : (
                  <div className="divide-y divide-border max-h-72 overflow-auto">
                    {filteredCourses.map((c) => {
                      const active = c.id === selectedCourseId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCourseId(c.id);
                            setSemester(c.semester);
                            saveRecentCourse(c.id);
                            if (!title.trim()) setTitle(materialTitleSuggestion(c, materialType));
                          }}
                          className={cn(
                            "w-full px-4 py-3 text-left transition hover:bg-secondary/40",
                            active ? "bg-secondary" : "bg-background"
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{c.course_code}</p>
                              <p className="truncate text-xs text-muted-foreground">{c.course_title ?? "—"}</p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {LEVEL_LABEL(c.level)} · {c.semester}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Section: Material type ──────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Material type
            </p>

            <div className="grid grid-cols-3 gap-2">
              {MATERIAL_TYPES.map((t) => {
                const active = t.key === materialType;
                const Icon   = t.icon;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setMaterialType(t.key);
                      if (selectedCourse && (!title.trim() || title === materialTitleSuggestion(selectedCourse, materialType))) {
                        setTitle(materialTitleSuggestion(selectedCourse, t.key));
                      }
                    }}
                    className={cn(
                      "flex flex-col items-center rounded-2xl border py-3 px-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                    style={
                      active
                        ? { borderColor: ACCENT, background: ACCENT_BG }
                        : { borderColor: "var(--color-border-tertiary)", background: "var(--color-background-primary)" }
                    }
                  >
                    <Icon
                      className="h-4 w-4 mb-1.5"
                      style={{ color: active ? ACCENT : "var(--color-text-secondary)" }}
                    />
                    <span
                      className="text-[11px] font-medium leading-tight"
                      style={{ color: active ? ACCENT_TEXT : "var(--color-text-primary)" }}
                    >
                      {t.label}
                    </span>
                    <span
                      className="mt-0.5 text-[10px]"
                      style={{ color: active ? "#534AB7" : "var(--color-text-tertiary)" }}
                    >
                      {t.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Section: Details ────────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Details
            </p>

            {/* Title */}
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Auto-filled — you can edit"
                className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-border/80"
              />
            </label>

            {/* Semester + Level */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Semester</span>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value as Semester)}
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
                >
                  <option value="first">First</option>
                  <option value="second">Second</option>
                  <option value="summer">Summer</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Level</span>
                <select
                  value={selectedCourse?.level ?? ""}
                  disabled
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground opacity-60 outline-none"
                >
                  {selectedCourse
                    ? <option value={selectedCourse.level}>{LEVEL_LABEL(selectedCourse.level)}</option>
                    : <option value="">—</option>
                  }
                </select>
              </label>
            </div>

            {/* Past question extras — only when type = past_question */}
            {materialType === "past_question" && (
              <div className="rounded-2xl bg-secondary/50 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Past question — extra fields</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Year</span>
                    <input
                      inputMode="numeric"
                      value={pqYear}
                      onChange={(e) => setPqYear(e.target.value ? Number(e.target.value) : "")}
                      placeholder="e.g. 2021"
                      className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Session</span>
                    <input
                      value={pqSession}
                      onChange={(e) => setPqSession(e.target.value)}
                      placeholder="2022/2023"
                      className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Notes */}
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Notes <span className="font-normal opacity-60">(optional)</span>
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Lecturer name, which section it covers…"
                rows={2}
                className="w-full resize-none rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          </section>

          {/* ── Section: File ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">File</p>

            {/* Hidden actual input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptStr}
              className="sr-only"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />

            {file ? (
              /* File selected state */
              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fmtBytes(file.size)} · {file.type || "unknown type"}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Hash className="h-3.5 w-3.5" />
                      {hashing
                        ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Computing hash…</span>
                        : fileHash
                        ? <span className="truncate">SHA-256: {fileHash.slice(0, 20)}…</span>
                        : "Hash unavailable"
                      }
                    </p>
                    {duplicateNote && (
                      <p className="mt-2 text-xs text-rose-700 dark:text-rose-400">
                        Duplicate: {duplicateNote}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={resetFile}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-background hover:bg-secondary/50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Upload progress */}
                {uploadProgress !== null && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{uploadProgress < 100 ? "Uploading…" : "Complete"}</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${uploadProgress}%`,
                          background: uploadProgress === 100 ? "#1D9E75" : ACCENT,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Drop zone */
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition",
                  isDragging ? "bg-secondary/50" : "bg-background hover:bg-secondary/30"
                )}
                style={{ borderColor: isDragging ? ACCENT : "var(--color-border-secondary)" }}
              >
                <UploadCloud
                  className="mx-auto h-8 w-8 mb-3"
                  style={{ color: isDragging ? ACCENT : "var(--color-text-tertiary)" }}
                />
                <p className="text-sm font-medium text-foreground">Drop your file here</p>
                <p className="mt-1 text-xs text-muted-foreground">or tap to browse</p>
                <div className="mt-4 inline-block rounded-2xl border border-border bg-background px-4 py-2 text-xs font-medium text-foreground">
                  Choose file
                </div>
                <p className="mt-3 text-[10px] text-muted-foreground">
                  {acceptStr.includes("image") ? "PDF or image · Max 20 MB" : "PDF preferred · Max 20 MB"}
                </p>
              </div>
            )}

            {/* Review queue notice */}
            <div
              className="flex items-start gap-2.5 rounded-2xl p-3"
              style={{ background: ACCENT_BG }}
            >
              <div
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ background: ACCENT }}
              >
                i
              </div>
              <p className="text-xs leading-relaxed" style={{ color: ACCENT_TEXT }}>
                Your upload goes to a review queue.{" "}
                {isRep
                  ? "As a rep your uploads are auto-approved."
                  : "You'll be notified when it's approved or if there's an issue."
                }
              </p>
            </div>
          </section>

          {/* ── Sticky submit bar ───────────────────────────────────────── */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-4 pt-3 backdrop-blur sm:hidden">
            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={onSubmit}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-medium text-white transition"
              style={{
                background: canSubmit && !submitting ? ACCENT : "var(--color-background-secondary)",
                color: canSubmit && !submitting ? "#fff" : "var(--color-text-tertiary)",
              }}
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                : <><UploadCloud className="h-4 w-4" /> {submitLabel ?? "Submit upload"}</>
              }
            </button>
          </div>

          {/* Desktop submit */}
          <div className="hidden justify-end sm:flex">
            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={onSubmit}
              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-medium text-white transition"
              style={{
                background: canSubmit && !submitting ? ACCENT : "var(--color-background-secondary)",
                color: canSubmit && !submitting ? "#fff" : "var(--color-text-tertiary)",
              }}
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                : <><UploadCloud className="h-4 w-4" /> Submit upload</>
              }
            </button>
          </div>

          {/* ── Create course modal ──────────────────────────────────────── */}
          {showCreateCourse && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
              onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreateCourse(false); }}
            >
              <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-background">
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Create a course</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {isRep && role === "course_rep"
                        ? "Only within your department and assigned level(s)."
                        : "Visible to all students once created."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateCourse(false)}
                    className="rounded-xl p-2 text-muted-foreground hover:bg-secondary/50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Course code</span>
                      <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                        <Hash className="h-4 w-4 text-muted-foreground" />
                        <input
                          value={reqCode}
                          onChange={(e) => setReqCode(e.target.value)}
                          onBlur={() => setReqCode((v) => normalizeCourseCode(v))}
                          placeholder="e.g. CSC 201"
                          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">Auto-formatted to "CSC 201".</p>
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Semester</span>
                      <select
                        value={reqSemester}
                        onChange={(e) => setReqSemester(e.target.value as Semester)}
                        className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
                      >
                        <option value="first">First</option>
                        <option value="second">Second</option>
                        <option value="summer">Summer</option>
                      </select>
                    </label>

                    <label className="block space-y-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-muted-foreground">Course title (optional)</span>
                      <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <input
                          value={reqTitle}
                          onChange={(e) => setReqTitle(e.target.value)}
                          placeholder="e.g. Data Structures"
                          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                        />
                      </div>
                    </label>

                    <label className="block space-y-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-muted-foreground">Level</span>
                      {isRep && role === "course_rep" && Array.isArray(allowedLevels) && allowedLevels.length === 1 ? (
                        <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/50 px-3 py-2 text-sm">
                          <span className="font-medium text-foreground">{LEVEL_LABEL(allowedLevels[0])}</span>
                          <span className="text-xs text-muted-foreground">Locked</span>
                        </div>
                      ) : (
                        <select
                          value={reqLevel || ""}
                          onChange={(e) => setReqLevel(Number(e.target.value))}
                          className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
                        >
                          <option value="" disabled>Select level</option>
                          {(isRep && role === "course_rep"
                            ? Array.isArray(allowedLevels) ? allowedLevels : []
                            : [100, 200, 300, 400, 500, 600, 700, 800, 900]
                          ).map((lvl) => (
                            <option key={lvl} value={lvl}>{LEVEL_LABEL(lvl)}</option>
                          ))}
                        </select>
                      )}
                    </label>
                  </div>

                  <div
                    className="flex items-start gap-2 rounded-2xl p-3 text-xs"
                    style={{ background: ACCENT_BG, color: ACCENT_TEXT }}
                  >
                    <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ACCENT }} />
                    Use official codes (e.g. <strong>CSC 201</strong>). Prevents duplicates and makes search easy.
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setShowCreateCourse(false)}
                      className="rounded-2xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitCreateCourse}
                      disabled={reqLoading}
                      className={cn(
                        "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-medium text-white",
                        reqLoading ? "opacity-60" : ""
                      )}
                      style={{ background: ACCENT }}
                    >
                      {reqLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create course
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}