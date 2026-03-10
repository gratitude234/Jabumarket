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

        // Single source of truth: study_preferences only.
        // Join faculty/department names so the form can pre-fill text fields.
        const normRes = await supabase
          .from("study_preferences")
          .select("faculty_id,department_id,level,semester,faculty:study_faculties(name),department:study_departments(name)")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!mounted) return;

        setFaculties((facRes.data ?? []) as any);

        const d: any = !normRes.error ? normRes.data : null;
        if (d && (d.faculty_id || d.department_id || d.level || d.semester)) {
          const hasIds = typeof d.faculty_id === "string" && typeof d.department_id === "string";
          setManualMode(!hasIds);

          setStudyForm((s) => ({
            ...s,
            faculty_id: d.faculty_id ?? "",
            department_id: d.department_id ?? "",
            faculty: (d.faculty as any)?.name ?? "",
            department: (d.department as any)?.name ?? "",
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

      // Single source of truth: write only to study_preferences.
      const normalized: any = {
        user_id: user.id,
        level,
        semester,
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

  /* ─── Label helper ─────────────────────────────────────── */
  function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
      <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-3">
        {children}
      </p>
    );
  }

  function SelectField({
    label,
    children,
    disabled,
  }: {
    label: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) {
    return (
      <label className="block">
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">{label}</p>
        <div className={cn("relative", disabled && "opacity-50")}>
          {children}
        </div>
      </label>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Banner ─────────────────────────────────────────── */}
      {banner ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm font-medium",
            banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : banner.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-zinc-200 bg-zinc-50 text-zinc-800"
          )}
          role="status"
        >
          {banner.text}
        </div>
      ) : null}

      {/* ── SECTION 1: Account ─────────────────────────────── */}
      <section>
        <SectionLabel>Account</SectionLabel>
        <div className="grid gap-3">
          <Field
            label="Full name"
            value={fullName}
            onChange={setFullName}
            placeholder="e.g. Gratitude Olawale"
          />

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Email</p>
            <input
              value={me?.email ?? ""}
              disabled
              readOnly
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-400 outline-none cursor-not-allowed"
            />
            <p className="mt-1 text-[11px] text-zinc-400">Your JABU email cannot be changed.</p>
          </div>

          {nameDirty && (
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFullName(me?.full_name ?? "")}
                className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                disabled={savingName}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveName}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                  savingName ? "bg-zinc-200 text-zinc-500" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}
                disabled={savingName || !fullName.trim()}
              >
                {savingName ? "Saving…" : "Save name"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION 2: Vendor Profile ──────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-px flex-1 bg-zinc-100" />
          <SectionLabel>
            {roles.isVendor && vendor ? "Vendor Profile" : "Sell on JABU"}
          </SectionLabel>
          <div className="h-px flex-1 bg-zinc-100" />
        </div>

        {roles.isVendor && vendor ? (
          <div className="grid gap-3">
            <Field
              label="Store / Display name"
              value={vendorForm.name}
              onChange={(v) => setVendorForm((s) => ({ ...s, name: v }))}
              onBlur={() => setVendorTouched((t) => ({ ...t, name: true }))}
              placeholder={defaultVendorNameFromEmail(me?.email)}
              error={vendorTouched.name ? vendErr.name : undefined}
            />

            <div className="grid grid-cols-2 gap-3">
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
              <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Vendor type</p>
              <div className="grid grid-cols-2 gap-2">
                {(["food", "mall", "student", "other"] as VendorType[]).map((t) => {
                  const active = vendorForm.vendor_type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVendorForm((s) => ({ ...s, vendor_type: t }))}
                      className={cn(
                        "rounded-xl border py-2.5 text-sm font-semibold capitalize transition-colors",
                        active
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {vendorDirty && (
              <div className="sticky bottom-0 -mx-4 border-t bg-white/95 px-4 py-3 backdrop-blur mt-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    Unsaved changes
                    {!vendorValidation.canSave && (
                      <span className="ml-1.5 font-semibold text-rose-600">— fix errors first</span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelVendor}
                      className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      disabled={vendorSaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveVendor}
                      disabled={vendorSaving || !vendorValidation.canSave}
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                        vendorSaving || !vendorValidation.canSave
                          ? "bg-zinc-200 text-zinc-500"
                          : "bg-zinc-900 text-white hover:bg-zinc-800"
                      )}
                    >
                      {vendorSaving ? "Saving…" : "Save vendor"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-zinc-50 border border-dashed border-zinc-200 p-5 text-center">
            <p className="text-2xl mb-2">🏪</p>
            <p className="text-sm font-semibold text-zinc-900">Start selling on JABU Market</p>
            <p className="mt-1 text-xs text-zinc-500">Create a vendor profile to post listings and reach buyers on campus.</p>
            <Link
              href="/post"
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Become a vendor →
            </Link>
          </div>
        )}
      </section>

      {/* ── SECTION 3: Study Profile ───────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-px flex-1 bg-zinc-100" />
          <SectionLabel>Study Preferences</SectionLabel>
          <div className="h-px flex-1 bg-zinc-100" />
        </div>

        {studyLoading ? (
          <div className="space-y-2">
            <div className="h-10 rounded-xl bg-zinc-100 animate-pulse" />
            <div className="h-10 rounded-xl bg-zinc-100 animate-pulse" />
            <div className="h-10 rounded-xl bg-zinc-100 animate-pulse" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Mode toggle */}
            <div className="flex items-center justify-between rounded-xl bg-zinc-50 border px-3 py-2.5">
              <p className="text-xs font-medium text-zinc-600">
                {manualMode ? "Manual entry mode" : "Official list mode"}
              </p>
              <button
                type="button"
                onClick={() => setManualMode((v) => !v)}
                className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-sm"
              >
                {manualMode ? "← Use official list" : "Can't find mine →"}
              </button>
            </div>

            {!manualMode ? (
              <>
                <SelectField label="Faculty">
                  <select
                    value={studyForm.faculty_id}
                    onChange={(e) => setStudyForm((s) => ({ ...s, faculty_id: e.target.value, department_id: "" }))}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 appearance-none"
                  >
                    <option value="">Select faculty…</option>
                    {faculties.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </SelectField>

                <SelectField label="Department" disabled={!studyForm.faculty_id}>
                  <select
                    value={studyForm.department_id}
                    onChange={(e) => setStudyForm((s) => ({ ...s, department_id: e.target.value }))}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-sm outline-none appearance-none",
                      !studyForm.faculty_id
                        ? "border-zinc-200 bg-zinc-50 text-zinc-400 cursor-not-allowed"
                        : "border-zinc-200 bg-white focus:border-zinc-400"
                    )}
                    disabled={!studyForm.faculty_id}
                  >
                    <option value="">
                      {studyForm.faculty_id ? "Select department…" : "Pick a faculty first"}
                    </option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {String(d.display_name || d.official_name || "").trim()}
                      </option>
                    ))}
                  </select>
                </SelectField>
              </>
            ) : (
              <>
                <Field
                  label="Faculty"
                  value={studyForm.faculty}
                  onChange={(v) => setStudyForm((s) => ({ ...s, faculty: v }))}
                  placeholder="e.g. College of Science"
                />
                <Field
                  label="Department"
                  value={studyForm.department}
                  onChange={(v) => setStudyForm((s) => ({ ...s, department: v }))}
                  placeholder="e.g. Computer Science"
                />
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Level">
                <select
                  value={String(studyForm.level)}
                  onChange={(e) => setStudyForm((s) => ({ ...s, level: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 appearance-none"
                >
                  {[100, 200, 300, 400, 500, 600, 700].map((lv) => (
                    <option key={lv} value={lv}>{lv} Level</option>
                  ))}
                </select>
              </SelectField>

              <SelectField label="Semester">
                <select
                  value={studyForm.semester}
                  onChange={(e) => setStudyForm((s) => ({ ...s, semester: e.target.value as any }))}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 appearance-none"
                >
                  <option value="first">1st Semester</option>
                  <option value="second">2nd Semester</option>
                  <option value="summer">Summer</option>
                </select>
              </SelectField>
            </div>

            <button
              type="button"
              onClick={saveStudy}
              disabled={!studyValid || studySaving}
              className={cn(
                "w-full rounded-xl py-2.5 text-sm font-semibold transition-colors",
                !studyValid || studySaving
                  ? "bg-zinc-200 text-zinc-500 cursor-not-allowed"
                  : "bg-zinc-900 text-white hover:bg-zinc-800"
              )}
            >
              {studySaving ? "Saving…" : "Save study profile"}
            </button>

            {!studyValid && (
              <p className="text-center text-xs text-zinc-400">
                Complete faculty + department to save.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}