"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  X,
  UploadCloud,
  BookOpen,
  FileText,
  Clock,
  SlidersHorizontal,
  CheckCircle2,
  Star,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  Download,
  Image as ImageIcon,
  Presentation,
  File,
  SortAsc,
  SortDesc,
  ThumbsUp,
} from "lucide-react";

import { getAuthedUserId, toggleSaved } from "@/lib/studySaved";
import { cn, formatWhen, normalizeQuery, safeSearchTerm, buildHref, asInt, clamp } from "@/lib/utils";
import StudyTabs from "../_components/StudyTabs";
import { Card, EmptyState, PageHeader, SkeletonCard } from "../_components/StudyUI";
import { RequestCourseModal } from "../_components/RequestCourseModal";

type SortKey = "newest" | "oldest" | "downloads_desc" | "downloads_asc";

type MaterialTypeKey =
  | "all"
  | "past_question"
  | "handout"
  | "note"
  | "slides"
  | "timetable"
  | "other";

type Course = {
  id: string;
  faculty: string;
  department: string;
  level: number;
  semester: string;
  course_code: string;
  course_title: string | null;
};

type MaterialRow = {
  id: string;
  title: string | null;
  description: string | null;
  file_url: string | null;
  file_path: string | null;
  session: string | null;
  approved: boolean | null;
  created_at: string | null;
  downloads: number | null;
  up_votes: number | null;
  course_id: string | null;

  material_type?: string | null;
  featured?: boolean | null;
  verified?: boolean | null;

  study_courses?: {
    id: string;
    faculty: string;
    department: string;
    level: number;
    semester: string;
    course_code: string;
    course_title: string | null;
  } | null;
};

const LEVELS = ["100", "200", "300", "400", "500"] as const;
const SEMESTERS = ["1st", "2nd", "summer"] as const;

function mapSemesterParamToDb(v: string) {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "1st" || s === "first") return "first";
  if (s === "2nd" || s === "second") return "second";
  if (s === "summer") return "summer";
  return "";
}

function mapMaterialTypeToDb(v: MaterialTypeKey) {
  if (v === "all") return "";
  return v;
}

const MATERIAL_TYPES: Array<{ key: MaterialTypeKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "past_question", label: "Past Q" },
  { key: "handout", label: "Handout" },
  { key: "note", label: "Lecture note" },
  { key: "slides", label: "Slides" },
  { key: "timetable", label: "Timetable" },
  { key: "other", label: "Other" },
];

const SORTS: Array<{ key: SortKey; label: string; icon: React.ReactNode }> = [
  { key: "newest", label: "Newest", icon: <SortDesc className="h-4 w-4" /> },
  { key: "oldest", label: "Oldest", icon: <SortAsc className="h-4 w-4" /> },
  { key: "downloads_desc", label: "Most downloaded", icon: <SortDesc className="h-4 w-4" /> },
  { key: "downloads_asc", label: "Least downloaded", icon: <SortAsc className="h-4 w-4" /> },
];

function Chip({
  active,
  children,
  onClick,
  className,
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-border bg-secondary text-foreground"
          : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-start justify-between gap-3 rounded-2xl border p-3 text-left transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "border-border bg-secondary text-foreground" : "border-border/60 bg-background hover:bg-secondary/50"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {desc ? <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p> : null}
      </div>
      <div
        className={cn(
          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border",
          checked ? "border-border bg-background" : "border-border/60 bg-background"
        )}
      >
        {checked ? <CheckCircle2 className="h-4 w-4 text-foreground" /> : null}
      </div>
    </button>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="block rounded-2xl border border-border bg-background p-3">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-transparent text-sm text-foreground outline-none"
      >
        <option value="">{placeholder ?? "All"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextRow({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block rounded-2xl border border-border bg-background p-3">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </label>
  );
}

/** Drawer: scroll lock + ESC close + first focus */
function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    window.setTimeout(() => {
      const root = panelRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      first?.focus?.();
    }, 50);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-opacity",
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        ref={panelRef}
        className={cn(
          "absolute inset-x-0 bottom-0 rounded-t-3xl border border-border bg-card shadow-xl transition-transform",
          open ? "translate-y-0" : "translate-y-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background",
              "hover:bg-secondary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-4">{children}</div>

        {footer ? <div className="border-t border-border p-4">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Preview modal: PDF/image inline, others open new tab */
function PreviewModal({
  open,
  onClose,
  title,
  url,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  url: string;
  kind: "pdf" | "image" | "other";
}) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] transition-opacity",
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          "absolute left-1/2 top-1/2 w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2",
          "rounded-3xl border border-border bg-card shadow-2xl"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Preview"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Preview</p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold",
                "text-foreground hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              )}
            >
              <ArrowRight className="h-4 w-4" />
              Open
            </a>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background",
                "hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              )}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-3">
          <div className="h-[70vh] w-full overflow-hidden rounded-2xl border border-border bg-background">
            {kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={title} className="h-full w-full object-contain" />
            ) : kind === "pdf" ? (
              <iframe title="PDF preview" src={url} className="h-full w-full" />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center">
                <div>
                  <p className="text-sm font-semibold text-foreground">Preview not available</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tap “Open” to view this file in a new tab.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function detectFileKind(m: MaterialRow): "pdf" | "image" | "other" {
  const src = ((m.file_url ?? "") + " " + (m.file_path ?? "")).toLowerCase();
  if (src.includes(".pdf")) return "pdf";
  if (src.match(/\.(png|jpg|jpeg|webp|gif)/)) return "image";
  return "other";
}

function MaterialCard({
  m,
  saved,
  saving,
  onToggleSave,
  onDownload,
}: {
  m: MaterialRow;
  saved: boolean;
  saving: boolean;
  onToggleSave: () => void;
  onDownload: () => void;
}) {
  const title = (m.title ?? "Untitled material").trim() || "Untitled material";
  const courseCode = (m.study_courses?.course_code ?? "").toString().trim();
  const courseLabel = (m.study_courses?.course_title ?? "").toString().trim();
  const dept = (m.study_courses?.department ?? "").toString().trim();
  const faculty = (m.study_courses?.faculty ?? "").toString().trim();

  const metaBits = [
    typeof m.study_courses?.level === "number" ? `${m.study_courses.level}L` : "",
    m.study_courses?.semester ? `${m.study_courses.semester} sem` : "",
    m.session ? String(m.session) : "",
    m.material_type ? String(m.material_type) : "",
  ].filter(Boolean);

  const kind = detectFileKind(m);

  const badge =
    kind === "pdf"
      ? "PDF"
      : kind === "image"
      ? "IMAGE"
      : ((m.file_url ?? "") + " " + (m.file_path ?? "")).toLowerCase().match(/\.(ppt|pptx)/)
      ? "PPT"
      : "FILE";

  const badgeIcon =
    badge === "PDF" ? (
      <FileText className="h-5 w-5 text-foreground" />
    ) : badge === "IMAGE" ? (
      <ImageIcon className="h-5 w-5 text-foreground" />
    ) : badge === "PPT" ? (
      <Presentation className="h-5 w-5 text-foreground" />
    ) : (
      <File className="h-5 w-5 text-foreground" />
    );

  const href = m.file_url || "#";
  const disabled = href === "#";
  const isVerified = !!m.verified;
  const isFeatured = !!m.featured;

  return (
    <Card className="rounded-3xl p-4 cursor-pointer">
      <Link href={`/study/materials/${m.id}`} className="block no-underline">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-foreground">{title}</p>
            {isVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verified
              </span>
            ) : null}
            {isFeatured ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                <Star className="h-3.5 w-3.5" />
                Featured
              </span>
            ) : null}
          </div>

          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {m.description ? m.description : dept || faculty ? `${dept}${dept && faculty ? " • " : ""}${faculty}` : " "}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {badge}
            </span>

            {courseCode ? (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                {courseCode}
              </span>
            ) : null}

            {courseLabel ? (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {courseLabel}
              </span>
            ) : null}

            {metaBits.map((b) => (
              <span
                key={b}
                className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
              >
                {b}
              </span>
            ))}

            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {formatWhen(m.created_at)}
            </span>
          </div>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background">
          {badgeIcon}
        </div>
      </div>
      </Link>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSave}
          disabled={saving}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            saved
              ? "border-border bg-secondary text-foreground"
              : "border-border/60 bg-background text-foreground hover:bg-secondary/50",
            saving ? "opacity-70" : ""
          )}
          aria-label={saved ? "Unsave material" : "Save material"}
          title={saved ? "Saved" : "Save"}
        >
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
        </button>

        <Link
          href={`/study/materials/${m.id}`}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition no-underline",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "bg-secondary text-foreground border-border hover:opacity-90"
          )}
        >
          <BookOpen className="h-4 w-4" />
          {kind === "other" ? "Open" : "Preview"}
        </Link>

        <a
          href={href}
          download
          onClick={(e) => {
            if (disabled) {
              e.preventDefault();
              return;
            }
            onDownload();
          }}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition no-underline",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            disabled
              ? "pointer-events-none bg-muted text-muted-foreground border-border/60"
              : "border-border/60 bg-background text-foreground hover:bg-secondary/50"
          )}
          aria-label="Download"
          title="Download"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Download</span>
        </a>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          {(m.downloads ?? 0).toLocaleString("en-NG")} downloads
        </span>
        {(m.up_votes ?? 0) > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <ThumbsUp className="h-3 w-3" /> {m.up_votes}
          </span>
        ) : null}
        {(m.downloads ?? 0) > 50 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            Popular
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export default function MaterialsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // ✅ IMPORTANT: this page must match StudyHomeClient width
  // We DO NOT use max-w containers here, and we keep spacing consistent: `space-y-4 pb-28`
  // Layout padding should be handled by your shared layout; we only use `-mx-4` where needed.

  // URL params
  const qParam = sp.get("q") ?? "";
  const levelParam = sp.get("level") ?? "";
  const semesterParam = sp.get("semester") ?? "";
  const facultyParam = sp.get("faculty") ?? "";
  const deptParam = sp.get("dept") ?? "";
  const courseParam = sp.get("course") ?? "";
  const sessionParam = sp.get("session") ?? "";
  const verifiedParam = sp.get("verified") ?? "";
  const featuredParam = sp.get("featured") ?? "";
  const typeParam = (sp.get("type") ?? "all") as MaterialTypeKey;
  const sortParam = (sp.get("sort") ?? "newest") as SortKey;

  // Scope toggle: mine vs all
  const mineParam = sp.get("mine") ?? "";
  const mineExplicitOn = mineParam === "1";
  const mineExplicitOff = mineParam === "0";

  const verifiedOnly = verifiedParam === "1";
  const featuredOnly = featuredParam === "1";

  // Local input state
  const [q, setQ] = useState(qParam);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Drawer draft states
  const [draftLevel, setDraftLevel] = useState(levelParam);
  const [draftSemester, setDraftSemester] = useState(semesterParam);
  const [draftFaculty, setDraftFaculty] = useState(facultyParam);
  const [draftDept, setDraftDept] = useState(deptParam);
  const [draftCourse, setDraftCourse] = useState(courseParam);
  const [draftSession, setDraftSession] = useState(sessionParam);
  const [draftType, setDraftType] = useState<MaterialTypeKey>(typeParam);
  const [draftSort, setDraftSort] = useState<SortKey>(sortParam);
  const [draftVerified, setDraftVerified] = useState(verifiedOnly);
  const [draftFeatured, setDraftFeatured] = useState(featuredOnly);

  // Options
  const [courses, setCourses] = useState<Course[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Materials
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);

  // Pagination: “Load more” (mobile-first)
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Personalization
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [myBadge, setMyBadge] = useState<string | null>(null);
  const [scopeDept, setScopeDept] = useState<string>("");
  const [scopeLevel, setScopeLevel] = useState<number | null>(null);
  const [scopeSemesterDb, setScopeSemesterDb] = useState<string>("");

  // Rep / contributor status — determines Upload vs Contribute UI
  const [repStatus, setRepStatus] = useState<
    "not_applied" | "pending" | "approved" | "rejected" | null
  >(null);

  // Saved
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [previewKind, setPreviewKind] = useState<"pdf" | "image" | "other">("other");

  // Request course modal
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  // Effective scope:
  // - mine=1 => always mine
  // - mine=0 => always all
  // - no mine param => wait for prefs; if we have a badge, default to mine
  const mineOnly = useMemo(() => {
    if (mineExplicitOn) return true;
    if (mineExplicitOff) return false;
    return false;
  }, [mineExplicitOn, mineExplicitOff, prefsLoaded, myBadge]);

  const filtersKey = useMemo(() => {
    return [
      safeSearchTerm(qParam),
      levelParam,
      semesterParam,
      facultyParam,
      deptParam,
      courseParam,
      sessionParam,
      typeParam,
      sortParam,
      verifiedOnly ? "v1" : "v0",
      featuredOnly ? "f1" : "f0",
      mineOnly ? "m1" : mineExplicitOff ? "m0x" : "m0",
    ].join("|");
  }, [
    qParam,
    levelParam,
    semesterParam,
    facultyParam,
    deptParam,
    courseParam,
    sessionParam,
    typeParam,
    sortParam,
    verifiedOnly,
    featuredOnly,
    mineOnly,
    mineExplicitOff,
  ]);

  // Reset list when filters change
  useEffect(() => {
    setPage(1);
    setMaterials([]);
    setHasMore(false);
  }, [filtersKey]);

  // Load saved ids for current list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = await getAuthedUserId();
        if (!userId) {
          if (!cancelled) setSavedIds(new Set());
          return;
        }
        const ids = materials.map((m) => m.id).filter(Boolean);
        if (ids.length === 0) {
          if (!cancelled) setSavedIds(new Set());
          return;
        }

        const { data, error } = await supabase
          .from("study_saved_items")
          .select("material_id")
          .eq("user_id", userId)
          .eq("item_type", "material")
          .in("material_id", ids);

        if (error) throw error;

        const next = new Set<string>();
        (data ?? []).forEach((r: any) => {
          if (r?.material_id) next.add(String(r.material_id));
        });

        if (!cancelled) setSavedIds(next);
      } catch {
        if (!cancelled) setSavedIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [materials]);

  async function onToggleMaterialSave(materialId: string) {
    setSavingId(materialId);
    const wasSaved = savedIds.has(materialId);

    setSavedIds((prev) => {
      const n = new Set(prev);
      if (n.has(materialId)) n.delete(materialId);
      else n.add(materialId);
      return n;
    });

    try {
      await toggleSaved({ itemType: "material", materialId });
      setToast(wasSaved ? "Removed from Library" : "Saved to Library");
    } catch (e: any) {
      setSavedIds((prev) => {
        const n = new Set(prev);
        if (n.has(materialId)) n.delete(materialId);
        else n.add(materialId);
        return n;
      });
      setToast(e?.message ?? "Could not save. Try again.");
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => setQ(qParam), [qParam]);

  // Load user scope badge + rep status — parallel, single auth check.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user ?? null;
        if (!user) {
          if (mounted) {
            setPrefsLoaded(true);
            setMyBadge(null);
          }
          return;
        }

        // Run prefs + rep status in parallel
        const [prefsRes, repRes] = await Promise.all([
          supabase
            .from("study_preferences")
            .select("level, semester, department_id, department:study_departments(name)")
            .eq("user_id", user.id)
            .maybeSingle(),
          fetch("/api/study/rep-applications/me", { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => null),
        ]);

        const prefsData = !prefsRes.error ? prefsRes.data : null;

        let deptName = "";
        let level: number | null = null;
        let semester = "";

        if (prefsData) {
          level = (prefsData as any)?.level ?? null;
          semester = String((prefsData as any)?.semester ?? "").trim();
          deptName = String((prefsData as any)?.department?.name ?? "").trim();
        }

        const badgeParts: string[] = [];
        if (deptName) badgeParts.push(deptName);
        if (typeof level === "number" && Number.isFinite(level)) badgeParts.push(`${level}L`);
        if (semester) badgeParts.push(semester.toLowerCase() === "first" ? "1st" : semester.toLowerCase() === "second" ? "2nd" : semester);

        if (mounted) {
          setMyBadge(badgeParts.length ? badgeParts.join(" • ") : null);
          setScopeDept(deptName);
          setScopeLevel(typeof level === "number" && Number.isFinite(level) ? level : null);
          setScopeSemesterDb(mapSemesterParamToDb(semester));
          setPrefsLoaded(true);

          // Set rep status from API response
          if (repRes?.ok) {
            setRepStatus(repRes.status ?? "not_applied");
          } else {
            setRepStatus("not_applied");
          }
        }
      } catch {
        if (mounted) {
          setPrefsLoaded(true);
          setMyBadge(null);
          setRepStatus("not_applied");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Auto-enable "My materials" after onboarding (unless user already chose a scope).
  useEffect(() => {
    if (!prefsLoaded) return;
    if (mineParam) return;
    if (!myBadge) return;

    // Avoid a route transition (which can look like a "reload") by updating the URL
    // without triggering Next.js navigation.
    // Also pre-apply dept name and level from prefs so the URL is shareable and bookmarkable.
    const href = buildHref(pathname, {
      q: normalizeQuery(q) || null,
      level: levelParam || (scopeLevel ? String(scopeLevel) : null),
      semester: semesterParam || null,
      faculty: facultyParam || null,
      dept: deptParam || scopeDept || null,
      course: courseParam || null,
      session: sessionParam || null,
      type: typeParam !== "all" ? typeParam : null,
      sort: sortParam !== "newest" ? sortParam : null,
      verified: verifiedOnly ? "1" : null,
      featured: featuredOnly ? "1" : null,
      mine: "1",
    });

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", href);
    } else {
      // Fallback (should be rare in client component)
      router.replace(href);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded]);

  // Load filter options
  useEffect(() => {
    let mounted = true;
    (async () => {
      setOptionsLoading(true);
      let q = supabase
        .from("study_courses")
        .select("id,faculty,department,level,semester,course_code,course_title")
        .order("course_code", { ascending: true })
        .limit(3000);

      // When in "My materials", keep dropdowns scoped too (best-effort).
      if (mineOnly) {
        if (scopeDept) q = q.eq("department", scopeDept);
        if (typeof scopeLevel === "number" && Number.isFinite(scopeLevel)) q = q.eq("level", scopeLevel);
        if (scopeSemesterDb) q = q.eq("semester", scopeSemesterDb);
      }

      const cRes = await q;

      if (!mounted) return;

      if (cRes.error) {
        setCourses([]);
        setOptionsLoading(false);
        return;
      }

      setCourses((cRes.data as any[])?.filter(Boolean) ?? []);
      setOptionsLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [mineOnly, scopeDept, scopeLevel, scopeSemesterDb]);

  const facultyOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const c of courses) {
      const v = (c.faculty ?? "").toString().trim();
      if (v) uniq.add(v);
    }
    return Array.from(uniq)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [courses]);

  const deptOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const c of courses) {
      if (draftFaculty && c.faculty !== draftFaculty) continue;
      const v = (c.department ?? "").toString().trim();
      if (v) uniq.add(v);
    }
    return Array.from(uniq)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => ({ value: v, label: v }));
  }, [courses, draftFaculty]);

  const courseOptions = useMemo(() => {
    const filtered = courses.filter((c) => {
      if (draftFaculty && c.faculty !== draftFaculty) return false;
      if (draftDept && c.department !== draftDept) return false;
      return true;
    });

    const sorted = filtered
      .slice()
      .sort((a, b) => (a.course_code ?? "").localeCompare(b.course_code ?? ""));

    return sorted.map((c) => ({
      value: c.course_code,
      label: `${c.course_code} — ${(c.course_title ?? "").toString().trim()}`.trim(),
    }));
  }, [courses, draftDept, draftFaculty]);

  // Fetch materials (paged, supports load more)
  async function fetchPage(nextPage: number) {
    const isFirst = nextPage === 1;

    if (isFirst) {
      setLoading(true);
      setLoadError(null);
      setSchemaHint(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const url = new URL("/api/study/materials", window.location.origin);
      url.searchParams.set("page", String(nextPage));
      url.searchParams.set("page_size", String(PAGE_SIZE));

      const qNorm = normalizeQuery(qParam);
      if (qNorm) url.searchParams.set("q", qNorm);
      if (levelParam) url.searchParams.set("level", String(levelParam));
      if (semesterParam) url.searchParams.set("semester", String(semesterParam));
      if (facultyParam) url.searchParams.set("faculty", String(facultyParam));
      if (deptParam) url.searchParams.set("dept", String(deptParam));
      if (courseParam) url.searchParams.set("course", String(courseParam));
      if (sessionParam.trim()) url.searchParams.set("session", sessionParam.trim());
      if (typeParam && typeParam !== "all") url.searchParams.set("type", String(typeParam));
      if (verifiedOnly) url.searchParams.set("verified", "1");
      if (featuredOnly) url.searchParams.set("featured", "1");
      if (sortParam) url.searchParams.set("sort", String(sortParam));
      if (mineOnly) url.searchParams.set("mine", "1");

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        const msg = json?.error || "Unknown error";
        setLoadError(msg);
        if (json?.schemaHint) setSchemaHint(String(json.schemaHint));
        if (isFirst) {
          setMaterials([]);
          setTotal(0);
        }
        return;
      }

      const totalCount = Number(json?.total ?? 0);
      setTotal(Number.isFinite(totalCount) ? totalCount : 0);

      const newRows = ((json?.items as any[]) ?? []).filter(Boolean) as MaterialRow[];

      setMaterials((prev) => {
        if (isFirst) return newRows;
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev];
        for (const row of newRows) if (!seen.has(row.id)) merged.push(row);
        return merged;
      });

      const loadedSoFar = (isFirst ? 0 : (nextPage - 1) * PAGE_SIZE) + newRows.length;
      setHasMore(loadedSoFar < totalCount);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // Initial fetch for current filters
  useEffect(() => {
    // If the user didn't explicitly set mine=0/1 yet, wait for prefs to load so we don't
    // briefly show "All materials" and then snap to "My materials".
    if (!mineParam && !prefsLoaded) return;
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // Debounce search -> URL update
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    const qNorm = normalizeQuery(q);
    if (qNorm === normalizeQuery(qParam)) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      router.replace(
        buildHref(pathname, {
          q: qNorm || null,
          level: levelParam || null,
          semester: semesterParam || null,
          faculty: facultyParam || null,
          dept: deptParam || null,
          course: courseParam || null,
          session: sessionParam || null,
          type: typeParam !== "all" ? typeParam : null,
          sort: sortParam !== "newest" ? sortParam : null,
          verified: verifiedOnly ? "1" : null,
          featured: featuredOnly ? "1" : null,
          mine: mineParam ? mineParam : null,
        })
      );
    }, 350);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [
    q,
    qParam,
    router,
    pathname,
    levelParam,
    semesterParam,
    facultyParam,
    deptParam,
    courseParam,
    sessionParam,
    typeParam,
    sortParam,
    verifiedOnly,
    featuredOnly,
    mineOnly,
    mineParam,
  ]);

  function openFilters() {
    setDraftLevel(levelParam);
    setDraftSemester(semesterParam);
    setDraftFaculty(facultyParam);
    setDraftDept(deptParam);
    setDraftCourse(courseParam);
    setDraftSession(sessionParam);
    setDraftType(typeParam);
    setDraftSort(sortParam);
    setDraftVerified(verifiedOnly);
    setDraftFeatured(featuredOnly);
    setDrawerOpen(true);
  }

  function applyFilters() {
    router.replace(
      buildHref(pathname, {
        q: normalizeQuery(q) || null,
        level: draftLevel || null,
        semester: draftSemester || null,
        faculty: draftFaculty || null,
        dept: draftDept || null,
        course: draftCourse || null,
        session: draftSession.trim() || null,
        type: draftType !== "all" ? draftType : null,
        sort: draftSort !== "newest" ? draftSort : null,
        verified: draftVerified ? "1" : null,
        featured: draftFeatured ? "1" : null,
        mine: mineParam ? mineParam : null,
      })
    );
    setDrawerOpen(false);
  }

  function clearAll() {
    setQ("");
    router.replace(
      buildHref(pathname, {
        mine: mineOnly ? "0" : (mineParam || null),
      })
    );
  }

  async function bumpDownloads(materialId: string) {
    // Optimistic update — immediately reflects in the UI
    setMaterials((prev) =>
      prev.map((m) => (m.id === materialId ? { ...m, downloads: (m.downloads ?? 0) + 1 } : m))
    );
    try {
      // Atomic increment via DB function — no race condition, bypasses RLS
      await supabase.rpc("increment_material_downloads", { material_id: materialId });
    } catch {
      // Roll back the optimistic update if the RPC fails
      setMaterials((prev) =>
        prev.map((m) => (m.id === materialId ? { ...m, downloads: Math.max(0, (m.downloads ?? 1) - 1) } : m))
      );
    }
  }

  const hasAnyFilters = Boolean(
    qParam ||
      levelParam ||
      semesterParam ||
      facultyParam ||
      deptParam ||
      courseParam ||
      sessionParam ||
      (typeParam && typeParam !== "all") ||
      verifiedOnly ||
      featuredOnly ||
      (sortParam && sortParam !== "newest") ||
      mineOnly
  );

  const showingFrom = total === 0 ? 0 : 1;
  const showingTo = Math.min(total, materials.length);

  const activeTypeLabel = MATERIAL_TYPES.find((t) => t.key === typeParam)?.label ?? "All";
  const activeSortLabel = SORTS.find((s) => s.key === sortParam)?.label ?? "Newest";

  function onPreviewMaterial(m: MaterialRow) {
    const href = m.file_url || "";
    if (!href) {
      setToast("No file URL found");
      return;
    }
    const kind = detectFileKind(m);
    if (kind === "other") {
      window.open(href, "_blank", "noreferrer");
      bumpDownloads(m.id);
      setToast("Opened file");
      return;
    }
    setPreviewTitle((m.title ?? "Material").trim() || "Material");
    setPreviewUrl(href);
    setPreviewKind(kind);
    setPreviewOpen(true);
    bumpDownloads(m.id);
  }

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <StudyTabs contributorStatus={repStatus ?? undefined} />

      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/study"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground no-underline",
            "hover:bg-secondary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

      </div>

      <Card className="rounded-3xl">
        <PageHeader
          title="Materials"
          subtitle="Approved past questions, handouts, slides & notes."
          right={
            <div className="hidden sm:flex items-center gap-2">
              {myBadge ? (
                <span className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
                  <Star className="h-4 w-4" />
                  {myBadge}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4" />
                {activeSortLabel}
              </span>
            </div>
          }
        />
      </Card>

      {/* Scope toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
        href="/study/materials/my"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "border-border bg-background hover:bg-secondary/50 text-foreground"
        )}
        title="Manage your uploads (My uploads)"
      >
        <Star className="h-4 w-4" />
        My uploads
      </Link>
        <Chip
          active={!mineOnly}
          onClick={() =>
            router.replace(
              buildHref(pathname, {
                q: qParam || null,
                level: levelParam || null,
                semester: semesterParam || null,
                faculty: facultyParam || null,
                dept: deptParam || null,
                course: courseParam || null,
                session: sessionParam || null,
                type: typeParam !== "all" ? typeParam : null,
                sort: sortParam !== "newest" ? sortParam : null,
                verified: verifiedOnly ? "1" : null,
                featured: featuredOnly ? "1" : null,
                // Mark explicit "All" so we don't auto-scope back to mine after prefs load.
                mine: "0",
              })
            )
          }
          title="Browse materials across all departments"
        >
          <BookOpen className="h-4 w-4" />
          All materials
        </Chip>
      </div>


      {/* ✅ Sticky search/filter: keep full width like Study Home */}
      <div className="sticky top-16 z-30">
        <Card className="rounded-3xl border bg-background/85 backdrop-blur">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search course code, title, description…"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl border border-border bg-background hover:bg-secondary/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={openFilters}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground",
                "hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>
            {materials.length > 0 ? (
              <Link
                href="/study/materials/upload"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground no-underline",
                  "hover:bg-secondary/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              >
                <UploadCloud className="h-4 w-4" />
                + Upload
              </Link>
            ) : null}
          </div>

          {hasAnyFilters ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {total > 0 && (
                <p className="text-xs font-semibold text-muted-foreground">
                  Showing <span className="text-foreground">{showingFrom}</span>–<span className="text-foreground">{showingTo}</span> of{" "}
                  <span className="text-foreground">{total}</span>
                </p>
              )}
              <button
                type="button"
                onClick={clearAll}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold",
                  "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              >
                <X className="h-3.5 w-3.5" />
                Clear all
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Tip: Try <span className="font-semibold">GST101</span> or “past question”.
            </p>
          )}

          <div className="mt-3 flex items-center gap-2 overflow-x-auto pl-16">
            {mineOnly && !mineExplicitOff && scopeDept ? (
              <Chip
                active
                onClick={() =>
                  router.replace(
                    buildHref(pathname, {
                      q: qParam || null,
                      level: levelParam || null,
                      semester: semesterParam || null,
                      faculty: facultyParam || null,
                      dept: deptParam || null,
                      course: courseParam || null,
                      session: sessionParam || null,
                      type: typeParam !== "all" ? typeParam : null,
                      sort: sortParam !== "newest" ? sortParam : null,
                      verified: verifiedOnly ? "1" : null,
                      featured: featuredOnly ? "1" : null,
                      mine: "0",
                    })
                  )
                }
              >
                {scopeDept} <X className="h-4 w-4" />
              </Chip>
            ) : null}
            {typeParam !== "all" ? (
              <Chip
                active
                onClick={() =>
                  router.replace(
                    buildHref(pathname, {
                      q: qParam || null,
                      level: levelParam || null,
                      semester: semesterParam || null,
                      faculty: facultyParam || null,
                      dept: deptParam || null,
                      course: courseParam || null,
                      session: sessionParam || null,
                      type: null,
                      sort: sortParam !== "newest" ? sortParam : null,
                      verified: verifiedOnly ? "1" : null,
                      featured: featuredOnly ? "1" : null,
                    })
                  )
                }
              >
                <FileText className="h-4 w-4" />
                {activeTypeLabel}
                <X className="h-4 w-4" />
              </Chip>
            ) : null}

            {levelParam ? (
              <Chip
                active
                onClick={() =>
                  router.replace(
                    buildHref(pathname, {
                      q: qParam || null,
                      level: null,
                      semester: semesterParam || null,
                      faculty: facultyParam || null,
                      dept: deptParam || null,
                      course: courseParam || null,
                      session: sessionParam || null,
                      type: typeParam !== "all" ? typeParam : null,
                      sort: sortParam !== "newest" ? sortParam : null,
                      verified: verifiedOnly ? "1" : null,
                      featured: featuredOnly ? "1" : null,
                    })
                  )
                }
              >
                {levelParam}L <X className="h-4 w-4" />
              </Chip>
            ) : null}

            <span className="ml-auto shrink-0 inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4" />
              {activeSortLabel}
            </span>
          </div>
        </Card>
      </div>

      {/* Error */}
      {loadError ? (
        <div className="rounded-3xl border border-border bg-background p-4">
          <p className="text-sm font-semibold text-foreground">Couldn’t load materials</p>
          <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
          {schemaHint ? (
            <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">{schemaHint}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* List */}
      <div className="grid gap-3 sm:grid-cols-2">
        {loading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} className="rounded-3xl" />
            ))}
          </>
        ) : materials.length === 0 ? (
          <div className="sm:col-span-2">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={
                courseParam
                  ? `No materials for ${courseParam} yet`
                  : (levelParam || deptParam)
                  ? "No materials found"
                  : "No materials yet"
              }
              description={
                courseParam
                  ? "Help us grow — request it and we’ll notify you when content is available."
                  : (levelParam || deptParam)
                  ? "Try adjusting your filters, or upload the first one."
                  : "Be the first to upload study materials for your department."
              }
              action={
                <div className="flex flex-wrap gap-2">
                  {courseParam ? (
                    <button
                      type="button"
                      onClick={() => setRequestModalOpen(true)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold text-foreground",
                        "hover:opacity-90",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      )}
                    >
                      Request this course
                    </button>
                  ) : null}
                  <Link
                    href="/study/materials/upload"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground no-underline",
                      "hover:bg-secondary/50",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    )}
                  >
                    <UploadCloud className="h-4 w-4" />
                    Upload a material
                  </Link>
                </div>
              }
            />
          </div>
        ) : (
          materials.map((m) => (
            <MaterialCard
              key={m.id}
              m={m}
              saved={savedIds.has(m.id)}
              saving={savingId === m.id}
              onToggleSave={() => onToggleMaterialSave(m.id)}
              onDownload={() => {
                if (!m.file_url) return;
                bumpDownloads(m.id);
                setToast("Download started");
              }}
            />
          ))
        )}
      </div>

      {/* ✅ Load more (mobile-first) */}
      {!loading && materials.length > 0 ? (
        <div className="flex justify-center">
          {hasMore ? (
            <button
              type="button"
              onClick={async () => {
                const next = page + 1;
                setPage(next);
                await fetchPage(next);
              }}
              disabled={loadingMore}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground",
                "hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                loadingMore ? "opacity-70" : ""
              )}
            >
              {loadingMore ? "Loading…" : "Load more"}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">You’ve reached the end.</p>
          )}
        </div>
      ) : null}

      {/* Filters drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filters"
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftLevel("");
                setDraftSemester("");
                setDraftFaculty("");
                setDraftDept("");
                setDraftCourse("");
                setDraftSession("");
                setDraftType("all");
                setDraftSort("newest");
                setDraftVerified(false);
                setDraftFeatured(false);
              }}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground",
                "hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              )}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground",
                "hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              )}
            >
              Apply
            </button>
          </div>
        }
      >
        <div className="rounded-3xl border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Sort</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setDraftSort(s.key)}
                className={cn(
                  "inline-flex items-center justify-between gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  draftSort === s.key
                    ? "border-border bg-secondary text-foreground"
                    : "border-border/60 bg-background text-foreground hover:bg-secondary/50"
                )}
              >
                <span className="inline-flex items-center gap-2">
                  {s.icon}
                  {s.label}
                </span>
                {draftSort === s.key ? <span className="text-xs font-semibold">Selected</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-3xl border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Type</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MATERIAL_TYPES.map((t) => (
              <Chip key={t.key} active={draftType === t.key} onClick={() => setDraftType(t.key)}>
                {t.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <SelectRow
            label="Level"
            value={draftLevel}
            onChange={setDraftLevel}
            options={LEVELS.map((l) => ({ value: l, label: `${l}L` }))}
            placeholder="All levels"
          />
          <SelectRow
            label="Semester"
            value={draftSemester}
            onChange={setDraftSemester}
            options={SEMESTERS.map((s) => ({ value: s, label: s }))}
            placeholder="All semesters"
          />
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <ToggleRow label="Verified only" desc="Show only verified materials" checked={draftVerified} onChange={setDraftVerified} />
          <ToggleRow label="Featured only" desc="Show highlighted materials" checked={draftFeatured} onChange={setDraftFeatured} />
        </div>

        <div className="mt-3 grid gap-2">
          <TextRow
            label="Session / Year"
            value={draftSession}
            onChange={setDraftSession}
            placeholder="e.g., 2022/2023"
            hint="Optional. Useful for past questions."
          />
        </div>

        <div className="mt-3 grid gap-2">
          <SelectRow
            label="Faculty"
            value={draftFaculty}
            onChange={(v) => {
              setDraftFaculty(v);
              setDraftDept("");
              setDraftCourse("");
            }}
            placeholder={optionsLoading ? "Loading…" : "All faculties"}
            options={facultyOptions}
          />

          <SelectRow
            label="Department"
            value={draftDept}
            onChange={(v) => {
              setDraftDept(v);
              setDraftCourse("");
            }}
            placeholder={optionsLoading ? "Loading…" : draftFaculty ? "All depts in faculty" : "All departments"}
            options={deptOptions}
          />

          <SelectRow
            label="Course"
            value={draftCourse}
            onChange={setDraftCourse}
            placeholder={optionsLoading ? "Loading…" : "All courses"}
            options={courseOptions}
          />
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Filters apply when you tap <span className="font-semibold">Apply</span>. Search updates automatically.
          </p>
        </div>
      </Drawer>

      {/* Preview modal */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={previewTitle}
        url={previewUrl}
        kind={previewKind}
      />

      {/* Request course modal */}
      <RequestCourseModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        initialCourseCode={courseParam}
      />

      {/* Toast */}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div
            role="status"
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-lg"
          >
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}