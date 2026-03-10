"use client";
import { cn } from "@/lib/utils";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Check,
  Loader2,
  Search,
  X,
  Clock,
  BadgeCheck,
  Ban,
  UserCheck2,
  Building2,
  GraduationCap,
  RefreshCw,
  MessageSquareWarning,
} from "lucide-react";

type RepApplication = {
  id: string;
  user_id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  role: "course_rep" | "dept_librarian" | null;
  faculty_id: string | null;
  department_id: string | null;
  level: number | null; // legacy
  levels: number[] | null;
  all_levels?: boolean;
  note: string | null;
  admin_note: string | null;
  decision_reason?: string | null;
};

type ApiResponse = { ok: boolean; items?: RepApplication[]; data?: RepApplication[]; error?: string };

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-NG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: RepApplication["status"] }) {
  const tone =
    status === "approved"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status === "rejected"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-amber-50 text-amber-900 border-amber-200";
  const Icon = status === "approved" ? BadgeCheck : status === "rejected" ? Ban : Clock;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", tone)}>
      <Icon className="h-3.5 w-3.5" /> {status}
    </span>
  );
}

type FacultyRow = { id: string; name: string };
type DeptRow = { id: string; name: string; faculty_id: string };

function RolePill({ role }: { role: RepApplication["role"] }) {
  if (!role) {
    return <span className="inline-flex items-center gap-1 rounded-full border bg-zinc-50 px-2 py-0.5 text-xs">Unknown role</span>;
  }
  const isLib = role === "dept_librarian";
  const Icon = isLib ? Building2 : GraduationCap;
  const label = isLib ? "Departmental Librarian" : "Course Rep";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-zinc-50 px-2 py-0.5 text-xs">
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}

function LevelsPill({ role, levels }: { role: RepApplication["role"]; levels: number[] | null }) {
  const label =
    role === "dept_librarian" ? "All levels" : levels?.length ? levels.map((l) => `${l}L`).join(", ") : "—";
  return <span className="rounded-full border bg-zinc-50 px-2 py-0.5 text-xs">{label}</span>;
}

export default function StudyAdminRepApplicationsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [q, setQ] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RepApplication[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [faculties, setFaculties] = useState<FacultyRow[]>([]);
  const [departments, setDepartments] = useState<DeptRow[]>([]);

  async function getTokenOrRedirect() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent("/study-admin/rep-applications")}`);
      return null;
    }
    return token;
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;

      const url = new URL("/api/study-admin/rep-applications", window.location.origin);
      url.searchParams.set("status", status);
      if (q.trim()) url.searchParams.set("q", q.trim());

      const res = await fetch(url.toString(), {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        router.replace(`/login?next=${encodeURIComponent("/study-admin/rep-applications")}`);
        return;
      }
      if (res.status === 403) {
        router.replace("/study");
        return;
      }
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load applications");
      const list = (json as any).items ?? (json as any).data ?? [];
      setItems(list);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Lookup tables for nicer labels (best-effort; falls back to IDs)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [fRes, dRes] = await Promise.all([
          supabase.from("study_faculties").select("id,name").order("name"),
          supabase.from("study_departments").select("id,name,faculty_id").order("name"),
        ]);
        if (!mounted) return;
        if (!fRes.error) setFaculties((fRes.data as any) ?? []);
        if (!dRes.error) setDepartments((dRes.data as any) ?? []);
      } catch {
        // ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const count = useMemo(() => items.length, [items]);

  async function approve(id: string) {
    if (!id) {
      setErr("Missing application id. Please refresh the page and try again.");
      return;
    }
    setBusyId(id);
    setErr(null);
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;
      const appId = encodeURIComponent(String(id));
      const res = await fetch(`/api/study-admin/rep-applications/${appId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ admin_note: adminNote.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Approve failed");
      setAdminNote("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    if (!id) {
      setErr("Missing application id. Please refresh the page and try again.");
      return;
    }
    setBusyId(id);
    setErr(null);
    try {
      const token = await getTokenOrRedirect();
      if (!token) return;
      const appId = encodeURIComponent(String(id));
      const res = await fetch(`/api/study-admin/rep-applications/${appId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          admin_note: adminNote.trim() || null,
          decision_reason: rejectReason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Reject failed");
      setAdminNote("");
      setRejectId(null);
      setRejectReason("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Class rep applications</h1>
            <p className="mt-1 text-sm text-zinc-600">Approve who can upload & moderate materials for a scope.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-2xl border bg-white px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                className="h-10 w-64 max-w-[70vw] rounded-2xl border bg-white pl-10 pr-3 text-sm"
                placeholder="Search faculty, dept, note…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load();
                }}
              />
            </div>
            <button
              onClick={load}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-black px-4 text-sm font-medium text-white"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      ) : null}

      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-600">
            Showing <span className="font-semibold text-zinc-900">{count}</span> application(s)
          </p>
          <div className="inline-flex items-center gap-2 rounded-2xl border bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <UserCheck2 className="h-4 w-4" /> Rep Apps
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="rounded-3xl border bg-zinc-50 p-4">
            <div className="text-sm font-semibold">Optional admin note</div>
            <div className="mt-1 text-xs text-zinc-600">Saved on the application when you approve/reject.</div>
            <input
              className="mt-3 h-11 w-full rounded-2xl border bg-white px-3 text-sm"
              placeholder="e.g. Approved (verified class rep)"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="rounded-3xl border p-6 text-sm text-zinc-600">Loading…</div>
          ) : items.length === 0 ? (
            <div className="rounded-3xl border p-6 text-sm text-zinc-600">
              No applications yet.
            </div>
          ) : (
            items.map((it) => (
              <div key={it.id} className="rounded-3xl border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={it.status} />
                      <RolePill role={it.role} />
                      <LevelsPill
                        role={it.role}
                        levels={it.levels ?? (typeof it.level === "number" ? [it.level] : null)}
                      />
                      <span className="rounded-full border bg-zinc-50 px-2 py-0.5 text-xs">
                        {departments.find((d) => d.id === it.department_id)?.name ||
                          (it.department_id ? "Department" : "—")}
                      </span>
                      <span className="rounded-full border bg-zinc-50 px-2 py-0.5 text-xs">
                        {faculties.find((f) => f.id === it.faculty_id)?.name || (it.faculty_id ? "Faculty" : "—")}
                      </span>
                    </div>
                    <div className="mt-3 text-lg font-semibold">Application</div>
                    <div className="mt-1 text-sm text-zinc-600">
                      Submitted {formatDate(it.created_at)}
                    </div>
                    {it.note ? <div className="mt-3 text-sm">“{it.note}”</div> : null}
                    {it.admin_note ? (
                      <div className="mt-2 text-xs text-zinc-600">Admin note: {it.admin_note}</div>
                    ) : null}
                    {it.decision_reason ? (
                      <div className="mt-2 text-xs text-zinc-600">Decision reason: {it.decision_reason}</div>
                    ) : null}
                  </div>

                  {it.status === "pending" ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => approve(it.id)}
                        disabled={busyId === it.id}
                        className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busyId === it.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setRejectId(it.id);
                          setRejectReason("");
                        }}
                        disabled={busyId === it.id}
                        className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
                      >
                        {busyId === it.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>

                {rejectId === it.id ? (
                  <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start gap-2">
                      <MessageSquareWarning className="mt-0.5 h-4 w-4 text-red-700" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-red-900">Rejection reason (required)</div>
                        <div className="mt-1 text-xs text-red-800/80">
                          This will be shown to the applicant.
                        </div>
                      </div>
                    </div>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      className="mt-3 w-full resize-none rounded-2xl border bg-white px-3 py-2 text-sm outline-none"
                      placeholder="e.g. Please provide proof of appointment and confirm your department."
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => reject(it.id)}
                        disabled={busyId === it.id || !rejectReason.trim()}
                        className="inline-flex items-center gap-2 rounded-2xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busyId === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        Confirm reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectId(null);
                          setRejectReason("");
                        }}
                        className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
