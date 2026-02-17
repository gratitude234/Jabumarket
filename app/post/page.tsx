// app/post/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Save,
  X,
  RefreshCcw,
  Sparkles,
  MapPin,
} from "lucide-react";

const CATEGORIES = [
  "Phones",
  "Laptops",
  "Fashion",
  "Provisions",
  "Food",
  "Beauty",
  "Services",
  "Repairs",
  "Tutoring",
  "Others",
] as const;

type ListingType = "product" | "service";

const DRAFT_KEY = "jm_post_draft_v1";
const MAX_IMAGE_MB = 5;
const MIN_TITLE = 8;
const MIN_DESC_SERVICE = 20;

const LOCATION_PRESETS = [
  "School gate",
  "CBT",
  "Library",
  "Ikeji hostel",
  "Female hostel",
  "Male hostel",
  "Chapel",
  "Sports complex",
] as const;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function onlyDigits(s: string) {
  return (s || "").replace(/[^\d]/g, "");
}

function formatDigitsAsNairaInput(digits: string) {
  const clean = onlyDigits(digits);
  if (!clean) return "";
  const n = Number(clean);
  if (!Number.isFinite(n)) return clean;
  return n.toLocaleString("en-NG");
}

function safeUuid() {
  // Best effort; no extra deps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  if (g?.crypto?.randomUUID) return g.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function compressImage(
  file: File,
  opts?: { maxDim?: number; quality?: number }
): Promise<File> {
  const maxDim = opts?.maxDim ?? 1600;
  const quality = opts?.quality ?? 0.82;

  if (!file.type.startsWith("image/")) return file;

  // If already small-ish, keep original
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb <= 1.2) return file;

  const imgUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to read image"));
      el.src = imgUrl;
    });

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    if (!w || !h) return file;

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // Better downscale quality on some browsers
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) => {
      // Always output JPEG (smaller, consistent). If original is PNG with transparency,
      // it will get flattened on white background — acceptable for marketplace listings.
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });

    if (!blob) return file;

    const compressed = new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    // If compression somehow got bigger, keep original
    if (compressed.size >= file.size) return file;

    return compressed;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

function Modal({
  open,
  title,
  children,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl p-3 sm:inset-0 sm:flex sm:items-center sm:justify-center">
        <div className="w-full rounded-3xl border bg-white p-4 shadow-xl sm:max-w-lg">
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function PostPage() {
  const router = useRouter();

  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [banner, setBanner] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // form
  const [listingType, setListingType] = useState<ListingType>("product");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Phones");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceDigits, setPriceDigits] = useState<string>(""); // digits only
  const [priceLabel, setPriceLabel] = useState<string>("");
  const [location, setLocation] = useState("");
  const [negotiable, setNegotiable] = useState(false);

  // image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // upload UX
  const [progress, setProgress] = useState(0);
  const progressTimerRef = useRef<number | null>(null);

  // success
  const [postedId, setPostedId] = useState<string | null>(null);

  // draft restore
  const [draftFound, setDraftFound] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const draftRef = useRef<any>(null);

  const previewUrl = useMemo(() => {
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  // Revoke preview URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const priceDisabled = priceLabel.trim().length > 0;
  const priceLabelDisabled = priceDigits.trim().length > 0;

  const titleCount = title.trim().length;
  const descCount = description.trim().length;

  const canPublish = useMemo(() => {
    if (title.trim().length < MIN_TITLE) return false;
    if (!imageFile) return false;

    if (listingType === "service" && description.trim().length < MIN_DESC_SERVICE) return false;

    if (priceDigits.trim() && !/^\d+$/.test(priceDigits.trim())) return false;
    if (priceDigits.trim() && priceLabel.trim()) return false;

    return true;
  }, [title, imageFile, priceDigits, priceLabel, listingType, description]);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function stopProgressTimer() {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function startFakeProgress() {
    stopProgressTimer();
    setProgress(5);
    progressTimerRef.current = window.setInterval(() => {
      setProgress((p) => {
        // advance slowly up to 90%
        if (p >= 90) return p;
        return Math.min(90, p + (p < 30 ? 6 : 2));
      });
    }, 220);
  }

  function finishProgress() {
    stopProgressTimer();
    setProgress(100);
    window.setTimeout(() => setProgress(0), 600);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    onPickFile(f);
  }

  function onPickFile(f: File) {
    setBanner(null);
    setErrors((prev) => ({ ...prev, image: "" }));

    if (!f.type.startsWith("image/")) {
      setErrors((prev) => ({ ...prev, image: "Please upload an image file (JPG/PNG)." }));
      return;
    }
    const sizeMb = f.size / (1024 * 1024);
    if (sizeMb > MAX_IMAGE_MB) {
      setErrors((prev) => ({ ...prev, image: `Image too large. Max ${MAX_IMAGE_MB}MB.` }));
      return;
    }
    setImageFile(f);
  }

  function validate() {
    const next: Record<string, string> = {};
    setBanner(null);

    if (!imageFile) next.image = "Please add a photo.";

    if (!title.trim()) next.title = "Title is required.";
    else if (title.trim().length < MIN_TITLE) next.title = `Title should be at least ${MIN_TITLE} characters.`;

    if (listingType === "service" && description.trim().length > 0 && description.trim().length < MIN_DESC_SERVICE) {
      next.description = `For services, add a bit more detail (min ${MIN_DESC_SERVICE} chars).`;
    }

    if (priceDigits.trim() && !/^\d+$/.test(priceDigits.trim())) next.price = "Price must be digits only.";
    if (priceDigits.trim() && priceLabel.trim()) {
      next.price = "Use either Price OR Price label, not both.";
      next.priceLabel = "Use either Price OR Price label, not both.";
    }

    if (imageFile) {
      const sizeMb = imageFile.size / (1024 * 1024);
      if (sizeMb > MAX_IMAGE_MB) next.image = `Image too large. Max ${MAX_IMAGE_MB}MB.`;
      if (!imageFile.type.startsWith("image/")) next.image = "Invalid file type.";
    }

    setErrors(next);
    return Object.keys(next).filter((k) => next[k]).length === 0;
  }

  async function uploadImageToStorage(file: File, userId: string) {
    setUploading(true);
    startFakeProgress();

    try {
      // Stage 1: compress (UX + speed)
      setProgress(10);
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.82 });
      setProgress((p) => Math.max(p, 25));

      const path = `listings/${userId}/${safeUuid()}.jpg`;

      // Stage 2: upload
      const res = await supabase.storage.from("listing-images").upload(path, compressed, {
        cacheControl: "3600",
        upsert: false,
        contentType: compressed.type || "image/jpeg",
      });

      if (res.error) throw res.error;

      setProgress((p) => Math.max(p, 92));
      const pub = supabase.storage.from("listing-images").getPublicUrl(path);
      return pub.data.publicUrl as string;
    } finally {
      setUploading(false);
      finishProgress();
    }
  }

  async function publish() {
    if (publishing || uploading) return;

    setErrors({});
    setBanner(null);

    if (!validate()) return;

    setPublishing(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        const m = String(userErr.message ?? "").toLowerCase();
        if (m.includes("auth session missing") || m.includes("session missing")) {
          router.push(`/login?next=${encodeURIComponent("/post")}`);
          return;
        }
        throw userErr;
      }

      const user = userData.user;
      if (!user) {
        router.push(`/login?next=${encodeURIComponent("/post")}`);
        return;
      }

      // get vendor
      const { data: vendor, error: vErr } = await supabase
        .from("vendors")
        .select("id, verified")
        .eq("user_id", user.id)
        .single();

      if (vErr || !vendor?.id) {
        // Friendly CTA instead of raw crash
        setBanner("You need a vendor profile before posting. Please complete your profile first.");
        return;
      }

      // upload image (compressed)
      const imgUrl = imageFile ? await uploadImageToStorage(imageFile, user.id) : null;

      const priceInt = priceDigits.trim() ? parseInt(priceDigits.trim(), 10) : null;

      const payload: any = {
        vendor_id: vendor.id,
        title: title.trim(),
        description: description.trim() || null,
        listing_type: listingType,
        category,
        price: Number.isFinite(priceInt as any) ? priceInt : null,
        price_label: priceLabel.trim() || null,
        location: location.trim() || null,
        image_url: imgUrl,
        negotiable,
        status: "active",
      };

      const { data: created, error: cErr } = await supabase.from("listings").insert(payload).select("id").single();
      if (cErr) throw cErr;

      // Clear draft on success
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {}

      setPostedId(created?.id ?? null);
    } catch (err: any) {
      setBanner(err?.message ?? "Failed to post listing.");
    } finally {
      setPublishing(false);
    }
  }

  function resetForm() {
    setBanner(null);
    setErrors({});
    setPostedId(null);

    setListingType("product");
    setCategory("Phones");
    setTitle("");
    setDescription("");
    setPriceDigits("");
    setPriceLabel("");
    setLocation("");
    setNegotiable(false);
    setImageFile(null);
  }

  // ---------- Draft autosave + restore ----------
  const draftPayload = useMemo(() => {
    return {
      v: 1,
      listingType,
      category,
      title,
      description,
      priceDigits,
      priceLabel,
      location,
      negotiable,
      // image intentionally excluded (can’t restore file reliably)
      ts: Date.now(),
    };
  }, [listingType, category, title, description, priceDigits, priceLabel, location, negotiable]);

  useEffect(() => {
    // On mount, detect draft
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // only show restore prompt if draft has meaningful content
      const hasContent =
        !!parsed?.title?.trim() ||
        !!parsed?.description?.trim() ||
        !!parsed?.priceDigits?.trim() ||
        !!parsed?.priceLabel?.trim() ||
        !!parsed?.location?.trim();
      if (!hasContent) return;

      draftRef.current = parsed;
      setDraftFound(true);
      setShowDraftModal(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // Debounced autosave (don’t autosave while success screen or publishing)
    if (postedId || publishing) return;

    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draftPayload));
      } catch {
        // ignore
      }
    }, 650);

    return () => window.clearTimeout(t);
  }, [draftPayload, postedId, publishing]);

  function restoreDraft() {
    const d = draftRef.current;
    if (!d) {
      setShowDraftModal(false);
      return;
    }
    setListingType(d.listingType === "service" ? "service" : "product");
    setCategory((CATEGORIES as readonly string[]).includes(d.category) ? d.category : "Phones");
    setTitle(d.title ?? "");
    setDescription(d.description ?? "");
    setPriceDigits(d.priceDigits ?? "");
    setPriceLabel(d.priceLabel ?? "");
    setLocation(d.location ?? "");
    setNegotiable(!!d.negotiable);
    setShowDraftModal(false);
  }

  function discardDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setDraftFound(false);
    setShowDraftModal(false);
  }

  // Success screen
  if (postedId) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 pb-24">
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100">
              <CheckCircle2 className="h-6 w-6 text-zinc-900" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">Listing posted ✅</h1>
              <p className="mt-1 text-sm text-zinc-600">
                Your listing is live. You can view it now or post another.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => router.push(`/listing/${postedId}`)}
              className="rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              View listing
            </button>
            <button
              onClick={resetForm}
              className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Post another
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => router.push("/my-listings")}
              className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Go to My Listings
            </button>
            <button
              onClick={() => {
                const url =
                  typeof window !== "undefined" ? `${window.location.origin}/listing/${postedId}` : `/listing/${postedId}`;
                navigator.clipboard?.writeText(url).catch(() => {});
                setBanner("Link copied ✅");
              }}
              className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Copy link
            </button>
          </div>
        </div>

        {banner ? (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">{banner}</div>
        ) : null}
      </div>
    );
  }

  const previewPrice =
    priceDigits.trim() !== ""
      ? formatNaira(parseInt(priceDigits, 10))
      : priceLabel.trim() || "Contact for price";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-24">
      {/* Draft restore modal */}
      <Modal open={showDraftModal} title="Restore your draft?">
        <p className="text-sm text-zinc-700">
          We found an unfinished post. Do you want to restore it? (Photo can’t be restored.)
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={discardDraft}
            className="rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={restoreDraft}
            className="rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Restore
          </button>
        </div>
      </Modal>

      {/* Top bar */}
      <div className="sticky top-0 z-10 -mx-4 border-b bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-semibold text-zinc-900">Post a listing</p>
            <p className="text-xs text-zinc-500">
              {publishing ? "Publishing…" : uploading ? "Uploading image…" : "Step-by-step"}
            </p>
          </div>
        </div>

        {/* Progress bar (shows during upload/compress) */}
        {(uploading || publishing) && progress > 0 ? (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-black transition-[width] duration-200"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {uploading ? "Optimizing & uploading image…" : "Publishing…"}
            </p>
          </div>
        ) : null}

        {banner ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div className="flex-1">{banner}</div>
              {banner.toLowerCase().includes("vendor profile") ? (
                <button
                  type="button"
                  onClick={() => router.push("/me")}
                  className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Fix now <ArrowLeft className="h-4 w-4 rotate-180" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Step 1: Photo */}
      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">1) Add a photo</h2>
            <p className="mt-0.5 text-xs text-zinc-600">Clear photos get more messages.</p>
          </div>

          {imageFile ? (
            <button
              type="button"
              onClick={() => setImageFile(null)}
              className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              <X className="h-4 w-4" />
              Remove
            </button>
          ) : null}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "mt-3 overflow-hidden rounded-3xl border bg-zinc-50 transition",
            dragOver && "ring-2 ring-black/10 border-zinc-300"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
            }}
            className="hidden"
          />

          <button type="button" onClick={openFilePicker} className="group relative w-full">
            <div className="relative aspect-[4/3] w-full bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl ?? "https://placehold.co/1200x900?text=Add+photo"}
                alt="Preview"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0" />

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-white">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 backdrop-blur">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold">Tap to upload</p>
                    <p className="text-xs text-white/80">or drag & drop</p>
                  </div>
                </div>

                <span className="rounded-2xl bg-white/15 px-3 py-2 text-xs font-semibold text-white backdrop-blur">
                  {imageFile ? "Replace" : "Upload"}
                </span>
              </div>
            </div>
          </button>
        </div>

        {errors.image ? <p className="mt-2 text-xs text-red-600">{errors.image}</p> : null}
        <p className="mt-2 text-xs text-zinc-500">
          PNG/JPG recommended • max {MAX_IMAGE_MB}MB • we auto-optimize your photo for faster posting.
        </p>
      </section>

      {/* Step 2: Details */}
      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">2) Details</h2>
        <p className="mt-0.5 text-xs text-zinc-600">Help buyers understand what you’re offering.</p>

        {/* Type segmented */}
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-700">Type</p>
          <div className="mt-2 grid grid-cols-2 rounded-2xl border bg-white p-1">
            <button
              type="button"
              onClick={() => setListingType("product")}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold",
                listingType === "product" ? "bg-black text-white" : "text-zinc-800 hover:bg-zinc-50"
              )}
            >
              Product
            </button>
            <button
              type="button"
              onClick={() => setListingType("service")}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold",
                listingType === "service" ? "bg-black text-white" : "text-zinc-800 hover:bg-zinc-50"
              )}
            >
              Service
            </button>
          </div>
        </div>

        {/* Category chips (mobile-first horizontal scroll) */}
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-700">Category</p>
          <div className="mt-2 -mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            <style>{`div::-webkit-scrollbar{display:none}`}</style>
            <div className="flex w-max gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold",
                    category === c ? "bg-black text-white border-black" : "bg-white text-zinc-800 hover:bg-zinc-50"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Pick the best match so buyers find you.</p>
        </div>

        {/* Title */}
        <div className="mt-4">
          <label className="text-xs font-medium text-zinc-700">
            Title <span className="text-red-600">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. iPhone 11 64GB — clean, no issues"
            className={cn("mt-1 w-full rounded-2xl border px-3 py-3 text-sm", errors.title && "border-red-300")}
          />
          <div className="mt-1 flex items-center justify-between">
            {errors.title ? <p className="text-xs text-red-600">{errors.title}</p> : <span />}
            <p className={cn("text-[11px]", titleCount < MIN_TITLE ? "text-amber-700" : "text-zinc-500")}>
              {titleCount}/{MIN_TITLE}+ recommended
            </p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Short + specific titles get more clicks.</p>
        </div>

        {/* Description */}
        <div className="mt-3">
          <label className="text-xs font-medium text-zinc-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Condition, what’s included, any faults, delivery options, etc."
            className={cn(
              "mt-1 min-h-[120px] w-full rounded-2xl border px-3 py-3 text-sm",
              errors.description && "border-red-300"
            )}
          />
          <div className="mt-1 flex items-center justify-between">
            {errors.description ? <p className="text-xs text-red-600">{errors.description}</p> : <span />}
            {listingType === "service" ? (
              <p className={cn("text-[11px]", descCount < MIN_DESC_SERVICE ? "text-amber-700" : "text-zinc-500")}>
                {descCount}/{MIN_DESC_SERVICE}+ recommended
              </p>
            ) : (
              <p className="text-[11px] text-zinc-500">{descCount} chars</p>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Good descriptions build trust.</p>
        </div>
      </section>

      {/* Step 3: Price & location */}
      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">3) Price & location</h2>
        <p className="mt-0.5 text-xs text-zinc-600">Use a numeric price or a label.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-zinc-700">Price (₦)</label>
            <input
              value={formatDigitsAsNairaInput(priceDigits)}
              onChange={(e) => setPriceDigits(onlyDigits(e.target.value))}
              inputMode="numeric"
              placeholder="e.g. 25,000"
              disabled={priceDisabled}
              className={cn(
                "mt-1 w-full rounded-2xl border px-3 py-3 text-sm disabled:bg-zinc-50 disabled:text-zinc-400",
                errors.price && "border-red-300"
              )}
            />
            {errors.price ? <p className="mt-1 text-xs text-red-600">{errors.price}</p> : null}
            {priceDigits ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                Preview: <span className="font-semibold text-zinc-900">{formatNaira(parseInt(priceDigits, 10))}</span>
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700">Price label</label>
            <input
              value={priceLabel}
              onChange={(e) => setPriceLabel(e.target.value)}
              placeholder="e.g. Negotiable / Call for price"
              disabled={priceLabelDisabled}
              className={cn(
                "mt-1 w-full rounded-2xl border px-3 py-3 text-sm disabled:bg-zinc-50 disabled:text-zinc-400",
                errors.priceLabel && "border-red-300"
              )}
            />
            {errors.priceLabel ? <p className="mt-1 text-xs text-red-600">{errors.priceLabel}</p> : null}

            {!priceLabelDisabled ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {["Negotiable", "Call for price", "Free"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPriceLabel(t)}
                    className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-zinc-700">Location</label>
          <div className="mt-1 flex items-center gap-2 rounded-2xl border bg-white px-3 py-3">
            <MapPin className="h-4 w-4 text-zinc-500" />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Ikeji hostel / CBT / School gate"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          <div className="mt-2 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            <style>{`div::-webkit-scrollbar{display:none}`}</style>
            {LOCATION_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setLocation(p)}
                className="whitespace-nowrap rounded-full border bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border bg-zinc-50 p-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Negotiable</p>
            <p className="text-xs text-zinc-600">Show you’re open to offers.</p>
          </div>

          <button
            type="button"
            onClick={() => setNegotiable((v) => !v)}
            className={cn("relative h-7 w-12 rounded-full transition-colors", negotiable ? "bg-black" : "bg-zinc-300")}
            aria-pressed={negotiable}
            aria-label="Toggle negotiable"
          >
            <span
              className={cn(
                "absolute top-1 h-5 w-5 rounded-full bg-white transition-transform",
                negotiable ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
      </section>

      {/* Live preview */}
      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Preview</h2>
            <p className="mt-0.5 text-xs text-zinc-600">This is how buyers will see it.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-xs font-semibold text-zinc-800">
            <Sparkles className="h-4 w-4" />
            Live
          </span>
        </div>

        <div className="mt-3 overflow-hidden rounded-3xl border bg-white">
          <div className="relative aspect-[4/3] bg-zinc-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl ?? "https://placehold.co/1200x900?text=Preview"}
              alt="Preview"
              className="h-full w-full object-cover"
            />
            <div className="absolute bottom-3 left-3">
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-900 backdrop-blur">
                {previewPrice}
              </span>
            </div>
            {negotiable ? (
              <div className="absolute bottom-3 right-3">
                <span className="rounded-full bg-black/90 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                  Negotiable
                </span>
              </div>
            ) : null}
          </div>

          <div className="space-y-1 p-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
                {listingType === "product" ? "Product" : "Service"}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
                {category}
              </span>
            </div>
            <p className="line-clamp-2 text-sm font-semibold text-zinc-900">
              {title.trim() || "Your title will appear here"}
            </p>
            <p className="line-clamp-2 text-xs text-zinc-600">
              {description.trim() || "Your description will appear here"}
            </p>
            <p className="text-xs text-zinc-500">{location.trim() || "Location"}</p>
          </div>
        </div>
      </section>

      {/* Desktop publish button */}
      <div className="hidden sm:flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={publish}
          disabled={!canPublish || publishing || uploading}
          className="inline-flex items-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {publishing || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {publishing ? "Publishing…" : uploading ? "Uploading…" : "Publish"}
        </button>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="sm:hidden fixed bottom-16 left-0 right-0 z-40 px-4">
        <div className="mx-auto max-w-2xl rounded-3xl border bg-white/90 p-2 shadow-lg backdrop-blur">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-3 py-3 text-sm font-semibold text-zinc-900"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>

            <button
              type="button"
              onClick={openFilePicker}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-3 py-3 text-sm font-semibold text-zinc-900"
            >
              <ImageIcon className="h-4 w-4" />
              Photo
            </button>

            <button
              type="button"
              onClick={publish}
              disabled={!canPublish || publishing || uploading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {publishing || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Post
            </button>
          </div>

          {draftFound ? (
            <div className="mt-2 flex items-center justify-between rounded-2xl border bg-white px-3 py-2">
              <p className="text-[11px] text-zinc-600">Draft autosave is on</p>
              <button
                type="button"
                onClick={() => setShowDraftModal(true)}
                className="inline-flex items-center gap-2 text-[11px] font-semibold text-zinc-900 underline underline-offset-4"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Restore
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Tips */}
      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <details className="group">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-zinc-900">Posting tips</p>
              <span className="rounded-full border bg-white p-2 text-zinc-700">
                <ArrowLeft className="h-4 w-4 rotate-[-90deg] transition-transform group-open:rotate-[90deg]" />
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">Tap to expand</p>
          </summary>

          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600">
            <li>Use clear photos with good lighting.</li>
            <li>Write honest details to build trust.</li>
            <li>Meet in public places on/around campus.</li>
            <li>For services, agree on price and timeline upfront.</li>
          </ul>
        </details>
      </section>
    </div>
  );
}
