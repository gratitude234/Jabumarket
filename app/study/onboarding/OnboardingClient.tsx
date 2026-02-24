// app/study/onboarding/OnboardingClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  School,
  Layers,
  Sparkles,
  X,
  Search,
} from "lucide-react";
import { Card } from "../_components/StudyUI";

function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

const SEMESTERS = [
  { value: "first", label: "1st Semester" },
  { value: "second", label: "2nd Semester" },
  { value: "summer", label: "Summer" },
];

type FacultyRow = { id: string; name: string; sort_order?: number | null };
type DeptRow = {
  id: string;
  faculty_id: string;
  display_name?: string;
  official_name?: string;
  sort_order?: number | null;
};

type Step = 1 | 2 | 3;

function normalize(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function Banner({
  tone = "info",
  title,
  description,
  onClose,
}: {
  tone?: "info" | "error" | "success";
  title: string;
  description?: string;
  onClose?: () => void;
}) {
  const toneCls =
    tone === "error"
      ? "border-rose-300/40 bg-rose-100/30 dark:bg-rose-950/20"
      : tone === "success"
      ? "border-emerald-300/40 bg-emerald-100/30 dark:bg-emerald-950/20"
      : "border-border bg-card";

  return (
    <div className={cn("rounded-3xl border p-4", toneCls)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-foreground">{title}</p>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl p-2 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ProgressPill({ step, total }: { step: number; total: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground">
      Step {step} of {total}
    </div>
  );
}

/**
 * SearchSelect: mobile-friendly searchable picker (no extra libs)
 */
function SearchSelect({
  label,
  icon,
  placeholder,
  items,
  valueId,
  onChangeId,
  disabled,
  helper,
  emptyText = "No matches",
}: {
  label: string;
  icon?: React.ReactNode;
  placeholder: string;
  items: Array<{ id: string; label: string; meta?: string }>;
  valueId: string;
  onChangeId: (id: string) => void;
  disabled?: boolean;
  helper?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => items.find((x) => x.id === valueId) ?? null, [items, valueId]);

  const filtered = useMemo(() => {
    const needle = normalize(q).toLowerCase();
    if (!needle) return items.slice(0, 30);
    const ranked = items
      .map((x) => {
        const hay = `${x.label} ${x.meta ?? ""}`.toLowerCase();
        const score =
          hay.startsWith(needle) ? 0 : hay.includes(needle) ? 1 : 999; // simple rank
        return { x, score };
      })
      .filter((r) => r.score !== 999)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.x);
    return ranked.slice(0, 40);
  }, [items, q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    // keep input text aligned when selection changes
    if (selected && !q) {
      // no-op (we only update q when user types)
    }
  }, [selected, q]);

  return (
    <div ref={boxRef} className={cn("relative", disabled ? "opacity-70" : "")}>
      <label className="block text-xs font-extrabold text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          {icon}
          {label}
        </span>
      </label>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "mt-1 flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background px-3 py-3 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          disabled ? "cursor-not-allowed" : "hover:bg-secondary/40"
        )}
        aria-label={`${label} picker`}
      >
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", selected ? "text-foreground" : "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </p>
          {selected?.meta ? <p className="mt-0.5 text-xs text-muted-foreground">{selected.meta}</p> : null}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>

      {helper ? <p className="mt-1 text-xs font-semibold text-muted-foreground">{helper}</p> : null}

      {open ? (
        <div className="absolute left-0 right-0 top-[86px] z-50 rounded-3xl border border-border bg-card p-3 shadow-xl">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full bg-transparent text-sm text-foreground outline-none"
              autoFocus
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="rounded-xl p-1 hover:bg-secondary/60"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-[280px] overflow-auto pr-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-sm font-semibold text-muted-foreground">{emptyText}</p>
            ) : (
              <div className="grid gap-1">
                {filtered.map((it) => {
                  const active = it.id === valueId;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        onChangeId(it.id);
                        setOpen(false);
                        setQ("");
                      }}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2 text-left",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        active ? "border-border bg-secondary" : "border-border/70 bg-background hover:bg-secondary/40"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-foreground">{it.label}</p>
                        {it.meta ? <p className="mt-0.5 text-xs text-muted-foreground">{it.meta}</p> : null}
                      </div>
                      {active ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQ("");
              }}
              className="rounded-2xl border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground hover:bg-secondary/50"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function OnboardingClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const next = useMemo(() => {
    const raw = (sp.get("next") ?? "/study").trim();
    return raw.startsWith("/") ? raw : "/study";
  }, [sp]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Stepper
  const [step, setStep] = useState<Step>(1);

  // Official lists
  const [officialOk, setOfficialOk] = useState(true);
  const [faculties, setFaculties] = useState<FacultyRow[]>([]);
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  // Manual override
  const [manualMode, setManualMode] = useState(false);
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");

  // Level + semester
  const [level, setLevel] = useState<number | "">("");
  const [semester, setSemester] = useState<string>("");

  // Inline messages (no alert)
  const [banner, setBanner] = useState<{ tone: "info" | "error" | "success"; title: string; description?: string } | null>(
    null
  );

  const totalSteps = 3;

  const facultyItems = useMemo(
    () => faculties.map((f) => ({ id: f.id, label: f.name })),
    [faculties]
  );

  const deptItems = useMemo(() => {
    return (departments ?? []).map((d) => ({
      id: d.id,
      label: (d.display_name || d.official_name || "Department").trim(),
      meta: d.official_name && d.display_name && d.official_name !== d.display_name ? `Official: ${d.official_name}` : undefined,
    }));
  }, [departments]);

  const canContinueStep1 = useMemo(() => {
    if (manualMode) return normalize(faculty).length >= 2 && normalize(department).length >= 2;
    return !!facultyId && !!departmentId;
  }, [manualMode, faculty, department, facultyId, departmentId]);

  const canContinueStep2 = useMemo(() => {
    return typeof level === "number" && Number.isFinite(level) && !!semester;
  }, [level, semester]);

  const isValidAll = canContinueStep1 && canContinueStep2;

  // Boot: auth + official lists + prefs
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setBanner(null);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent("/study/onboarding")}`);
        return;
      }

      // Load faculties (official)
      const facRes = await supabase
        .from("study_faculties_clean")
        .select("id,name,sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (!mounted) return;

      if (facRes.error) {
        setOfficialOk(false);
        setFaculties([]);
        setManualMode(true);
        setBanner({
          tone: "info",
          title: "Official list unavailable right now",
          description: "You can type your faculty/department manually and continue.",
        });
      } else {
        setOfficialOk(true);
        setFaculties((facRes.data ?? []) as FacultyRow[]);
      }

      // Load existing prefs (if exists)
      const { data, error } = await supabase
        .from("study_user_preferences")
        .select("faculty_id,department_id,faculty,department,level,semester")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      const d: any = data;
      const alreadyDone = !!(
        d?.level &&
        d?.semester &&
        ((d?.faculty_id && d?.department_id) || (d?.faculty && d?.department))
      );

      if (!error && alreadyDone) {
        router.replace(next);
        return;
      }

      // Prefill if present
      if (!error && d) {
        if (typeof d.faculty_id === "string") setFacultyId(d.faculty_id);
        if (typeof d.department_id === "string") setDepartmentId(d.department_id);
        if (typeof d.faculty === "string") setFaculty(d.faculty);
        if (typeof d.department === "string") setDepartment(d.department);
        if (typeof d.level === "number") setLevel(d.level);
        if (typeof d.semester === "string") setSemester(d.semester);

        // Decide default mode based on what we have
        const hasOfficial = typeof d.faculty_id === "string" && typeof d.department_id === "string";
        const hasManual = typeof d.faculty === "string" && typeof d.department === "string";
        if (hasManual && !hasOfficial) setManualMode(true);
      }

      // Smart default step:
      // - if step1 already filled, jump to step2; if step2 also filled, jump to review
      const step1Ready =
        (typeof d?.faculty_id === "string" && typeof d?.department_id === "string") ||
        (typeof d?.faculty === "string" && typeof d?.department === "string");
      const step2Ready = typeof d?.level === "number" && typeof d?.semester === "string" && !!d?.semester;

      setStep(step2Ready ? 3 : step1Ready ? 2 : 1);

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [router, next]);

  // Load departments when faculty changes (official mode)
  useEffect(() => {
    if (!officialOk) return;
    if (manualMode) return;

    if (!facultyId) {
      setDepartments([]);
      setDepartmentId("");
      return;
    }

    let mounted = true;
    (async () => {
      const res = await supabase
        .from("study_departments_clean")
        .select("id,faculty_id,display_name,official_name,sort_order")
        .eq("faculty_id", facultyId)
        .order("sort_order", { ascending: true })
        .order("display_name", { ascending: true });

      if (!mounted) return;

      if (res.error) {
        setOfficialOk(false);
        setDepartments([]);
        setManualMode(true);
        setBanner({
          tone: "info",
          title: "Departments list failed to load",
          description: "No worries—switch to manual typing and continue.",
        });
        return;
      }

      setDepartments((res.data ?? []) as DeptRow[]);
    })();

    return () => {
      mounted = false;
    };
  }, [officialOk, manualMode, facultyId]);

  function goNext() {
    setBanner(null);

    if (step === 1) {
      if (!canContinueStep1) {
        setBanner({
          tone: "error",
          title: "Complete your faculty and department",
          description: manualMode
            ? "Type at least 2 characters for both fields."
            : "Pick your faculty, then pick your department.",
        });
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!canContinueStep2) {
        setBanner({
          tone: "error",
          title: "Select your level and semester",
          description: "This helps us show the right practice sets and materials.",
        });
        return;
      }
      setStep(3);
      return;
    }
  }

  function goBack() {
    setBanner(null);
    setStep((s) => (s === 1 ? 1 : ((s - 1) as Step)));
  }

  async function skip() {
    // Skip is allowed: just navigate.
    // Best-effort "touch" the prefs row so user can change later (but don't fail if table/RLS blocks).
    setBanner(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent("/study/onboarding")}`);
        return;
      }
      await supabase.from("study_user_preferences").upsert({
        user_id: user.id,
        updated_at: new Date().toISOString(),
      } as any);
    } catch {
      // ignore
    }
    router.replace(next);
  }

  async function saveAll() {
    if (!isValidAll) {
      setBanner({
        tone: "error",
        title: "Almost there",
        description: "Please complete the required fields before saving.",
      });
      return;
    }

    setSaving(true);
    setBanner(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent("/study/onboarding")}`);
        return;
      }

      const selectedFaculty = manualMode
        ? normalize(faculty)
        : faculties.find((f) => f.id === facultyId)?.name ?? "";
      const selectedDeptRow = manualMode ? null : departments.find((d) => d.id === departmentId) ?? null;
      const selectedDepartment = manualMode
        ? normalize(department)
        : normalize(String(selectedDeptRow?.display_name || selectedDeptRow?.official_name || ""));

      const payload: any = {
        user_id: user.id,
        faculty: selectedFaculty,
        department: selectedDepartment,
        level,
        semester,
        updated_at: new Date().toISOString(),
      };

      if (!manualMode) {
        payload.faculty_id = facultyId;
        payload.department_id = departmentId;
      }

      const { error } = await supabase.from("study_user_preferences").upsert(payload);
      if (error) throw error;

      setBanner({ tone: "success", title: "Saved", description: "Taking you to Study…" });

      router.replace(next);
      router.refresh();
    } catch (e: any) {
      setBanner({
        tone: "error",
        title: "Couldn’t save your setup",
        description: e?.message ?? "Try again. If it keeps failing, you can skip for now.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
        <Card className="rounded-3xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading setup…
          </div>
        </Card>
      </div>
    );
  }

  // Review strings
  const reviewFaculty = manualMode ? normalize(faculty) : faculties.find((f) => f.id === facultyId)?.name ?? "";
  const reviewDept = manualMode
    ? normalize(department)
    : normalize(String(departments.find((d) => d.id === departmentId)?.display_name || departments.find((d) => d.id === departmentId)?.official_name || ""));

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      {/* Header */}
      <Card className="rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-extrabold tracking-tight text-foreground">Set up Jabu Study</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Quick setup so we can show the right materials + practice sets for you. You can change this later.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <ProgressPill step={step} total={totalSteps} />
            <button
              type="button"
              onClick={skip}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Skip
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* Banner */}
      {banner ? (
        <div className="mt-3">
          <Banner tone={banner.tone} title={banner.title} description={banner.description} onClose={() => setBanner(null)} />
        </div>
      ) : null}

      {/* Step content */}
      <div className="mt-3 space-y-3">
        {/* STEP 1 */}
        {step === 1 ? (
          <Card className="rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-foreground">Your faculty & department</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose from the official list, or type manually if yours isn’t listed.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setBanner(null);
                  setManualMode((v) => !v);
                  // reset official picks if switching to manual and nothing is selected
                  if (!manualMode) {
                    setFaculty("");
                    setDepartment("");
                  }
                }}
                className="shrink-0 rounded-2xl border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground hover:bg-secondary/50"
              >
                {manualMode ? "Use official list" : "Type manually"}
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {!manualMode ? (
                <>
                  <SearchSelect
                    label="Faculty"
                    icon={<School className="h-4 w-4" />}
                    placeholder="Pick your faculty"
                    items={facultyItems}
                    valueId={facultyId}
                    onChangeId={(id) => {
                      setFacultyId(id);
                      setDepartmentId("");
                      setDepartments([]);
                    }}
                    helper={officialOk ? "Search and pick. Departments load after selecting faculty." : "Official list unavailable"}
                  />

                  <SearchSelect
                    label="Department"
                    icon={<Building2 className="h-4 w-4" />}
                    placeholder={facultyId ? "Pick your department" : "Select faculty first"}
                    items={deptItems}
                    valueId={departmentId}
                    onChangeId={(id) => setDepartmentId(id)}
                    disabled={!facultyId}
                    helper={!facultyId ? "Choose faculty to unlock departments." : "Search and pick your department."}
                    emptyText={facultyId ? "No departments found. Try manual typing." : "Select faculty first."}
                  />

                  <div className="rounded-2xl border border-border bg-card p-3">
                    <p className="text-xs font-extrabold text-foreground">Can’t find your department?</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Switch to manual typing. You can still continue and use Study normally.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs font-extrabold text-muted-foreground inline-flex items-center gap-2">
                      <School className="h-4 w-4" /> Faculty
                    </span>
                    <input
                      value={faculty}
                      onChange={(e) => setFaculty(e.target.value)}
                      placeholder="e.g. College of Health Sciences"
                      className={cn(
                        "mt-1 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      )}
                      aria-label="Faculty"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-extrabold text-muted-foreground inline-flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Department
                    </span>
                    <input
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Nursing"
                      className={cn(
                        "mt-1 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      )}
                      aria-label="Department"
                    />
                  </label>

                  <div className="rounded-2xl border border-border bg-card p-3">
                    <p className="text-xs font-extrabold text-foreground">Tip</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Keep it short and clear. You can edit this later in settings.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={skip}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-extrabold text-foreground hover:bg-secondary/50"
              >
                Skip for now <ArrowRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={goNext}
                disabled={!canContinueStep1}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold",
                  canContinueStep1
                    ? "bg-secondary text-foreground hover:opacity-90"
                    : "border border-border/60 bg-background text-muted-foreground opacity-60"
                )}
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ) : null}

        {/* STEP 2 */}
        {step === 2 ? (
          <Card className="rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-foreground">Your level & semester</p>
                <p className="mt-1 text-sm text-muted-foreground">This helps us tailor what you see on Study Home.</p>
              </div>
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-extrabold text-muted-foreground inline-flex items-center gap-2">
                  <Layers className="h-4 w-4" /> Level
                </span>
                <select
                  value={level === "" ? "" : String(level)}
                  onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : "")}
                  className={cn(
                    "mt-1 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                  aria-label="Level"
                >
                  <option value="">Select level</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="300">300</option>
                  <option value="400">400</option>
                  <option value="500">500</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-muted-foreground">Semester</span>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className={cn(
                    "mt-1 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  )}
                  aria-label="Semester"
                >
                  <option value="">Select semester</option>
                  {SEMESTERS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-extrabold text-foreground hover:bg-secondary/50"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>

              <button
                type="button"
                onClick={goNext}
                disabled={!canContinueStep2}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold",
                  canContinueStep2
                    ? "bg-secondary text-foreground hover:opacity-90"
                    : "border border-border/60 bg-background text-muted-foreground opacity-60"
                )}
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ) : null}

        {/* STEP 3 */}
        {step === 3 ? (
          <Card className="rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-foreground">Review</p>
                <p className="mt-1 text-sm text-muted-foreground">Confirm these details. You can change them later.</p>
              </div>
              <div className="rounded-2xl border border-border bg-background px-3 py-2 text-xs font-extrabold text-foreground">
                Ready
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="rounded-2xl border border-border bg-card p-3">
                <p className="text-xs font-extrabold text-muted-foreground">Faculty</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">{reviewFaculty || "—"}</p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-3">
                <p className="text-xs font-extrabold text-muted-foreground">Department</p>
                <p className="mt-1 text-sm font-extrabold text-foreground">{reviewDept || "—"}</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-3">
                  <p className="text-xs font-extrabold text-muted-foreground">Level</p>
                  <p className="mt-1 text-sm font-extrabold text-foreground">{level || "—"}</p>
                </div>

                <div className="rounded-2xl border border-border bg-card p-3">
                  <p className="text-xs font-extrabold text-muted-foreground">Semester</p>
                  <p className="mt-1 text-sm font-extrabold text-foreground">
                    {SEMESTERS.find((s) => s.value === semester)?.label ?? "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-3">
                <p className="text-xs font-extrabold text-foreground">Why we ask</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We use this to personalize Study Home, filter materials, and recommend relevant practice sets.
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={goBack}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-extrabold text-foreground hover:bg-secondary/50 disabled:opacity-60"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>

              <button
                type="button"
                onClick={saveAll}
                disabled={!isValidAll || saving}
                className={cn(
                  "inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold sm:w-auto",
                  isValidAll ? "bg-secondary text-foreground hover:opacity-90" : "border border-border/60 bg-background text-muted-foreground opacity-60"
                )}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Finish setup
              </button>
            </div>

            <div className="mt-3 text-center">
              <Link href={next} className="text-xs font-extrabold text-muted-foreground hover:text-foreground">
                Continue without saving
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}