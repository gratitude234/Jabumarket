// app/post/page.tsx
"use client";

import { useMemo, useRef, useState } from "react";
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

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
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
  const [price, setPrice] = useState<string>("");
  const [priceLabel, setPriceLabel] = useState<string>("");
  const [location, setLocation] = useState("");
  const [negotiable, setNegotiable] = useState(false);

  // image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // success
  const [postedId, setPostedId] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  const priceDisabled = priceLabel.trim().length > 0;
  const priceLabelDisabled = price.trim().length > 0;

  const canPublish = useMemo(() => {
    if (!title.trim()) return false;
    if (!imageFile) return false;
    if (price.trim() && !/^\d+$/.test(price.trim())) return false;
    if (price.trim() && priceLabel.trim()) return false;
    return true;
  }, [title, imageFile, price, priceLabel]);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setImageFile(f);
  }

  function validate() {
    const next: Record<string, string> = {};
    setBanner(null);

    if (!imageFile) next.image = "Please add a photo.";
    if (!title.trim()) next.title = "Title is required.";

    if (price.trim() && !/^\d+$/.test(price.trim())) next.price = "Price must be digits only.";
    if (price.trim() && priceLabel.trim()) {
      next.price = "Use either Price OR Price label, not both.";
      next.priceLabel = "Use either Price OR Price label, not both.";
    }

    if (imageFile) {
      const maxMb = 5;
      const sizeMb = imageFile.size / (1024 * 1024);
      if (sizeMb > maxMb) next.image = `Image too large. Max ${maxMb}MB.`;
      if (!imageFile.type.startsWith("image/")) next.image = "Invalid file type.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function uploadImageToStorage(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `listings/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

      const res = await supabase.storage.from("listing-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/*",
      });

      if (res.error) throw res.error;

      const pub = supabase.storage.from("listing-images").getPublicUrl(path);
      return pub.data.publicUrl as string;
    } finally {
      setUploading(false);
    }
  }

  async function publish() {
    if (publishing || uploading) return;

    setErrors({});
    setBanner(null);

    if (!validate()) return;

    setPublishing(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.push("/login");
        return;
      }

      // get vendor
      const { data: vendor, error: vErr } = await supabase
        .from("vendors")
        .select("id, verified")
        .eq("user_id", user.id)
        .single();

      if (vErr || !vendor?.id) {
        throw new Error("Vendor profile not found. Please create your vendor profile first.");
      }

      // upload image
      const imgUrl = imageFile ? await uploadImageToStorage(imageFile) : null;

      const priceInt =
        price.trim() === ""
          ? null
          : Number.isFinite(Number(price))
            ? parseInt(price, 10)
            : null;

      const payload: any = {
        vendor_id: vendor.id,
        title: title.trim(),
        description: description.trim() || null,
        listing_type: listingType,
        category,
        price: priceInt,
        price_label: priceLabel.trim() || null,
        location: location.trim() || null,
        image_url: imgUrl,
        negotiable,
        status: "active",
      };

      const { data: created, error: cErr } = await supabase
        .from("listings")
        .insert(payload)
        .select("id")
        .single();

      if (cErr) throw cErr;

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
    setPrice("");
    setPriceLabel("");
    setLocation("");
    setNegotiable(false);
    setImageFile(null);
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
        </div>
      </div>
    );
  }

  const previewPrice =
    price.trim() !== ""
      ? `₦${Number(price).toLocaleString("en-NG")}`
      : priceLabel.trim() || "Contact for price";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-24">
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

        {banner ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div>{banner}</div>
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
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className={cn("mt-3 overflow-hidden rounded-3xl border bg-zinc-50")}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
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
        <p className="mt-2 text-xs text-zinc-500">PNG/JPG recommended • max 5MB.</p>
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
          {errors.title ? <p className="mt-1 text-xs text-red-600">{errors.title}</p> : null}
          <p className="mt-1 text-xs text-zinc-500">Short + specific titles get more clicks.</p>
        </div>

        {/* Description */}
        <div className="mt-3">
          <label className="text-xs font-medium text-zinc-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Condition, what’s included, any faults, delivery options, etc."
            className="mt-1 min-h-[120px] w-full rounded-2xl border px-3 py-3 text-sm"
          />
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
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="e.g. 25000"
              disabled={priceDisabled}
              className={cn(
                "mt-1 w-full rounded-2xl border px-3 py-3 text-sm disabled:bg-zinc-50 disabled:text-zinc-400",
                errors.price && "border-red-300"
              )}
            />
            {errors.price ? <p className="mt-1 text-xs text-red-600">{errors.price}</p> : null}
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

            {/* quick label chips */}
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
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Ikeji hostel / CBT / School gate"
            className="mt-1 w-full rounded-2xl border px-3 py-3 text-sm"
          />
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

      {/* Live preview (makes page more “appealing”) */}
      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Preview</h2>
        <p className="mt-0.5 text-xs text-zinc-600">This is how buyers will see it.</p>

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
        </div>
      </div>

      {/* Small tips accordion (trust) */}
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
