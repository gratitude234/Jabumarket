"use client";
// app/study/apply-rep/page.tsx
import { cn } from "@/lib/utils";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader } from "../_components/StudyUI";
import {
  ArrowRight,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Building2,
  GraduationCap,
  X,
} from "lucide-react";

type FacultyRow = { id: string; name: string; sort_order?: number | null };
type DeptRow = { id: string; name: string; faculty_id: string; sort_order?: number | null };

type Role = "course_rep" | "dept_librarian";
type MeStatus = "not_applied" | "pending" | "approved" | "rejected";

const LEVELS = [100, 200, 300, 400, 500, 600];

function codeToMessage(code?: string) {
  switch (code) {
    case "NO_SESSION":
      return "Please log in to continue.";
    case "MISSING_DEPARTMENT":
      return "Select your department to continue.";
    case "LEVELS_REQUIRED":
      return "Select at least one level for Course Rep.";
    case "ALREADY_PENDING":
      return "You already have a pending application.";
    case "ALREADY_APPROVED":
      return "You’re already approved.";
    case "INVALID_ROLE":
      return "Please select a valid role.";
    default:
      return null;
  }
}

export default function ApplyRepPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [faculties, setFaculties] = useState<FacultyRow[]>([]);
  const [depts, setDepts] = useState<DeptRow[]>([]);

  // form state
  const [facultyId, setFacultyId] = useState<string>("");
  const [deptId, setDeptId] = useState<string>("");
  const [role, setRole] = useState<Role>("course_rep");
  const [levels, setLevels] = useState<number[]>([100]);
  const [note, setNote] = useState<string>("");

  // status from /me
  const [meStatus, setMeStatus] = useState<MeStatus>("not_applied");
  const [meRole, setMeRole] = useState<Role | null>(null);
  const [meScope, setMeScope] = useState<{
    faculty_id: string | null;
    department_id: string | null;
    levels: number[] | null;
    all_levels?: boolean;
  } | null>(null);
  const [meDecisionReason, setMeDecisionReason] = useState<string | null>(null);

  const isLocked = meStatus === "pending" || meStatus === "approved";

  const deptsForFaculty = useMemo(() => {
    if (!facultyId) return depts;
    return depts.filter((d) => d.faculty_id === facultyId);
  }, [depts, facultyId]);

  const facultyName = useMemo(() => {
    const f = faculties.find((x) => x.id === facultyId);
    return f?.name ?? "";
  }, [faculties, facultyId]);

  const deptName = useMemo(() => {
    const d = depts.find((x) => x.id === deptId);
    return d?.name ?? "";
  }, [depts, deptId]);

  const selectedLevelsLabel = useMemo(() => {
    if (role === "dept_librarian") return "All levels";
    const ls = (levels || []).map((x) => `${x}L`).join(", ");
    return ls || "Select level(s)";
  }, [role, levels]);

  const summaryLine = useMemo(() => {
    if (!deptId) return "Choose your scope to continue.";
    const who = role === "course_rep" ? "Course Rep" : "Departmental Librarian";
    const dept = deptName || "Department";
    return `${who} • ${dept} • ${selectedLevelsLabel}`;
  }, [deptId, deptName, role, selectedLevelsLabel]);

  const canSubmit = useMemo(() => {
    if (isLocked) return false;
    if (!facultyId) return false;
    if (!deptId) return false;
    if (role === "course_rep" && (!levels || levels.length === 0)) return false;
    return true;
  }, [isLocked, facultyId, deptId, role, levels]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          router.replace("/login?next=%2Fstudy%2Fapply-rep");
          return;
        }

        const [facRes, depRes, meRes] = await Promise.all([
          supabase.from("study_faculties").select("id,name,sort_order").order("sort_order"),
          supabase.from("study_departments").select("id,name,faculty_id,sort_order").order("sort_order"),
          fetch("/api/study/rep-applications/me", { method: "GET", cache: "no-store" }).then((r) => r.json()),
        ]);

        if (!mounted) return;

        setFaculties((facRes.data as any) ?? []);
        setDepts((depRes.data as any) ?? []);

        if (meRes?.ok) {
          const status: MeStatus = meRes.status ?? "not_applied";
          setMeStatus(status);
          setMeRole(meRes.role ?? null);
          setMeScope(meRes.scope ?? null);

          const reason = meRes?.application?.decision_reason ?? meRes?.application?.note ?? null;
          setMeDecisionReason(reason);

          // Prefill (helps rejected users reapply quickly)
          if (meRes?.scope?.faculty_id) setFacultyId(meRes.scope.faculty_id);
          if (meRes?.scope?.department_id) setDeptId(meRes.scope.department_id);

          if (meRes?.role === "dept_librarian") setRole("dept_librarian");
          if (meRes?.role === "course_rep") setRole("course_rep");

          const existingLevels =
            Array.isArray(meRes?.scope?.levels) && meRes.scope.levels.length ? meRes.scope.levels : null;
          if (existingLevels) setLevels(existingLevels);
        }
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? "Failed to load.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  function toggleLevel(l: number) {
    setLevels((prev) => {
      const has = prev.includes(l);
      if (has) {
        const next = prev.filter((x) => x !== l);
        // Keep at least one level selected for Course Rep
        return next.length ? next : prev;
      }
      return [...prev, l].sort((a, b) => a - b);
    });
  }

  async function submit() {
    setError(null);
    setSuccess(null);

    if (!facultyId) {
      setError("Select your faculty.");
      return;
    }
    if (!deptId) {
      setError("Select your department.");
      return;
    }
    if (role === "course_rep" && (!levels || levels.length === 0)) {
      setError("Select at least one level for Course Rep.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/study/rep-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          faculty_id: facultyId || null,
          department_id: deptId,
          role,
          levels: role === "course_rep" ? levels : null,
          // NOTE: API currently ignores note unless you add it server-side.
          // Keeping here for forward-compat.
          note: note || null,
        }),
      });

      const json = await res.json();
      if (!json?.ok) {
        const msg = codeToMessage(json?.code) || json?.message || json?.error || "Request failed";
        throw new Error(msg);
      }

      setSuccess("Application submitted. You can check the status on this page.");
      setNote("");

      // Refresh status immediately
      const me = await fetch("/api/study/rep-applications/me", { cache: "no-store" }).then((r) => r.json());
      if (me?.ok) {
        setMeStatus(me.status ?? "pending");
        setMeRole(me.role ?? role);
        setMeScope(me.scope ?? null);
        setMeDecisionReason(me?.application?.decision_reason ?? null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  // status view content
  const statusCard = (() => {
    if (loading) {
      return (
        <Card className="rounded-3xl">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        </Card>
      );
    }

    if (meStatus === "pending") {
      return (
        <Card className="rounded-3xl">
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <Info className="mt-0.5 h-4 w-4" />
            <div className="min-w-0">
              <div className="font-semibold">Application under review</div>
              <div className="mt-0.5 text-amber-900/80">
                You can keep browsing while we review your request. Updates will appear here.
              </div>
              {meRole ? (
                <div className="mt-2 text-xs text-amber-900/80">
                  <span className="font-semibold">Scope:</span>{" "}
                  {meRole === "dept_librarian"
                    ? "Departmental Librarian • All levels"
                    : `Course Rep • ${
                        Array.isArray(meScope?.levels) && meScope?.levels?.length
                          ? meScope.levels.map((x: number) => `${x}L`).join(", ")
                          : "—"
                      }`}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/study"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
                    "text-sm font-semibold text-foreground hover:bg-secondary/50"
                  )}
                >
                  Back to Study <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          {error ? <InlineError message={error} /> : null}
          {success ? <InlineSuccess message={success} /> : null}
        </Card>
      );
    }

    if (meStatus === "approved") {
      return (
        <Card className="rounded-3xl">
          <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            <div className="min-w-0">
              <div className="font-semibold">You’re approved 🎉</div>
              <div className="mt-0.5 text-emerald-900/80">
                You can now upload materials within your assigned scope.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/study/materials/upload"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2",
                    "text-sm font-semibold text-foreground hover:opacity-90",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  )}
                >
                  Go to Uploads <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/study"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
                    "text-sm font-semibold text-foreground hover:bg-secondary/50"
                  )}
                >
                  Back to Study
                </Link>
              </div>
            </div>
          </div>

          {error ? <InlineError message={error} /> : null}
          {success ? <InlineSuccess message={success} /> : null}
        </Card>
      );
    }

    if (meStatus === "rejected") {
      return (
        <Card className="rounded-3xl">
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div className="min-w-0">
              <div className="font-semibold">Application not approved</div>
              <div className="mt-0.5 text-rose-900/80">
                Update your details and reapply. If you have proof (rep appointment / department approval), mention it.
              </div>
              {meDecisionReason ? (
                <div className="mt-2 text-xs text-rose-900/80">
                  <span className="font-semibold">Reason:</span> {meDecisionReason}
                </div>
              ) : null}
            </div>
          </div>

          {error ? <InlineError message={error} /> : null}
          {success ? <InlineSuccess message={success} /> : null}
        </Card>
      );
    }

    // not applied
    return (
      <Card className="rounded-3xl">
        <div className="flex items-start gap-2 rounded-2xl border bg-secondary/30 p-3 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="font-semibold">Apply to upload materials</div>
            <div className="mt-0.5 text-muted-foreground">
              Choose your role and scope below. Uploads are reviewed before they go live.
            </div>
          </div>
        </div>

        {error ? <InlineError message={error} /> : null}
        {success ? <InlineSuccess message={success} /> : null}
      </Card>
    );
  })();

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      <PageHeader
        title="Apply to contribute"
        subtitle="Course Reps and Departmental Librarians can upload materials for their department. All uploads are reviewed."
        right={
          <div className="flex items-center gap-2">
            <Link
              href="/study"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
                "text-sm font-semibold text-foreground hover:bg-secondary/50"
              )}
            >
              Not now <X className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      {statusCard}

      {/* Form + Summary */}
      <div className="grid gap-4 md:grid-cols-5">
        {/* Form */}
        <Card className={cn("rounded-3xl md:col-span-3", isLocked && "opacity-70")}>
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-secondary">
              <ShieldCheck className="h-5 w-5 text-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-extrabold tracking-tight text-foreground">Your application</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isLocked
                  ? "Your application is locked while it’s pending/approved."
                  : "Fill this once. If rejected, you can update and resubmit."}
              </p>
            </div>
          </div>

          {/* Role selector */}
          <div className="mt-4">
            <p className="text-sm font-semibold text-foreground">Choose role</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setRole("course_rep")}
                className={cn(
                  "rounded-2xl border p-3 text-left transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  role === "course_rep"
                    ? "border-border bg-secondary text-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <div className="flex items-start gap-2">
                  <GraduationCap className="mt-0.5 h-4 w-4" />
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-foreground">Course Rep</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">Upload for selected level(s).</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={isLocked}
                onClick={() => setRole("dept_librarian")}
                className={cn(
                  "rounded-2xl border p-3 text-left transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  role === "dept_librarian"
                    ? "border-border bg-secondary text-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4" />
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-foreground">Departmental Librarian</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">Upload for all levels.</div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Faculty + Department */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Faculty" hint="Select your faculty first.">
              <select
                disabled={isLocked}
                value={facultyId}
                onChange={(e) => {
                  const next = e.target.value;
                  setFacultyId(next);
                  // reset department if it doesn't belong anymore
                  setDeptId("");
                }}
                className={cn(
                  "w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              >
                <option value="">Select faculty</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Department" hint={facultyId ? "Choose your department." : "Select a faculty to unlock."}>
              <select
                disabled={isLocked || !facultyId}
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                className={cn(
                  "w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  (!facultyId || isLocked) && "opacity-60"
                )}
              >
                <option value="">{facultyId ? "Select department" : "Select faculty first"}</option>
                {deptsForFaculty.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Levels */}
          <div className="mt-4">
            <p className="text-sm font-semibold text-foreground">Level scope</p>
            {role === "dept_librarian" ? (
              <div className="mt-2 rounded-2xl border border-border bg-secondary/30 p-3 text-sm">
                <div className="font-semibold text-foreground">All levels</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Departmental Librarians cover every level in the department.
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {LEVELS.map((l) => {
                  const active = levels.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      disabled={isLocked}
                      onClick={() => toggleLevel(l)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        active
                          ? "border-border bg-secondary text-foreground"
                          : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                        isLocked && "opacity-60"
                      )}
                    >
                      {l}L
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Note (proof helper, forward-compatible) */}
          <div className="mt-4">
            <Field
              label="Verification note (optional but recommended)"
              hint="Example: “I was appointed course rep by … on … (screenshot available)”"
            >
              <textarea
                disabled={isLocked}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                className={cn(
                  "w-full resize-none rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  isLocked && "opacity-60"
                )}
                placeholder="Add any proof or context that helps approval…"
              />
            </Field>
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/study"
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-2",
                "text-sm font-semibold text-foreground hover:bg-secondary/50"
              )}
            >
              Back to Study
            </Link>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || submitting}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-2",
                "text-sm font-extrabold text-foreground hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                (!canSubmit || submitting) && "opacity-60"
              )}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit application <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {!isLocked ? (
            <div className="mt-4 rounded-2xl border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">How it works</div>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>Apply with the correct scope (department + level).</li>
                <li>Moderators review your request.</li>
                <li>If approved, the Upload tab becomes available.</li>
                <li>Uploads are reviewed before going live.</li>
              </ul>
            </div>
          ) : null}
        </Card>

        {/* Summary */}
        <Card className="rounded-3xl md:col-span-2">
          <p className="text-sm font-extrabold text-foreground">Summary</p>
          <p className="mt-1 text-sm text-muted-foreground">This is what you’re requesting.</p>

          <div className="mt-3 space-y-2">
            <SummaryRow label="Role" value={role === "course_rep" ? "Course Rep" : "Departmental Librarian"} />
            <SummaryRow label="Faculty" value={facultyName || "—"} />
            <SummaryRow label="Department" value={deptName || "—"} />
            <SummaryRow label="Levels" value={selectedLevelsLabel || "—"} />
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-background p-3 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground">Preview</div>
            <div className="mt-1">{summaryLine}</div>
          </div>

          {meStatus === "approved" ? (
            <Link
              href="/study/materials/upload"
              className={cn(
                "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-2",
                "text-sm font-extrabold text-foreground hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              Upload now <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{label}</p>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-background px-3 py-2">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="text-xs font-extrabold text-foreground text-right">{value}</span>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}

function InlineSuccess({ message }: { message: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
      <CheckCircle2 className="mt-0.5 h-4 w-4" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}