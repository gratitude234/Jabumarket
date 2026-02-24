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
} from "lucide-react";

import { getAuthedUserId, toggleSaved } from "@/lib/studySaved";

import StudyTabs from "../_components/StudyTabs";
import { Card, EmptyState, PageHeader, SkeletonCard } from "../_components/StudyUI";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatWhen(iso?: string | null) {
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function asInt(v: string | null, fallback: number) {
  const n = Number(v ?? "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function normalizeQuery(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

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

function buildHref(path: string, params: Record<string, string | number | null | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    const s = String(v).trim();
    if (!s) return;
    sp.set(k, s);
  });
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

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
  onPreview,
  onDownload,
}: {
  m: MaterialRow;
  saved: boolean;
  saving: boolean;
  onToggleSave: () => void;
  onPreview: () => void;
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
    <Card className="rounded-3xl p-4">
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

        <button
          type="button"
          onClick={onPreview}
          disabled={disabled}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            disabled
              ? "cursor-not-allowed bg-muted text-muted-foreground border-border/60"
              : "bg-secondary text-foreground border-border hover:opacity-90"
          )}
        >
          <BookOpen className="h-4 w-4" />
          {kind === "other" ? "Open" : "Preview"}
        </button>

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

      {typeof m.downloads === "number" ? (
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
          {m.downloads.toLocaleString("en-NG")} downloads
        </p>
      ) : null}
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

  const filtersKey = useMemo(() => {
    return [
      normalizeQuery(qParam),
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

  // Load filter options
  useEffect(() => {
    let mounted = true;
    (async () => {
      setOptionsLoading(true);
      const cRes = await supabase
        .from("study_courses")
        .select("id,faculty,department,level,semester,course_code,course_title")
        .order("course_code", { ascending: true })
        .limit(3000);

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
  }, []);

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
      let query = supabase
        .from("study_materials")
        .select(
          `
            id,title,description,file_url,file_path,session,approved,created_at,downloads,course_id,
            material_type,featured,verified,
            study_courses:course_id!inner(id,faculty,department,level,semester,course_code,course_title)
          `,
          { count: "exact" }
        )
        .eq("approved", true);

      const qNorm = normalizeQuery(qParam);
      if (qNorm) {
        query = query.or(
          `title.ilike.%${qNorm}%,description.ilike.%${qNorm}%,study_courses.course_code.ilike.%${qNorm}%,study_courses.course_title.ilike.%${qNorm}%,study_courses.department.ilike.%${qNorm}%,study_courses.faculty.ilike.%${qNorm}%`
        );
      }

      if (levelParam) {
        const lv = Number(levelParam);
        if (Number.isFinite(lv)) query = query.eq("study_courses.level", lv);
      }

      if (semesterParam) {
        const sem = mapSemesterParamToDb(semesterParam);
        if (sem) query = query.eq("study_courses.semester", sem);
      }

      if (facultyParam) query = query.eq("study_courses.faculty", facultyParam);
      if (deptParam) query = query.eq("study_courses.department", deptParam);
      if (courseParam) query = query.eq("study_courses.course_code", courseParam.trim().toUpperCase());

      const sess = sessionParam.trim();
      if (sess) query = query.ilike("session", `%${sess}%`);

      const dbType = mapMaterialTypeToDb(typeParam);
      if (dbType) query = query.eq("material_type", dbType);

      if (verifiedOnly) query = query.eq("verified", true);
      if (featuredOnly) query = query.eq("featured", true);

      if (sortParam === "oldest") query = query.order("created_at", { ascending: true });
      else if (sortParam === "downloads_desc")
        query = query.order("downloads", { ascending: false, nullsFirst: false });
      else if (sortParam === "downloads_asc") query = query.order("downloads", { ascending: true, nullsFirst: false });
      else query = query.order("created_at", { ascending: false });

      const from = (nextPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const res = await query.range(from, to);

      if (res.error) {
        const msg = res.error.message || "Unknown error";
        setLoadError(msg);

        if (msg.includes("material_type") || msg.includes("featured") || msg.includes("verified")) {
          setSchemaHint(
            "Your database is missing some columns (material_type / featured / verified). Add them to study_materials, then refresh this page."
          );
        }

        if (isFirst) {
          setMaterials([]);
          setTotal(0);
        }
        return;
      }

      const totalCount = res.count ?? 0;
      setTotal(totalCount);

      const newRows = ((res.data as any[]) ?? []).filter(Boolean) as MaterialRow[];

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
      })
    );
    setDrawerOpen(false);
  }

  function clearAll() {
    setQ("");
    router.replace(pathname);
  }

  async function bumpDownloads(materialId: string) {
    try {
      const current = materials.find((m) => m.id === materialId)?.downloads ?? 0;
      setMaterials((prev) =>
        prev.map((m) => (m.id === materialId ? { ...m, downloads: (m.downloads ?? 0) + 1 } : m))
      );
      await supabase.from("study_materials").update({ downloads: current + 1 }).eq("id", materialId);
    } catch {
      // ignore (RLS may block)
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
      featuredOnly
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
      <StudyTabs />

      {/* Top bar: match StudyHome spacing (no max-w) */}
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

        <Link
          href="/study/materials/upload"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground no-underline",
            "hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <UploadCloud className="h-4 w-4" />
          Upload
        </Link>
      </div>

      <Card className="rounded-3xl">
        <PageHeader title="Materials" subtitle="Approved past questions, handouts, slides & notes." right={null} />
      </Card>

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
          </div>

          {hasAnyFilters ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Showing <span className="text-foreground">{showingFrom}</span>–<span className="text-foreground">{showingTo}</span> of{" "}
                <span className="text-foreground">{total}</span>
              </p>
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
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

            <span className="ml-auto inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
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
              title="No materials found"
              description="Try clearing filters or upload the first material for your course."
              action={
                <Link
                  href="/study/materials/upload"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground no-underline",
                    "hover:opacity-90",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                >
                  <UploadCloud className="h-4 w-4" />
                  Upload a material
                </Link>
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
              onPreview={() => onPreviewMaterial(m)}
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