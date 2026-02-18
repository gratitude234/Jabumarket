// app/listing/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase/server";
import type { ListingRow, VendorRow } from "@/lib/types";
import OwnerActions from "@/components/listing/OwnerActions";
import ListingImage from "@/components/ListingImage";
import { getWhatsAppLink } from "@/lib/whatsapp";
import {
  ArrowLeft,
  BadgeCheck,
  MapPin,
  Clock,
  Phone,
  Flag,
  Store,
  Truck,
  Share2,
  Image as ImageIcon,
} from "lucide-react";

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-NG", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function safeText(s: unknown) {
  return String(s ?? "").trim();
}

function digitsOnly(s: string) {
  return s.replace(/[^\d]/g, "");
}

function pickImage(url?: string | null) {
  const u = safeText(url);
  if (!u) return "https://placehold.co/1200x900?text=Jabumarket";
  return u;
}

function buildSiteUrl() {
  const direct = safeText(process.env.NEXT_PUBLIC_SITE_URL);
  if (direct) return direct.replace(/\/$/, "");

  // Vercel fallback
  const vercel = safeText(process.env.VERCEL_URL);
  if (vercel) return `https://${vercel}`.replace(/\/$/, "");

  return ""; // unknown, we’ll keep relative share text
}

function maskNumber(digits: string) {
  if (!digits) return "—";
  if (digits.length <= 4) return digits;
  const last4 = digits.slice(-4);
  return `****${last4}`;
}

function listingMetaDesc(listing: ListingRow) {
  const desc = safeText(listing.description);
  if (!desc) return "View listing details on Jabumarket.";
  const oneLine = desc.replace(/\s+/g, " ").trim();
  return oneLine.length > 160 ? `${oneLine.slice(0, 157)}…` : oneLine;
}

function uniq(arr: string[]) {
  const s = new Set<string>();
  for (const a of arr) if (a) s.add(a);
  return Array.from(s);
}

// ✅ Optional SEO (safe + lightweight)
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const { data } = await supabase
    .from("listings")
    .select("id,title,description,image_url,price,price_label,location,category")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return {
      title: "Listing not found — Jabumarket",
      description: "This listing may have been removed or does not exist.",
    };
  }

  const listing = data as ListingRow;

  const title = safeText(listing.title) || "Listing";
  const metaTitle = `${title} — Jabumarket`;
  const metaDesc = listingMetaDesc(listing);

  return {
    title: metaTitle,
    description: metaDesc,
    openGraph: {
      title: metaTitle,
      description: metaDesc,
      images: [{ url: pickImage(listing.image_url) }],
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDesc,
      images: [pickImage(listing.image_url)],
    },
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const siteUrl = buildSiteUrl();

  const { data, error } = await supabase
    .from("listings")
    .select(
      `
      id,title,description,listing_type,category,price,price_label,location,image_url,negotiable,status,created_at,vendor_id,
      vendor:vendors(id,name,whatsapp,verified,vendor_type,phone,location)
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  // Normalize vendor from VendorRow[] -> VendorRow | null
  const row = data as ListingRow & { vendor?: VendorRow[] | null };
  const listing: ListingRow & { vendor?: VendorRow | null } = {
    ...(row as ListingRow),
    vendor: row.vendor?.[0] ?? null,
  };

  const title = safeText(listing.title) || "Untitled listing";
  const desc = safeText(listing.description);

  const priceText =
    listing.price !== null
      ? formatNaira(listing.price)
      : safeText(listing.price_label) || "Contact for price";

  const typeLabel = listing.listing_type === "product" ? "Product" : "Service";

  const isSold = listing.status === "sold";
  const isInactive = listing.status === "inactive";
  const isUnavailable = isSold || isInactive;

  const vendor = listing.vendor ?? null;
  const isVerified = Boolean(vendor?.verified);

  const sellerName = safeText(vendor?.name) || "Unknown";
  const vendorId = vendor?.id ?? listing.vendor_id ?? null;

  // WhatsApp + Call logic
  const whatsappRaw = safeText(vendor?.whatsapp);
  const phoneRaw = safeText(vendor?.phone);

  const whatsappDigits = digitsOnly(whatsappRaw);
  const phoneDigits = digitsOnly(phoneRaw);

  const hasWhatsApp = whatsappDigits.length >= 8;
  const hasPhone = phoneDigits.length >= 8;

  const waText = `Hi, I'm interested in: ${title} (on Jabumarket). Is it still available?`;
  const waLink = hasWhatsApp ? getWhatsAppLink(whatsappDigits, waText) : "";

  const callDigits = hasPhone ? phoneDigits : whatsappDigits;
  const canCall = !isUnavailable && callDigits.length >= 8;

  // Delivery eligibility (broader + safer default)
  const category = safeText(listing.category);
  const isFoodListing =
    category.toLowerCase() === "food" ||
    safeText(vendor?.vendor_type).toLowerCase() === "food";

  const deliveryEligible = !isUnavailable && (isFoodListing || listing.listing_type === "product");

  const postedAt = formatDateTime(listing.created_at);

  // Listing URL for sharing
  const listingPath = `/listing/${listing.id}`;
  const listingUrl = siteUrl ? `${siteUrl}${listingPath}` : listingPath;

  const shareText = encodeURIComponent(
    `${title} — ${priceText}\n${listingUrl}\n\nFrom Jabumarket`
  );
  const shareWa = `https://wa.me/?text=${shareText}`;

  // Gallery (defensive: supports future array fields without breaking)
  const rawImages = [
    // current schema
    listing.image_url ?? "",
    // possible future fields
    ...(((listing as unknown as any)?.image_urls as string[] | undefined) ?? []),
    ...(((listing as unknown as any)?.images as string[] | undefined) ?? []),
  ];
  const images = uniq(rawImages.map((u) => pickImage(u)).filter(Boolean));
  const primaryImage = images[0] ?? pickImage(listing.image_url);

  // Similar listings:
  // 1) same category + same type
  // 2) fill remainder with newest active
  const baseSimilarSelect =
    "id,title,price,price_label,image_url,category,listing_type,location,status,created_at,negotiable";

  const primarySimilarQuery = supabase
    .from("listings")
    .select(baseSimilarSelect)
    .neq("id", listing.id)
    .in("status", ["active"])
    .order("created_at", { ascending: false })
    .limit(6);

  const { data: primarySimilar } =
    category || listing.listing_type
      ? await primarySimilarQuery
          .eq("listing_type", listing.listing_type)
          .eq("category", category || "")
      : await primarySimilarQuery;

  const firstBatch = (primarySimilar ?? []) as ListingRow[];
  const already = new Set<string>(firstBatch.map((x) => x.id));

  let similar: ListingRow[] = firstBatch;

  if (similar.length < 6) {
    const { data: fill } = await supabase
      .from("listings")
      .select(baseSimilarSelect)
      .neq("id", listing.id)
      .in("status", ["active"])
      .order("created_at", { ascending: false })
      .limit(12);

    const fillRows = ((fill ?? []) as ListingRow[]).filter((x) => !already.has(x.id));
    similar = [...similar, ...fillRows].slice(0, 6);
  }

  const hasGallery = images.length > 1;
  const descLong = desc.length > 240;

  return (
    <div className="space-y-4 pb-28 lg:pb-0 overflow-x-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm text-zinc-800 no-underline hover:bg-zinc-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="flex items-center gap-2">
          {category ? (
            <span className="rounded-full border bg-white px-3 py-2 text-xs font-medium text-zinc-700">
              {category}
            </span>
          ) : null}
          <span className="rounded-full border bg-white px-3 py-2 text-xs font-medium text-zinc-700">
            {typeLabel}
          </span>
        </div>
      </div>

      {/* Mobile-first layout */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Media */}
        <div className="lg:col-span-3 min-w-0">
          <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
            <div className="relative w-full overflow-hidden bg-zinc-100">
              {/* ✅ stable aspect ratio prevents mobile overshoot */}
              <div className="relative aspect-[4/3] w-full">
                <ListingImage
                  src={primaryImage}
                  alt={`${title} photo`}
                  className={[
                    "h-full w-full object-cover",
                    isUnavailable ? "" : "transition-transform duration-200",
                  ].join(" ")}
                />

                {/* Status */}
                {isSold ? (
                  <div className="absolute left-3 top-3">
                    <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                      SOLD
                    </span>
                  </div>
                ) : isInactive ? (
                  <div className="absolute left-3 top-3">
                    <span className="rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white">
                      INACTIVE
                    </span>
                  </div>
                ) : null}

                {/* Badges */}
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  <span className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-zinc-800 backdrop-blur">
                    {typeLabel}
                  </span>
                  {listing.negotiable ? (
                    <span className="rounded-full bg-black/80 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
                      Negotiable
                    </span>
                  ) : null}
                </div>

                {/* Gallery indicator */}
                {hasGallery ? (
                  <div className="absolute bottom-3 right-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-zinc-800 backdrop-blur">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {images.length}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* ✅ lightweight gallery thumbnails (no JS carousel) */}
              {hasGallery ? (
                <div className="border-t bg-white p-3">
                  <p className="text-xs font-semibold text-zinc-700">More photos</p>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                    <style>{`div::-webkit-scrollbar{display:none}`}</style>
                    {images.map((src, i) => (
                      <a
                        key={`${src}-${i}`}
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        className="relative h-16 w-20 shrink-0 overflow-hidden rounded-2xl border bg-zinc-100"
                        title="Open image"
                      >
                        <ListingImage src={src} alt={`${title} photo ${i + 1}`} className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Similar listings */}
          {similar.length ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {category ? "More like this" : "Latest listings"}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {category ? "Similar items you might like." : "Fresh items from the marketplace."}
                  </p>
                </div>

                <Link
                  href={category ? `/explore?category=${encodeURIComponent(category)}` : "/explore"}
                  className="text-xs font-medium text-zinc-800 hover:underline"
                >
                  See more
                </Link>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1 pr-4 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:overflow-visible lg:pr-0">
                <style>{`div::-webkit-scrollbar{display:none}`}</style>

                {similar.map((s) => {
                  const sTitle = safeText(s.title) || "Untitled listing";
                  const sPrice =
                    s.price !== null ? formatNaira(s.price) : safeText(s.price_label) || "Contact for price";
                  const sType = s.listing_type === "product" ? "Product" : "Service";

                  return (
                    <Link
                      key={s.id}
                      href={`/listing/${s.id}`}
                      className="min-w-[220px] overflow-hidden rounded-3xl border bg-white no-underline shadow-sm hover:bg-zinc-50 lg:min-w-0"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
                        <ListingImage
                          src={pickImage(s.image_url)}
                          alt={`${sTitle} photo`}
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute right-3 top-3 flex items-center gap-2">
                          <span className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-zinc-800 backdrop-blur">
                            {sType}
                          </span>
                          {s.negotiable ? (
                            <span className="rounded-full bg-black/80 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
                              Negotiable
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-1 p-3">
                        <p className="line-clamp-1 text-sm font-semibold text-zinc-900">{sTitle}</p>
                        <p className="text-xs font-semibold text-zinc-900">{sPrice}</p>
                        <p className="line-clamp-1 text-xs text-zinc-500">{safeText(s.location) || "—"}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Details */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {/* Listing details */}
          <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
            {isUnavailable ? (
              <div
                className={[
                  "mb-3 rounded-2xl border px-3 py-2",
                  isSold ? "border-red-200 bg-red-50" : "border-zinc-200 bg-zinc-50",
                ].join(" ")}
              >
                <p
                  className={[
                    "text-sm font-semibold",
                    isSold ? "text-red-700" : "text-zinc-800",
                  ].join(" ")}
                >
                  {isSold ? "This listing is sold" : "This listing is inactive"}
                </p>
                <p className="text-xs text-zinc-600">
                  You can still browse similar items below or return to Explore.
                </p>
              </div>
            ) : null}

            <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>

            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-2xl font-extrabold text-zinc-900">{priceText}</p>

              <div className="text-right text-xs text-zinc-500">
                {listing.location ? (
                  <div className="inline-flex items-center justify-end gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{listing.location}</span>
                  </div>
                ) : (
                  <div className="truncate">—</div>
                )}

                {postedAt ? (
                  <div className="mt-1 inline-flex items-center justify-end gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{postedAt}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                {typeLabel}
              </span>
              {category ? (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  {category}
                </span>
              ) : null}
              {listing.negotiable ? (
                <span className="rounded-full bg-black px-2.5 py-1 text-xs font-semibold text-white">
                  Negotiable
                </span>
              ) : null}
            </div>

            {/* ✅ Fixed: no duplicated description on expand */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-zinc-700">Description</p>

              {desc ? (
                <div className="mt-2 rounded-2xl border bg-zinc-50 p-3">
                  {!descLong ? (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">{desc}</p>
                  ) : (
                    <details>
                      <summary className="cursor-pointer select-none">
                        <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700 line-clamp-4">
                          {desc}
                        </p>
                        <span className="mt-2 inline-block text-sm font-semibold text-zinc-900">
                          Read more
                        </span>
                      </summary>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">
                        {desc}
                      </p>
                    </details>
                  )}
                </div>
              ) : (
                <div className="mt-2 rounded-2xl border bg-zinc-50 p-3">
                  <p className="text-sm text-zinc-700">No description yet. Contact the seller for details.</p>
                </div>
              )}
            </div>

            {/* Share row */}
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={shareWa}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                title="Share on WhatsApp"
              >
                <Share2 className="h-4 w-4" />
                Share
              </a>

              <Link
                href={`/report?listing=${listing.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
              >
                <Flag className="h-4 w-4" />
                Report
              </Link>
            </div>
          </div>

          {/* Seller / Provider */}
          <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-700">Seller / Provider</p>

                <div className="mt-1 flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-900">{sellerName}</p>

                  {isVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black px-2 py-1 text-[10px] font-semibold text-white">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Verified
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-700">
                      Unverified
                    </span>
                  )}
                </div>

                <div className="mt-1 space-y-1 text-xs text-zinc-500">
                  <p>WhatsApp: {hasWhatsApp ? `+${isVerified ? whatsappDigits : maskNumber(whatsappDigits)}` : "—"}</p>
                  <p>Phone: {hasPhone ? `+${isVerified ? phoneDigits : maskNumber(phoneDigits)}` : "—"}</p>
                  {safeText(vendor?.location) ? (
                    <p className="line-clamp-1">Location: {vendor?.location}</p>
                  ) : null}
                </div>
              </div>

              {vendorId && isVerified ? (
                <Link
                  href={`/vendors/${vendorId}`}
                  className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                >
                  <Store className="h-4 w-4" />
                  Shop
                </Link>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-500">
                  <Store className="h-4 w-4" />
                  Shop locked
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {!isUnavailable && hasWhatsApp ? (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white no-underline hover:bg-zinc-800"
                >
                  WhatsApp seller
                </a>
              ) : (
                <span className="col-span-2 inline-flex items-center justify-center rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-500">
                  WhatsApp unavailable
                </span>
              )}

              {canCall ? (
                <a
                  href={`tel:+${callDigits}`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                >
                  <Phone className="h-4 w-4" />
                  Call
                </a>
              ) : (
                <span className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-400">
                  <Phone className="h-4 w-4" />
                  Call
                </span>
              )}

              {deliveryEligible ? (
                <Link
                  href={`/couriers?listing=${listing.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                >
                  <Truck className="h-4 w-4" />
                  Delivery
                </Link>
              ) : (
                <span className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-400">
                  <Truck className="h-4 w-4" />
                  Delivery
                </span>
              )}
            </div>

            {!isVerified ? (
              <div className="mt-3 rounded-2xl border bg-zinc-50 p-3">
                <p className="text-xs font-semibold text-zinc-800">Safety note</p>
                <p className="mt-1 text-xs text-zinc-600">
                  This seller is not verified. Prefer meeting in public places and avoid full prepayment.
                </p>
              </div>
            ) : null}

            <p className="mt-3 text-xs text-zinc-500">
              Tip: Meet in a public place. Inspect items before paying. Avoid full prepayment.
            </p>
          </div>

          {/* Owner actions (edit/mark sold/etc.) */}
          <OwnerActions
            listingId={listing.id}
            listingVendorId={listing.vendor_id}
            status={listing.status}
          />

          {/* Safety tips */}
          <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm font-semibold text-zinc-900">Safety tips</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-600">
              <li>Meet in a public place on/around campus.</li>
              <li>Inspect item before paying. Avoid full prepayment.</li>
              <li>For services, agree on price and timeline upfront.</li>
              <li>Report suspicious listings to help keep the market safe.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Mobile bottom action bar (clear hierarchy) */}
      <div className="fixed bottom-16 left-0 right-0 z-40 px-4 lg:hidden">
        <div className="mx-auto max-w-6xl rounded-3xl border bg-white/90 p-2 shadow-lg backdrop-blur">
          <div className="grid grid-cols-2 gap-2">
            {!isUnavailable && hasWhatsApp ? (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="col-span-2 inline-flex items-center justify-center rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white no-underline hover:bg-zinc-800"
              >
                WhatsApp seller
              </a>
            ) : (
              <span className="col-span-2 inline-flex items-center justify-center rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-500">
                WhatsApp unavailable
              </span>
            )}

            <Link
              href={`/report?listing=${listing.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
            >
              <Flag className="h-4 w-4" />
              Report
            </Link>

            <a
              href={shareWa}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
              title="Share on WhatsApp"
            >
              <Share2 className="h-4 w-4" />
              Share
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
