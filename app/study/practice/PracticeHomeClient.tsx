"use client";
import { cn } from "@/lib/utils";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import StudyTabs from "../_components/StudyTabs";
import { Card, EmptyState, PageHeader, SkeletonCard } from "../_components/StudyUI";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Hash,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  SortAsc,
  SortDesc,
  Play,
  History,
  Info,
  Flame,
  Layers,
  Plus,
  Loader2,
  ShieldCheck,
  Lock,
  PenLine,
} from "lucide-react";

function normalizeQuery(v: string) {
  return v.trim().replace(/\s+/g, " ");
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

type SortKey = "newest" | "oldest";
const SORTS: Array<{ key: SortKey; label: string; icon: React.ReactNode }> = [
  { key: "newest", label: "Newest", icon: <SortDesc className="h-4 w-4" /> },
  { key: "oldest", label: "Oldest", icon: <SortAsc className="h-4 w-4" /> },
];

const LEVELS = ["100", "200", "300", "400", "500"] as const;
const SEMESTERS = ["1st", "2nd", "summer"] as const;

type ViewKey = "for_you" | "recent" | "all";

type QuizSetRow = {
  id: string;
  title: string | null;
  description: string | null;

  course_code?: string | null;
  level?: number | null;
  semester?: string | null;

  published?: boolean | null;
  approved?: boolean | null;

  questions_count?: number | null;
  total_questions?: number | null;

  time_limit_minutes?: number | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  created_at?: string | null;
};

type LatestAttempt = {
  id: string;
  set_id: string | null;
  created_at: string | null;
  updated_at?: string | null;

  score?: number | null;
  total_questions?: number | null;

  study_quiz_sets?: {
    id: string;
    title: string | null;
    course_code?: string | null;
  } | null;
};

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
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
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
          : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      )}
    >
      {children}
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
        checked
          ? "border-border bg-secondary text-foreground"
          : "border-border/60 bg-background hover:bg-secondary/50"
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

function safeSemesterLabel(v?: string | null) {
  const s = (v ?? "").toString().trim().toLowerCase();
  if (!s) return "";
  if (s === "first") return "1st";
  if (s === "second") return "2nd";
  return s;
}

const DIFFICULTY_STYLES: Record<
  "easy" | "medium" | "hard",
  { label: string; className: string }
> = {
  easy:   { label: "Easy",   className: "border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300" },
  medium: { label: "Medium", className: "border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300" },
  hard:   { label: "Hard",   className: "border-rose-200/80 bg-rose-50/80 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300" },
};

function DifficultyBadge({ difficulty }: { difficulty: "easy" | "medium" | "hard" }) {
  const s = DIFFICULTY_STYLES[difficulty];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-extrabold",
        s.className
      )}
    >
      {difficulty === "easy" ? "●" : difficulty === "medium" ? "◆" : "▲"} {s.label}
    </span>
  );
}

function pill(text: string, icon?: React.ReactNode) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      {icon ? icon : null}
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground",
        "hover:opacity-90 disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground",
        "hover:bg-secondary/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {children}
    </button>
  );
}

function MiniTabs({ value, onChange }: { value: ViewKey; onChange: (v: ViewKey) => void }) {
  const items: Array<{ k: ViewKey; label: string; icon: React.ReactNode }> = [
    { k: "for_you", label: "For you", icon: <Sparkles className="h-4 w-4" /> },
    { k: "recent", label: "Recent", icon: <History className="h-4 w-4" /> },
    { k: "all", label: "All sets", icon: <Layers className="h-4 w-4" /> },
  ];

  return (
    <div className="flex w-full items-center gap-2 overflow-x-auto rounded-3xl border border-border bg-background p-2">
      {items.map((it) => {
        const active = value === it.k;
        return (
          <button
            key={it.k}
            type="button"
            onClick={() => onChange(it.k)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function QuizSetCard({ s, onStart, onPreview }: { s: QuizSetRow; onStart: () => void; onPreview: () => void }) {
  const title = (s.title ?? "Untitled set").trim() || "Untitled set";
  const code = (s.course_code ?? "").toString().trim().toUpperCase();
  const sem = safeSemesterLabel(s.semester);
  const level = typeof s.level === "number" ? `${s.level}L` : "";
  const qCount =
    typeof s.questions_count === "number"
      ? s.questions_count
      : typeof s.total_questions === "number"
      ? s.total_questions
      : null;

  const time =
    typeof s.time_limit_minutes === "number" && Number.isFinite(s.time_limit_minutes)
      ? `${s.time_limit_minutes} min`
      : "";

  return (
    <Card className="w-full max-w-full overflow-hidden rounded-3xl p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {s.description ? s.description : "Practice past questions and test yourself."}
          </p>

          <div className="mt-3 flex max-w-full flex-wrap items-center gap-2">
            {code ? pill(code, <Hash className="h-3.5 w-3.5" />) : null}
            {level ? pill(level) : null}
            {sem ? pill(`${sem} sem`, <Clock className="h-3.5 w-3.5" />) : null}
            {qCount !== null ? pill(`${qCount} questions`) : null}
            {time ? pill(time) : null}
            {s.created_at ? pill(formatWhen(s.created_at)) : null}
            {s.difficulty ? <DifficultyBadge difficulty={s.difficulty} /> : null}
          </div>
        </div>

        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background">
          <BookOpen className="h-5 w-5 text-foreground" />
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
        <PrimaryButton onClick={onStart}>
          <Play className="h-4 w-4" />
          Start
          <ArrowRight className="h-4 w-4" />
        </PrimaryButton>

        <SecondaryButton onClick={onPreview}>
          <Info className="h-4 w-4" />
          Preview
        </SecondaryButton>
      </div>
    </Card>
  );
}

// ─── Rep status ───────────────────────────────────────────────────────────────

type RepStatus = "loading" | "not_applied" | "pending" | "rejected" | "approved";

type RepScope = {
  faculty_id: string | null;
  department_id: string | null;
  levels: number[] | null;
  all_levels: boolean;
} | null;

// ─── Create Set Drawer ────────────────────────────────────────────────────────

const SEMESTERS_OPT = ["1st", "2nd", "summer"] as const;
const LEVELS_OPT    = [100, 200, 300, 400, 500, 600] as const;

function CreateSetDrawer({
  open,
  onClose,
  repScope,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  repScope: RepScope;
  onCreated: (newId: string) => void;
}) {
  const router = useRouter();
  const [title, setTitle]         = useState("");
  const [description, setDesc]    = useState("");
  const [courseCode, setCourse]   = useState("");
  const [level, setLevel]         = useState("");
  const [semester, setSemester]   = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  // Reset form whenever drawer opens
  useEffect(() => {
    if (!open) return;
    setTitle(""); setDesc(""); setCourse("");
    setLevel(""); setSemester(""); setTimeLimit("");
    setDifficulty("");
    setErr(null); setSaving(false);
  }, [open]);

  // Limit level options to rep's approved scope if applicable
  const allowedLevels = repScope?.all_levels
    ? LEVELS_OPT
    : repScope?.levels?.length
      ? (LEVELS_OPT.filter((l) => repScope!.levels!.includes(l)) as unknown as typeof LEVELS_OPT)
      : LEVELS_OPT;

  async function handleSubmit() {
    const t = title.trim();
    if (!t) { setErr("Title is required."); return; }

    const lvNum = level ? Number(level) : null;
    const tlNum = timeLimit ? Number(timeLimit) : null;

    if (tlNum !== null && (!Number.isFinite(tlNum) || tlNum <= 0)) {
      setErr("Time limit must be a positive number of minutes."); return;
    }

    setSaving(true);
    setErr(null);

    try {
      const payload: Record<string, unknown> = {
        title: t,
        description: description.trim() || null,
        course_code:  courseCode.trim().toUpperCase() || null,
        level:        lvNum,
        semester:     semester || null,
        time_limit_minutes: tlNum,
        difficulty:   difficulty || null,
        published: false,
        questions_count: 0,
      };

      const { data, error } = await supabase
        .from("study_quiz_sets")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      const newId = (data as { id: string }).id;
      onCreated(newId);
      onClose();
      // Navigate to the admin editor to add questions
      router.push(`/admin/study/practice/${newId}`);
    } catch (e: any) {
      setErr(e?.message || "Failed to create set. Check your permissions.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Create practice set"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground",
              "hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-foreground bg-foreground px-4 py-3 text-sm font-semibold text-background",
              "hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            {saving ? "Creating…" : "Create & add questions"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {err && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {/* Rep badge */}
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-secondary/50 px-3 py-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground">
            {repScope?.all_levels
              ? "Rep access — all levels"
              : `Rep access — level${(repScope?.levels?.length ?? 0) > 1 ? "s" : ""} ${(repScope?.levels ?? []).join(", ")}`}
          </p>
        </div>

        {/* Title */}
        <label className="block rounded-2xl border border-border bg-background px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">Title *</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. GST101 Past Questions 2024"
            className="mt-1 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </label>

        {/* Description */}
        <label className="block rounded-2xl border border-border bg-background px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Short description of what's covered…"
            rows={2}
            className="mt-1 w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        {/* Course + Level */}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block rounded-2xl border border-border bg-background px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">Course code</span>
            <input
              value={courseCode}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. GST101"
              className="mt-1 w-full bg-transparent text-sm text-foreground uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground"
            />
          </label>

          <label className="block rounded-2xl border border-border bg-background px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">Level</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="mt-1 w-full bg-transparent text-sm text-foreground outline-none"
            >
              <option value="">Any level</option>
              {allowedLevels.map((l) => (
                <option key={l} value={l}>{l}L</option>
              ))}
            </select>
          </label>
        </div>

        {/* Semester + Time limit */}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block rounded-2xl border border-border bg-background px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">Semester</span>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="mt-1 w-full bg-transparent text-sm text-foreground outline-none"
            >
              <option value="">Any</option>
              {SEMESTERS_OPT.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="block rounded-2xl border border-border bg-background px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">Time limit (minutes)</span>
            <input
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)}
              placeholder="e.g. 60 (leave blank = untimed)"
              inputMode="numeric"
              className="mt-1 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        {/* Difficulty */}
        <div className="block rounded-2xl border border-border bg-background px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">Difficulty</span>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {(["", "easy", "medium", "hard"] as const).map((d) => {
              const label = d === "" ? "Any" : d === "easy" ? "● Easy" : d === "medium" ? "◆ Medium" : "▲ Hard";
              const active = difficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    "inline-flex items-center justify-center rounded-xl border px-2 py-2 text-[11px] font-semibold transition",
                    active
                      ? d === "" ? "border-border bg-secondary text-foreground"
                        : d === "easy" ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : d === "medium" ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-rose-300 bg-rose-50 text-rose-700"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Easy = warm-up / ≤10 Qs · Medium = 11–30 Qs · Hard = exam sim / 30+ Qs
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          After creating the set you'll be taken to the editor to add questions. The set starts unpublished — submit it
          for review when ready.
        </p>
      </div>
    </Drawer>
  );
}

export default function PracticeHomeClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // URL params
  const qParam = sp.get("q") ?? "";
  const courseParam = sp.get("course") ?? "";
  const levelParam = sp.get("level") ?? "";
  const semesterParam = sp.get("semester") ?? "";
  const sortParam = (sp.get("sort") ?? "newest") as SortKey;
  const difficultyParam = sp.get("difficulty") ?? "";

  // view tab
  const viewParam = (sp.get("view") ?? "for_you") as ViewKey;

  // published-only toggle
  const publishedParam = sp.get("published") ?? "";
  const publishedOnly = publishedParam === "1";

  // Local state
  const [q, setQ] = useState(qParam);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Preview sheet
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSet, setPreviewSet] = useState<QuizSetRow | null>(null);

  // Drawer drafts
  const [draftCourse, setDraftCourse] = useState(courseParam);
  const [draftLevel, setDraftLevel] = useState(levelParam);
  const [draftSemester, setDraftSemester] = useState(semesterParam);
  const [draftSort, setDraftSort] = useState<SortKey>(sortParam);
  const [draftPublished, setDraftPublished] = useState(publishedOnly);
  const [draftDifficulty, setDraftDifficulty] = useState(difficultyParam);

  // Data
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sets, setSets] = useState<QuizSetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);

  // Attempts
  const [latestAttempt, setLatestAttempt] = useState<LatestAttempt | null>(null);
  const [recentAttempts, setRecentAttempts] = useState<LatestAttempt[]>([]);

  // User prefs — used to personalize the "For you" tab without requiring URL params
  const [userPrefs, setUserPrefs] = useState<{
    course_code?: string | null;
    level?: number | null;
    semester?: string | null;
    department_id?: string | null;
    faculty_id?: string | null;
  } | null>(null);

  // Load user prefs once on mount
  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) return;
        const { data } = await supabase
          .from("study_preferences")
          .select("level, semester, department_id, faculty_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) setUserPrefs(data as any);
      } catch {
        // non-fatal — for_you falls back to URL params only
      }
    })();
  }, []);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // ── Rep status (gates "Create set" button) ──────────────────────────────
  const [repStatus, setRepStatus]   = useState<RepStatus>("loading");
  const [repScope, setRepScope]     = useState<RepScope>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/study/rep-applications/me");
        if (!res.ok) { if (mounted) setRepStatus("not_applied"); return; }
        const json = await res.json();
        if (!mounted) return;
        if (json.status === "approved") {
          setRepStatus("approved");
          setRepScope(json.scope ?? null);
        } else {
          setRepStatus(json.status ?? "not_applied");
        }
      } catch {
        if (mounted) setRepStatus("not_applied");
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Pagination
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);

  const filtersKey = useMemo(() => {
    return [
      normalizeQuery(qParam),
      courseParam.trim().toUpperCase(),
      levelParam,
      semesterParam,
      difficultyParam,
      sortParam,
      publishedOnly ? "p1" : "p0",
      viewParam,
    ].join("|");
  }, [qParam, courseParam, levelParam, semesterParam, sortParam, publishedOnly, viewParam]);

  useEffect(() => setQ(qParam), [qParam]);

  // debounce search to URL
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    const qNorm = normalizeQuery(q);
    if (qNorm === normalizeQuery(qParam)) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      router.replace(
        buildHref(pathname, {
          q: qNorm || null,
          course: courseParam || null,
          level: levelParam || null,
          semester: semesterParam || null,
          sort: sortParam !== "newest" ? sortParam : null,
          published: publishedOnly ? "1" : null,
          view: viewParam !== "for_you" ? viewParam : null,
        })
      );
    }, 350);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, qParam, router, pathname, courseParam, levelParam, semesterParam, sortParam, publishedOnly, viewParam]);

  // Reset list when filters change
  useEffect(() => {
    setPage(1);
    setSets([]);
    setHasMore(false);
    setTotal(0);
  }, [filtersKey]);

  // Load latest + recent attempts
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) {
          if (mounted) {
            setLatestAttempt(null);
            setRecentAttempts([]);
          }
          return;
        }

        const res = await supabase
          .from("study_practice_attempts")
          .select(
            `
            id,set_id,created_at,updated_at,score,total_questions,
            study_quiz_sets(id,title,course_code)
          `
          )
          .eq("user_id", uid)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(6);

        if (!mounted) return;

        if (res.error) {
          setLatestAttempt(null);
          setRecentAttempts([]);
          return;
        }

        const rows = ((res.data as any[]) ?? []).filter(Boolean) as LatestAttempt[];
        setLatestAttempt(rows[0] ?? null);
        setRecentAttempts(rows.slice(0, 6));
      } catch {
        if (mounted) {
          setLatestAttempt(null);
          setRecentAttempts([]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Load user prefs for personalised For You scoring
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return;
        const { data, error } = await supabase
          .from("study_preferences")
          .select("department_id,faculty_id,level,semester")
          .eq("user_id", uid)
          .maybeSingle();
        if (!mounted || error || !data) return;
        setUserPrefs({
          department_id: (data as any).department_id ?? null,
          faculty_id: (data as any).faculty_id ?? null,
          level: (data as any).level ?? null,
          semester: (data as any).semester ?? null,
        });
      } catch { /* prefs are optional */ }
    })();
    return () => { mounted = false; };
  }, []);

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
      const selectFields =
        "id,title,description,course_code,level,semester,time_limit_minutes,difficulty,published,questions_count,created_at";

      let query = supabase.from("study_quiz_sets").select(selectFields, { count: "exact" });

      if (publishedOnly) query = query.eq("published", true);

      const qNorm = normalizeQuery(qParam);
      if (qNorm) {
        query = query.or(`title.ilike.%${qNorm}%,description.ilike.%${qNorm}%,course_code.ilike.%${qNorm}%`);
      }

      const course = courseParam.trim().toUpperCase();
      if (course) query = query.eq("course_code", course);

      if (levelParam) {
        const lv = Number(levelParam);
        if (Number.isFinite(lv)) query = query.eq("level", lv);
      }

      if (semesterParam) {
        const s = semesterParam.trim().toLowerCase();
        if (s) query = query.eq("semester", s);
      }

      if (difficultyParam) {
        const d = difficultyParam.trim().toLowerCase();
        if (d === "easy" || d === "medium" || d === "hard") {
          query = query.eq("difficulty", d);
        }
      }

      if (sortParam === "oldest") query = query.order("created_at", { ascending: true });
      else query = query.order("created_at", { ascending: false });

      const from = (nextPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const res = await query.range(from, to);

      if (res.error) {
        const msg = res.error.message || "Unknown error";
        setLoadError(msg);

        if (
          msg.includes("published") ||
          msg.includes("approved") ||
          msg.includes("questions_count") ||
          msg.includes("time_limit_minutes") ||
          msg.includes("semester")
        ) {
          setSchemaHint(
            "Some optional columns are missing (e.g., semester/time_limit/questions_count/published). The page still works — add them later for richer UX."
          );
        }

        if (isFirst) {
          setSets([]);
          setTotal(0);
        }
        return;
      }

      const totalCount = res.count ?? 0;
      setTotal(totalCount);

      const rows = ((res.data as any[]) ?? []).filter(Boolean) as QuizSetRow[];

      setSets((prev) => {
        if (isFirst) return rows;
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev];
        for (const r of rows) if (!seen.has(r.id)) merged.push(r);
        return merged;
      });

      const loaded = (nextPage - 1) * PAGE_SIZE + rows.length;
      setHasMore(loaded < totalCount);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  function openFilters() {
    setDraftCourse(courseParam);
    setDraftLevel(levelParam);
    setDraftSemester(semesterParam);
    setDraftSort(sortParam);
    setDraftPublished(publishedOnly);
    setDraftDifficulty(difficultyParam);
    setDrawerOpen(true);
  }

  function applyFilters() {
    router.replace(
      buildHref(pathname, {
        q: normalizeQuery(q) || null,
        course: draftCourse.trim().toUpperCase() || null,
        level: draftLevel || null,
        semester: draftSemester || null,
        difficulty: draftDifficulty || null,
        sort: draftSort !== "newest" ? draftSort : null,
        published: draftPublished ? "1" : null,
        view: viewParam !== "for_you" ? viewParam : null,
      })
    );
    setDrawerOpen(false);
  }

  function clearAll() {
    setQ("");
    router.replace(buildHref(pathname, { view: viewParam !== "for_you" ? viewParam : null }));
  }

  function setView(v: ViewKey) {
    router.replace(
      buildHref(pathname, {
        q: qParam || null,
        course: courseParam || null,
        level: levelParam || null,
        semester: semesterParam || null,
        sort: sortParam !== "newest" ? sortParam : null,
        published: publishedOnly ? "1" : null,
        view: v !== "for_you" ? v : null,
      })
    );
  }

  const hasAnyFilters = Boolean(
    qParam ||
      courseParam ||
      levelParam ||
      semesterParam ||
      difficultyParam ||
      (sortParam && sortParam !== "newest") ||
      publishedOnly
  );

  const activeSortLabel = SORTS.find((s) => s.key === sortParam)?.label ?? "Newest";
  const showingFrom = total === 0 ? 0 : 1;
  const showingTo = Math.min(total, sets.length);

  const forYouSets = useMemo(() => {
    if (!sets.length) return [];

    // URL params take priority; fall back to loaded user prefs
    const wantCourse = (courseParam.trim() || "").toUpperCase();
    const wantLevel =
      levelParam
        ? Number(levelParam)
        : typeof userPrefs?.level === "number"
        ? userPrefs.level
        : NaN;
    const wantSem =
      semesterParam.trim().toLowerCase() ||
      (userPrefs?.semester ?? "").toLowerCase();

    const scored = sets.map((s) => {
      let score = 0;
      const code = (s.course_code ?? "").toString().trim().toUpperCase();

      // Strong match: exact course code
      if (wantCourse && code === wantCourse) score += 3;

      // Level match: from prefs or URL param
      if (
        Number.isFinite(wantLevel) &&
        typeof s.level === "number" &&
        s.level === wantLevel
      )
        score += 2;

      // Semester match
      if (
        wantSem &&
        (s.semester ?? "").toString().trim().toLowerCase() === wantSem
      )
        score += 1;

      // Difficulty score: prefer sets appropriate for user's level
      // Upper levels (400+) get a boost for harder sets; lower levels for easier ones.
      const diff = (s.difficulty ?? "").toLowerCase();
      if (Number.isFinite(wantLevel)) {
        if (wantLevel >= 400 && diff === "hard")   score += 1.5;
        if (wantLevel >= 300 && diff === "medium")  score += 0.5;
        if (wantLevel <= 200 && diff === "easy")    score += 1.5;
        if (wantLevel <= 200 && diff === "hard")    score -= 1;
      }

      // Slight recency boost
      if (s.created_at) score += 0.2;

      return { s, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.s);
  }, [sets, courseParam, levelParam, semesterParam, userPrefs]);

  const visibleSets = useMemo(() => {
    if (viewParam === "for_you") return forYouSets.length ? forYouSets : sets;
    return sets;
  }, [viewParam, forYouSets, sets]);

  const showRecentEmpty = viewParam === "recent" && recentAttempts.length === 0;

  function openPreview(s: QuizSetRow) {
    setPreviewSet(s);
    setPreviewOpen(true);
  }

  function startSet(id: string) {
    router.push(`/study/practice/${id}`);
  }

  return (
    // FIX: prevent any horizontal overflow across the whole page
    <div className="w-full max-w-full overflow-x-hidden space-y-4 pb-28 md:pb-6">
      <StudyTabs />

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

        <div className="flex items-center gap-2">
          {/* Rep-gated Create button */}
          {repStatus === "approved" && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground",
                "hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
              title="Create a new practice set (rep access)"
            >
              <Plus className="h-4 w-4" />
              Create set
            </button>
          )}

          <Link
            href="/study/practice/history"
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground no-underline",
              "hover:opacity-90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
          >
            <History className="h-4 w-4" />
            History
          </Link>
        </div>
      </div>

      {/* Header */}
      <Card className="rounded-3xl">
        <PageHeader
          title="Practice"
          subtitle="Pick a set, preview it, and start in one tap."
          right={
            <span className="hidden sm:inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4" />
              {activeSortLabel}
            </span>
          }
        />
      </Card>

      {/* Continue card */}
      {latestAttempt?.set_id ? (
        <Card className="w-full max-w-full overflow-hidden rounded-3xl p-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground">Continue</p>
              <p className="mt-1 truncate text-base font-semibold text-foreground">
                {(latestAttempt.study_quiz_sets?.title ?? "Practice set").trim() || "Practice set"}
              </p>
              <div className="mt-2 flex max-w-full flex-wrap items-center gap-2">
                {latestAttempt.study_quiz_sets?.course_code ? (
                  <span className="max-w-full truncate rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                    {String(latestAttempt.study_quiz_sets.course_code).toUpperCase()}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatWhen(latestAttempt.updated_at ?? latestAttempt.created_at)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => startSet(String(latestAttempt.set_id))}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground",
                "hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              <Play className="h-4 w-4" />
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </Card>
      ) : null}

      {/* Tabs: For you / Recent / All */}
      <MiniTabs value={viewParam} onChange={setView} />

      {/* NOT STICKY: Search + filters (regular block) */}
      <Card className="w-full max-w-full overflow-hidden rounded-3xl border bg-background/85 backdrop-blur p-3">
        <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search course code, title, topic…"
            className="min-w-0 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />

          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-background hover:bg-secondary/50",
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
              "inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground",
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
              Showing <span className="text-foreground">{total === 0 ? 0 : 1}</span>–
              <span className="text-foreground">{Math.min(total, sets.length)}</span> of{" "}
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
            Tip: try <span className="font-semibold">GST101</span> or “Anatomy”.
          </p>
        )}

        <div className="mt-3 flex max-w-full flex-wrap items-center gap-2">
          {courseParam ? (
            <Chip
              active
              onClick={() =>
                router.replace(
                  buildHref(pathname, {
                    q: qParam || null,
                    course: null,
                    level: levelParam || null,
                    semester: semesterParam || null,
                    sort: sortParam !== "newest" ? sortParam : null,
                    published: publishedOnly ? "1" : null,
                    view: viewParam !== "for_you" ? viewParam : null,
                  })
                )
              }
              title="Clear course"
            >
              <Hash className="h-4 w-4" />
              {courseParam.toUpperCase()}
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
                    course: courseParam || null,
                    level: null,
                    semester: semesterParam || null,
                    sort: sortParam !== "newest" ? sortParam : null,
                    published: publishedOnly ? "1" : null,
                    view: viewParam !== "for_you" ? viewParam : null,
                  })
                )
              }
              title="Clear level"
            >
              {levelParam}L <X className="h-4 w-4" />
            </Chip>
          ) : null}

          {semesterParam ? (
            <Chip
              active
              onClick={() =>
                router.replace(
                  buildHref(pathname, {
                    q: qParam || null,
                    course: courseParam || null,
                    level: levelParam || null,
                    semester: null,
                    sort: sortParam !== "newest" ? sortParam : null,
                    published: publishedOnly ? "1" : null,
                    view: viewParam !== "for_you" ? viewParam : null,
                  })
                )
              }
              title="Clear semester"
            >
              <Clock className="h-4 w-4" />
              {semesterParam} <X className="h-4 w-4" />
            </Chip>
          ) : null}
        </div>
      </Card>

      {/* Errors */}
      {loadError ? (
        <div className="rounded-3xl border border-border bg-background p-4">
          <p className="text-sm font-semibold text-foreground">Couldn’t load practice sets</p>
          <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
          {schemaHint ? (
            <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">{schemaHint}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* RECENT VIEW */}
      {viewParam === "recent" ? (
        recentAttempts.length === 0 ? (
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No recent attempts yet"
            description="Start any practice set and your recent attempts will show here."
            action={
              <Link
                href="/study/materials"
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground no-underline",
                  "hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
              >
                <Flame className="h-4 w-4" />
                Browse Materials
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {recentAttempts.map((a) => (
              <Card key={a.id} className="w-full max-w-full overflow-hidden rounded-3xl p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">
                      {(a.study_quiz_sets?.title ?? "Practice set").trim() || "Practice set"}
                    </p>
                    <div className="mt-2 flex max-w-full flex-wrap items-center gap-2">
                      {a.study_quiz_sets?.course_code ? (
                        <span className="max-w-full truncate rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                          {String(a.study_quiz_sets.course_code).toUpperCase()}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatWhen(a.updated_at ?? a.created_at)}
                      </span>
                    </div>
                  </div>

                  {a.set_id ? (
                    <button
                      type="button"
                      onClick={() => startSet(String(a.set_id))}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground",
                        "hover:opacity-90",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      )}
                    >
                      <Play className="h-4 w-4" />
                      Open
                    </button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <>
          {/* RESULTS */}
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {loading ? (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} className="rounded-3xl" />
                ))}
              </>
            ) : visibleSets.length === 0 ? (
              <div className="sm:col-span-2">
                <EmptyState
                  icon={<BookOpen className="h-5 w-5" />}
                  title="No practice sets found"
                  description={
                    hasAnyFilters
                      ? "Try clearing filters or searching a different course/topic."
                      : "No sets have been published yet. Check Materials or come back later."
                  }
                  action={
                    <Link
                      href="/study/materials"
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground no-underline",
                        "hover:opacity-90",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      )}
                    >
                      <Flame className="h-4 w-4" />
                      Browse Materials
                    </Link>
                  }
                />
              </div>
            ) : (
              visibleSets.map((s) => (
                <QuizSetCard key={s.id} s={s} onStart={() => startSet(s.id)} onPreview={() => openPreview(s)} />
              ))
            )}
          </div>

          {/* Load more (only on All sets view) */}
          {!loading && sets.length > 0 && viewParam === "all" ? (
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
        </>
      )}

      {/* Rep status info banners */}
      {repStatus === "pending" && (
        <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Rep application pending</p>
            <p className="mt-0.5 text-xs opacity-80">Your rep application is under review. You'll be able to create sets once approved.</p>
          </div>
        </div>
      )}

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
                setDraftCourse("");
                setDraftLevel("");
                setDraftSemester("");
                setDraftSort("newest");
                setDraftPublished(false);
                setDraftDifficulty("");
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
          <p className="text-sm font-semibold text-foreground">Course</p>
          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <input
              value={draftCourse}
              onChange={(e) => setDraftCourse(e.target.value)}
              placeholder="e.g., GST101 or CSC201"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {draftCourse ? (
              <button
                type="button"
                onClick={() => setDraftCourse("")}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl border border-border bg-background hover:bg-secondary/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                )}
                aria-label="Clear course"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">You can also search course codes in the main search bar.</p>
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

        {/* Difficulty */}
        <div className="mt-3 rounded-3xl border border-border bg-background p-3">
          <p className="text-sm font-semibold text-foreground">Difficulty</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(["", "easy", "medium", "hard"] as const).map((d) => {
              const label = d === "" ? "Any" : d === "easy" ? "● Easy" : d === "medium" ? "◆ Medium" : "▲ Hard";
              const active = draftDifficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDraftDifficulty(d)}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    active
                      ? d === "" ? "border-border bg-secondary text-foreground"
                        : d === "easy" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : d === "medium" ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                        : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3">
          <ToggleRow
            label="Published only"
            desc="Show only published sets (if supported by your DB)"
            checked={draftPublished}
            onChange={setDraftPublished}
          />
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Filters apply when you tap <span className="font-semibold">Apply</span>. Search updates automatically.
          </p>
        </div>
      </Drawer>

      {/* Preview sheet */}
      <Drawer
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview"
        footer={
          previewSet ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewOpen(false);
                  startSet(previewSet.id);
                }}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground",
                  "hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                )}
              >
                <Play className="h-4 w-4" />
                Start
              </button>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground",
                  "hover:bg-secondary/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                )}
              >
                Close
              </button>
            </div>
          ) : null
        }
      >
        {previewSet ? (
          <div className="space-y-3">
            <div className="rounded-3xl border border-border bg-background p-4">
              <p className="text-base font-semibold text-foreground">
                {(previewSet.title ?? "Untitled set").trim() || "Untitled set"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {previewSet.description ? previewSet.description : "Practice past questions and test yourself."}
              </p>
              {previewSet.difficulty ? (
                <div className="mt-3">
                  <DifficultyBadge difficulty={previewSet.difficulty} />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing to preview.</p>
        )}
      </Drawer>

      {/* Create set drawer (rep-gated) */}
      <CreateSetDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        repScope={repScope}
        onCreated={(id) => setToast(`Set created — redirecting to editor…`)}
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