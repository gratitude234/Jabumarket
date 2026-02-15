"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

export default function PostPage() {
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Listing fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [listingType, setListingType] = useState<ListingType>("product");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Phones");
  const [price, setPrice] = useState<string>("");
  const [priceLabel, setPriceLabel] = useState<string>("");
  const [location, setLocation] = useState<string>("JABU");
  const [negotiable, setNegotiable] = useState(false);

  // Image
  const [imageFile, setImageFile] = useState<File | null>(null);

  const previewUrl = useMemo(() => {
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    // Require auth
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setErrorMsg(userErr.message);
      return;
    }
    const user = userData.user;
    if (!user) {
      router.push("/login");
      return;
    }

    // Basic validation
    if (!title.trim()) return setErrorMsg("Title is required.");

    setSubmitting(true);

    try {
      // 0) Get current user's vendor
      const { data: vendor, error: vendorErr } = await supabase
        .from("vendors")
        .select("id, whatsapp")
        .eq("user_id", user.id)
        .single();

      if (vendorErr) throw vendorErr;

      // Optional: encourage user to set WhatsApp in /me (CTA depends on your preference)
      if (!vendor?.whatsapp || String(vendor.whatsapp).trim() === "") {
        setErrorMsg("Please set your WhatsApp number on the Me page before posting.");
        router.push("/me");
        return;
      }

      // 1) Upload image (optional)
      let imageUrl: string | null = null;

      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop() || "jpg";
        const fileName = `listings/${Date.now()}-${Math.random().toString(16).slice(2)}.${fileExt}`;

        const uploadRes = await supabase.storage.from("listing-images").upload(fileName, imageFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: imageFile.type || "image/*",
        });

        if (uploadRes.error) throw uploadRes.error;

        const pub = supabase.storage.from("listing-images").getPublicUrl(fileName);
        imageUrl = pub.data.publicUrl;
      }

      // 2) Create listing
      const priceInt =
        price.trim() === ""
          ? null
          : Number.isFinite(Number(price))
            ? parseInt(price, 10)
            : null;

      const { data: listing, error: listingErr } = await supabase
        .from("listings")
        .insert({
          vendor_id: vendor.id,
          title: title.trim(),
          description: description.trim() || null,
          listing_type: listingType,
          category,
          price: priceInt,
          price_label: priceLabel.trim() || null,
          location: location.trim() || null,
          image_url: imageUrl,
          negotiable,
          status: "active",
        })
        .select("id")
        .single();

      if (listingErr) throw listingErr;

      // 3) Redirect to listing page
      router.push(`/listing/${listing.id}`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "Something went wrong. Check console.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Post a Listing</h1>
        <p className="text-sm text-zinc-600">
          You must be logged in. Update your WhatsApp on the Me page so buyers can reach you.
        </p>
      </div>

      {errorMsg ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{errorMsg}</div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Image */}
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <p className="text-sm font-semibold">Photo (optional)</p>

          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />

          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Preview"
              className="mt-2 w-full rounded-xl border object-cover"
            />
          ) : null}
        </div>

        {/* Listing info */}
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
              placeholder="e.g. iPhone 11 (clean, 128GB)"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-600">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Condition, what’s included, how to meet, etc."
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
                placeholder="e.g. 45000"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">Leave empty if not fixed.</p>
            </div>

            <div>
              <label className="text-xs text-zinc-600">Price label (optional)</label>
              <input
                value={priceLabel}
                onChange={(e) => setPriceLabel(e.target.value)}
                placeholder="e.g. ₦5k/day, Negotiable"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-600">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. JABU, Iperu"
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
          disabled={submitting}
          className="w-full rounded-2xl bg-black px-4 py-3 text-white font-medium disabled:opacity-60"
        >
          {submitting ? "Posting..." : "Post Listing"}
        </button>

        <p className="text-xs text-zinc-500">
          Safety: meet in public places, inspect items before paying, report suspicious listings.
        </p>
      </form>
    </div>
  );
}
