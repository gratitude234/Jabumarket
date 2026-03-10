"use client";
// app/study/gpa/page.tsx
import { cn } from "@/lib/utils";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calculator,
  Target,
  Copy,
  RotateCcw,
  ShieldCheck,
  Check,
  X,
  Cloud,
  CloudOff,
  FileUp,
  AlertCircle,
  Table2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type ScaleKey = "ng_5" | "us_4" | "custom";
type Banner = { type: "success" | "error" | "info"; text: string } | null;

type GradeMap = Record<string, number>;

type CourseRow = {
  id: string;
  code: string;
  units: string;
  grade: string;
};

type Semester = {
  id: string;
  name: string;
  open: boolean;
  courses: CourseRow[];
};

const STORAGE_KEY = "jabuStudy.gpa.v1";

type SyncStatus = "idle" | "syncing" | "synced" | "offline";

type GpaPayload = {
  scaleKey: ScaleKey;
  customScale: GradeMap;
  semesters: Semester[];
  targetTool: {
    currentCgpa: string;
    completedUnits: string;
    targetCgpa: string;
    nextUnits: string;
  };
  updated_at?: string;
};

function uid() {
  // crypto.randomUUID supported in modern browsers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = typeof crypto !== "undefined" ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalize(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function toNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function format2(n: number) {
  return n.toFixed(2);
}

const NG_5: GradeMap = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
const US_4: GradeMap = { A: 4, B: 3, C: 2, D: 1, F: 0 };

function BannerBox({ banner, onClose }: { banner: Banner; onClose: () => void }) {
  if (!banner) return null;

  const tone =
    banner.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : banner.type === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-border bg-card text-foreground";

  const icon =
    banner.type === "success" ? (
      <Check className="h-4 w-4" />
    ) : banner.type === "error" ? (
      <X className="h-4 w-4" />
    ) : (
      <ShieldCheck className="h-4 w-4" />
    );

  return (
    <div className={cn("rounded-2xl border p-4 text-sm", tone)} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5">{icon}</div>
          <p>{banner.text}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-1 hover:bg-black/5"
          aria-label="Close banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <section className="space-y-4 rounded-3xl border bg-card p-4 shadow-sm sm:p-5">{children}</section>;
}

function gradeLabelForScale(scale: GradeMap, grade: string) {
  const g = normalize(grade).toUpperCase();
  if (!g) return "—";
  if (scale[g] === undefined) return "—";
  return `${g} (${scale[g]})`;
}

function semesterStats(sem: Semester, scale: GradeMap) {
  let unitsTotal = 0;
  let pointsTotal = 0;
  let validRows = 0;
  let invalidRows = 0;

  const gradeCount: Record<string, number> = {};

  for (const c of sem.courses) {
    const u = toNum(c.units);
    const g = normalize(c.grade).toUpperCase();
    const gp = scale[g];

    if (!Number.isFinite(u) || u <= 0 || gp === undefined) {
      invalidRows += 1;
      continue;
    }

    validRows += 1;
    unitsTotal += u;
    pointsTotal += u * gp;
    gradeCount[g] = (gradeCount[g] ?? 0) + 1;
  }

  const gpa = unitsTotal > 0 ? pointsTotal / unitsTotal : 0;

  return { unitsTotal, pointsTotal, gpa, validRows, invalidRows, gradeCount };
}

function classifyGpa(gpa: number, max: number) {
  if (gpa <= 0) {
    return {
      label: "No GPA yet",
      hint: "Add courses to calculate.",
      tone: "border-border bg-card text-foreground",
    };
  }

  const pct = max > 0 ? gpa / max : 0;

  if (pct >= 0.8) {
    return {
      label: "Excellent",
      hint: "You’re doing great — keep it up.",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
    };
  }

  if (pct >= 0.65) {
    return {
      label: "Good",
      hint: "Solid performance — push a bit more.",
      tone: "border-blue-200 bg-blue-50 text-blue-900",
    };
  }

  if (pct >= 0.5) {
    return {
      label: "Fair",
      hint: "You can improve — focus on weak courses.",
      tone: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }

  return {
    label: "Needs work",
    hint: "Make a plan and get support early.",
    tone: "border-red-200 bg-red-50 text-red-900",
  };
}

function safeParseJSON<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

// ─── CSV import ───────────────────────────────────────────────────────────────
//
// Expected CSV format (header row required):
//   semester, course, units, grade
//
// Column names are case-insensitive and trimmed.
// Extra columns are silently ignored.
// Rows with missing units OR grade are flagged invalid but still shown.
//
// Example:
//   semester,course,units,grade
//   Semester 1,GST101,2,A
//   Semester 1,MTH101,3,B
//   Semester 2,CSC201,3,A

type CsvRow = {
  semester: string;
  course: string;
  units: string;
  grade: string;
  _valid: boolean;
  _error: string;
};

type ParseResult =
  | { ok: true; rows: CsvRow[] }
  | { ok: false; error: string };

function parseCsv(text: string): ParseResult {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { ok: false, error: "File must have a header row and at least one data row." };
  }

  // Parse header — support quoted and unquoted
  const headerCols = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());

  const colIdx = (aliases: string[]) => {
    for (const a of aliases) {
      const i = headerCols.indexOf(a);
      if (i !== -1) return i;
    }
    return -1;
  };

  const semCol    = colIdx(["semester", "sem", "semester_name", "term"]);
  const courseCol = colIdx(["course", "course_code", "code", "subject"]);
  const unitsCol  = colIdx(["units", "unit", "credit", "credits", "credit_units", "credit_hours"]);
  const gradeCol  = colIdx(["grade", "grades", "score", "letter"]);

  if (unitsCol === -1) return { ok: false, error: "No 'units' column found in header." };
  if (gradeCol === -1) return { ok: false, error: "No 'grade' column found in header." };

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const get  = (idx: number) => (idx === -1 ? "" : (cols[idx] ?? "").trim());

    const semester = normalize(get(semCol))   || `Imported`;
    const course   = normalize(get(courseCol)).toUpperCase();
    const units    = get(unitsCol);
    const grade    = get(gradeCol).toUpperCase();

    const uNum   = Number(units);
    const errors: string[] = [];
    if (!units || !Number.isFinite(uNum) || uNum <= 0) errors.push("invalid units");
    if (!grade) errors.push("missing grade");

    rows.push({
      semester,
      course,
      units,
      grade,
      _valid: errors.length === 0,
      _error: errors.join(", "),
    });
  }

  if (!rows.length) return { ok: false, error: "No data rows found after the header." };

  return { ok: true, rows };
}

/** Split a single CSV line respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/** Convert an array of CsvRows into Semester objects. */
function csvRowsToSemesters(rows: CsvRow[], scale: GradeMap): Semester[] {
  const semMap = new Map<string, CourseRow[]>();

  for (const row of rows) {
    if (!semMap.has(row.semester)) semMap.set(row.semester, []);
    semMap.get(row.semester)!.push({
      id:    uid(),
      code:  row.course,
      units: row.units,
      grade: row.grade,
    });
  }

  return Array.from(semMap.entries()).map(([name, courses], idx) => ({
    id:     uid(),
    name,
    open:   idx === 0,
    courses: courses.length
      ? courses
      : [{ id: uid(), code: "", units: "", grade: "" }],
  }));
}

// ─── Import modal ─────────────────────────────────────────────────────────────

function ImportModal({
  result,
  scale,
  onClose,
  onImport,
}: {
  result: ParseResult | null;
  scale: GradeMap;
  onClose: () => void;
  onImport: (semesters: Semester[], mode: "replace" | "merge") => void;
}) {
  const [mode, setMode] = useState<"replace" | "merge">("merge");

  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [result, onClose]);

  if (!result) return null;

  const validRows   = result.ok ? result.rows.filter((r) => r._valid) : [];
  const invalidRows = result.ok ? result.rows.filter((r) => !r._valid) : [];
  const semesterNames = result.ok
    ? [...new Set(result.rows.filter((r) => r._valid).map((r) => r.semester))]
    : [];

  const unknownGrades = result.ok
    ? [...new Set(validRows.map((r) => r.grade.toUpperCase()).filter((g) => scale[g] === undefined && g !== ""))]
    : [];

  function doImport() {
    if (!result?.ok) return;
    const sems = csvRowsToSemesters(validRows, scale);
    onImport(sems, mode);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 mx-auto mt-auto w-full max-w-2xl rounded-t-3xl border-t border-border bg-card shadow-2xl md:my-auto md:rounded-3xl md:border">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <Table2 className="h-5 w-5 text-muted-foreground" />
            <p className="text-base font-semibold text-foreground">CSV Import Preview</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-2xl border border-border bg-background hover:bg-secondary/50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-5 space-y-4">
          {/* Error state */}
          {!result.ok && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{result.error}</p>
            </div>
          )}

          {result.ok && (
            <>
              {/* Summary chips */}
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full border border-border bg-background px-3 py-1.5 text-foreground">
                  {result.rows.length} rows total
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800">
                  {validRows.length} valid
                </span>
                {invalidRows.length > 0 && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-red-700">
                    {invalidRows.length} invalid (skipped)
                  </span>
                )}
                <span className="rounded-full border border-border bg-background px-3 py-1.5 text-foreground">
                  {semesterNames.length} semester{semesterNames.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Unknown grade warning */}
              {unknownGrades.length > 0 && (
                <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Unknown grades for current scale: <strong>{unknownGrades.join(", ")}</strong>. These rows are
                    imported but won't contribute to GPA until the grade is corrected.
                  </span>
                </div>
              )}

              {/* Semester breakdown */}
              {semesterNames.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Semesters to import</p>
                  {semesterNames.map((name) => {
                    const semRows = validRows.filter((r) => r.semester === name);
                    return (
                      <div key={name} className="rounded-2xl border border-border bg-background p-3">
                        <p className="text-sm font-semibold text-foreground">{name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{semRows.length} course{semRows.length !== 1 ? "s" : ""}</p>
                        <div className="mt-2 space-y-1">
                          {semRows.slice(0, 5).map((r, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="w-20 truncate font-mono">{r.course || "—"}</span>
                              <span>{r.units}u</span>
                              <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 font-semibold text-foreground">{r.grade}</span>
                            </div>
                          ))}
                          {semRows.length > 5 && (
                            <p className="text-xs text-muted-foreground">…and {semRows.length - 5} more</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Invalid rows */}
              {invalidRows.length > 0 && (
                <div className="rounded-2xl border border-red-100 bg-red-50/60 p-3">
                  <p className="text-xs font-semibold text-red-700">Skipped rows ({invalidRows.length})</p>
                  <div className="mt-2 space-y-1">
                    {invalidRows.slice(0, 5).map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-red-600">
                        <span className="w-20 truncate font-mono">{r.course || "(no code)"}</span>
                        <span className="text-red-500">{r._error}</span>
                      </div>
                    ))}
                    {invalidRows.length > 5 && (
                      <p className="text-xs text-red-500">…and {invalidRows.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Import mode */}
              {validRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Import mode</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["merge", "replace"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={cn(
                          "rounded-2xl border p-3 text-left text-sm transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          mode === m
                            ? "border-foreground bg-secondary font-semibold text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-secondary/50"
                        )}
                      >
                        <p className="font-semibold">{m === "merge" ? "Merge" : "Replace all"}</p>
                        <p className="mt-0.5 text-xs opacity-80">
                          {m === "merge"
                            ? "Add imported semesters alongside your existing ones."
                            : "Delete all existing semesters and replace with the import."}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary/50"
          >
            Cancel
          </button>
          {result.ok && validRows.length > 0 && (
            <button
              type="button"
              onClick={doImport}
              className="rounded-2xl border border-foreground bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:opacity-90"
            >
              Import {validRows.length} row{validRows.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GpaPage() {
  const [banner, setBanner] = useState<Banner>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  const [scaleKey, setScaleKey] = useState<ScaleKey>("ng_5");
  const [customScale, setCustomScale] = useState<GradeMap>({ ...NG_5 });

  const [semesters, setSemesters] = useState<Semester[]>([
    {
      id: uid(),
      name: "Semester 1",
      open: true,
      courses: [
        { id: uid(), code: "", units: "", grade: "" },
        { id: uid(), code: "", units: "", grade: "" },
      ],
    },
  ]);

  const [currentCgpa, setCurrentCgpa] = useState("");
  const [completedUnits, setCompletedUnits] = useState("");
  const [targetCgpa, setTargetCgpa] = useState("");
  const [nextUnits, setNextUnits] = useState("");

  // ── CSV import state ──────────────────────────────────────────────────────
  const [importResult, setImportResult] = useState<ParseResult | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  function openFilePicker() {
    csvInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after a cancel
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") {
        setImportResult({ ok: false, error: "Could not read file." });
        return;
      }
      setImportResult(parseCsv(text));
    };
    reader.onerror = () => setImportResult({ ok: false, error: "File read error." });
    reader.readAsText(file);
  }

  function handleImport(newSemesters: Semester[], mode: "replace" | "merge") {
    setSemesters((prev) => {
      if (mode === "replace") return newSemesters;
      // Merge: keep existing, append new (open first new semester)
      const existing = prev.map((s) => ({ ...s, open: false }));
      return [
        ...existing,
        ...newSemesters.map((s, i) => ({ ...s, open: i === 0 })),
      ];
    });
    setImportResult(null);
    setBanner({
      type: "success",
      text: `Imported ${newSemesters.length} semester${newSemesters.length !== 1 ? "s" : ""} via CSV.`,
    });
  }

  const scale: GradeMap = useMemo(() => {
    if (scaleKey === "ng_5") return NG_5;
    if (scaleKey === "us_4") return US_4;
    return customScale;
  }, [scaleKey, customScale]);

  const scaleMax = useMemo(() => {
    const vals = Object.values(scale);
    return vals.length ? Math.max(...vals) : 0;
  }, [scale]);

  useEffect(() => {
    let cancelled = false;

    function applyPayload(saved: GpaPayload) {
      if (saved.scaleKey) setScaleKey(saved.scaleKey);
      if (saved.customScale) setCustomScale(saved.customScale);

      if (Array.isArray(saved.semesters) && saved.semesters.length) {
        setSemesters(
          saved.semesters.map((s, idx) => ({
            id: s.id || uid(),
            name: s.name || `Semester ${idx + 1}`,
            open: typeof s.open === "boolean" ? s.open : idx === 0,
            courses: Array.isArray(s.courses)
              ? s.courses.map((c) => ({
                  id: c.id || uid(),
                  code: String(c.code ?? ""),
                  units: String(c.units ?? ""),
                  grade: String(c.grade ?? ""),
                }))
              : [{ id: uid(), code: "", units: "", grade: "" }],
          }))
        );
      }

      if (saved.targetTool) {
        setCurrentCgpa(String(saved.targetTool.currentCgpa ?? ""));
        setCompletedUnits(String(saved.targetTool.completedUnits ?? ""));
        setTargetCgpa(String(saved.targetTool.targetCgpa ?? ""));
        setNextUnits(String(saved.targetTool.nextUnits ?? ""));
      }
    }

    async function load() {
      const localRaw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      const local = safeParseJSON<GpaPayload>(localRaw);

      if (local && !cancelled) applyPayload(local);

      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user ?? null;
        if (!user || cancelled) return;

        setSyncStatus("syncing");

        const { data: dbRow, error } = await supabase
          .from("study_gpa_data")
          .select("data")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setSyncStatus("offline");
          return;
        }

        const dbPayload = safeParseJSON<GpaPayload>(dbRow?.data ? JSON.stringify(dbRow.data) : null);

        const localTs = local?.updated_at ? new Date(local.updated_at).getTime() : 0;
        const dbTs = dbPayload?.updated_at ? new Date(dbPayload.updated_at).getTime() : 0;

        if (dbPayload && dbTs >= localTs) {
          applyPayload(dbPayload);
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dbPayload));
          } catch {
            //
          }
        }

        setSyncStatus("synced");
      } catch {
        if (!cancelled) setSyncStatus("offline");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);

    saveTimer.current = window.setTimeout(async () => {
      const payload: GpaPayload = {
        scaleKey,
        customScale,
        semesters,
        targetTool: { currentCgpa, completedUnits, targetCgpa, nextUnits },
        updated_at: new Date().toISOString(),
      };

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        //
      }

      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user ?? null;
        if (!user) return;

        setSyncStatus("syncing");

        const { error } = await supabase.from("study_gpa_data").upsert(
          { user_id: user.id, data: payload as any, updated_at: payload.updated_at },
          { onConflict: "user_id" }
        );

        setSyncStatus(error ? "offline" : "synced");
      } catch {
        setSyncStatus("offline");
      }
    }, 250);

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [scaleKey, customScale, semesters, currentCgpa, completedUnits, targetCgpa, nextUnits]);

  const totals = useMemo(() => {
    let unitsTotal = 0;
    let pointsTotal = 0;
    let validRows = 0;
    let invalidRows = 0;

    const gradeCount: Record<string, number> = {};

    for (const s of semesters) {
      const st = semesterStats(s, scale);
      unitsTotal += st.unitsTotal;
      pointsTotal += st.pointsTotal;
      validRows += st.validRows;
      invalidRows += st.invalidRows;

      for (const [g, c] of Object.entries(st.gradeCount)) {
        gradeCount[g] = (gradeCount[g] ?? 0) + c;
      }
    }

    const cgpa = unitsTotal > 0 ? pointsTotal / unitsTotal : 0;
    return { unitsTotal, pointsTotal, cgpa, validRows, invalidRows, gradeCount };
  }, [semesters, scale]);

  const cgpaTone = useMemo(() => classifyGpa(totals.cgpa, scaleMax), [totals.cgpa, scaleMax]);

  const requiredGpa = useMemo(() => {
    const cur = toNum(currentCgpa);
    const doneU = toNum(completedUnits);
    const tgt = toNum(targetCgpa);
    const nxtU = toNum(nextUnits);

    if (!Number.isFinite(cur) || !Number.isFinite(doneU) || !Number.isFinite(tgt) || !Number.isFinite(nxtU)) {
      return null;
    }

    if (doneU <= 0 || nxtU <= 0) return null;

    const req = (tgt * (doneU + nxtU) - cur * doneU) / nxtU;
    if (!Number.isFinite(req)) return null;

    return req;
  }, [currentCgpa, completedUnits, targetCgpa, nextUnits]);

  const requiredStatus = useMemo(() => {
    if (requiredGpa === null) return null;

    const req = requiredGpa;

    if (req < 0) {
      return { type: "success" as const, text: "You’re already above your target. Keep it steady." };
    }

    if (req > scaleMax) {
      return {
        type: "error" as const,
        text: "Target might be unrealistic for next semester with these units.",
      };
    }

    if (req >= scaleMax * 0.8) {
      return {
        type: "info" as const,
        text: "You’ll need a very strong semester. Start early and stay consistent.",
      };
    }

    if (req >= scaleMax * 0.65) {
      return {
        type: "info" as const,
        text: "Achievable — stay focused and prioritize tough courses.",
      };
    }

    return { type: "success" as const, text: "Achievable — keep up a steady routine." };
  }, [requiredGpa, scaleMax]);

  function updateSemester(semId: string, patch: Partial<Semester>) {
    setSemesters((prev) => prev.map((s) => (s.id === semId ? { ...s, ...patch } : s)));
  }

  function updateCourse(semId: string, courseId: string, patch: Partial<CourseRow>) {
    setSemesters((prev) =>
      prev.map((s) => {
        if (s.id !== semId) return s;
        return {
          ...s,
          courses: s.courses.map((c) => (c.id === courseId ? { ...c, ...patch } : c)),
        };
      })
    );
  }

  function addCourse(semId: string) {
    setSemesters((prev) =>
      prev.map((s) => {
        if (s.id !== semId) return s;
        return {
          ...s,
          courses: [...s.courses, { id: uid(), code: "", units: "", grade: "" }],
        };
      })
    );
  }

  function removeCourse(semId: string, courseId: string) {
    setSemesters((prev) =>
      prev.map((s) => {
        if (s.id !== semId) return s;
        const next = s.courses.filter((c) => c.id !== courseId);
        return {
          ...s,
          courses: next.length ? next : [{ id: uid(), code: "", units: "", grade: "" }],
        };
      })
    );
  }

  function addSemester() {
    const n = semesters.length + 1;
    setSemesters((prev) => [
      ...prev.map((s) => ({ ...s, open: false })),
      {
        id: uid(),
        name: `Semester ${n}`,
        open: true,
        courses: [{ id: uid(), code: "", units: "", grade: "" }],
      },
    ]);
  }

  function removeSemester(semId: string) {
    setSemesters((prev) => {
      const next = prev.filter((s) => s.id !== semId);

      if (!next.length) {
        return [
          {
            id: uid(),
            name: "Semester 1",
            open: true,
            courses: [{ id: uid(), code: "", units: "", grade: "" }],
          },
        ];
      }

      if (!next.some((s) => s.open)) {
        next[0] = { ...next[0], open: true };
      }

      return next;
    });
  }

  async function clearCloudData() {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user ?? null;
      if (user) {
        await supabase.from("study_gpa_data").delete().eq("user_id", user.id);
      }
    } catch {
      //
    }
  }

  async function copySummary() {
    const lines: string[] = [];
    lines.push("Jabu Study GPA Summary");
    lines.push(`Scale: ${scaleKey === "ng_5" ? "Nigeria (5.0)" : scaleKey === "us_4" ? "4.0" : "Custom"}`);
    lines.push(`CGPA: ${format2(totals.cgpa)} / ${scaleMax}`);
    lines.push(`Total Units: ${totals.unitsTotal}`);
    lines.push("");

    for (const s of semesters) {
      const st = semesterStats(s, scale);
      lines.push(`${s.name}: GPA ${format2(st.gpa)} | Units ${st.unitsTotal} | Courses ${st.validRows}/${s.courses.length} valid`);
    }

    const text = lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setBanner({ type: "success", text: "Copied summary to clipboard." });
    } catch {
      setBanner({
        type: "error",
        text: "Failed to copy. Your browser may block clipboard access.",
      });
    }
  }

  async function resetAll() {
    setBanner(null);
    setScaleKey("ng_5");
    setCustomScale({ ...NG_5 });
    setSemesters([
      {
        id: uid(),
        name: "Semester 1",
        open: true,
        courses: [
          { id: uid(), code: "", units: "", grade: "" },
          { id: uid(), code: "", units: "", grade: "" },
        ],
      },
    ]);
    setCurrentCgpa("");
    setCompletedUnits("");
    setTargetCgpa("");
    setNextUnits("");

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    setSyncStatus("idle");
    await clearCloudData();
    setBanner({ type: "success", text: "Reset done." });
  }

  const canCalculate = useMemo(
    () => totals.validRows > 0 && totals.unitsTotal > 0,
    [totals.validRows, totals.unitsTotal]
  );

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <header className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
        <Link
          href="/study"
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground no-underline hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Study
        </Link>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground">GPA / CGPA Calculator</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Calculate your semester GPA and overall CGPA. Saves automatically on this device and syncs to your
              account.
            </p>
          </div>

          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <label className="rounded-2xl border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">Grade scale</span>
            <select
              value={scaleKey}
              onChange={(e) => setScaleKey(e.target.value as ScaleKey)}
              className="mt-1 w-full bg-transparent text-sm text-foreground outline-none"
            >
              <option value="ng_5">Nigeria (5.0) — A=5 … F=0</option>
              <option value="us_4">4.0 — A=4 … F=0</option>
              <option value="custom">Custom</option>
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">Current max: {scaleMax}</p>
          </label>

          <div className={cn("rounded-2xl border p-3", cgpaTone.tone)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">CGPA</p>
                <p className="mt-1 text-2xl font-bold">
                  {canCalculate ? format2(totals.cgpa) : "—"}
                  <span className="text-sm font-semibold"> / {scaleMax}</span>
                </p>
                <p className="mt-1 text-sm font-semibold">{cgpaTone.label}</p>
                <p className="mt-1 text-xs opacity-80">{cgpaTone.hint}</p>
              </div>

              <div className="grid h-10 w-10 place-items-center rounded-2xl border bg-card/70">
                <Calculator className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full border bg-card/70 px-2 py-1">Units: {totals.unitsTotal}</span>
              <span className="rounded-full border bg-card/70 px-2 py-1">Valid rows: {totals.validRows}</span>
              {totals.invalidRows ? (
                <span className="rounded-full border bg-card/70 px-2 py-1">Invalid rows: {totals.invalidRows}</span>
              ) : null}
            </div>
          </div>
        </div>

        {scaleKey === "custom" ? (
          <div className="mt-3 rounded-3xl border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Custom scale</p>
            <p className="mt-1 text-xs text-muted-foreground">Edit grade points. Keep grades as letters (A, B, C…).</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {Object.keys(customScale)
                .sort()
                .map((g) => (
                  <label key={g} className="rounded-2xl border bg-card p-3">
                    <span className="text-xs font-semibold text-muted-foreground">{g}</span>
                    <input
                      value={String(customScale[g])}
                      onChange={(e) => {
                        const v = toNum(e.target.value);
                        setCustomScale((prev) => ({
                          ...prev,
                          [g]: Number.isFinite(v) ? v : prev[g],
                        }));
                      }}
                      inputMode="decimal"
                      className="mt-1 w-full bg-transparent text-sm text-foreground outline-none"
                    />
                  </label>
                ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCustomScale({ ...NG_5 })}
                className="rounded-2xl border px-3 py-2 text-sm font-semibold hover:bg-muted/50"
              >
                Use Nigeria 5.0 preset
              </button>
              <button
                type="button"
                onClick={() => setCustomScale({ ...US_4 })}
                className="rounded-2xl border px-3 py-2 text-sm font-semibold hover:bg-muted/50"
              >
                Use 4.0 preset
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <BannerBox banner={banner} onClose={() => setBanner(null)} />

      <SectionCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-foreground">Semesters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your courses and grades. Each semester collapses to keep the page clean on mobile.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Hidden CSV file input */}
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="sr-only"
              aria-label="Import CSV"
            />
            <button
              type="button"
              onClick={openFilePicker}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary/50"
              title="Import courses from a CSV file"
            >
              <FileUp className="h-4 w-4" />
              Import CSV
            </button>
            <button
              type="button"
              onClick={addSemester}
              className="inline-flex items-center gap-2 rounded-2xl border border-foreground bg-foreground px-3 py-2 text-sm font-semibold text-background hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Add semester
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {semesters.map((s, idx) => {
            const st = semesterStats(s, scale);
            const tone = classifyGpa(st.gpa, scaleMax);

            return (
              <div key={s.id} className="rounded-3xl border bg-card">
                <div className="flex items-start justify-between gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => updateSemester(s.id, { open: !s.open })}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <div className={cn("mt-0.5 rounded-2xl border p-2", tone.tone)}>
                      {s.open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <input
                        value={s.name}
                        onChange={(e) => updateSemester(s.id, { name: e.target.value })}
                        className="w-full bg-transparent text-base font-semibold text-foreground outline-none"
                        aria-label={`Semester ${idx + 1} name`}
                      />
                      <p className="mt-1 text-sm text-muted-foreground">
                        GPA: <span className="font-semibold text-foreground">{st.unitsTotal > 0 ? format2(st.gpa) : "—"}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          • Units {st.unitsTotal} • Valid {st.validRows}/{s.courses.length}
                        </span>
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeSemester(s.id)}
                    className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/50"
                    aria-label="Remove semester"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                </div>

                {s.open ? (
                  <div className="space-y-3 border-t p-4">
                    {s.courses.map((c) => {
                      const u = toNum(c.units);
                      const g = normalize(c.grade).toUpperCase();
                      const invalid = (!Number.isFinite(u) || u <= 0) && c.units.trim() !== "";
                      const gInvalid = c.grade.trim() !== "" && scale[g] === undefined;

                      return (
                        <div key={c.id} className="rounded-3xl border bg-card p-3">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <label className="rounded-2xl border bg-card px-3 py-2">
                              <span className="block text-[11px] font-semibold text-muted-foreground">Course (optional)</span>
                              <input
                                value={c.code}
                                onChange={(e) => updateCourse(s.id, c.id, { code: e.target.value })}
                                placeholder="e.g. GST101"
                                className="mt-1 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                              />
                            </label>

                            <label className="rounded-2xl border bg-card px-3 py-2">
                              <span className="block text-[11px] font-semibold text-muted-foreground">Units *</span>
                              <input
                                value={c.units}
                                onChange={(e) => updateCourse(s.id, c.id, { units: e.target.value })}
                                placeholder="e.g. 2"
                                inputMode="numeric"
                                className={cn(
                                  "mt-1 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground",
                                  invalid ? "text-red-600" : "text-foreground"
                                )}
                              />
                              {invalid ? (
                                <p className="mt-1 text-[11px] font-semibold text-red-600">Enter a valid number &gt; 0</p>
                              ) : null}
                            </label>

                            <label className="rounded-2xl border bg-card px-3 py-2">
                              <span className="block text-[11px] font-semibold text-muted-foreground">Grade *</span>
                              <select
                                value={c.grade}
                                onChange={(e) => updateCourse(s.id, c.id, { grade: e.target.value })}
                                className={cn(
                                  "mt-1 w-full bg-transparent text-sm outline-none",
                                  gInvalid ? "text-red-600" : "text-foreground"
                                )}
                              >
                                <option value="">Select grade</option>
                                {Object.keys(scale)
                                  .sort()
                                  .map((gr) => (
                                    <option key={gr} value={gr}>
                                      {gradeLabelForScale(scale, gr)}
                                    </option>
                                  ))}
                              </select>
                              {gInvalid ? <p className="mt-1 text-[11px] font-semibold text-red-600">Invalid grade</p> : null}
                            </label>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">
                              Points:{" "}
                              <span className="font-semibold text-foreground">
                                {Number.isFinite(u) && u > 0 && scale[g] !== undefined ? format2(u * scale[g]) : "—"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCourse(s.id, c.id)}
                              className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/50"
                            >
                              <Trash2 className="h-4 w-4" />
                              Remove row
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => addCourse(s.id)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-foreground bg-foreground px-4 py-3 text-sm font-semibold text-background hover:opacity-90"
                      >
                        <Plus className="h-4 w-4" />
                        Add course row
                      </button>

                      <div className="flex-1 rounded-2xl border bg-muted/50 p-3">
                        <p className="text-xs font-semibold text-foreground">Semester GPA</p>
                        <p className="mt-1 text-xl font-bold text-foreground">{st.unitsTotal > 0 ? format2(st.gpa) : "—"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Units: {st.unitsTotal} • Valid rows: {st.validRows}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-foreground">Target GPA tool</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your current CGPA and units to estimate the GPA you need next semester.
            </p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-2xl border bg-muted/50">
            <Target className="h-5 w-5" />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="rounded-2xl border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">Current CGPA</span>
            <input
              value={currentCgpa}
              onChange={(e) => setCurrentCgpa(e.target.value)}
              placeholder="e.g. 3.45"
              inputMode="decimal"
              className="mt-1 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>

          <label className="rounded-2xl border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">Completed units</span>
            <input
              value={completedUnits}
              onChange={(e) => setCompletedUnits(e.target.value)}
              placeholder="e.g. 84"
              inputMode="numeric"
              className="mt-1 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>

          <label className="rounded-2xl border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">Target CGPA</span>
            <input
              value={targetCgpa}
              onChange={(e) => setTargetCgpa(e.target.value)}
              placeholder="e.g. 4.00"
              inputMode="decimal"
              className="mt-1 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Max on this scale: {scaleMax}</p>
          </label>

          <label className="rounded-2xl border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">Next semester units</span>
            <input
              value={nextUnits}
              onChange={(e) => setNextUnits(e.target.value)}
              placeholder="e.g. 24"
              inputMode="numeric"
              className="mt-1 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        <div className="rounded-3xl border bg-muted/50 p-4">
          <p className="text-xs font-semibold text-foreground">Required next GPA</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {requiredGpa === null ? "—" : `${format2(clamp(requiredGpa, -99, 999))} / ${scaleMax}`}
          </p>

          {requiredStatus ? (
            <p
              className={cn(
                "mt-2 rounded-2xl border px-3 py-2 text-sm font-semibold",
                requiredStatus.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : requiredStatus.type === "error"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : "border-border bg-card text-foreground"
              )}
            >
              {requiredStatus.text}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Fill all fields with valid numbers to see the required GPA.</p>
          )}
        </div>
      </SectionCard>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copySummary}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/50"
            >
              <Copy className="h-4 w-4" />
              Copy summary
            </button>

            <button
              type="button"
              disabled
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-foreground bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-80"
            >
              {syncStatus === "syncing" ? (
                <>
                  <Cloud className="h-4 w-4 animate-pulse" />
                  Syncing…
                </>
              ) : syncStatus === "synced" ? (
                <>
                  <Cloud className="h-4 w-4" />
                  Synced ✓
                </>
              ) : syncStatus === "offline" ? (
                <>
                  <CloudOff className="h-4 w-4" />
                  Saved locally
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4" />
                  Saved ✓
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <ImportModal
        result={importResult}
        scale={scale}
        onClose={() => setImportResult(null)}
        onImport={handleImport}
      />
    </div>
  );
}