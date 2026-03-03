"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Me, RoleFlags, Vendor, VendorType } from "./types";
import { cn, defaultVendorNameFromEmail, normalizePhone } from "./utils";
import Field from "./Field";

export default function ProfileTab({
  roles,
  me,
  vendor,
  onVendorUpdated,
  onMeUpdated,
}: {
  roles: RoleFlags;
  me: Me | null;
  vendor: Vendor | null;
  onVendorUpdated: (v: Vendor) => void;
  onMeUpdated: (m: Me) => void;
}) {
  /* -------------------------- Account identity -------------------------- */
  const [fullName, setFullName] = useState(me?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const nameDirty = (me?.full_name ?? "") !== fullName;

  useEffect(() => setFullName(me?.full_name ?? ""), [me?.id]);

  async function saveName() {
    const next = fullName.trim();
    if (!next) return;

    setSavingName(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { full_name: next } });
      if (error) throw error;

      onMeUpdated({
        id: data.user?.id ?? me?.id ?? "",
        email: data.user?.email ?? me?.email ?? null,
        full_name: (data.user?.user_metadata as any)?.full_name ?? next,
      });
    } finally {
      setSavingName(false);
    }
  }

  /* ---------------------------- Vendor profile --------------------------- */
  const [vendorForm, setVendorForm] = useState({
    name: "",
    whatsapp: "",
    phone: "",
    location: "",
    vendor_type: "student" as VendorType,
  });

  const [vendorTouched, setVendorTouched] = useState({
    name: false,
    whatsapp: false,
    phone: false,
    location: false,
  });

  const [vendorSaving, setVendorSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (!vendor) return;
    setVendorForm({
      name: vendor.name ?? "",
      whatsapp: vendor.whatsapp ?? "",
      phone: vendor.phone ?? "",
      location: vendor.location ?? "",
      vendor_type: (vendor.vendor_type ?? "student") as VendorType,
    });
    setVendorTouched({ name: false, whatsapp: false, phone: false, location: false });
  }, [vendor?.id]);

  const vendorValidation = useMemo(() => {
    const errors: Record<string, string> = {};
    const name = vendorForm.name.trim();
    const whatsappDigits = normalizePhone(vendorForm.whatsapp);
    const phoneDigits = normalizePhone(vendorForm.phone);

    if (!name) errors.name = "Store/Display name is required.";
    if (vendorForm.whatsapp.trim() && whatsappDigits.length < 7) errors.whatsapp = "Enter a valid WhatsApp number.";
    if (vendorForm.phone.trim() && phoneDigits.length < 7) errors.phone = "Enter a valid phone number.";

    return { errors, canSave: Object.keys(errors).length === 0 };
  }, [vendorForm]);

  const vendorDirty = useMemo(() => {
    if (!vendor) return false;
    return (
      (vendor.name ?? "") !== vendorForm.name ||
      (vendor.whatsapp ?? "") !== vendorForm.whatsapp ||
      (vendor.phone ?? "") !== vendorForm.phone ||
      (vendor.location ?? "") !== vendorForm.location ||
      (vendor.vendor_type ?? "student") !== vendorForm.vendor_type
    );
  }, [vendor, vendorForm]);

  async function saveVendor() {
    if (!vendor) return;

    setVendorTouched({ name: true, whatsapp: true, phone: true, location: true });
    if (!vendorValidation.canSave) {
      setBanner({ type: "error", text: "Please fix the highlighted fields." });
      return;
    }

    setVendorSaving(true);
    setBanner(null);

    try {
      const payload = {
        name: vendorForm.name.trim(),
        whatsapp: vendorForm.whatsapp.trim() || null,
        phone: vendorForm.phone.trim() || null,
        location: vendorForm.location.trim() || null,
        vendor_type: vendorForm.vendor_type,
      };

      const { error } = await supabase.from("vendors").update(payload).eq("id", vendor.id);
      if (error) throw error;

      onVendorUpdated({ ...vendor, ...payload } as any);
      setBanner({ type: "success", text: "Vendor profile saved." });
      setVendorTouched({ name: false, whatsapp: false, phone: false, location: false });
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message ?? "Save failed." });
    } finally {
      setVendorSaving(false);
    }
  }

  function cancelVendor() {
    if (!vendor) return;
    setVendorForm({
      name: vendor.name ?? "",
      whatsapp: vendor.whatsapp ?? "",
      phone: vendor.phone ?? "",
      location: vendor.location ?? "",
      vendor_type: (vendor.vendor_type ?? "student") as VendorType,
    });
    setVendorTouched({ name: false, whatsapp: false, phone: false, location: false });
    setBanner(null);
  }

  /* ----------------------------- Study profile --------------------------- */
  type Semester = "first" | "second" | "summer";
  type FacultyRow = { id: string; name: string; sort_order?: number | null };
  type DeptRow = { id: string; faculty_id: string; display_name?: string | null; official_name?: string | null; sort_order?: number | null };

  const [studyLoading, setStudyLoading] = useState(true);
  const [faculties, setFaculties] = useState<FacultyRow[]>([]);
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [manualMode, setManualMode] = useState(false);

  const [studyForm, setStudyForm] = useState({
    faculty_id: "",
    department_id: "",
    faculty: "",
    department: "",
    level: 100,
    semester: "first" as Semester,
  });

  const [studySaving, setStudySaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadStudyPrefs() {
      setStudyLoading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) return;

        const facRes = await supabase
          .from("study_faculties_clean")
          .select("id,name,sort_order")
          .order("sort_order", { ascending: true });

        const prefRes = await supabase
          .from("study_user_preferences")
          .select("faculty_id,department_id,faculty,department,level,semester")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!mounted) return;

        setFaculties((facRes.data ?? []) as any);

        const d: any = prefRes.data ?? null;
        if (d) {
          const hasIds = typeof d.faculty_id === "string" && typeof d.department_id === "string";
          setManualMode(!hasIds && (!!d.faculty || !!d.department));

          setStudyForm((s) => ({
            ...s,
            faculty_id: d.faculty_id ?? "",
            department_id: d.department_id ?? "",
            faculty: d.faculty ?? "",
            department: d.department ?? "",
            level: typeof d.level === "number" ? d.level : 100,
            semester: (d.semester as Semester) || "first",
          }));
        }
      } finally {
        if (mounted) setStudyLoading(false);
      }
    }

    loadStudyPrefs();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadDepts() {
      if (manualMode) return;
      if (!studyForm.faculty_id) {
        setDepartments([]);
        return;
      }

      const depRes = await supabase
        .from("study_departments_clean")
        .select("id,faculty_id,display_name,official_name,sort_order")
        .eq("faculty_id", studyForm.faculty_id)
        .order("sort_order", { ascending: true });

      if (!mounted) return;
      setDepartments((depRes.data ?? []) as any);
    }

    loadDepts();
    return () => {
      mounted = false;
    };
  }, [manualMode, studyForm.faculty_id]);

  const studyValid = useMemo(() => {
    const lvlOk = [100, 200, 300, 400, 500, 600, 700].includes(Number(studyForm.level));
    if (!lvlOk) return false;
    if (!studyForm.semester) return false;

    if (manualMode) return !!studyForm.faculty.trim() && !!studyForm.department.trim();
    return !!studyForm.faculty_id && !!studyForm.department_id;
  }, [studyForm, manualMode]);

  async function saveStudy() {
    setStudySaving(true);
    setBanner(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return;

      const level = Number(studyForm.level);
      const semester = studyForm.semester;

      const selectedFaculty = manualMode
        ? studyForm.faculty.trim()
        : faculties.find((f) => f.id === studyForm.faculty_id)?.name ?? "";

      const selectedDeptRow = manualMode ? null : departments.find((d) => d.id === studyForm.department_id) ?? null;

      const selectedDepartment = manualMode
        ? studyForm.department.trim()
        : String(selectedDeptRow?.display_name || selectedDeptRow?.official_name || "").trim();

      const payload: any = {
        user_id: user.id,
        faculty: selectedFaculty,
        department: selectedDepartment,
        level,
        semester,
        updated_at: new Date().toISOString(),
        faculty_id: manualMode ? null : studyForm.faculty_id,
        department_id: manualMode ? null : studyForm.department_id,
      };

      const prefRes = await supabase.from("study_user_preferences").upsert(payload);
      if (prefRes.error) throw prefRes.error;

      const normalized: any = {
        user_id: user.id,
        level,
        updated_at: new Date().toISOString(),
        faculty_id: manualMode ? null : studyForm.faculty_id,
        department_id: manualMode ? null : studyForm.department_id,
      };

      const normRes = await supabase.from("study_preferences").upsert(normalized);
      if (normRes.error) throw normRes.error;

      setBanner({ type: "success", text: "Study profile saved." });
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message ?? "Couldn’t save study profile." });
    } finally {
      setStudySaving(false);
    }
  }

  const vendErr = vendorValidation.errors;

  return (
    <div className="space-y-3">
      {banner ? (
        <div
          className={cn(
            "rounded-2xl border p-3 text-sm",
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : banner.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-zinc-200 bg-zinc-50 text-zinc-800"
          )}
          role="status"
        >
          {banner.text}
        </div>
      ) : null}

      {/* Account identity */}
      <div className="rounded-2xl border p-3">
        <div className="text-sm font-semibold text-zinc-900">Account identity</div>
        <p className="mt-1 text-sm text-zinc-600">This name shows across the app.</p>

        <div className="mt-3 grid gap-2">
          <Field label="Full name" value={fullName} onChange={setFullName} placeholder="e.g. Gratitude Developers" />

          {nameDirty ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFullName(me?.full_name ?? "")}
                className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                disabled={savingName}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveName}
                className={cn("rounded-xl px-3 py-2 text-sm font-semibold", savingName ? "bg-zinc-200 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800")}
                disabled={savingName || !fullName.trim()}
              >
                {savingName ? "Saving…" : "Save name"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-3 text-xs text-zinc-500">
          Email: <span className="font-medium text-zinc-700">{me?.email ?? "—"}</span>
        </div>
      </div>

      {/* Vendor profile */}
      {roles.isVendor && vendor ? (
        <div className="rounded-2xl border p-3">
          <div className="text-sm font-semibold text-zinc-900">Vendor profile</div>
          <p className="mt-1 text-sm text-zinc-600">What customers see when viewing your store.</p>

          <div className="mt-4 grid gap-3">
            <Field
              label="Store / Display name"
              value={vendorForm.name}
              onChange={(v) => setVendorForm((s) => ({ ...s, name: v }))}
              onBlur={() => setVendorTouched((t) => ({ ...t, name: true }))}
              placeholder={defaultVendorNameFromEmail(me?.email)}
              error={vendorTouched.name ? vendErr.name : undefined}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="WhatsApp"
                value={vendorForm.whatsapp}
                onChange={(v) => setVendorForm((s) => ({ ...s, whatsapp: v }))}
                onBlur={() => setVendorTouched((t) => ({ ...t, whatsapp: true }))}
                placeholder="+234 801 234 5678"
                error={vendorTouched.whatsapp ? vendErr.whatsapp : undefined}
              />
              <Field
                label="Phone"
                value={vendorForm.phone}
                onChange={(v) => setVendorForm((s) => ({ ...s, phone: v }))}
                onBlur={() => setVendorTouched((t) => ({ ...t, phone: true }))}
                placeholder="+234 701 234 5678"
                error={vendorTouched.phone ? vendErr.phone : undefined}
              />
            </div>

            <Field
              label="Location"
              value={vendorForm.location}
              onChange={(v) => setVendorForm((s) => ({ ...s, location: v }))}
              onBlur={() => setVendorTouched((t) => ({ ...t, location: true }))}
              placeholder="e.g. JABU Campus / Male Hostels"
              error={vendorTouched.location ? vendErr.location : undefined}
            />

            <div>
              <div className="text-xs font-semibold text-zinc-700">Vendor type</div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["food", "mall", "student", "other"] as VendorType[]).map((t) => {
                  const active = vendorForm.vendor_type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVendorForm((s) => ({ ...s, vendor_type: t }))}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-sm font-semibold capitalize",
                        active ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-800 hover:bg-zinc-50"
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {vendorDirty ? (
            <div className="sticky bottom-0 -mx-3 mt-4 border-t bg-white/90 px-3 py-3 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-zinc-600">
                  Unsaved vendor changes
                  {!vendorValidation.canSave ? <span className="ml-2 font-semibold text-rose-700">• Fix errors to save</span> : null}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelVendor}
                    className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                    disabled={vendorSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveVendor}
                    disabled={vendorSaving || !vendorValidation.canSave}
                    className={cn(
                      "rounded-xl px-3 py-2 text-sm font-semibold",
                      vendorSaving || !vendorValidation.canSave ? "bg-zinc-200 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800"
                    )}
                  >
                    {vendorSaving ? "Saving…" : "Save vendor"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border p-3">
          <div className="text-sm font-semibold text-zinc-900">Vendor profile</div>
          <p className="mt-1 text-sm text-zinc-700">Not a vendor yet? Create a vendor profile to sell on JabuMarket.</p>
          <Link href="/post" className="mt-3 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
            Become a vendor
          </Link>
        </div>
      )}

      {/* Study profile */}
      <div className="rounded-2xl border p-3">
        <div className="text-sm font-semibold text-zinc-900">Study profile</div>
        <p className="mt-1 text-sm text-zinc-600">Used to personalize courses/materials and improve “For you”.</p>

        {studyLoading ? (
          <div className="mt-3 space-y-2">
            <div className="h-10 rounded-xl bg-zinc-100" />
            <div className="h-10 rounded-xl bg-zinc-100" />
            <div className="h-10 rounded-xl bg-zinc-100" />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-zinc-700">Mode</div>
              <button
                type="button"
                onClick={() => setManualMode((v) => !v)}
                className="rounded-xl border bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                {manualMode ? "Use official list" : "Can’t find mine? Type manually"}
              </button>
            </div>

            {!manualMode ? (
              <>
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Faculty</div>
                  <select
                    value={studyForm.faculty_id}
                    onChange={(e) => setStudyForm((s) => ({ ...s, faculty_id: e.target.value, department_id: "" }))}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  >
                    <option value="">Select faculty</option>
                    {faculties.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Department</div>
                  <select
                    value={studyForm.department_id}
                    onChange={(e) => setStudyForm((s) => ({ ...s, department_id: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                    disabled={!studyForm.faculty_id}
                  >
                    <option value="">{studyForm.faculty_id ? "Select department" : "Pick faculty first"}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {String(d.display_name || d.official_name || "").trim()}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <Field label="Faculty (manual)" value={studyForm.faculty} onChange={(v) => setStudyForm((s) => ({ ...s, faculty: v }))} placeholder="e.g. Science" />
                <Field
                  label="Department (manual)"
                  value={studyForm.department}
                  onChange={(v) => setStudyForm((s) => ({ ...s, department: v }))}
                  placeholder="e.g. Computer Science"
                />
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Level</div>
                <select
                  value={String(studyForm.level)}
                  onChange={(e) => setStudyForm((s) => ({ ...s, level: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                >
                  {[100, 200, 300, 400, 500, 600, 700].map((lv) => (
                    <option key={lv} value={lv}>
                      {lv} Level
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Semester</div>
                <select
                  value={studyForm.semester}
                  onChange={(e) => setStudyForm((s) => ({ ...s, semester: e.target.value as any }))}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                >
                  <option value="first">1st Semester</option>
                  <option value="second">2nd Semester</option>
                  <option value="summer">Summer</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={saveStudy}
              disabled={!studyValid || studySaving}
              className={cn(
                "inline-flex w-full items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold",
                !studyValid || studySaving ? "bg-zinc-200 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800"
              )}
            >
              {studySaving ? "Saving…" : "Save study profile"}
            </button>

            {!studyValid ? (
              <p className="text-xs text-zinc-500">Please complete faculty + department and ensure level/semester are selected.</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}