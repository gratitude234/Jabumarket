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
  Send,
  Share2,
  Sparkles,
  Star,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { toggleSaved } from "@/lib/studySaved";
import { supabase } from "@/lib/supabase";

type GeneratedQuestion = {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
  explanation: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "model";
  text: string;
};

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

function getInitials(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase();
}

function formatMaterialType(t: string | null) {
  if (!t) return "Material";
  return (
    {
      past_question: "Past Question",
      handout: "Handout",
      note: "Lecture Note",
      slides: "Slides",
      timetable: "Timetable",
      other: "Other",
    }[t] ?? t
  );
}

const GDOCS = (url: string) =>
  `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

function PdfViewer({ url, heightClass = "h-[70vh]" }: { url: string; heightClass?: string }) {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const src = useFallback ? GDOCS(url) : url;

  useEffect(() => { setLoading(true); setErrored(false); }, [src]);
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
                <button type="button" onClick={() => { setUseFallback(true); setErrored(false); }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3 py-2 text-xs font-semibold text-foreground hover:opacity-90">
                  <RefreshCw className="h-3.5 w-3.5" /> Try Google Docs viewer
                </button>
              )}
              <a href={url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary/50">
                <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
              </a>
            </div>
          </div>
        </div>
      ) : (
        <iframe key={src} title="PDF preview" src={src} className="h-full w-full"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setErrored(true); }} />
      )}
    </div>
  );
}

function ImageViewer({ url, title, heightClass = "h-[70vh]" }: { url: string; title: string; heightClass?: string }) {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  return (
    <div className={cn("relative w-full overflow-auto rounded-2xl border border-border bg-background", heightClass, zoomed ? "cursor-zoom-out" : "cursor-zoom-in")}
      onClick={() => setZoomed((v) => !v)} title={zoomed ? "Click to zoom out" : "Click to zoom in"}>
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
        <img src={url} alt={title}
          className={cn("transition-transform duration-300 ease-in-out select-none",
            zoomed ? "min-h-full min-w-full object-contain scale-150 origin-top-left" : "h-full w-full object-contain")}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setErrored(true); }}
          draggable={false} />
      )}
      {!loading && !errored && (
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-1 text-[10px] font-semibold text-muted-foreground backdrop-blur">
          {zoomed ? <ZoomOut className="h-3 w-3" /> : <ZoomIn className="h-3 w-3" />}
          {zoomed ? "Zoom out" : "Zoom in"}
        </div>
      )}
    </div>
  );
}

function InlinePreview({ url, title, kind }: { url: string; title: string; kind: "pdf" | "image" | "other" }) {
  const [open, setOpen] = useState(false);
  if (kind === "other" || !url) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-expanded={open}>
        <div className="flex items-center gap-3">
          {kind === "pdf" ? <FileText className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <div>
            <p className="text-sm font-semibold text-foreground">{open ? "Hide preview" : `Preview ${kind === "pdf" ? "PDF" : "image"}`}</p>
            {!open && <p className="text-xs text-muted-foreground">Tap to expand inline</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/50">
            Open <ExternalLink className="h-3 w-3" />
          </a>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
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

function PreviewModal({ open, onClose, title, url, kind }: { open: boolean; onClose: () => void; title: string; url: string; kind: "pdf" | "image" | "other" }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full flex-col md:m-auto md:h-auto md:w-[90vw] md:max-w-4xl md:rounded-3xl md:border md:border-border md:shadow-2xl bg-card">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary/50">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
            <button type="button" onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-2xl border border-border bg-background hover:bg-secondary/50" aria-label="Close preview">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
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

type AiSummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; overview: string; keyTopics: string[]; examTips: string[]; cached: boolean }
  | { status: "error"; message: string };

function AiSummarizeCard({ materialId, title, description, courseCode, materialType, compact }: {
  materialId: string; title: string; description: string | null;
  courseCode: string | null | undefined; materialType: string | null; compact?: boolean;
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
        setState({ status: "done", overview: s.overview ?? "", keyTopics: Array.isArray(s.keyTopics) ? s.keyTopics : [], examTips: Array.isArray(s.examTips) ? s.examTips : [], cached: !!json.cached });
      }
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  if (state.status === "idle") {
    if (compact) {
      return (
        <button type="button" onClick={fetchSummary}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#5B4FD9] hover:underline focus-visible:outline-none">
          <Sparkles className="h-3 w-3" /> Regenerate with Gemini
        </button>
      );
    }
    return (
      <button type="button" onClick={fetchSummary}
        className="flex w-full items-center gap-3 rounded-xl border border-[#5B4FD9]/20 bg-[#EEEDFE]/70 px-4 py-3.5 text-left transition hover:bg-[#EEEDFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B4FD9] dark:border-[#5B4FD9]/30 dark:bg-[#5B4FD9]/[0.07] dark:hover:bg-[#5B4FD9]/10">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5B4FD9] text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#3A2EB8] dark:text-indigo-300">Summarize with AI</p>
          <p className="text-xs text-[#5B4FD9]/70 dark:text-indigo-400/70">Key topics & exam tips · Gemini</p>
        </div>
      </button>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[#5B4FD9]/20 bg-[#EEEDFE]/70 px-4 py-3.5 dark:border-[#5B4FD9]/30 dark:bg-[#5B4FD9]/[0.07]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5B4FD9] text-white">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
        <div>
          <p className="text-sm font-bold text-[#3A2EB8] dark:text-indigo-300">Analysing material…</p>
          <p className="text-xs text-[#5B4FD9]/70">Gemini is generating your summary</p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-rose-200/60 bg-rose-50/60 px-4 py-3 dark:border-rose-800/40 dark:bg-rose-950/20">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-rose-700 dark:text-rose-400">Couldn&apos;t generate summary</p>
            <p className="mt-0.5 text-xs text-rose-600/80">{state.message}</p>
          </div>
          <button type="button" onClick={fetchSummary}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50" aria-label="Retry">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-[#5B4FD9]/20 bg-[#EEEDFE]/50 px-4 py-4 dark:border-[#5B4FD9]/30 dark:bg-[#5B4FD9]/[0.07]">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-[#5B4FD9] text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <p className="text-sm font-bold text-[#3A2EB8] dark:text-indigo-300">AI Summary</p>
        <span className="ml-auto text-[10px] font-semibold text-[#5B4FD9]/70">Gemini · {state.cached ? "cached" : "generated"}</span>
      </div>
      <p className="text-sm leading-relaxed text-foreground">{state.overview}</p>
      {state.keyTopics.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold text-[#3A2EB8] dark:text-indigo-300">Key Topics</p>
          <div className="flex flex-wrap gap-2">
            {state.keyTopics.map((t, i) => (
              <span key={i} className="rounded-full border border-[#5B4FD9]/20 bg-white px-2.5 py-1 text-xs font-semibold text-foreground dark:border-[#5B4FD9]/30 dark:bg-background">{t}</span>
            ))}
          </div>
        </div>
      )}
      {state.examTips.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold text-[#3A2EB8] dark:text-indigo-300">Exam Tips</p>
          <ul className="space-y-1.5">
            {state.examTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5B4FD9]" />
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

export default function MaterialDetailClient({
  material: m, initialSaved = false, relatedMaterials: initialRelatedMaterials = [],
}: {
  material: Material; initialSaved?: boolean; relatedMaterials?: any[];
}) {
  const kind = detectKind(m);
  const badge = fileTypeBadge(kind, m);
  const course = m.study_courses;
  const title = (m.title ?? course?.course_code ?? "Untitled material").trim();
  const fileUrl = m.file_url ?? "";
  const hasFile = fileUrl.length > 0;

  const [saved, setSaved] = useState(initialSaved);
  const [saving, setSaving] = useState(false);
  const [downloads, setDownloads] = useState(m.downloads ?? 0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const upvoteCount = m.up_votes ?? 0;
  const [relatedMaterials] = useState<any[]>(initialRelatedMaterials);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [genQsLoading, setGenQsLoading] = useState(false);
  const [genQsError, setGenQsError] = useState<string | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[] | null>(null);
  const [genQsSheetOpen, setGenQsSheetOpen] = useState(false);
  const [savingQs, setSavingQs] = useState(false);
  const [savedSetId, setSavedSetId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2600);
  }

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);
  useEffect(() => { if (!chatOpen) return; chatInputRef.current?.focus(); }, [chatOpen]);

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

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : `https://jabu.edu.ng/study/materials/${m.id}`;
    const shareTitle = m.title ?? "Study material";
    const text = [shareTitle, course ? `${course.course_code} · ${course.level}L` : ""].filter(Boolean).join(" — ");
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: shareTitle, text, url }); return; } catch { /* fall through */ }
    }
    try { await navigator.clipboard.writeText(url); showToast("Link copied to clipboard"); }
    catch { showToast("Could not copy link"); }
  }

  async function handleGenerateQuestions() {
    setGenQsLoading(true);
    setGenQsError(null);
    setSavedSetId(null);
    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId: m.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate questions.");
      setGeneratedQuestions(data.questions);
      setRevealed({});
      setGenQsSheetOpen(true);
    } catch (e: unknown) {
      setGenQsError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setGenQsLoading(false);
    }
  }

  async function handleSaveQuestions() {
    if (!generatedQuestions || !m.study_courses?.id) return;
    setSavingQs(true);
    try {
      const res = await fetch("/api/ai/save-generated-questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId: m.id, courseId: m.study_courses.id, questions: generatedQuestions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSavedSetId(data.setId);
    } finally { setSavingQs(false); }
  }

  async function handleChatSend() {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text: message };
    const modelMessageId = crypto.randomUUID();
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await fetch("/api/ai/material-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId: m.id, message, history: chatHistory }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Chat failed."); }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let modelText = "";
      setChatHistory([...updatedHistory, { id: modelMessageId, role: "model", text: "" }]);
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          modelText += decoder.decode(value, { stream: true });
          setChatHistory([...updatedHistory, { id: modelMessageId, role: "model", text: modelText }]);
        }
      }
    } catch (e: unknown) {
      setChatError(e instanceof Error ? e.message : "Something went wrong.");
      setChatHistory(chatHistory);
    } finally { setChatLoading(false); }
  }

  const MetaPill = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90">
      {children}
    </span>
  );

  return (
    <div className="space-y-3 pb-28 md:pb-8">

      {/* Back */}
      <div>
        <Link href="/study/materials"
          className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <ArrowLeft className="h-4 w-4" /> Materials
        </Link>
      </div>

      {/* ══ HERO CARD ══ */}
      <div className="overflow-hidden rounded-3xl border border-border shadow-sm">

        {/* Purple gradient banner */}
        <div className="relative bg-gradient-to-br from-[#5B4FD9] to-[#7B6FE9] px-5 pt-5 pb-6">
          <div className="pointer-events-none absolute -top-10 -right-8 h-40 w-40 rounded-full bg-white/[0.06]" />
          <div className="pointer-events-none absolute -bottom-8 left-4 h-24 w-24 rounded-full bg-white/[0.04]" />

          {/* Context chips */}
          <div className="relative mb-4 flex flex-wrap items-center gap-1.5">
            {course?.course_code && <MetaPill>{course.course_code}</MetaPill>}
            {course?.level && <MetaPill>{course.level}L</MetaPill>}
            {course?.semester && <MetaPill>{course.semester} sem</MetaPill>}
            {m.session && <MetaPill>{m.session}</MetaPill>}
          </div>

          {/* Icon + title */}
          <div className="relative flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-white">
              <FileIcon kind={kind} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold leading-snug tracking-tight text-white">{title}</h1>
                {m.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-100">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </span>
                )}
                {m.featured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
                    <Star className="h-3 w-3" /> Featured
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <MetaPill>{badge}</MetaPill>
                {m.material_type && <MetaPill>{formatMaterialType(m.material_type)}</MetaPill>}
                <MetaPill><Clock className="mr-1 h-2.5 w-2.5" />{timeAgo(m.created_at)}</MetaPill>
              </div>
            </div>
          </div>

          {m.description && (
            <p className="relative mt-3 text-sm leading-relaxed text-white/75">{m.description}</p>
          )}
        </div>

        {/* Action area */}
        <div className="space-y-3 bg-card px-5 pt-4 pb-5">

          {/* Primary action row */}
          <div className="flex items-center gap-2">
            <a href={hasFile ? `/api/study/materials/${m.id}/download` : "#"} download
              onClick={(e) => { if (!hasFile) { e.preventDefault(); return; } handleDownload(); }}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold no-underline transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B4FD9] focus-visible:ring-offset-2",
                !hasFile ? "pointer-events-none border border-border/60 bg-muted text-muted-foreground"
                  : "bg-[#5B4FD9] text-white hover:bg-[#4A3FC8] active:scale-[0.98]"
              )}>
              <Download className="h-4 w-4" /> Download PDF
            </a>

            <button type="button" onClick={handleToggleSave} disabled={saving} aria-label={saved ? "Remove from library" : "Save to library"}
              className={cn(
                "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                saved ? "border-[#5B4FD9]/30 bg-[#EEEDFE] text-[#3A2EB8]" : "border-border/60 bg-background text-foreground hover:bg-secondary/50",
                saving ? "opacity-60" : ""
              )}>
              {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            </button>

            <button type="button" onClick={handleShare} aria-label="Share"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background text-foreground transition hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {downloads.toLocaleString("en-NG")} downloads
            {upvoteCount > 0 && ` · ${upvoteCount} found helpful`}
          </p>

          <div className="border-t border-border/60" />

          {/* AI feature cluster */}
          <div className="space-y-2">
            {/* Generate practice questions */}
            {kind === "pdf" && (
              <button type="button" onClick={handleGenerateQuestions} disabled={genQsLoading}
                className="flex w-full items-center gap-3 rounded-xl border border-[#5B4FD9]/20 bg-[#EEEDFE]/70 px-4 py-3.5 text-left transition hover:bg-[#EEEDFE] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B4FD9]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5B4FD9] text-white">
                  {genQsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#3A2EB8]">
                    {genQsLoading ? "Generating questions…" : "Generate Practice Questions"}
                  </p>
                  <p className="text-xs text-[#5B4FD9]/70">AI-powered exam prep from this material</p>
                </div>
              </button>
            )}
            {genQsError && <p className="text-center text-xs text-red-500">{genQsError}</p>}

            {/* Summarize + Ask AI side by side */}
            <div className={cn("gap-2", kind === "pdf" ? "grid grid-cols-2" : "block")}>
              <AiSummarizeCard materialId={m.id} title={title} description={m.description}
                courseCode={course?.course_code} materialType={m.material_type} />

              {kind === "pdf" && (
                <button type="button" onClick={() => setChatOpen((v) => !v)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-xl border px-4 py-3.5 text-left transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B4FD9]",
                    chatOpen
                      ? "border-[#5B4FD9]/30 bg-[#EEEDFE]"
                      : "border-border/60 bg-background hover:bg-secondary/40"
                  )}>
                  <span className={cn("grid h-9 w-9 place-items-center rounded-xl", chatOpen ? "bg-[#5B4FD9] text-white" : "bg-secondary text-muted-foreground")}>
                    <Send className="h-4 w-4" />
                  </span>
                  <div>
                    <p className={cn("text-sm font-bold", chatOpen ? "text-[#3A2EB8]" : "text-foreground")}>Ask AI</p>
                    <p className="text-xs text-muted-foreground">Ask anything</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Existing AI summary strip */}
      {m.ai_summary && (
        <div className="rounded-2xl border-l-[3px] border-[#5B4FD9] bg-[#EEEDFE] px-4 py-3.5 dark:bg-[#5B4FD9]/10">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[#5B4FD9]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[#3A2EB8] dark:text-indigo-300">AI Summary</p>
            <span className="ml-auto text-[10px] font-medium text-[#5B4FD9]/70">verify before your exam</span>
          </div>
          <p className="text-sm leading-relaxed text-[#3A2EB8]/85 dark:text-indigo-200">{m.ai_summary}</p>
          <div className="mt-3 border-t border-[#5B4FD9]/15 pt-2">
            <AiSummarizeCard materialId={m.id} title={title} description={m.description}
              courseCode={course?.course_code} materialType={m.material_type} compact />
          </div>
        </div>
      )}

      {/* Chat panel */}
      {kind === "pdf" && chatOpen && (
        <div className="overflow-hidden rounded-2xl border border-[#5B4FD9]/25 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#5B4FD9]" />
              <p className="text-sm font-semibold text-foreground">Ask AI about this material</p>
            </div>
            <div className="flex items-center gap-2">
              {chatHistory.length > 0 && (
                <button type="button" onClick={() => { setChatHistory([]); setChatError(null); }}
                  className="rounded-xl border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-secondary/30 hover:text-foreground">
                  Clear
                </button>
              )}
              <button type="button" onClick={() => setChatOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-xl border border-border/60 text-muted-foreground hover:bg-secondary/40">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto px-4 py-3">
            {chatHistory.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Ask anything about this document. AI answers only from its content.
              </p>
            )}
            {chatHistory.map((msg) => (
              <div key={msg.id} className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "user" ? "ml-auto bg-[#5B4FD9] text-white" : "mr-auto bg-[#EEEDFE] text-[#3A2EB8]")}>
                {msg.text || (<span className="flex items-center gap-1.5 text-[#5B4FD9]/60"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</span>)}
              </div>
            ))}
            {chatError && <p className="text-center text-xs text-red-500">{chatError}</p>}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2.5">
            <input ref={chatInputRef} type="text" value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleChatSend(); }}
              placeholder="Ask a question…" disabled={chatLoading}
              className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition focus:border-[#5B4FD9] focus:ring-2 focus:ring-[#5B4FD9]/20 disabled:opacity-60" />
            <button type="button" onClick={handleChatSend} disabled={chatLoading || !chatInput.trim()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#5B4FD9] text-white transition hover:bg-[#3A2EB8] disabled:opacity-50">
              {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Inline preview */}
      {hasFile && <InlinePreview url={fileUrl} title={title} kind={kind} />}

      {/* About card */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">About this material</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Course</p>
            {course ? (
              <>
                <p className="mt-1 text-base font-bold text-foreground">{course.course_code}</p>
                {course.course_title && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{course.course_title}</p>}
                <Link href={`/study/courses/${encodeURIComponent(course.course_code)}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#5B4FD9] hover:underline">
                  View course <ArrowRight className="h-3 w-3" />
                </Link>
              </>
            ) : <p className="mt-1 text-sm text-muted-foreground">—</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Level</p>
            <p className="mt-1 text-base font-bold text-foreground">{course?.level ? `${course.level}L` : "—"}</p>
            {m.verified && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Verified
              </span>
            )}
          </div>
        </div>
        <div className="my-4 border-t border-border/60" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EEEDFE] text-[11px] font-bold text-[#5B4FD9]">
              {getInitials(m.uploader_email)}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">Uploaded by</p>
              <p className="truncate text-xs font-semibold text-foreground">
                {m.uploader_email ? obfuscateEmail(m.uploader_email) : "A student"}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] text-muted-foreground">Downloads</p>
            <p className="text-xl font-bold text-foreground">{downloads.toLocaleString("en-NG")}</p>
          </div>
        </div>
      </div>

      {/* Related materials */}
      {relatedMaterials.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-foreground">More for {course?.course_code ?? "this course"}</p>
          <div className="space-y-2">
            {relatedMaterials.map((r) => (
              <Link key={r.id} href={`/study/materials/${r.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 no-underline transition hover:bg-secondary/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{r.title ?? "Untitled"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.material_type?.replace("_", " ")} · {r.downloads ?? 0} downloads</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      <div className="rounded-2xl border border-border/50 bg-background p-3 text-center">
        <Link href="/study/report" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground">
          Something wrong with this material? Report it →
        </Link>
      </div>

      {/* Preview modal */}
      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} title={title} url={fileUrl} kind={kind} />

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div role="status" className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-lg">
            {toast}
          </div>
        </div>
      )}

      {/* Generated Questions Sheet */}
      {genQsSheetOpen && generatedQuestions && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setGenQsSheetOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-3xl bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div>
                <p className="text-sm font-bold text-foreground">Practice Questions</p>
                <p className="text-xs text-muted-foreground">{generatedQuestions.length} questions generated by AI</p>
              </div>
              <button type="button" onClick={() => setGenQsSheetOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background text-muted-foreground hover:bg-secondary/50 focus-visible:outline-none">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-36">
              {generatedQuestions.map((q, idx) => (
                <div key={idx} className="rounded-2xl border border-border bg-background p-4">
                  <p className="mb-3 text-sm font-bold text-foreground">{idx + 1}. {q.question}</p>
                  <div className="space-y-2">
                    {(["A", "B", "C", "D"] as const).map((key) => {
                      const isRevealed = revealed[idx] === true;
                      const isCorrect = q.answer === key;
                      return (
                        <div key={key} className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-sm",
                          isRevealed && isCorrect ? "border-l-4 border-[#5B4FD9] bg-[#EEEDFE] font-semibold text-[#3A2EB8]" : "border border-border/60 text-foreground")}>
                          <span className="shrink-0 font-bold">{key}.</span>
                          <span>{q.options[key]}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    {revealed[idx] ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-[#5B4FD9]">Explanation: </span>{q.explanation}
                      </p>
                    ) : (
                      <button type="button" onClick={() => setRevealed((prev) => ({ ...prev, [idx]: true }))}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#5B4FD9]/30 bg-[#EEEDFE] px-3 py-2 text-xs font-semibold text-[#3A2EB8] transition hover:bg-[#E5E2FF]">
                        Reveal answer
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 border-t border-border bg-card px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {savedSetId ? (
                <Link href={`/study/practice/${savedSetId}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5B4FD9] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4A3FC8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B4FD9]">
                  Start Practicing →
                </Link>
              ) : (
                <button type="button" onClick={handleSaveQuestions} disabled={savingQs}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5B4FD9] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4A3FC8] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B4FD9]">
                  {savingQs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {savingQs ? "Saving…" : "Save to Practice"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}