// app/listing/[id]/edit/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ListingRow } from "@/lib/types";
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Loader2,
  Save,
  Trash2,
  X,
  AlertTriangle,
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

function isNumericLike(v: string) {
  if (!v.trim()) return true;
  return /^\d+$/.test(v.trim());
}

function isUuid(v?: string | null) {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const id = typeof params?.id === "string" ? params.id : undefined;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [banner, setBanner] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [original, setOriginal] = useState<ListingRow | null>(null);

  // form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listingType, setListingType] = useState<ListingType>("product");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Phones");
  const [price, setPrice] = useState<string>("");
  const [priceLabel, setPriceLabel] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [negotiable, setNegotiable] = useState(false);

  // image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewUrl = useMemo(() => {
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Load listing + permission check
  useEffect(() => {
    (async () => {
      setBanner(null);
      setErrors({});
      setLoading(true);

      // Guard against undefined/invalid ids (prevents Postgres "invalid input syntax for type uuid: \"undefined\""
      // when Supabase builds the query).
      if (!isUuid(id)) {
        setBanner("Can’t open edit page — invalid listing id.");
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: vendor, error: vErr } = await supabase
        .from("vendors")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (vErr || !vendor?.id) {
        setBanner(vErr?.message ?? "Could not find your vendor profile.");
        setLoading(false);
        return;
      }

      setVendorId(vendor.id);

      const { data: listing, error: lErr } = await supabase
        .from("listings")
        // select only what we need (faster)
        .select(
          "id,title,description,listing_type,category,price,price_label,location,image_url,negotiable,vendor_id"
        )
        .eq("id", id)
        .single();

      if (lErr || !listing) {
        setBanner(lErr?.message ?? "Listing not found.");
        setLoading(false);
        return;
      }

      const row = listing as ListingRow;

      if (row.vendor_id !== vendor.id) {
        setBanner("You don’t have permission to edit this listing.");
        setLoading(false);
        return;
      }

      setOriginal(row);

      setTitle(row.title ?? "");
      setDescription(row.description ?? "");
      setListingType(row.listing_type);
      setCategory((row.category as any) ?? "Phones");
      setPrice(row.price !== null && row.price !== undefined ? String(row.price) : "");
      setPriceLabel(row.price_label ?? "");
      setLocation(row.location ?? "");
      setNegotiable(Boolean(row.negotiable));

      setLoading(false);
    })();
  }, [id, router]);

  const priceDisabled = priceLabel.trim().length > 0;
  const priceLabelDisabled = price.trim().length > 0;

  const dirty = useMemo(() => {
    if (!original) return false;

    const norm = (v: any) => (v ?? "").toString().trim();
    const same =
      norm(original.title) === norm(title) &&
      norm(original.description) === norm(description) &&
      norm(original.listing_type) === norm(listingType) &&
      norm(original.category) === norm(category) &&
      (original.price === null || original.price === undefined ? "" : String(original.price)) ===
        norm(price) &&
      norm(original.price_label) === norm(priceLabel) &&
      norm(original.location) === norm(location) &&
      Boolean(original.negotiable) === Boolean(negotiable);

    return !same || Boolean(imageFile);
  }, [original, title, description, listingType, category, price, priceLabel, location, negotiable, imageFile]);

  // warn on refresh/close if dirty
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty || saving) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function validate() {
    const next: Record<string, string> = {};
    setBanner(null);

    if (!title.trim()) next.title = "Title is required.";
    if (!isNumericLike(price)) next.price = "Price must be digits only.";
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

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!vendorId || !original) return;

    setErrors({});
    setBanner(null);

    if (!validate()) return;

    setSaving(true);
    try {
      let imageUrl: string | null = original.image_url;

      // upload new image if selected
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop() || "jpg";
        const fileName = `listings/${Date.now()}-${Math.random().toString(16).slice(2)}.${fileExt}`;

        const uploadRes = await supabase.storage
          .from("listing-images")
          .upload(fileName, imageFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: imageFile.type || "image/*",
          });

        if (uploadRes.error) throw uploadRes.error;

        const pub = supabase.storage.from("listing-images").getPublicUrl(fileName);
        imageUrl = pub.data.publicUrl;
      }

      const priceInt =
        price.trim() === ""
          ? null
          : Number.isFinite(Number(price))
            ? parseInt(price, 10)
            : null;

      const { error } = await supabase
        .from("listings")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          listing_type: listingType,
          category,
          price: priceInt,
          price_label: priceLabel.trim() || null,
          location: location.trim() || null,
          image_url: imageUrl,
          negotiable,
        })
        .eq("id", id)
        .eq("vendor_id", vendorId);

      if (error) throw error;

      router.push(`/listing/${id}`);
    } catch (err: any) {
      setBanner(err?.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  function onBack() {
    if (dirty && !saving) {
      const ok = confirm("You have unsaved changes. Leave without saving?");
      if (!ok) return;
    }
    router.back();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setImageFile(f);
  }

  if (loading) {
    return <div className="text-sm text-zinc-600">Loading…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-24">
      {/* Top bar (mobile-first) */}
      <div className="sticky top-0 z-10 -mx-4 border-b bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-semibold text-zinc-900">Edit listing</p>
            <p className="text-xs text-zinc-500">
              {saving ? "Saving…" : dirty ? "Unsaved changes" : "Up to date"}
            </p>
          </div>
        </div>

        {/* Banner */}
        {banner ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div>{banner}</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Photo card */}
      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Photo</h2>
            <p className="mt-0.5 text-xs text-zinc-600">Add a clear photo to get more buyers.</p>
          </div>

          {imageFile ? (
            <button
              type="button"
              onClick={() => setImageFile(null)}
              className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          ) : null}
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className={cn(
            "mt-3 overflow-hidden rounded-3xl border bg-zinc-50",
            "focus-within:ring-2 focus-within:ring-zinc-900"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />

          <button
            type="button"
            onClick={openFilePicker}
            className="group relative w-full"
          >
            <div className="relative aspect-[4/3] w-full bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  previewUrl ??
                  original?.image_url ??
                  "https://placehold.co/1200x900?text=Add+photo"
                }
                alt="Listing preview"
                className="h-full w-full object-cover"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/0 opacity-100" />

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
                  Replace
                </span>
              </div>
            </div>
          </button>
        </div>

        {errors.image ? <p className="mt-2 text-xs text-red-600">{errors.image}</p> : null}
        <p className="mt-2 text-xs text-zinc-500">PNG/JPG recommended • max 5MB.</p>
      </section>

      {/* Info card */}
      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Listing info</h2>
        <p className="mt-0.5 text-xs text-zinc-600">Make it easy to understand at a glance.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-zinc-700">Type</label>
            <select
              value={listingType}
              onChange={(e) => setListingType(e.target.value as ListingType)}
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-3 text-sm"
            >
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="mt-1 w-full rounded-2xl border bg-white px-3 py-3 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-zinc-700">
            Title <span className="text-red-600">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. iPhone 11 64GB (clean)"
            className={cn(
              "mt-1 w-full rounded-2xl border px-3 py-3 text-sm",
              errors.title && "border-red-300"
            )}
          />
          {errors.title ? <p className="mt-1 text-xs text-red-600">{errors.title}</p> : null}
          <p className="mt-1 text-xs text-zinc-500">Keep it short. Mention key details.</p>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-zinc-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Condition, what’s included, delivery info, etc."
            className="mt-1 min-h-[120px] w-full rounded-2xl border px-3 py-3 text-sm"
          />
          <p className="mt-1 text-xs text-zinc-500">Good descriptions sell faster.</p>
        </div>
      </section>

      {/* Pricing + location card */}
      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Pricing & location</h2>
        <p className="mt-0.5 text-xs text-zinc-600">Use either a numeric price or a label.</p>

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
            {priceDisabled ? (
              <p className="mt-1 text-xs text-zinc-500">Disabled because Price label is set.</p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">Numbers only.</p>
            )}
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
            {priceLabelDisabled ? (
              <p className="mt-1 text-xs text-zinc-500">Disabled because Price is set.</p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">Optional text instead of numeric price.</p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-zinc-700">Location</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Ikeji Hostel, JABU"
            className="mt-1 w-full rounded-2xl border px-3 py-3 text-sm"
          />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border bg-zinc-50 p-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Negotiable</p>
            <p className="text-xs text-zinc-600">Show buyers you’re open to offers.</p>
          </div>

          <button
            type="button"
            onClick={() => setNegotiable((v) => !v)}
            className={cn(
              "relative h-7 w-12 rounded-full transition-colors",
              negotiable ? "bg-black" : "bg-zinc-300"
            )}
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

      {/* Desktop actions (hidden on mobile; mobile gets sticky bar) */}
      <div className="hidden sm:flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => save()}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Mobile sticky bottom bar (above your bottom nav) */}
      <div className="sm:hidden fixed bottom-16 left-0 right-0 z-40 px-4">
        <div className="mx-auto max-w-2xl rounded-3xl border bg-white/90 p-2 shadow-lg backdrop-blur">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onBack}
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
              onClick={() => save()}
              disabled={!dirty || saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Hidden form submit hook (optional) */}
      <form onSubmit={save} className="hidden" />
    </div>
  );
}
