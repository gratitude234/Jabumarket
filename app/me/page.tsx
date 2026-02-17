// app/me/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  ShieldAlert,
  User,
  Phone,
  MapPin,
  Store,
  ArrowRight,
  LogOut,
  Save,
  Sparkles,
} from "lucide-react";

type VendorType = "food" | "mall" | "student" | "other";

type Vendor = {
  id: string;
  name: string;
  whatsapp: string | null;
  phone: string | null;
  location: string | null;
  vendor_type: VendorType;
  verified: boolean;
  verification_requested: boolean;
};

type Banner = { type: "success" | "error" | "info"; text: string } | null;

function isNoRowError(err: any) {
  const msg = String(err?.message ?? "");
  const code = String(err?.code ?? "");
  return code === "PGRST116" || msg.toLowerCase().includes("0 rows");
}

function isAbortError(err: any) {
  const name = String(err?.name ?? "");
  const msg = String(err?.message ?? "");
  return name === "AbortError" || msg.toLowerCase().includes("aborted");
}

function defaultVendorNameFromEmail(email?: string | null) {
  if (!email) return "New Vendor";
  const prefix = email.split("@")[0]?.trim();
  return prefix ? prefix : "New Vendor";
}

function normalizePhone(s: string) {
  return s.replace(/[^\d]/g, "");
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Skeleton({ className }: { className: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-zinc-100", className)} />;
}

function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn";
  children: React.ReactNode;
}) {
  const styles =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-zinc-50 text-zinc-700 border-zinc-200";
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", styles)}>
      {children}
    </span>
  );
}

function BannerView({ banner }: { banner: Banner }) {
  if (!banner) return null;
  const base = "rounded-2xl border p-3 text-sm";
  const tone =
    banner.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : banner.type === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-zinc-200 bg-zinc-50 text-zinc-800";
  return <div className={cx(base, tone)}>{banner.text}</div>;
}

export default function MePage() {
  const router = useRouter();
  const aliveRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);

  const [banner, setBanner] = useState<Banner>(null);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Separate editable form state (prevents accidental mutation bugs)
  const [form, setForm] = useState({
    name: "",
    whatsapp: "",
    phone: "",
    location: "",
    vendor_type: "student" as VendorType,
  });

  const [touched, setTouched] = useState({
    name: false,
    whatsapp: false,
    phone: false,
    location: false,
  });

  function setToast(next: Banner) {
    setBanner(next);
  }

  // Auto-dismiss banners so they don't stick forever
  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), 4500);
    return () => window.clearTimeout(id);
  }, [banner]);

  function syncFormFromVendor(v: Vendor | null) {
    if (!v) return;
    setForm({
      name: v.name ?? "",
      whatsapp: v.whatsapp ?? "",
      phone: v.phone ?? "",
      location: v.location ?? "",
      vendor_type: v.vendor_type ?? "student",
    });
    setTouched({ name: false, whatsapp: false, phone: false, location: false });
  }

  async function load() {
    if (!aliveRef.current) return;

    setBanner(null);
    setLoading(true);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();

      // Treat "Auth session missing" as simply logged-out
      if (userErr) {
        const m = String(userErr?.message ?? "").toLowerCase();
        if (m.includes("auth session missing") || m.includes("session missing")) {
          setLoading(false);
          router.replace("/login");
          return;
        }
        throw userErr;
      }

      const user = userData.user;
      if (!user) {
        setLoading(false);
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? null);

      // 1) Try to fetch vendor profile for this user
      const { data: v, error } = await supabase
        .from("vendors")
        .select("id, name, whatsapp, phone, location, vendor_type, verified, verification_requested")
        .eq("user_id", user.id)
        .single();

      // 2) If no vendor row exists, auto-create it (but guide the user)
      if (error && isNoRowError(error)) {
        const name = defaultVendorNameFromEmail(user.email);

        const { data: created, error: createErr } = await supabase
          .from("vendors")
          .insert({
            user_id: user.id,
            name,
            whatsapp: null,
            phone: null,
            location: null,
            vendor_type: "student",
            verified: false,
            verification_requested: false,
          })
          .select("id, name, whatsapp, phone, location, vendor_type, verified, verification_requested")
          .single();

        if (createErr) throw createErr;

        const next = created as Vendor;
        setVendor(next);
        syncFormFromVendor(next);
        setToast({ type: "info", text: "Your vendor profile was created. Please complete your details below." });
        return;
      }

      if (error) throw error;

      const next = (v ?? null) as Vendor | null;
      setVendor(next);
      syncFormFromVendor(next);
    } catch (err: any) {
      if (isAbortError(err)) return;

      console.error(err);
      if (aliveRef.current) {
        setToast({ type: "error", text: err?.message ?? "Something went wrong." });
        setVendor(null);
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    aliveRef.current = true;

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      aliveRef.current = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validation = useMemo(() => {
    const name = form.name.trim();
    const whatsappDigits = normalizePhone(form.whatsapp);
    const phoneDigits = normalizePhone(form.phone);

    const errors: Record<string, string> = {};

    if (!name) errors.name = "Name is required.";
    if (form.whatsapp.trim() && whatsappDigits.length < 7) errors.whatsapp = "Enter a valid WhatsApp number.";
    if (form.phone.trim() && phoneDigits.length < 7) errors.phone = "Enter a valid phone number.";

    const canSave = Object.keys(errors).length === 0;
    return { errors, canSave, whatsappDigits, phoneDigits };
  }, [form]);

  const isDirty = useMemo(() => {
    if (!vendor) return false;
    return (
      (vendor.name ?? "") !== form.name ||
      (vendor.whatsapp ?? "") !== form.whatsapp ||
      (vendor.phone ?? "") !== form.phone ||
      (vendor.location ?? "") !== form.location ||
      vendor.vendor_type !== form.vendor_type
    );
  }, [vendor, form]);

  async function saveProfile() {
    if (!vendor) return;
    setBanner(null);

    // Show field errors only after interaction / on save
    setTouched({ name: true, whatsapp: true, phone: true, location: true });

    if (!validation.canSave) {
      setToast({ type: "error", text: "Please fix the highlighted fields and try again." });
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return router.replace("/login");

      const payload = {
        name: form.name.trim(),
        whatsapp: form.whatsapp.trim() || null,
        phone: form.phone.trim() || null,
        location: form.location.trim() || null,
        vendor_type: form.vendor_type,
      };

      const { error } = await supabase.from("vendors").update(payload).eq("user_id", user.id);

      if (error) {
        setToast({ type: "error", text: error.message });
        return;
      }

      const nextVendor: Vendor = {
        ...vendor,
        name: payload.name,
        whatsapp: payload.whatsapp,
        phone: payload.phone,
        location: payload.location,
        vendor_type: payload.vendor_type,
      };
      setVendor(nextVendor);
      syncFormFromVendor(nextVendor);
      setToast({ type: "success", text: "Profile saved ✅" });
    } finally {
      setSaving(false);
    }
  }

  async function requestVerification() {
    if (!vendor) return;
    setBanner(null);

    // Require WhatsApp before requesting verification
    const digits = normalizePhone(form.whatsapp);
    if (!digits || digits.length < 7) {
      setTouched((t) => ({ ...t, whatsapp: true }));
      setToast({ type: "error", text: "Add a valid WhatsApp number before requesting verification." });
      return;
    }

    if (vendor.verified) {
      setToast({ type: "info", text: "You are already verified." });
      return;
    }

    if (vendor.verification_requested) {
      setToast({ type: "info", text: "Your request is already pending review." });
      return;
    }

    setVerifying(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return router.replace("/login");

      const { error } = await supabase
        .from("vendors")
        .update({ verification_requested: true })
        .eq("user_id", user.id);

      if (error) {
        setToast({ type: "error", text: error.message });
        return;
      }

      setVendor({ ...vendor, verification_requested: true });
      setToast({ type: "success", text: "Verification request sent ✅" });
    } finally {
      setVerifying(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-3xl border bg-white p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-10 w-32 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-4 space-y-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Header / Summary */}
      <div className="rounded-3xl border bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border bg-zinc-50">
            <User className="h-5 w-5 text-zinc-700" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-zinc-900">Account</h1>

              {vendor?.verified ? (
                <Chip tone="good">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Verified
                </Chip>
              ) : vendor?.verification_requested ? (
                <Chip tone="warn">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Pending review
                </Chip>
              ) : (
                <Chip>
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Not verified
                </Chip>
              )}
            </div>

            <p className="mt-1 truncate text-sm text-zinc-600">{email}</p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                onClick={() => router.push("/my-listings")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 sm:w-auto"
              >
                <Store className="h-4 w-4" />
                My Listings
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                onClick={logout}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 sm:w-auto"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <BannerView banner={banner} />

      {/* Main content */}
      {vendor ? (
        <div className="rounded-3xl border bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Vendor profile</p>
              <p className="mt-0.5 text-xs text-zinc-600">
                Keep your details accurate so buyers can reach you quickly.
              </p>
            </div>

            {isDirty ? (
              <Chip>
                <Sparkles className="h-3.5 w-3.5" />
                Unsaved changes
              </Chip>
            ) : null}
          </div>

          <div className="mt-4 space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="name" className="text-xs font-medium text-zinc-700">
                Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="name"
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                className={cx(
                  "mt-1 w-full rounded-2xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/10",
                  touched.name && validation.errors.name ? "border-rose-300 bg-rose-50" : "bg-white"
                )}
                placeholder="e.g. Grace Tech Store"
              />
              {touched.name && validation.errors.name ? (
                <p className="mt-1 text-xs text-rose-700">{validation.errors.name}</p>
              ) : null}
            </div>

            {/* WhatsApp + Phone */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="whatsapp" className="text-xs font-medium text-zinc-700">
                  WhatsApp
                </label>
                <div className="mt-1 flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 focus-within:ring-2 focus-within:ring-black/10">
                  <Phone className="h-4 w-4 text-zinc-500" />
                  <input
                    id="whatsapp"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={form.whatsapp}
                    onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                    onBlur={() => setTouched((t) => ({ ...t, whatsapp: true }))}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="e.g. +234 801 234 5678"
                  />
                </div>
                {touched.whatsapp && validation.errors.whatsapp ? (
                  <p className="mt-1 text-xs text-rose-700">{validation.errors.whatsapp}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-zinc-500">Used for verification & customer chat.</p>
                )}
              </div>

              <div>
                <label htmlFor="phone" className="text-xs font-medium text-zinc-700">
                  Phone (optional)
                </label>
                <div className="mt-1 flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 focus-within:ring-2 focus-within:ring-black/10">
                  <Phone className="h-4 w-4 text-zinc-500" />
                  <input
                    id="phone"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="e.g. 0801 234 5678"
                  />
                </div>
                {touched.phone && validation.errors.phone ? (
                  <p className="mt-1 text-xs text-rose-700">{validation.errors.phone}</p>
                ) : null}
              </div>
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="text-xs font-medium text-zinc-700">
                Location
              </label>
              <div className="mt-1 flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 focus-within:ring-2 focus-within:ring-black/10">
                <MapPin className="h-4 w-4 text-zinc-500" />
                <input
                  id="location"
                  autoComplete="street-address"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  onBlur={() => setTouched((t) => ({ ...t, location: true }))}
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="e.g. JABU, Ikeji-Arakeji"
                />
              </div>
            </div>

            {/* Vendor type */}
            <div>
              <label htmlFor="vendor_type" className="text-xs font-medium text-zinc-700">
                Vendor type
              </label>
              <select
                id="vendor_type"
                value={form.vendor_type}
                onChange={(e) => setForm((f) => ({ ...f, vendor_type: e.target.value as VendorType }))}
                className="mt-1 w-full rounded-2xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/10"
              >
                <option value="student">Student</option>
                <option value="food">Food</option>
                <option value="mall">Mall</option>
                <option value="other">Other</option>
              </select>
              <p className="mt-1 text-[11px] text-zinc-500">
                If you change your type, verification may be required before it shows as trusted.
              </p>
            </div>

            {/* Verification card */}
            <div className="rounded-2xl border bg-zinc-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Verification</p>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    Verified vendors appear more trustworthy to buyers.
                  </p>
                </div>

                {vendor.verified ? (
                  <Chip tone="good">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verified
                  </Chip>
                ) : vendor.verification_requested ? (
                  <Chip tone="warn">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Pending
                  </Chip>
                ) : (
                  <Chip>
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Not verified
                  </Chip>
                )}
              </div>

              {!vendor.verified ? (
                <div className="mt-3">
                  {vendor.verification_requested ? (
                    <p className="text-xs text-zinc-700">
                      Your request is pending. You’ll be verified after review.
                    </p>
                  ) : (
                    <button
                      onClick={requestVerification}
                      disabled={verifying}
                      className={cx(
                        "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 sm:w-auto",
                        verifying && "opacity-70"
                      )}
                    >
                      {verifying ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          Sending…
                        </>
                      ) : (
                        <>
                          <BadgeCheck className="h-4 w-4" />
                          Request verification
                        </>
                      )}
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            {/* Save row */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-zinc-500">
                Tip: Add WhatsApp to unlock verification requests.
              </p>

              <button
                onClick={saveProfile}
                disabled={saving || !isDirty}
                className={cx(
                  "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 sm:w-auto",
                  (saving || !isDirty) && "opacity-60"
                )}
              >
                {saving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border bg-white p-4 text-sm text-zinc-600">
          No vendor profile found yet.
        </div>
      )}
    </div>
  );
}
