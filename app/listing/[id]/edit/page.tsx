"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ListingRow } from "@/lib/types";

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

export default function EditListingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [original, setOriginal] = useState<ListingRow | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listingType, setListingType] = useState<ListingType>("product");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Phones");
  const [price, setPrice] = useState<string>("");
  const [priceLabel, setPriceLabel] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [negotiable, setNegotiable] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);

  const previewUrl = useMemo(() => {
    if (imageFile) return URL.createObjectURL(imageFile);
    return null;
  }, [imageFile]);

  useEffect(() => {
    (async () => {
      setMsg(null);
      setLoading(true);

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

      if (vErr) {
        setMsg(vErr.message);
        setLoading(false);
        return;
      }

      setVendorId(vendor.id);

      const { data: listing, error: lErr } = await supabase
        .from("listings")
        .select("*")
        .eq("id", id)
        .single();

      if (lErr || !listing) {
        setMsg(lErr?.message ?? "Listing not found.");
        setLoading(false);
        return;
      }

      const row = listing as ListingRow;

      if (row.vendor_id !== vendor.id) {
        setMsg("You don’t have permission to edit this listing.");
        setLoading(false);
        return;
      }

      setOriginal(row);

      setTitle(row.title ?? "");
      setDescription(row.description ?? "");
      setListingType(row.listing_type);
      setCategory((row.category as any) ?? "Phones");
      setPrice(row.price !== null ? String(row.price) : "");
      setPriceLabel(row.price_label ?? "");
      setLocation(row.location ?? "");
      setNegotiable(Boolean(row.negotiable));

      setLoading(false);
    })();
  }, [id, router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId || !original) return;

    setMsg(null);

    if (!title.trim()) {
      setMsg("Title is required.");
      return;
    }

    setSaving(true);

    try {
      let imageUrl: string | null = original.image_url;

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
      setMsg(err?.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-zinc-600">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Edit Listing</h1>
          <p className="text-sm text-zinc-600">Update your listing details.</p>
        </div>

        <button
          onClick={() => router.back()}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
        >
          Back
        </button>
      </div>

      {msg ? <div className="rounded-2xl border bg-white p-4 text-sm">{msg}</div> : null}

      <form onSubmit={save} className="space-y-4">
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <p className="text-sm font-semibold">Photo</p>

          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />

          {(previewUrl || original?.image_url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl ?? (original?.image_url ?? "")}
              alt="Preview"
              className="mt-2 w-full rounded-xl border object-cover"
            />
          ) : null}

          <p className="text-xs text-zinc-500">
            Uploading a new photo will replace the current one.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <p className="text-sm font-semibold">Listing info</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-zinc-600">Type</label>
              <select
                value={listingType}
                onChange={(e) => setListingType(e.target.value as ListingType)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm bg-white"
              >
                <option value="product">Product</option>
                <option value="service">Service</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-600">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-600">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-600">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm min-h-[110px]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-zinc-600">Price (₦)</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-600">Price label</label>
              <input
                value={priceLabel}
                onChange={(e) => setPriceLabel(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-600">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={negotiable}
              onChange={(e) => setNegotiable(e.target.checked)}
            />
            Negotiable
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-2xl bg-black px-4 py-3 text-white font-medium disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}
