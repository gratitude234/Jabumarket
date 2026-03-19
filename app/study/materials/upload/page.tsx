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
} from "lucide-react";

import { Card, EmptyState, PageHeader } from "../../_components/StudyUI";

type Semester = "first" | "second" | "summer";
type MaterialType = "past_question" | "handout" | "slides" | "note" | "timetable" | "other";

type Role = "course_rep" | "dept_librarian";
type MeStatus = "not_applied" | "pending" | "approved" | "rejected";

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
  | {
      ok: true;
      material_id: string;
      bucket: string;
      path: string;
      token: string; // for uploadToSignedUrl
    }
  | {
      ok: false;
      code?: string;
      message?: string;
      duplicate_of?: { id: string; title?: string; created_at?: string } | null;
    };

type CreateCourseResponse =
  | { ok: true; course: CourseRow }
  | { ok: false; code?: string; error?: string };

const MATERIAL_TYPES: Array<{
  key: MaterialType;
  label: string;
  icon: any;
  hint: string;
  accept: string[];
}> = [
  { key: "past_question", label: "Past Questions", icon: Hash, hint: "Requires year + session", accept: ["application/pdf", "image/*"] },
  { key: "handout", label: "Handout", icon: FileText, hint: "PDF preferred", accept: ["application/pdf"] },
  { key: "slides", label: "Slides", icon: Presentation, hint: "PDF preferred", accept: ["application/pdf"] },
  { key: "note", label: "Lecture Note", icon: BookOpen, hint: "PDF preferred", accept: ["application/pdf"] },
  { key: "timetable", label: "Timetable", icon: ImageIcon, hint: "PDF or image", accept: ["application/pdf", "image/*"] },
  { key: "other", label: "Other", icon: UploadCloud, hint: "PDF or image", accept: ["application/pdf", "image/*"] },
];

const LEVEL_LABEL = (n: number) => `${n}L`;

// --- Hashing (client) for duplicate UX + server authority ---
async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function friendlyError(code?: string, message?: string) {
  if (code === "NO_SESSION") return "Please log in to continue.";
  if (code === "NOT_STUDY_MODERATOR" || code === "NOT_APPROVED") return "You don’t have upload access yet.";
  if (code === "REP_SCOPE_MISCONFIGURED") return "Your upload scope isn’t set up correctly. Contact admin.";
  if (code === "DUPLICATE_FOUND") return "This looks like a duplicate of an existing upload.";
  return message || "Something went wrong. Please try again.";
}

function normalizeCourseCode(input: string) {
  // Make codes consistent: "csc201" -> "CSC 201"
  const raw = input.trim().toUpperCase().replace(/\s+/g, " ");
  // Insert a space between letters and numbers if missing (simple heuristic)
  const m = raw.match(/^([A-Z]{2,6})\s*([0-9]{2,4}[A-Z]?)$/);
  if (m) return `${m[1]} ${m[2]}`;
  return raw;
}

export default function UploadMaterialsPage() {
  const router = useRouter();

  // auth + status
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [me, setMe] = useState<RepMeResponse | null>(null);

  // Rep info (bonus — reps still see their scope badge)
  const isRep = me?.ok && me.status === "approved" && !!me.scope?.department_id && !!me.role;
  const role: Role | null = (me?.role as Role) ?? null;
  const departmentId = me?.scope?.department_id ?? null;
  const allowedLevels = me?.scope?.levels ?? null;

  // courses
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [q, setQ] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [recentCourseIds, setRecentCourseIds] = useState<string[]>([]);

  // create course (modal)
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [reqCode, setReqCode] = useState("");
  const [reqTitle, setReqTitle] = useState("");
  const [reqLevel, setReqLevel] = useState<number>(0);
  const [reqSemester, setReqSemester] = useState<Semester>("first");
  const [reqLoading, setReqLoading] = useState(false);

  // material form
  const [materialType, setMaterialType] = useState<MaterialType>("past_question");
  const [title, setTitle] = useState("");
  const [semester, setSemester] = useState<Semester>("first");
  const [description, setDescription] = useState("");

  // Past question metadata
  const [pqYear, setPqYear] = useState<number | "">("");
  const [pqSession, setPqSession] = useState(""); // e.g. 2022/2023

  // file
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // submit + banners
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: "error" | "success" | "info" | "warning"; text: string } | null>(null);
  const [duplicateNote, setDuplicateNote] = useState<string | null>(null);

  const selectedCourse = useMemo(() => courses.find((c) => c.id === selectedCourseId) || null, [courses, selectedCourseId]);

  const acceptStr = useMemo(() => {
    const cfg = MATERIAL_TYPES.find((x) => x.key === materialType);
    return cfg ? cfg.accept.join(",") : "application/pdf,image/*";
  }, [materialType]);

  const scopeBadge = useMemo(() => {
    if (!isRep) return null;
    const deptText = "Dept scoped";
    if (role === "dept_librarian") return `${deptText} • All levels`;
    const levelsText = Array.isArray(allowedLevels) && allowedLevels.length ? allowedLevels.map(LEVEL_LABEL).join(", ") : "—";
    return `${deptText} • ${levelsText}`;
  }, [isRep, role, allowedLevels]);

  // Load auth + rep status (rep info is bonus — all students can upload)
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

        // Fetch rep status in background (for scope badge only — not a gate)
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

  // Remember recent course picks (for faster uploads)
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("jabuStudy_recentCourseIds") : null;
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setRecentCourseIds(arr.filter((x) => typeof x === "string").slice(0, 8));
      }
    } catch {}
  }, []);

  // Load courses — all students see all courses; reps see their dept scoped first
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

        // Reps: pre-filter to their dept + levels for convenience (they can still search wider)
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

  // Hash file when chosen
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

    return () => {
      cancelled = true;
    };
  }, [file]);

  const filteredCourses = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      if (!recentCourseIds.length) return courses;
      const set = new Set(recentCourseIds);
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

  function resetFile() {
    setFile(null);
    setFileHash(null);
    setDuplicateNote(null);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function materialTitleSuggestion(course: CourseRow | null, type: MaterialType) {
    if (!course) return "";
    const base = `${course.course_code}${course.course_title ? ` — ${course.course_title}` : ""}`;
    const typeLabel = MATERIAL_TYPES.find((x) => x.key === type)?.label ?? "Material";
    return `${base} (${typeLabel})`;
  }

  const canSubmit = useMemo(() => {
    if (!userId) return false;
    if (!selectedCourse) return false;
    if (!materialType) return false;
    if (!file) return false;

    if (materialType === "past_question") {
      if (!pqYear || typeof pqYear !== "number") return false;
      if (!pqSession || !pqSession.includes("/")) return false;
    }
    return true;
  }, [userId, selectedCourse, materialType, file, pqYear, pqSession]);

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
      try {
        window.localStorage.setItem("jabuStudy_recentCourseIds", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  async function submitCreateCourse() {
    if (reqLoading) return;

    const code = normalizeCourseCode(reqCode);
    if (!code) {
      setBanner({ type: "error", text: "Enter a course code." });
      return;
    }

    if (!reqLevel) {
      setBanner({ type: "error", text: "Select a level." });
      return;
    }

    // Course reps: hard guard on allowed levels (UI already restricts, but keep safe)
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
          course_code: code,
          course_title: reqTitle.trim() || null,
          level: reqLevel,
          semester: reqSemester,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as CreateCourseResponse;

      if (!res.ok || !data?.ok) {
        const msg =
          (data as any)?.code === "COURSE_EXISTS"
            ? "That course already exists. Try searching again."
            : (data as any)?.error || "Failed to create course.";
        setBanner({ type: "error", text: msg });
        return;
      }

      const created = (data as any)?.course as CourseRow | undefined;

      if (created?.id) {
        setCourses((prev) => {
          const exists = prev.some((c) => c.id === created.id);
          const next = exists ? prev : [created, ...prev];
          return next
            .slice()
            .sort((a, b) => (a.level - b.level) || a.course_code.localeCompare(b.course_code));
        });

        setSelectedCourseId(created.id);
        setQ(created.course_code);
        saveRecentCourse(created.id);

        // Nice: auto-fill title if empty
        if (!title.trim()) setTitle(materialTitleSuggestion(created, materialType));
      }

      setBanner({ type: "success", text: "Course created. Continue your upload 👇" });
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

    if (!userId) {
      setBanner({ type: "error", text: "You don’t have upload access yet." });
      return;
    }

    if (!selectedCourse) {
      setBanner({ type: "error", text: "Select a course first." });
      return;
    }

    if (!file) {
      setBanner({ type: "error", text: "Choose a file to upload." });
      return;
    }

    if (materialType === "past_question") {
      if (!pqYear || typeof pqYear !== "number") {
        setBanner({ type: "error", text: "Enter the past question year." });
        return;
      }
      if (!pqSession || !pqSession.includes("/")) {
        setBanner({ type: "error", text: "Enter session like 2022/2023." });
        return;
      }
    }

    // Title: auto-suggest if empty
    const finalTitle = (title || "").trim() || materialTitleSuggestion(selectedCourse, materialType);

    setSubmitting(true);
    setUploadProgress(null);
    try {
      const initRes = await fetch("/api/study/materials/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          course_id: selectedCourse.id,
          department_id: selectedCourse.department_id,
          faculty_id: selectedCourse.faculty_id,
          level: selectedCourse.level,
          semester: selectedCourse.semester,
          material_type: materialType,
          title: finalTitle,
          description: description.trim() || null,
          past_question_year: materialType === "past_question" ? pqYear : null,
          session: materialType === "past_question" ? pqSession.trim() : null,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          file_hash: fileHash,
        }),
      }).then((r) => r.json() as Promise<UploadInitResponse>);

      if (!initRes.ok) {
        if (initRes.code === "DUPLICATE_FOUND") {
          setDuplicateNote(
            initRes.duplicate_of?.title
              ? `Duplicate detected: matches “${initRes.duplicate_of.title}”.`
              : "Duplicate detected: this file matches an existing upload."
          );
          setBanner({ type: "error", text: "This upload looks like a duplicate. Please verify before uploading again." });
          return;
        }
        throw new Error(friendlyError(initRes.code, initRes.message));
      }

      const { bucket, path, token, material_id } = initRes;

      setUploadProgress(0);
      const { error: uploadErr } = await (supabase.storage.from(bucket) as any).uploadToSignedUrl(
        path,
        token,
        file,
        {
          onUploadProgress: (progress: { loaded: number; total: number }) => {
            if (progress.total > 0) {
              setUploadProgress(Math.round((progress.loaded / progress.total) * 100));
            }
          },
        }
      );
      if (uploadErr) throw new Error((uploadErr as any).message || "File upload failed.");
      setUploadProgress(100);

      setBanner({ type: "success", text: "Uploaded! Your material is pending review." });

      // best-effort completion ping
      try {
        const { data } = await supabase.auth.getSession();
        const bearer = data.session?.access_token;
        const res = await fetch("/api/study/materials/upload/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
          body: JSON.stringify({ material_id }),
        });

        const j = await res.json().catch(() => null);
        if (j && j.ok === true && j.verified_in_storage === false) {
          setBanner({
            type: "warning",
            text: "Upload recorded, but the file wasn’t found in storage. Please try again (or check your network).",
          });
        }
      } catch {
        // ignore
      }

      // keep course selection for fast multi-upload
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

  const SelectedCourseChip = useMemo(() => {
    if (!selectedCourse) return null;
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl border bg-zinc-50 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900">{selectedCourse.course_code}</div>
          <div className="truncate text-xs text-zinc-600">
            {selectedCourse.course_title ?? "—"} • {LEVEL_LABEL(selectedCourse.level)} • {selectedCourse.semester}
          </div>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              // scroll user to course picker quickly
              const el = document.getElementById("course-picker");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="inline-flex items-center gap-1 rounded-xl border bg-white px-2 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Change <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }, [selectedCourse]);

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <PageHeader
        title="Upload Materials"
        subtitle="Any student can contribute — uploads go to a review queue before going live."
      />

      {/* Top bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href="/study/materials"
            className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>

          <Link
            href="/study/materials/my"
            className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            <ShieldCheck className="h-4 w-4" />
            My uploads
          </Link>
        </div>

        {isRep ? (
          <div className="hidden items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm sm:flex">
            {role === "dept_librarian" ? <Building2 className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
            <span className="font-medium">{role === "dept_librarian" ? "Departmental Librarian" : "Course Rep"}</span>
            <span className="text-zinc-400">•</span>
            <span className="truncate">{scopeBadge}</span>
          </div>
        ) : userId ? (
          <div className="hidden items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm sm:flex">
            <Users className="h-4 w-4" />
            <span>Student upload</span>
          </div>
        ) : null}
      </div>

      {/* Banner */}
      {banner ? (
        <div
          className={cn(
            "rounded-3xl border p-4 shadow-sm",
            banner.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
            banner.type === "error" && "border-red-200 bg-red-50 text-red-900",
            banner.type === "info" && "border-amber-200 bg-amber-50 text-amber-900",
            banner.type === "warning" && "border-amber-200 bg-amber-50 text-amber-900"
          )}
        >
          <div className="flex items-start gap-2">
            {banner.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : null}
            {banner.type === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4" /> : null}
            {banner.type === "info" || banner.type === "warning" ? <Info className="mt-0.5 h-4 w-4" /> : null}
            <div className="min-w-0 text-sm">
              <div className="font-medium">{banner.text}</div>
              {duplicateNote ? <div className="mt-1 text-xs opacity-80">{duplicateNote}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Gating UI */}
      {loading ? (
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        </Card>
      ) : !userId ? (
        <Card className="p-5">
          <EmptyState
            icon={ShieldCheck}
            title="Sign in to upload"
            description="You need to be logged in to contribute materials."
            action={
              <Link
                href="/login?next=%2Fstudy%2Fmaterials%2Fupload"
                className="inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
              >
                Sign in
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* Quick summary (mobile-first): show selected course at top once picked */}
          {selectedCourse ? <Card className="p-4 sm:hidden">{SelectedCourseChip}</Card> : null}

          {/* Step 1: Select course */}
          <Card className="p-5" id="course-picker">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">1) Select course</div>
                <div className="mt-1 text-xs text-zinc-600">
                  Search all courses. Can't find yours? Create it below.
                </div>
              </div>
              {coursesLoading ? <Loader2 className="h-4 w-4 animate-spin text-zinc-500" /> : null}
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2">
                <Search className="h-4 w-4 text-zinc-500" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search course code or title…"
                  className="w-full bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => openCreateCourse({ code: q })}
                  className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-2 py-1 text-xs font-semibold text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create
                </button>
              </div>

              <div className="text-xs text-zinc-600">
                Tip: If you don’t see a course, create it for your department (and your level scope).
              </div>

              <div className="max-h-[360px] overflow-auto rounded-2xl border bg-white">
                {filteredCourses.length === 0 ? (
                  <div className="p-4 text-sm text-zinc-600">
                    <div className="font-medium text-zinc-900">No matching courses found.</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      Create the course (within your scope) and upload immediately.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openCreateCourse({ code: q })}
                        className="rounded-2xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Create course
                      </button>
                      <Link className="rounded-2xl border px-3 py-2 text-xs font-semibold text-zinc-900" href="/study/materials">
                        Browse materials
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y">
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
                            "w-full p-3 text-left transition",
                            active ? "bg-zinc-50" : "bg-white hover:bg-zinc-50"
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-zinc-900">{c.course_code}</div>
                              <div className="truncate text-xs text-zinc-600">{c.course_title ?? "—"}</div>
                            </div>
                            <div className="shrink-0 text-xs text-zinc-600">
                              {LEVEL_LABEL(c.level)} • {c.semester}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Step 2: Choose type + details */}
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">2) Material details</div>
                <div className="mt-1 text-xs text-zinc-600">Pick a material type and fill the required fields.</div>
              </div>
              <div className="hidden sm:block min-w-[260px]">{SelectedCourseChip}</div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {MATERIAL_TYPES.map((t) => {
                const active = t.key === materialType;
                const Icon = t.icon;
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
                      "rounded-2xl border p-3 text-left transition",
                      active ? "border-zinc-900 bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={cn("mt-0.5 h-4 w-4", active ? "text-white" : "text-zinc-700")} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{t.label}</div>
                        <div className={cn("mt-0.5 text-xs", active ? "text-white/80" : "text-zinc-600")}>{t.hint}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <div className="text-sm font-medium text-zinc-800">Title</div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Auto-filled, you can edit…"
                  className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
              </label>

              <label className="space-y-1">
                <div className="text-sm font-medium text-zinc-800">Semester</div>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value as Semester)}
                  className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                >
                  <option value="first">First</option>
                  <option value="second">Second</option>
                  <option value="summer">Summer</option>
                </select>
              </label>
            </div>

            {materialType === "past_question" ? (
              <div className="mt-4 rounded-2xl border bg-zinc-50 p-3">
                <div className="text-sm font-semibold text-zinc-900">Past Question info</div>
                <div className="mt-1 text-xs text-zinc-600">These fields help students find the right year/session.</div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <div className="text-sm font-medium text-zinc-800">Year</div>
                    <input
                      inputMode="numeric"
                      value={pqYear}
                      onChange={(e) => setPqYear(e.target.value ? Number(e.target.value) : "")}
                      placeholder="e.g. 2021"
                      className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    />
                  </label>

                  <label className="space-y-1">
                    <div className="text-sm font-medium text-zinc-800">Session</div>
                    <input
                      value={pqSession}
                      onChange={(e) => setPqSession(e.target.value)}
                      placeholder="e.g. 2022/2023"
                      className="w-full rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <label className="mt-4 block space-y-1">
              <div className="text-sm font-medium text-zinc-800">
                Notes <span className="text-zinc-500 font-normal">(optional)</span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Any context for students or reviewers, e.g. which lecturer, which section it covers…"
                rows={2}
                className="w-full resize-none rounded-2xl border bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
            </label>
          </Card>

          {/* Step 3: File */}
          <Card className="p-5">
            <div className="text-sm font-semibold text-zinc-900">3) Upload file</div>
            <div className="mt-1 text-xs text-zinc-600">We compute a hash to detect duplicates.</div>

            <div className="mt-4 rounded-2xl border bg-white p-3">
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptStr}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                }}
                className="block w-full text-sm"
              />

              {file ? (
                <div className="mt-3 rounded-2xl border bg-zinc-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{file.name}</div>
                      <div className="mt-0.5 text-xs text-zinc-600">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || "unknown"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={resetFile}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border bg-white"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-zinc-700">
                    <Hash className="h-4 w-4" />
                    {hashing ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Computing hash…
                      </span>
                    ) : fileHash ? (
                      <span className="truncate">SHA-256: {fileHash}</span>
                    ) : (
                      <span>Hash unavailable</span>
                    )}
                  </div>

                  {duplicateNote ? (
                    <div className="mt-2 text-xs text-red-700">
                      <span className="font-medium">Duplicate notice:</span> {duplicateNote}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 text-xs text-zinc-600">
                  Accepted:{" "}
                  <span className="font-medium text-zinc-800">{acceptStr.includes("pdf") ? "PDF" : "PDF / Images"}</span>
                </div>
              )}
            </div>

            <div className="mt-2 text-xs text-zinc-600">
              Submissions are <span className="font-medium text-zinc-800">pending review</span> before they appear to students.
            </div>

            {uploadProgress !== null && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-zinc-600 mb-1">
                  <span>{uploadProgress < 100 ? "Uploading…" : "Upload complete"}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      uploadProgress === 100 ? "bg-emerald-500" : "bg-zinc-900"
                    )}
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* Sticky submit bar (mobile-first) */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 p-3 backdrop-blur sm:hidden">
            <div className="mx-auto flex max-w-2xl items-center gap-2">
              <button
                type="button"
                disabled={!canSubmit || submitting}
                onClick={onSubmit}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white",
                  (!canSubmit || submitting) && "opacity-70"
                )}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Submit upload
              </button>
            </div>
            {!selectedCourse ? (
              <div className="mt-2 text-center text-[11px] text-zinc-600">Select a course to enable upload.</div>
            ) : null}
          </div>

          {/* Desktop submit (non-sticky) */}
          <div className="hidden justify-end sm:flex">
            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={onSubmit}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white",
                (!canSubmit || submitting) && "opacity-70"
              )}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Submit upload
            </button>
          </div>

          {/* Create course modal (mobile: bottom-sheet, desktop: centered) */}
          {showCreateCourse ? (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
              onMouseDown={(e) => {
                // click outside to close (only if click is on backdrop)
                if (e.target === e.currentTarget) setShowCreateCourse(false);
              }}
            >
              <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-xl">
                <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-zinc-900">Create a course</div>
                    <div className="mt-0.5 text-xs text-zinc-600">
                      {isRep && role === "course_rep"
                        ? "Only within your department and assigned level(s)."
                        : "Course will be visible to all students once created."}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateCourse(false)}
                    className="rounded-xl p-2 text-zinc-600 hover:bg-zinc-50"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-zinc-700">Course code</label>
                      <div className="mt-1 flex items-center gap-2 rounded-2xl border bg-white px-3 py-2">
                        <Hash className="h-4 w-4 text-zinc-500" />
                        <input
                          value={reqCode}
                          onChange={(e) => setReqCode(e.target.value)}
                          onBlur={() => setReqCode((v) => normalizeCourseCode(v))}
                          placeholder="e.g. CSC 201"
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500">We’ll auto-format it like “CSC 201”.</div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-zinc-700">Semester</label>
                      <select
                        value={reqSemester}
                        onChange={(e) => setReqSemester(e.target.value as Semester)}
                        className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm"
                      >
                        <option value="first">First</option>
                        <option value="second">Second</option>
                        <option value="summer">Summer</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-zinc-700">Course title (optional)</label>
                      <div className="mt-1 flex items-center gap-2 rounded-2xl border bg-white px-3 py-2">
                        <BookOpen className="h-4 w-4 text-zinc-500" />
                        <input
                          value={reqTitle}
                          onChange={(e) => setReqTitle(e.target.value)}
                          placeholder="e.g. Data Structures"
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-zinc-700">Level</label>
                      {isRep && role === "course_rep" && Array.isArray(allowedLevels) && allowedLevels.length === 1 ? (
                        <div className="mt-1 flex items-center justify-between rounded-2xl border bg-zinc-50 px-3 py-2 text-sm">
                          <span className="font-medium text-zinc-900">{LEVEL_LABEL(allowedLevels[0])}</span>
                          <span className="text-xs text-zinc-600">Locked</span>
                        </div>
                      ) : (
                        <select
                          value={reqLevel || ""}
                          onChange={(e) => setReqLevel(Number(e.target.value))}
                          className="mt-1 w-full rounded-2xl border bg-white px-3 py-2 text-sm"
                        >
                          <option value="" disabled>
                            Select level
                          </option>
                          {(isRep && role === "course_rep"
                            ? Array.isArray(allowedLevels)
                              ? allowedLevels
                              : []
                            : [100, 200, 300, 400, 500, 600, 700, 800, 900]
                          ).map((lvl) => (
                            <option key={lvl} value={lvl}>
                              {LEVEL_LABEL(lvl)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setShowCreateCourse(false)}
                      className="rounded-2xl border px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitCreateCourse}
                      disabled={reqLoading}
                      className={cn(
                        "inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white",
                        reqLoading ? "opacity-70" : "hover:opacity-95"
                      )}
                    >
                      {reqLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create course
                    </button>
                  </div>

                  <div className="mt-3 flex items-start gap-2 rounded-2xl bg-zinc-50 p-3 text-xs text-zinc-700">
                    <Info className="mt-0.5 h-4 w-4 text-zinc-500" />
                    <div>
                      Keep it consistent: use official codes (e.g., <span className="font-medium">CSC 201</span>). This
                      prevents duplicates and makes search easy.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}