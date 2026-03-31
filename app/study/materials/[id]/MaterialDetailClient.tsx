"use client";

// app/study/materials/[id]/MaterialDetailClient.tsx

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  File,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  Share2,
  Sparkles,
  Star,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toggleSaved, getAuthedUserId } from "@/lib/studySaved";
import { supabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

type Course = {
  id: string;
  course_code: string;
  course_title: string | null;
  level: number | null;
  semester: string | null;
  faculty: string | null;
  department: string | null;
};

type Material = {
  id: string;
  title: string | null;
  description: string | null;
  material_type: string | null;
  session: string | null;
  approved: boolean | null;
  downloads: number | null;
  up_votes: number | null;
  down_votes: number | null;
  file_url: string | null;
  file_path: string | null;
  verified: boolean | null;
  featured: boolean | null;
  created_at: string | null;
  uploader_email: string | null;
  ai_summary: string | null;
  study_courses: Course | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectKind(m: Material): "pdf" | "image" | "other" {
  const src = ((m.file_url ?? "") + " " + (m.file_path ?? "")).toLowerCase();
  if (src.includes(".pdf")) return "pdf";
  if (src.match(/\.(png|jpg|jpeg|webp|gif)/)) return "image";
  return "other";
}

function fileTypeBadge(kind: "pdf" | "image" | "other", m: Material) {
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "IMAGE";
  const src = ((m.file_url ?? "") + " " + (m.file_path ?? "")).toLowerCase();
  if (src.match(/\.(ppt|pptx)/)) return "PPT";
  if (src.match(/\.(doc|docx)/)) return "WORD";
  return "FILE";
}

function FileIcon({ kind }: { kind: "pdf" | "image" | "other" }) {
  if (kind === "pdf") return <FileText className="h-6 w-6" />;
  if (kind === "image") return <ImageIcon className="h-6 w-6" />;
  return <File className="h-6 w-6" />;
}

function obfuscateEmail(email: string | null | undefined): string {
  if (!email) return "Anonymous";
  const [local, domain] = email.split("@");
  if (!local || !domain) return email.slice(0, 3) + "***";
  return local.slice(0, 3) + "***@" + domain;
}

function formatMaterialType(t: string | null) {
  if (!t) return "Material";
  return {
    past_question: "Past Question",
    handout: "Handout",
    note: "Lecture Note",
    slides: "Slides",
    timetable: "Timetable",
    other: "Other",
  }[t] ?? t;
}

// ─── PDF viewer (iframe + Google Docs fallback) ───────────────────────────────

const GDOCS = (url: string) =>
  `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

function PdfViewer({ url, heightClass = "h-[70vh]" }: { url: string; heightClass?: string }) {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const src = useFallback ? GDOCS(url) : url;

  // Reset state when source changes
  useEffect(() => { setLoading(true); setErrored(false); }, [src]);

  // Detect mobile — iframes often block PDFs there; default to Google Docs
  useEffect(() => {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    if (isMobile) setUseFallback(true);
  }, []);

  return (
    <div className={cn("relative w-full overflow-hidden rounded-2xl border border-border bg-background", heightClass)}>
      {loading && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading PDF…</p>
          </div>
        </div>
      )}

      {errored ? (
        <div className="grid h-full place-items-center p-6 text-center">
          <div>
            <p className="text-sm font-semibold text-foreground">Couldn't load PDF</p>
            <p className="mt-1 text-xs text-muted-foreground">Your browser may be blocking the file.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {!useFallback && (
                <button
                  type="button"
                  onClick={() => { setUseFallback(true); setErrored(false); }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3 py-2 text-xs font-semibold text-foreground hover:opacity-90"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try Google Docs viewer
                </button>
              )}
              <a
                href={url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary/50"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
              </a>
            </div>
          </div>
        </div>
      ) : (
        <iframe
          key={src}
          title="PDF preview"
          src={src}
          className="h-full w-full"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setErrored(true); }}
        />
      )}
    </div>
  );
}

// ─── Image viewer (with zoom toggle) ─────────────────────────────────────────

function ImageViewer({ url, title, heightClass = "h-[70vh]" }: { url: string; title: string; heightClass?: string }) {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  return (
    <div
      className={cn(
        "relative w-full overflow-auto rounded-2xl border border-border bg-background",
        heightClass,
        zoomed ? "cursor-zoom-out" : "cursor-zoom-in"
      )}
      onClick={() => setZoomed((v) => !v)}
      title={zoomed ? "Click to zoom out" : "Click to zoom in"}
    >
      {loading && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {errored ? (
        <div className="grid h-full place-items-center p-6 text-center">
          <p className="text-sm text-muted-foreground">Image failed to load.</p>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={title}
          className={cn(
            "transition-transform duration-300 ease-in-out select-none",
            zoomed
              ? "min-h-full min-w-full object-contain scale-150 origin-top-left"
              : "h-full w-full object-contain"
          )}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setErrored(true); }}
          draggable={false}
        />
      )}
      {/* Zoom hint badge */}
      {!loading && !errored && (
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground backdrop-blur">
          {zoomed ? <ZoomOut className="h-3 w-3" /> : <ZoomIn className="h-3 w-3" />}
          {zoomed ? "Zoom out" : "Zoom in"}
        </div>
      )}
    </div>
  );
}

// ─── Inline preview strip ─────────────────────────────────────────────────────
// Collapsible panel that lives directly on the page — no modal needed.

function InlinePreview({
  url,
  title,
  kind,
}: {
  url: string;
  title: string;
  kind: "pdf" | "image" | "other";
}) {
  const [open, setOpen] = useState(false);

  if (kind === "other" || !url) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors",
          "hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        )}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          {kind === "pdf"
            ? <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            : <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <div>
            <p className="text-sm font-semibold text-foreground">
              {open ? "Hide preview" : `Preview ${kind === "pdf" ? "PDF" : "image"}`}
            </p>
            {!open && (
              <p className="text-xs text-muted-foreground">Tap to expand inline</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/50"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
          {open
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border p-3">
          {kind === "pdf" && <PdfViewer url={url} heightClass="h-[60vh]" />}
          {kind === "image" && <ImageViewer url={url} title={title} heightClass="h-[60vh]" />}
        </div>
      )}
    </div>
  );
}

// ─── Fullscreen preview modal ─────────────────────────────────────────────────

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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel — fullscreen on mobile, centered card on desktop */}
      <div className="relative z-10 flex h-full flex-col md:m-auto md:h-auto md:w-[90vw] md:max-w-4xl md:rounded-3xl md:border md:border-border md:shadow-2xl bg-card">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <div className="flex items-center gap-2">
            <a
              href={url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary/50"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
            <button
              type="button" onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-2xl border border-border bg-background hover:bg-secondary/50"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-3 md:flex-none">
          {kind === "pdf" && <PdfViewer url={url} heightClass="h-[calc(100vh-6rem)] md:h-[75vh]" />}
          {kind === "image" && <ImageViewer url={url} title={title} heightClass="h-[calc(100vh-6rem)] md:h-[75vh]" />}
          {kind === "other" && (
            <div className="grid h-48 place-items-center p-6 text-center">
              <div>
                <p className="text-sm font-semibold text-foreground">Preview not available</p>
                <p className="mt-1 text-sm text-muted-foreground">Tap "Open" to view in a new tab.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AI Summarize Card ────────────────────────────────────────────────────────

type AiSummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; overview: string; keyTopics: string[]; examTips: string[]; cached: boolean }
  | { status: "error"; message: string };

function AiSummarizeCard({
  materialId,
  title,
  description,
  courseCode,
  materialType,
  compact,
}: {
  materialId: string;
  title: string;
  description: string | null;
  courseCode: string | null | undefined;
  materialType: string | null;
  compact?: boolean;
}) {
  const [state, setState] = useState<AiSummaryState>({ status: "idle" });

  async function fetchSummary() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId, title, description, courseCode, materialType }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setState({ status: "error", message: json.error ?? "Something went wrong." });
      } else {
        const s = json.summary;
        setState({
          status: "done",
          overview: s.overview ?? "",
          keyTopics: Array.isArray(s.keyTopics) ? s.keyTopics : [],
          examTips: Array.isArray(s.examTips) ? s.examTips : [],
          cached: !!json.cached,
        });
      }
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  if (state.status === "idle") {
    if (compact) {
      return (
        <button
          type="button"
          onClick={fetchSummary}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#5B35D5] hover:underline focus-visible:outline-none"
        >
          <Sparkles className="h-3 w-3" />
          Regenerate with Gemini
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={fetchSummary}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all",
          "border-[#5B35D5]/20 bg-[#EEEDFE]/60 hover:bg-[#EEEDFE]/80",
          "dark:border-[#5B35D5]/30 dark:bg-[#5B35D5]/[0.07] dark:hover:bg-[#5B35D5]/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B35D5] focus-visible:ring-offset-2"
        )}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5B35D5]/[0.07] text-[#5B35D5] dark:text-indigo-400">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#3B24A8] dark:text-indigo-300">Summarize with AI</p>
          <p className="text-xs text-[#5B35D5]/80 dark:text-indigo-400/70">Get key topics & exam tips · Powered by Gemini</p>
        </div>
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#5B35D5]/70" />
      </button>
    );
  }

  if (state.status === "loading") {
    return (
      <div className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3", "border-[#5B35D5]/20 bg-[#EEEDFE]/60", "dark:border-[#5B35D5]/30 dark:bg-[#5B35D5]/[0.07]")}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5B35D5]/[0.07] text-[#5B35D5]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-[#3B24A8] dark:text-indigo-300">Analysing material…</p>
          <p className="text-xs text-[#5B35D5]/80">Gemini is generating your summary</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={cn("rounded-2xl border px-4 py-3", "border-rose-200/60 bg-rose-50/60 dark:border-rose-800/40 dark:bg-rose-950/20")}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-rose-700 dark:text-rose-400">Couldn&apos;t generate summary</p>
            <p className="mt-0.5 text-xs text-rose-600/80">{state.message}</p>
          </div>
          <button
            type="button"
            onClick={fetchSummary}
            className="shrink-0 grid h-8 w-8 place-items-center rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
            aria-label="Retry"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // done
  return (
    <div className={cn("rounded-2xl border px-4 py-4 space-y-4", "border-[#5B35D5]/20 bg-[#EEEDFE]/50", "dark:border-[#5B35D5]/30 dark:bg-[#5B35D5]/[0.07]")}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-[#5B35D5]/[0.07] text-[#5B35D5] dark:text-indigo-400">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <p className="text-sm font-extrabold text-[#3B24A8] dark:text-indigo-300">AI Summary</p>
        <span className="ml-auto text-[10px] font-semibold text-[#5B35D5]/70">Gemini · {state.cached ? "cached" : "generated"}</span>
      </div>

      {/* Overview */}
      <p className="text-sm leading-relaxed text-foreground">{state.overview}</p>

      {/* Key Topics */}
      {state.keyTopics.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-extrabold text-[#3B24A8] dark:text-indigo-300">Key Topics</p>
          <div className="flex flex-wrap gap-2">
            {state.keyTopics.map((t, i) => (
              <span key={i} className="rounded-full border border-[#5B35D5]/20 bg-background px-2.5 py-1 text-xs font-semibold text-foreground dark:border-[#5B35D5]/30">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Exam Tips */}
      {state.examTips.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-extrabold text-[#3B24A8] dark:text-indigo-300">Exam Tips</p>
          <ul className="space-y-1.5">
            {state.examTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5B35D5]" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">AI can make mistakes. Cross-check with your lecturer or textbook.</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MaterialDetailClient({ material: m }: { material: Material }) {
  const kind = detectKind(m);
  const badge = fileTypeBadge(kind, m);
  const course = m.study_courses;
  const title = (m.title ?? course?.course_code ?? "Untitled material").trim();
  const fileUrl = m.file_url ?? "";
  const hasFile = fileUrl.length > 0;

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloads, setDownloads] = useState(m.downloads ?? 0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [upvoteCount] = useState(m.up_votes ?? 0);
  const [relatedMaterials, setRelatedMaterials] = useState<any[]>([]);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2600);
  }

  // Check if already saved
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = await getAuthedUserId();
      if (!userId || cancelled) return;
      const { data } = await supabase
        .from("study_saved_items")
        .select("id")
        .eq("user_id", userId)
        .eq("item_type", "material")
        .eq("material_id", m.id)
        .maybeSingle();
      if (!cancelled) setSaved(!!data);
    })();
    return () => { cancelled = true; };
  }, [m.id]);

  // Fetch related materials (same course code, max 4)
  useEffect(() => {
    let cancelled = false;
    const code = m.study_courses?.course_code;
    if (!code) return;
    (async () => {
      const { data: related } = await supabase
        .from("study_materials")
        .select("id,title,material_type,downloads,up_votes,file_path,created_at,study_courses:course_id(course_code)")
        .eq("approved", true)
        .eq("course_code", code)
        .neq("id", m.id)
        .order("downloads", { ascending: false })
        .limit(4);
      if (!cancelled && related?.length) setRelatedMaterials(related as any[]);
    })();
    return () => { cancelled = true; };
  }, [m.id, m.study_courses?.course_code]);

  async function handleToggleSave() {
    setSaving(true);
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      await toggleSaved({ itemType: "material", materialId: m.id });
      showToast(wasSaved ? "Removed from Library" : "Saved to Library");
    } catch (e: any) {
      setSaved(wasSaved);
      showToast(e?.message ?? "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    setDownloads((d) => d + 1);
    try {
      await supabase.rpc("increment_material_downloads", { material_id: m.id });
    } catch {
      setDownloads((d) => Math.max(0, d - 1));
    }
    showToast("Download started");
  }

  function handlePreview() {
    if (!hasFile) { showToast("No file available"); return; }
    if (kind === "other") {
      // Non-previewable: open in new tab and count as download
      window.open(fileUrl, "_blank", "noreferrer");
      handleDownload();
      return;
    }
    // pdf / image: open fullscreen modal — no download count (inline strip is free)
    setPreviewOpen(true);
  }

  async function handleShare() {
    const url = typeof window !== "undefined"
      ? window.location.href
      : `https://jabu.edu.ng/study/materials/${m.id}`;
    const title = m.title ?? "Study material";
    const text = [
      title,
      course ? `${course.course_code} · ${course.level}L` : "",
    ].filter(Boolean).join(" — ");

    // Try Web Share API first (mobile)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // User cancelled or browser doesn't support — fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard");
    } catch {
      showToast("Could not copy link");
    }
  }

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      {/* Back */}
      <div className="flex items-center gap-3">
        <Link
          href="/study/materials"
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
            "text-sm font-semibold text-foreground hover:bg-secondary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Materials
        </Link>
      </div>

      {/* Header card */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-4">
          {/* File type icon */}
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-border bg-background text-foreground">
            <FileIcon kind={kind} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-tight text-foreground leading-snug">{title}</h1>
              {m.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                </span>
              ) : null}
              {m.featured ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  <Star className="h-3.5 w-3.5" /> Featured
                </span>
              ) : null}
            </div>

            {m.description ? (
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{m.description}</p>
            ) : null}

            {/* Meta chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {badge}
              </span>
              {m.material_type ? (
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                  {formatMaterialType(m.material_type)}
                </span>
              ) : null}
              {course?.course_code ? (
                <Link
                  href={`/study/courses/${encodeURIComponent(course.course_code)}`}
                  className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground hover:bg-secondary/50"
                >
                  {course.course_code}
                </Link>
              ) : null}
              {course?.level ? (
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {course.level}L
                </span>
              ) : null}
              {course?.semester ? (
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {course.semester} sem
                </span>
              ) : null}
              {m.session ? (
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {m.session}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                <Clock className="h-3 w-3" />
                {timeAgo(m.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-5 flex items-center gap-2">
          <a
            href={hasFile ? `/api/study/materials/${m.id}/download` : "#"}
            download
            onClick={(e) => { if (!hasFile) { e.preventDefault(); return; } handleDownload(); }}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold no-underline transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B35D5] focus-visible:ring-offset-2",
              !hasFile
                ? "pointer-events-none border border-border/60 bg-muted text-muted-foreground"
                : "bg-[#5B35D5] text-white hover:bg-[#4526B8]"
            )}
          >
            <Download className="h-4 w-4" />
            Download
          </a>
          <button
            type="button"
            onClick={handleToggleSave}
            disabled={saving}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              saved ? "border-[#5B35D5]/30 bg-[#EEEDFE] text-[#3B24A8]" : "border-border/60 bg-background text-foreground hover:bg-secondary/50",
              saving ? "opacity-70" : ""
            )}
          >
            {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            {saved ? "Saved" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleShare}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm font-semibold transition",
              "hover:bg-secondary/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>

        {/* Download + upvote stat line */}
        <p className="mt-2.5 text-xs text-muted-foreground">
          {downloads.toLocaleString("en-NG")} downloads
          {upvoteCount > 0 && ` · ${upvoteCount} found helpful`}
        </p>
      </div>

      {/* ── AI Summary strip ── */}
      {m.ai_summary ? (
        <div className="rounded-r-2xl border-l-[3px] border-[#5B35D5] bg-[#EEEDFE] px-4 py-3.5 dark:bg-[#5B35D5]/10">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#5B35D5]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[#3B24A8] dark:text-indigo-300">AI Summary</p>
            <span className="ml-auto text-[10px] font-medium text-[#5B35D5]/70">verify before your exam</span>
          </div>
          <p className="text-sm leading-relaxed text-[#3B24A8]/85 dark:text-indigo-200">{m.ai_summary}</p>
          <div className="mt-3 border-t border-[#5B35D5]/15 pt-2">
            <AiSummarizeCard
              materialId={m.id}
              title={title}
              description={m.description}
              courseCode={course?.course_code}
              materialType={m.material_type}
              compact
            />
          </div>
        </div>
      ) : (
        <div className="rounded-r-2xl border-l-[3px] border-border bg-card px-4 py-3.5">
          <AiSummarizeCard
            materialId={m.id}
            title={title}
            description={m.description}
            courseCode={course?.course_code}
            materialType={m.material_type}
          />
        </div>
      )}

      {/* ── Inline preview strip ── */}
      {hasFile && (
        <InlinePreview url={fileUrl} title={title} kind={kind} />
      )}

      {/* About this material */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold text-muted-foreground">About this material</p>
        <div className="grid grid-cols-2 gap-4">
          {/* Course */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Course</p>
            {course ? (
              <>
                <p className="mt-1 text-sm font-extrabold text-foreground">{course.course_code}</p>
                {course.course_title ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{course.course_title}</p>
                ) : null}
                <Link
                  href={`/study/courses/${encodeURIComponent(course.course_code)}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline"
                >
                  View course page <ArrowRight className="h-3 w-3" />
                </Link>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">—</p>
            )}
          </div>

          {/* Level */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Level</p>
            <p className="mt-1 text-sm font-extrabold text-foreground">
              {course?.level ? `${course.level}L` : "—"}
            </p>
          </div>

          {/* Uploaded by */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Uploaded by</p>
            <p className="mt-1 text-sm font-extrabold text-foreground truncate">
              {m.uploader_email ? obfuscateEmail(m.uploader_email) : "A student"}
            </p>
          </div>

          {/* Downloads */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Downloads</p>
            <p className="mt-1 text-2xl font-extrabold text-foreground">{downloads.toLocaleString("en-NG")}</p>
          </div>
        </div>
      </div>

      {/* Related materials */}
      {relatedMaterials.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-foreground mb-3">
            More for {course?.course_code ?? "this course"}
          </p>
          <div className="space-y-2">
            {relatedMaterials.map((r) => (
              <Link
                key={r.id}
                href={`/study/materials/${r.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 hover:bg-secondary/50 no-underline"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{r.title ?? "Untitled"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.material_type?.replace("_", " ")} · {r.downloads ?? 0} downloads
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      <div className="rounded-2xl border border-border bg-background p-3 text-center">
        <Link href="/study/report" className="text-xs text-muted-foreground hover:text-foreground">
          Something wrong with this material? Report it →
        </Link>
      </div>

      {/* Preview modal */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={title}
        url={fileUrl}
        kind={kind}
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