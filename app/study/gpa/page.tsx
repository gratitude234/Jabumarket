// app/study/gpa/page.tsx
"use client";

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
} from "lucide-react";

type ScaleKey = "ng_5" | "us_4" | "custom";
type Banner = { type: "success" | "error" | "info"; text: string } | null;

type GradeMap = Record<string, number>; // "A" -> 5

type CourseRow = {
  id: string;
  code: string;
  units: string; // keep as string for input
  grade: string; // A-F
};

type Semester = {
  id: string;
  name: string;
  open: boolean;
  courses: CourseRow[];
};

const STORAGE_KEY = "jabuStudy.gpa.v1";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

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

const GRADE_OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;

function BannerBox({ banner, onClose }: { banner: Banner; onClose: () => void }) {
  if (!banner) return null;
  const tone =
    banner.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : banner.type === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-zinc-200 bg-white text-zinc-700";
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
        <button type="button" onClick={onClose} className="rounded-xl p-1 hover:bg-black/5" aria-label="Close banner">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <section className="space-y-4 rounded-3xl border bg-white p-4 shadow-sm sm:p-5">{children}</section>;
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
  if (gpa <= 0) return { label: "No GPA yet", hint: "Add courses to calculate.", tone: "border-zinc-200 bg-white text-zinc-700" };
  const pct = max > 0 ? gpa / max : 0;
  if (pct >= 0.8) return { label: "Excellent", hint: "You’re doing great — keep it up.", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" };
  if (pct >= 0.65) return { label: "Good", hint: "Solid performance — push a bit more.", tone: "border-blue-200 bg-blue-50 text-blue-900" };
  if (pct >= 0.5) return { label: "Fair", hint: "You can improve — focus on weak courses.", tone: "border-amber-200 bg-amber-50 text-amber-900" };
  return { label: "Needs work", hint: "Make a plan and get support early.", tone: "border-red-200 bg-red-50 text-red-900" };
}

function safeParseJSON<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export default function GpaPage() {
  const [banner, setBanner] = useState<Banner>(null);

  // Scale
  const [scaleKey, setScaleKey] = useState<ScaleKey>("ng_5");
  const [customScale, setCustomScale] = useState<GradeMap>({ ...NG_5 });

  // Semesters
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

  // Target tool
  const [currentCgpa, setCurrentCgpa] = useState("");
  const [completedUnits, setCompletedUnits] = useState("");
  const [targetCgpa, setTargetCgpa] = useState("");
  const [nextUnits, setNextUnits] = useState("");

  const scale: GradeMap = useMemo(() => {
    if (scaleKey === "ng_5") return NG_5;
    if (scaleKey === "us_4") return US_4;
    return customScale;
  }, [scaleKey, customScale]);

  const scaleMax = useMemo(() => {
    // max grade point in current scale
    const vals = Object.values(scale);
    const m = vals.length ? Math.max(...vals) : 0;
    return m;
  }, [scale]);

  // Load from localStorage
  useEffect(() => {
    const saved = safeParseJSON<{
      scaleKey: ScaleKey;
      customScale: GradeMap;
      semesters: Semester[];
      targetTool: { currentCgpa: string; completedUnits: string; targetCgpa: string; nextUnits: string };
    }>(typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null);

    if (!saved) return;

    if (saved.scaleKey) setScaleKey(saved.scaleKey);
    if (saved.customScale) setCustomScale(saved.customScale);
    if (Array.isArray(saved.semesters) && saved.semesters.length) {
      // ensure structure
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
  }, []);

  // Save to localStorage (debounced)
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const payload = {
        scaleKey,
        customScale,
        semesters,
        targetTool: { currentCgpa, completedUnits, targetCgpa, nextUnits },
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
      for (const [g, c] of Object.entries(st.gradeCount)) gradeCount[g] = (gradeCount[g] ?? 0) + c;
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

    if (!Number.isFinite(cur) || !Number.isFinite(doneU) || !Number.isFinite(tgt) || !Number.isFinite(nxtU)) return null;
    if (doneU <= 0 || nxtU <= 0) return null;

    // required GPA next semester to achieve target:
    // (cur*doneU + req*nxtU) / (doneU + nxtU) = tgt
    const req = (tgt * (doneU + nxtU) - cur * doneU) / nxtU;
    if (!Number.isFinite(req)) return null;
    return req;
  }, [currentCgpa, completedUnits, targetCgpa, nextUnits]);

  const requiredStatus = useMemo(() => {
    if (requiredGpa === null) return null;
    const req = requiredGpa;
    if (req < 0) return { type: "success" as const, text: "You’re already above your target. Keep it steady." };
    if (req > scaleMax) return { type: "error" as const, text: "Target might be unrealistic for next semester with these units." };
    if (req >= scaleMax * 0.8) return { type: "info" as const, text: "You’ll need a very strong semester. Start early and stay consistent." };
    if (req >= scaleMax * 0.65) return { type: "info" as const, text: "Achievable — stay focused and prioritize tough courses." };
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
        return { ...s, courses: [...s.courses, { id: uid(), code: "", units: "", grade: "" }] };
      })
    );
  }

  function removeCourse(semId: string, courseId: string) {
    setSemesters((prev) =>
      prev.map((s) => {
        if (s.id !== semId) return s;
        const next = s.courses.filter((c) => c.id !== courseId);
        return { ...s, courses: next.length ? next : [{ id: uid(), code: "", units: "", grade: "" }] };
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
      // open first if none open
      if (!next.some((s) => s.open)) next[0] = { ...next[0], open: true };
      return next;
    });
  }

  async function copySummary() {
    const lines: string[] = [];
    lines.push(`Jabu Study GPA Summary`);
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
      setBanner({ type: "error", text: "Failed to copy. Your browser may block clipboard access." });
    }
  }

  function resetAll() {
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

    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    setBanner({ type: "success", text: "Reset done." });
  }

  const canCalculate = useMemo(() => totals.validRows > 0 && totals.unitsTotal > 0, [totals.validRows, totals.unitsTotal]);

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <header className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <Link href="/study" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 no-underline hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to Study
        </Link>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-zinc-900">GPA / CGPA Calculator</p>
            <p className="mt-1 text-sm text-zinc-600">Calculate your semester GPA and overall CGPA. Saves automatically on this device.</p>
          </div>

          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-inc-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>

        {/* Scale */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <label className="rounded-2xl border bg-white p-3">
            <span className="text-xs font-semibold text-zinc-600">Grade scale</span>
            <select
              value={scaleKey}
              onChange={(e) => setScaleKey(e.target.value as ScaleKey)}
              className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none"
            >
              <option value="ng_5">Nigeria (5.0) — A=5 … F=0</option>
              <option value="us_4">4.0 — A=4 … F=0</option>
              <option value="custom">Custom</option>
            </select>
            <p className="mt-1 text-[11px] text-zinc-500">Current max: {scaleMax}</p>
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

              <div className="grid h-10 w-10 place-items-center rounded-2xl border bg-white/70">
                <Calculator className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full border bg-white/70 px-2 py-1">Units: {totals.unitsTotal}</span>
              <span className="rounded-full border bg-white/70 px-2 py-1">Valid rows: {totals.validRows}</span>
              {totals.invalidRows ? <span className="rounded-full border bg-white/70 px-2 py-1">Invalid rows: {totals.invalidRows}</span> : null}
            </div>
          </div>
        </div>

        {scaleKey === "custom" ? (
          <div className="mt-3 rounded-3xl border bg-white p-4">
            <p className="text-sm font-semibold text-zinc-900">Custom scale</p>
            <p className="mt-1 text-xs text-zinc-600">Edit grade points. Keep grades as letters (A, B, C…).</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {Object.keys(customScale)
                .sort()
                .map((g) => (
                  <label key={g} className="rounded-2xl border bg-white p-3">
                    <span className="text-xs font-semibold text-zinc-600">{g}</span>
                    <input
                      value={String(customScale[g])}
                      onChange={(e) => {
                        const v = toNum(e.target.value);
                        setCustomScale((prev) => ({ ...prev, [g]: Number.isFinite(v) ? v : prev[g] }));
                      }}
                      inputMode="decimal"
                      className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none"
                    />
                  </label>
                ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCustomScale({ ...NG_5 })}
                className="rounded-2xl border px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
              >
                Use Nigeria 5.0 preset
              </button>
              <button
                type="button"
                onClick={() => setCustomScale({ ...US_4 })}
                className="rounded-2xl border px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
              >
                Use 4.0 preset
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <BannerBox banner={banner} onClose={() => setBanner(null)} />

      {/* Semesters */}
      <SectionCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-900">Semesters</p>
            <p className="mt-1 text-sm text-zinc-600">Add your courses and grades. Each semester collapses to keep the page clean on mobile.</p>
          </div>
          <button
            type="button"
            onClick={addSemester}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            Add semester
          </button>
        </div>

        <div className="space-y-3">
          {semesters.map((s, idx) => {
            const st = semesterStats(s, scale);
            const tone = classifyGpa(st.gpa, scaleMax);

            return (
              <div key={s.id} className="rounded-3xl border bg-white">
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
                        className="w-full bg-transparent text-base font-semibold text-zinc-900 outline-none"
                        aria-label={`Semester ${idx + 1} name`}
                      />
                      <p className="mt-1 text-sm text-zinc-600">
                        GPA: <span className="font-semibold text-zinc-900">{st.unitsTotal > 0 ? format2(st.gpa) : "—"}</span>
                        <span className="text-zinc-500"> • Units {st.unitsTotal} • Valid {st.validRows}/{s.courses.length}</span>
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeSemester(s.id)}
                    className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
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
                      const invalid = (!Number.isFinite(u) || u <= 0) && c.units.trim() !== "" ? true : false;
                      const gInvalid = c.grade.trim() !== "" && scale[g] === undefined;

                      return (
                        <div key={c.id} className="rounded-3xl border bg-white p-3">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <label className="rounded-2xl border bg-white px-3 py-2">
                              <span className="block text-[11px] font-semibold text-zinc-600">Course (optional)</span>
                              <input
                                value={c.code}
                                onChange={(e) => updateCourse(s.id, c.id, { code: e.target.value })}
                                placeholder="e.g. GST101"
                                className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                              />
                            </label>

                            <label className="rounded-2xl border bg-white px-3 py-2">
                              <span className="block text-[11px] font-semibold text-zinc-600">Units *</span>
                              <input
                                value={c.units}
                                onChange={(e) => updateCourse(s.id, c.id, { units: e.target.value })}
                                placeholder="e.g. 2"
                                inputMode="numeric"
                                className={cn(
                                  "mt-1 w-full bg-transparent text-sm outline-none placeholder:text-zinc-400",
                                  invalid ? "text-red-600" : "text-zinc-900"
                                )}
                              />
                              {invalid ? <p className="mt-1 text-[11px] font-semibold text-red-600">Enter a valid number &gt; 0</p> : null}
                            </label>

                            <label className="rounded-2xl border bg-white px-3 py-2">
                              <span className="block text-[11px] font-semibold text-zinc-600">Grade *</span>
                              <select
                                value={c.grade}
                                onChange={(e) => updateCourse(s.id, c.id, { grade: e.target.value })}
                                className={cn("mt-1 w-full bg-transparent text-sm outline-none", gInvalid ? "text-red-600" : "text-zinc-900")}
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
                            <div className="text-xs text-zinc-600">
                              Points:{" "}
                              <span className="font-semibold text-zinc-900">
                                {Number.isFinite(u) && u > 0 && scale[g] !== undefined ? format2(u * scale[g]) : "—"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCourse(s.id, c.id)}
                              className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
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
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
                      >
                        <Plus className="h-4 w-4" />
                        Add course row
                      </button>

                      <div className="flex-1 rounded-2xl border bg-zinc-50 p-3">
                        <p className="text-xs font-semibold text-zinc-700">Semester GPA</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900">{st.unitsTotal > 0 ? format2(st.gpa) : "—"}</p>
                        <p className="mt-1 text-xs text-zinc-600">Units: {st.unitsTotal} • Valid rows: {st.validRows}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Target GPA tool */}
      <SectionCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-900">Target GPA tool</p>
            <p className="mt-1 text-sm text-zinc-600">Enter your current CGPA and units to estimate the GPA you need next semester.</p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-2xl border bg-zinc-50">
            <Target className="h-5 w-5" />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="rounded-2xl border bg-white p-3">
            <span className="text-xs font-semibold text-zinc-600">Current CGPA</span>
            <input
              value={currentCgpa}
              onChange={(e) => setCurrentCgpa(e.target.value)}
              placeholder={`e.g. 3.45`}
              inputMode="decimal"
              className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </label>

          <label className="rounded-2xl border bg-white p-3">
            <span className="text-xs font-semibold text-zinc-600">Completed units</span>
            <input
              value={completedUnits}
              onChange={(e) => setCompletedUnits(e.target.value)}
              placeholder="e.g. 84"
              inputMode="numeric"
              className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </label>

          <label className="rounded-2xl border bg-white p-3">
            <span className="text-xs font-semibold text-zinc-600">Target CGPA</span>
            <input
              value={targetCgpa}
              onChange={(e) => setTargetCgpa(e.target.value)}
              placeholder={`e.g. 4.00`}
              inputMode="decimal"
              className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <p className="mt-1 text-[11px] text-zinc-500">Max on this scale: {scaleMax}</p>
          </label>

          <label className="rounded-2xl border bg-white p-3">
            <span className="text-xs font-semibold text-zinc-600">Next semester units</span>
            <input
              value={nextUnits}
              onChange={(e) => setNextUnits(e.target.value)}
              placeholder="e.g. 24"
              inputMode="numeric"
              className="mt-1 w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </label>
        </div>

        <div className="rounded-3xl border bg-zinc-50 p-4">
          <p className="text-xs font-semibold text-zinc-700">Required next GPA</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">
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
                  : "border-zinc-200 bg-white text-zinc-700"
              )}
            >
              {requiredStatus.text}
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">Fill all fields with valid numbers to see the required GPA.</p>
          )}
        </div>
      </SectionCard>

      {/* Sticky actions */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copySummary}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              <Copy className="h-4 w-4" />
              Copy summary
            </button>

            <button
              type="button"
              onClick={() => {
                setBanner({
                  type: "info",
                  text: "Tip: Your entries are saved automatically. If you refresh, you won’t lose them.",
                });
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              <Calculator className="h-4 w-4" />
              Saved ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}