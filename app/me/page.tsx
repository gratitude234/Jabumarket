// app/me/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  UploadCloud,
  FileText,
  X,
  Loader2,
  Package,
  ChevronDown,
  ChevronUp,
  PencilLine,
} from "lucide-react";

type VendorType = "food" | "mall" | "student" | "other";

type VerificationStatus =
  | "unverified"
  | "requested"
  | "under_review"
  | "verified"
  | "rejected"
  | "suspended";

type Vendor = {
  id: string;
  user_id?: string | null;
  name: string;
  whatsapp: string | null;
  phone: string | null;
  location: string | null;
  vendor_type: VendorType;

  // legacy
  verified?: boolean | null;

  // new
  verification_status?: VerificationStatus | null;
  verification_requested_at?: string | null;
  verified_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
};

type VerificationRequest = {
  id: string;
  vendor_id: string;
  status: "requested" | "under_review" | "approved" | "rejected";
  note: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

type VerificationDoc = {
  id: string;
  vendor_id: string;
  doc_type: string;
  file_path: string;
  created_at: string;
};

type Banner = { type: "success" | "error" | "info"; text: string } | null;

const DOC_TYPES = [
  { key: "id_card", label: "ID Card" },
  { key: "utility_bill", label: "Utility Bill" },
  { key: "business_reg", label: "Business Reg." },
  { key: "selfie", label: "Selfie" },
] as const;

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

/**
 * ✅ Hydration-safe datetime formatter:
 * Avoids toLocaleString() during first render, which can vary by runtime/timezone.
 * Deterministic UTC output to prevent hydration mismatches.
 */
function formatDateTimeUTC(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const styles =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : tone === "bad"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-zinc-50 text-zinc-700 border-zinc-200";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
        styles
      )}
    >
      {children}
    </span>
  );
}

function BannerView({
  banner,
  onClose,
}: {
  banner: Banner;
  onClose: () => void;
}) {
  if (!banner) return null;
  const base =
    "rounded-2xl border p-3 text-sm flex items-start justify-between gap-3";
  const tone =
    banner.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : banner.type === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-zinc-200 bg-zinc-50 text-zinc-800";
  return (
    <div className={cx(base, tone)} role="status">
      <span>{banner.text}</span>
      <button
        onClick={onClose}
        className="rounded-xl border bg-white/70 p-2 hover:bg-white"
        aria-label="Close"
        type="button"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function statusMeta(v: Vendor | null) {
  const status = (v?.verification_status ?? null) as VerificationStatus | null;
  const legacyVerified = v?.verified === true;

  const isVerified = status === "verified" || legacyVerified;

  if (isVerified) {
    return {
      tone: "good" as const,
      label: "Verified",
      hint: "Your profile is verified and appears publicly with a verified badge.",
    };
  }

  if (status === "requested") {
    return {
      tone: "warn" as const,
      label: "Request sent",
      hint: "Your request has been received. An admin will review it soon.",
    };
  }

  if (status === "under_review") {
    return {
      tone: "warn" as const,
      label: "Under review",
      hint: "An admin is currently reviewing your verification request.",
    };
  }

  if (status === "rejected") {
    return {
      tone: "bad" as const,
      label: "Rejected",
      hint: "Your request was rejected. Fix the issue and re-apply.",
    };
  }

  if (status === "suspended") {
    return {
      tone: "bad" as const,
      label: "Suspended",
      hint: "Your verification has been suspended. Contact support or admin.",
    };
  }

  return {
    tone: "neutral" as const,
    label: "Unverified",
    hint: "Upload proof documents (optional) and request verification when ready.",
  };
}

function friendlyVendorType(t: VendorType) {
  if (t === "food") return "Food Vendor";
  if (t === "mall") return "Mall Store";
  if (t === "student") return "Student Seller";
  return "Other";
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

  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [docs, setDocs] = useState<VerificationDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [docType, setDocType] =
    useState<(typeof DOC_TYPES)[number]["key"]>("id_card");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // ✅ collapse/expand vendor details form
  const [detailsOpen, setDetailsOpen] = useState(true);

  // Separate editable form state
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

  async function loadRequestsAndDocs(vendorId: string) {
    setDocsLoading(true);
    try {
      const { data: reqs } = await supabase
        .from("vendor_verification_requests")
        .select("id,vendor_id,status,note,rejection_reason,created_at,reviewed_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      const { data: ds } = await supabase
        .from("vendor_verification_docs")
        .select("id,vendor_id,doc_type,file_path,created_at")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });

      if (!aliveRef.current) return;
      setRequests((reqs ?? []) as any);
      setDocs((ds ?? []) as any);
    } catch {
      // ignore
    } finally {
      if (aliveRef.current) setDocsLoading(false);
    }
  }

  async function load() {
    if (!aliveRef.current) return;

    setBanner(null);
    setLoading(true);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();

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

      const { data: v, error } = await supabase
        .from("vendors")
        .select(
          "id, user_id, name, whatsapp, phone, location, vendor_type, verified, verification_status, verification_requested_at, verified_at, rejected_at, rejection_reason, suspended_at, suspension_reason"
        )
        .eq("user_id", user.id)
        .single();

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
            verification_status: "unverified",
          })
          .select(
            "id, user_id, name, whatsapp, phone, location, vendor_type, verified, verification_status, verification_requested_at, verified_at, rejected_at, rejection_reason, suspended_at, suspension_reason"
          )
          .single();

        if (createErr) throw createErr;

        const next = created as Vendor;
        setVendor(next);
        syncFormFromVendor(next);
        setDetailsOpen(true);
        setToast({
          type: "info",
          text: "Your vendor profile was created. Please complete your details below.",
        });
        await loadRequestsAndDocs(next.id);
        return;
      }

      if (error) throw error;

      const next = (v ?? null) as Vendor | null;
      setVendor(next);
      syncFormFromVendor(next);
      if (next?.id) await loadRequestsAndDocs(next.id);
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
    if (form.whatsapp.trim() && whatsappDigits.length < 7)
      errors.whatsapp = "Enter a valid WhatsApp number.";
    if (form.phone.trim() && phoneDigits.length < 7)
      errors.phone = "Enter a valid phone number.";

    const canSave = Object.keys(errors).length === 0;
    return { errors, canSave, whatsappDigits, phoneDigits };
  }, [form]);

  const dirty = useMemo(() => {
    if (!vendor) return false;
    return (
      (vendor.name ?? "") !== form.name ||
      (vendor.whatsapp ?? "") !== form.whatsapp ||
      (vendor.phone ?? "") !== form.phone ||
      (vendor.location ?? "") !== form.location ||
      (vendor.vendor_type ?? "student") !== form.vendor_type
    );
  }, [vendor, form]);

  const meta = statusMeta(vendor);

  const myListingsHref = "/my-listings";

  async function saveProfile() {
    if (!vendor) return;

    setTouched({ name: true, whatsapp: true, phone: true, location: true });

    if (!validation.canSave) {
      setToast({ type: "error", text: "Please fix the highlighted fields." });
      return;
    }

    setSaving(true);
    setBanner(null);

    try {
      const { error } = await supabase
        .from("vendors")
        .update({
          name: form.name.trim(),
          whatsapp: form.whatsapp.trim() || null,
          phone: form.phone.trim() || null,
          location: form.location.trim() || null,
          vendor_type: form.vendor_type,
        })
        .eq("id", vendor.id);

      if (error) throw error;

      const next: Vendor = {
        ...vendor,
        name: form.name.trim(),
        whatsapp: form.whatsapp.trim() || null,
        phone: form.phone.trim() || null,
        location: form.location.trim() || null,
        vendor_type: form.vendor_type,
      };

      setVendor(next);
      setToast({ type: "success", text: "Saved successfully." });

      setDetailsOpen(false);
    } catch (e: any) {
      setToast({ type: "error", text: e?.message ?? "Save failed." });
    } finally {
      setSaving(false);
    }
  }

  async function requestVerification() {
    if (!vendor) return;

    const isVerified =
      vendor.verification_status === "verified" || vendor.verified === true;
    if (isVerified) {
      setToast({ type: "info", text: "You are already verified." });
      return;
    }
    if (vendor.verification_status === "suspended") {
      setToast({
        type: "error",
        text: "Your verification is suspended. Contact an admin.",
      });
      return;
    }

    setVerifying(true);
    setBanner(null);

    try {
      const { data: openReq } = await supabase
        .from("vendor_verification_requests")
        .select("id,status")
        .eq("vendor_id", vendor.id)
        .in("status", ["requested", "under_review"])
        .maybeSingle();

      if (openReq?.id) {
        setToast({ type: "info", text: "You already have a pending request." });
        await loadRequestsAndDocs(vendor.id);
        return;
      }

      const { error: reqErr } = await supabase
        .from("vendor_verification_requests")
        .insert({
          vendor_id: vendor.id,
          status: "requested",
          note: docs.length
            ? `Submitted with ${docs.length} document(s).`
            : "No documents attached (optional).",
        });

      if (reqErr) throw reqErr;

      const { error: vErr } = await supabase
        .from("vendors")
        .update({
          verification_status: "requested",
          verification_requested_at: new Date().toISOString(),
          rejection_reason: null,
          rejected_at: null,
        })
        .eq("id", vendor.id);

      if (vErr) console.warn(vErr);

      setToast({ type: "success", text: "Verification request sent." });
      await load();
    } catch (e: any) {
      setToast({ type: "error", text: e?.message ?? "Could not send request." });
    } finally {
      setVerifying(false);
    }
  }

  async function uploadDoc() {
    if (!vendor) return;
    if (!docFile) {
      setToast({ type: "error", text: "Choose a file first." });
      return;
    }

    setUploading(true);
    setBanner(null);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const user = userData.user;
      if (!user) {
        setToast({ type: "error", text: "Please log in again." });
        router.replace("/login");
        return;
      }

      const bucket = "vendor-verification";
      const safeName = docFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${docType}-${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, docFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: docFile.type || undefined,
        });

      if (upErr) throw upErr;

      const { error: insErr } = await supabase
        .from("vendor_verification_docs")
        .insert({
          vendor_id: vendor.id,
          doc_type: docType,
          file_path: path,
        });

      if (insErr) throw insErr;

      setDocFile(null);
      const el = document.getElementById("doc-file") as HTMLInputElement | null;
      if (el) el.value = "";

      setToast({ type: "success", text: "Uploaded." });
      await loadRequestsAndDocs(vendor.id);
    } catch (e: any) {
      setToast({ type: "error", text: e?.message ?? "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function openDoc(path: string) {
    try {
      const bucket = "vendor-verification";
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60);
      if (error) throw error;
      if (data?.signedUrl)
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setToast({ type: "error", text: e?.message ?? "Could not open document." });
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const lastDecision = useMemo(() => {
    const decided = requests.find(
      (r) => r.status === "approved" || r.status === "rejected"
    );
    return decided ?? null;
  }, [requests]);

  const hasOpenRequest = useMemo(() => {
    return requests.some(
      (r) => r.status === "requested" || r.status === "under_review"
    );
  }, [requests]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-24">
      <header className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-zinc-900">My Profile</p>
            <p className="mt-1 text-sm text-zinc-600">
              Manage your vendor details and verification.
            </p>
            {email ? (
              <p className="mt-1 text-xs text-zinc-500">Signed in as {email}</p>
            ) : null}
          </div>

          <button
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            type="button"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip tone={meta.tone}>{meta.label}</Chip>
          {vendor?.vendor_type ? (
            <Chip>
              <Store className="h-3.5 w-3.5" />
              {friendlyVendorType(vendor.vendor_type)}
            </Chip>
          ) : null}
          {vendor?.location ? (
            <Chip>
              <MapPin className="h-3.5 w-3.5" />
              {vendor.location}
            </Chip>
          ) : null}
        </div>

        <div className="mt-3 rounded-2xl border bg-zinc-50 p-3 text-xs text-zinc-700">
          {meta.hint}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link
            href={myListingsHref}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            <Package className="h-4 w-4" />
            My Listings / Products
            <ArrowRight className="h-4 w-4" />
          </Link>

          <button
            type="button"
            onClick={() => {
              setDetailsOpen(true);
              const el = document.getElementById("vendor-details-section");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            <PencilLine className="h-4 w-4" />
            Edit My Details
          </button>
        </div>
      </header>

      <BannerView banner={banner} onClose={() => setBanner(null)} />

      <section
        id="vendor-details-section"
        className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-900">Vendor details</p>
            <p className="mt-1 text-sm text-zinc-600">
              These details show on your vendor page.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              aria-expanded={detailsOpen}
              aria-controls="vendor-details-content"
            >
              {detailsOpen ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Expand
                </>
              )}
            </button>

            <button
              onClick={saveProfile}
              disabled={saving || !dirty || !validation.canSave || !detailsOpen}
              className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              type="button"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>
          </div>
        </div>

        {!detailsOpen && !loading && vendor ? (
          <div className="mt-4 rounded-3xl border bg-zinc-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border bg-white p-3">
                <p className="text-xs font-semibold text-zinc-600">Shop name</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {vendor.name || "—"}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-3">
                <p className="text-xs font-semibold text-zinc-600">Vendor type</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {friendlyVendorType(vendor.vendor_type)}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-3">
                <p className="text-xs font-semibold text-zinc-600">WhatsApp</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {vendor.whatsapp || "—"}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-3">
                <p className="text-xs font-semibold text-zinc-600">Phone</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {vendor.phone || "—"}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-3 sm:col-span-2">
                <p className="text-xs font-semibold text-zinc-600">Location</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {vendor.location || "—"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              <PencilLine className="h-4 w-4" />
              Edit details
            </button>
          </div>
        ) : null}

        <div id="vendor-details-content">
          {loading && detailsOpen ? (
            <div className="mt-5 grid gap-3">
              <div className="h-11 w-full animate-pulse rounded-2xl bg-zinc-100" />
              <div className="h-11 w-full animate-pulse rounded-2xl bg-zinc-100" />
              <div className="h-11 w-full animate-pulse rounded-2xl bg-zinc-100" />
              <div className="h-11 w-full animate-pulse rounded-2xl bg-zinc-100" />
            </div>
          ) : detailsOpen ? (
            <div className="mt-5 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-700">Shop name</span>
                <div
                  className={cx(
                    "flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5",
                    touched.name && validation.errors.name
                      ? "border-rose-300"
                      : "border-zinc-200"
                  )}
                >
                  <User className="h-4 w-4 text-zinc-500" />
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="e.g. Mama Put Kitchen"
                  />
                </div>
                {touched.name && validation.errors.name ? (
                  <span className="text-xs text-rose-700">{validation.errors.name}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-700">
                  WhatsApp (recommended)
                </span>
                <div
                  className={cx(
                    "flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5",
                    touched.whatsapp && validation.errors.whatsapp
                      ? "border-rose-300"
                      : "border-zinc-200"
                  )}
                >
                  <Phone className="h-4 w-4 text-zinc-500" />
                  <input
                    value={form.whatsapp}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, whatsapp: e.target.value }))
                    }
                    onBlur={() => setTouched((p) => ({ ...p, whatsapp: true }))}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="e.g. 2348012345678"
                  />
                </div>
                {touched.whatsapp && validation.errors.whatsapp ? (
                  <span className="text-xs text-rose-700">{validation.errors.whatsapp}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-700">Phone (optional)</span>
                <div
                  className={cx(
                    "flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5",
                    touched.phone && validation.errors.phone
                      ? "border-rose-300"
                      : "border-zinc-200"
                  )}
                >
                  <Phone className="h-4 w-4 text-zinc-500" />
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="e.g. 08012345678"
                  />
                </div>
                {touched.phone && validation.errors.phone ? (
                  <span className="text-xs text-rose-700">{validation.errors.phone}</span>
                ) : null}
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-700">Location</span>
                <div
                  className={cx(
                    "flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5",
                    touched.location && validation.errors.location
                      ? "border-rose-300"
                      : "border-zinc-200"
                  )}
                >
                  <MapPin className="h-4 w-4 text-zinc-500" />
                  <input
                    value={form.location}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, location: e.target.value }))
                    }
                    onBlur={() => setTouched((p) => ({ ...p, location: true }))}
                    className="w-full bg-transparent text-sm outline-none"
                    placeholder="e.g. JABU Hostel Area"
                  />
                </div>
              </label>

              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-700">Vendor type</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["food", "mall", "student", "other"] as VendorType[]).map((t) => {
                    const active = form.vendor_type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, vendor_type: t }))}
                        className={cx(
                          "rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                          active
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </label>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-900">Verification</p>
            <p className="mt-1 text-sm text-zinc-600">
              Verified vendors look more trustworthy and appear in the public vendor directory.
            </p>
          </div>

          <button
            onClick={requestVerification}
            disabled={
              verifying ||
              loading ||
              !vendor ||
              hasOpenRequest ||
              vendor?.verification_status === "under_review"
            }
            className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            type="button"
          >
            {verifying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {hasOpenRequest ? "Request pending" : "Request verification"}
          </button>
        </div>

        {vendor?.verification_status === "rejected" && vendor?.rejection_reason ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-semibold">Rejected</p>
                <p className="mt-1 text-rose-800">Reason: {vendor.rejection_reason}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 rounded-3xl border bg-zinc-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Upload proof (optional)</p>
              <p className="mt-1 text-xs text-zinc-600">
                Bucket: <span className="font-semibold">vendor-verification</span> (private).
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Upload path must start with your user id:{" "}
                <span className="font-mono">auth.uid()/...</span>
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[200px_1fr_auto]">
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as any)}
              className="h-11 rounded-2xl border bg-white px-3 text-sm"
            >
              {DOC_TYPES.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>

            <input
              id="doc-file"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              className="h-11 rounded-2xl border bg-white px-3 text-sm"
            />

            <button
              type="button"
              onClick={uploadDoc}
              disabled={uploading || !docFile || !vendor}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              Upload
            </button>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-700">Your documents</p>
              {docsLoading ? <span className="text-xs text-zinc-500">Loading…</span> : null}
            </div>

            {docs.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-600">No documents uploaded yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border bg-white p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900">
                        {d.doc_type}
                      </p>
                      <p className="truncate text-xs text-zinc-600">{d.file_path}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openDoc(d.file_path)}
                      className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      <FileText className="h-4 w-4" />
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold text-zinc-700">Request history</p>
          {requests.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-600">No verification requests yet.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {requests.slice(0, 3).map((r) => (
                <div key={r.id} className="rounded-2xl border bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Chip
                      tone={
                        r.status === "approved"
                          ? "good"
                          : r.status === "rejected"
                          ? "bad"
                          : "warn"
                      }
                    >
                      {r.status}
                    </Chip>

                    {/* ✅ Hydration-safe time display */}
                    <span className="text-xs text-zinc-500">
                      {formatDateTimeUTC(r.created_at)}
                    </span>
                  </div>

                  {r.rejection_reason ? (
                    <p className="mt-2 text-xs text-rose-700">
                      Reason: {r.rejection_reason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {lastDecision?.status === "approved" ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <div className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-semibold">Approved</p>
                  <p className="mt-1 text-emerald-800">You are verified. ✅</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between rounded-2xl border bg-white p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">Go to vendors directory</p>
            <p className="mt-1 text-xs text-zinc-600">
              Check how your profile appears publicly.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/vendors")}
            className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Open <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}