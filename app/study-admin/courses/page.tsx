"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Pencil, Check, X, Ban, Trash2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CourseRow = {
  id: string;
  course_code: string;
  course_title: string | null;
  level: number;
  semester: string;
  department_id: string | null;
  faculty_id: string | null;
  status: string;
  created_at: string;
};

type Faculty = { id: string; name: string };
type Department = { id: string; name: string; faculty_id: string };

const LEVELS = [100, 200, 300, 400, 500, 600, 700];
const SEMESTERS = ["first", "second", "summer"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function StudyAdminCoursesPage() {
  const router = useRouter();

  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Filters
  const [deptFilter, setDeptFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Data
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // Add course modal
  const [showModal, setShowModal] = useState(false);
  const [newFacultyId, setNewFacultyId] = useState("");
  const [newDeptId, setNewDeptId] = useState("");
  const [newLevel, setNewLevel] = useState<number | "">("");
  const [newSemester, setNewSemester] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  // Departments for modal (filtered by faculty)
  const [modalDepts, setModalDepts] = useState<Department[]>([]);

  // Load faculties and departments once
  useEffect(() => {
    supabase
      .from("study_faculties")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setFaculties((data as Faculty[]) ?? []));

    supabase
      .from("study_departments")
      .select("id, name, faculty_id")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        setAllDepartments((data as Department[]) ?? []);
        setDepartments((data as Department[]) ?? []);
      });
  }, []);

  // Update modal depts when faculty changes
  useEffect(() => {
    setNewDeptId("");
    if (!newFacultyId) {
      setModalDepts(allDepartments);
    } else {
      setModalDepts(allDepartments.filter((d) => d.faculty_id === newFacultyId));
    }
  }, [newFacultyId, allDepartments]);

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent("/study-admin/courses")}`);
      return null;
    }
    return token;
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const token = await getToken();
      if (!token) return;

      const url = new URL("/api/study-admin/courses", window.location.origin);
      if (deptFilter) url.searchParams.set("dept_id", deptFilter);
      if (levelFilter) url.searchParams.set("level", levelFilter);
      if (statusFilter) url.searchParams.set("status", statusFilter);
      url.searchParams.set("page", String(page));

      const res = await fetch(url.toString(), {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { router.replace("/login?next=/study-admin/courses"); return; }
      if (res.status === 403) { router.replace("/study"); return; }

      const json = await res.json() as { ok: boolean; items: CourseRow[]; total: number; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message || "Failed to load");
      setCourses(json.items ?? []);
      setTotal(json.total ?? 0);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptFilter, levelFilter, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  // ── Inline edit save
  async function saveEdit() {
    if (!editId) return;
    setEditBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/study-admin/courses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: editId, course_code: editCode, course_title: editTitle }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || "Save failed");
      setEditId(null);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEditBusy(false);
    }
  }

  // ── Deactivate
  async function deactivate(id: string) {
    if (!window.confirm("Deactivate this course? It will no longer appear in course lists.")) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/study-admin/courses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, deactivate: true }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) { setErr(json.message || "Deactivate failed"); return; }
    await load();
  }

  // ── Delete course
  async function deleteCourse(id: string, code: string) {
    if (!window.confirm(`Delete ${code}? All materials attached to this course will also be permanently deleted. This cannot be undone.`)) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/study-admin/courses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ course_id: id }),
    });
    const json = await res.json() as { ok: boolean; code?: string; message?: string };
    if (!res.ok || !json.ok) {
      setErr(json.message || "Delete failed");
      return;
    }
    setCourses((prev) => prev.filter((c) => c.id !== id));
    setTotal((prev) => prev - 1);
  }

  // ── Add course
  async function addCourse() {
    setAddErr(null);
    if (!newCode.trim() || !newLevel || !newSemester || !newDeptId) {
      setAddErr("Course code, level, semester, and department are required.");
      return;
    }
    setAddBusy(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/study-admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          course_code: newCode.trim(),
          course_title: newTitle.trim() || null,
          level: newLevel,
          semester: newSemester,
          department_id: newDeptId,
          faculty_id: newFacultyId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || "Add failed");
      setShowModal(false);
      resetModal();
      await load();
    } catch (e: unknown) {
      setAddErr(e instanceof Error ? e.message : "Add failed");
    } finally {
      setAddBusy(false);
    }
  }

  function resetModal() {
    setNewFacultyId(""); setNewDeptId(""); setNewLevel(""); setNewSemester("");
    setNewCode(""); setNewTitle(""); setAddErr(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / 50));

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Courses</h1>
            <p className="mt-1 text-sm text-zinc-600">Manage all courses in the study hub.</p>
          </div>
          <button
            type="button"
            onClick={() => { resetModal(); setShowModal(true); }}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" /> Add Course
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500">Department</label>
            <select
              className="h-9 rounded-2xl border bg-white px-3 text-sm"
              value={deptFilter}
              onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
            >
              <option value="">All</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500">Level</label>
            <select
              className="h-9 rounded-2xl border bg-white px-3 text-sm"
              value={levelFilter}
              onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
            >
              <option value="">All</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500">Status</label>
            <select
              className="h-9 rounded-2xl border bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">All</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <button onClick={load} className="h-9 rounded-2xl bg-black px-4 text-sm font-medium text-white">Refresh</button>
        </div>
      </div>

      {err && <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>}

      {/* Table */}
      <div className="rounded-3xl border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : courses.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">No courses found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-50 text-left text-xs text-zinc-500">
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Semester</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {courses.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50/50">
                    <td className="px-4 py-3">
                      {editId === c.id ? (
                        <input
                          className="h-8 w-28 rounded-xl border px-2 text-sm font-mono"
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }}
                          autoFocus
                        />
                      ) : (
                        <span className="font-mono font-medium text-zinc-900">{c.course_code}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editId === c.id ? (
                        <input
                          className="h-8 w-48 rounded-xl border px-2 text-sm"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }}
                          placeholder="Course title…"
                        />
                      ) : (
                        <span className="text-zinc-700">{c.course_title ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{c.level}</td>
                    <td className="px-4 py-3 text-zinc-600 capitalize">{c.semester}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        c.status === "approved" ? "bg-emerald-50 text-emerald-700" :
                        c.status === "rejected" ? "bg-red-50 text-red-700" :
                        "bg-amber-50 text-amber-700"
                      )}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {editId === c.id ? (
                          <>
                            <button
                              type="button"
                              disabled={editBusy}
                              onClick={saveEdit}
                              className="inline-flex h-7 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {editBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditId(null)}
                              className="inline-flex h-7 items-center gap-1 rounded-xl border px-3 text-xs"
                            >
                              <X className="h-3 w-3" /> Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => { setEditId(c.id); setEditCode(c.course_code); setEditTitle(c.course_title ?? ""); }}
                              className="inline-flex h-7 items-center gap-1 rounded-xl border px-3 text-xs hover:bg-zinc-50"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                            {c.status !== "rejected" && (
                              <button
                                type="button"
                                onClick={() => deactivate(c.id)}
                                className="inline-flex h-7 items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-xs text-red-700 hover:bg-red-100"
                              >
                                <Ban className="h-3 w-3" /> Deactivate
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => deleteCourse(c.id, c.course_code)}
                              className="inline-flex h-7 items-center gap-1 rounded-xl border border-red-300 bg-red-50 px-3 text-xs text-red-800 hover:bg-red-100"
                            >
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-zinc-500">Page {page} of {totalPages} ({total} total)</p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-8 rounded-2xl border px-3 text-xs disabled:opacity-40"
              >Prev</button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 rounded-2xl border px-3 text-xs disabled:opacity-40"
              >Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Add course modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl border bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Course</h2>
              <button type="button" onClick={() => { setShowModal(false); resetModal(); }} className="text-zinc-400 hover:text-zinc-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700">Faculty</label>
                <select
                  className="h-10 rounded-2xl border bg-white px-3 text-sm"
                  value={newFacultyId}
                  onChange={(e) => setNewFacultyId(e.target.value)}
                >
                  <option value="">All faculties</option>
                  {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700">Department <span className="text-red-500">*</span></label>
                <select
                  className="h-10 rounded-2xl border bg-white px-3 text-sm"
                  value={newDeptId}
                  onChange={(e) => setNewDeptId(e.target.value)}
                >
                  <option value="">Select department…</option>
                  {modalDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-zinc-700">Level <span className="text-red-500">*</span></label>
                  <select
                    className="h-10 rounded-2xl border bg-white px-3 text-sm"
                    value={newLevel}
                    onChange={(e) => setNewLevel(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">Select…</option>
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-zinc-700">Semester <span className="text-red-500">*</span></label>
                  <select
                    className="h-10 rounded-2xl border bg-white px-3 text-sm"
                    value={newSemester}
                    onChange={(e) => setNewSemester(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {SEMESTERS.map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700">Course Code <span className="text-red-500">*</span></label>
                <input
                  className="h-10 rounded-2xl border bg-white px-3 text-sm font-mono uppercase"
                  placeholder="e.g. CSC301"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700">Course Title</label>
                <input
                  className="h-10 rounded-2xl border bg-white px-3 text-sm"
                  placeholder="e.g. Data Structures and Algorithms"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              {addErr && <p className="text-sm text-red-600">{addErr}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowModal(false); resetModal(); }}
                className="h-10 rounded-2xl border px-4 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={addBusy}
                onClick={addCourse}
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-black px-5 text-sm font-medium text-white disabled:opacity-50 hover:bg-zinc-800"
              >
                {addBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Course
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
