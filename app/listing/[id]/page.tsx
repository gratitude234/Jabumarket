// app/listing/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ListingRow, VendorRow } from "@/lib/types";
import OwnerActions from "@/components/listing/OwnerActions";
import AskSellerButton from "@/components/listing/AskSellerButton";
import RequestCallbackButton from "@/components/listing/RequestCallbackButton";
import { VendorRatingBadge } from "@/components/vendor/VendorReviews";
import BackButton from "@/components/listing/BackButton";
import {
  ListingContactActions,
  ListingViewTracker,
  ShareButton,
} from "@/components/listing/ListingStatsClient";
import ListingGallery from "@/components/listing/ListingGallery";
import ListingImage from "@/components/ListingImage";
import { ArrowLeft, ArrowRight, BadgeCheck, Clock, Eye, MapPin, Truck, Bookmark } from "lucide-react";

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

function isFoodLike(listing: ListingRow, vendor?: VendorRow | null) {
  const cat = String((listing as any).category ?? "").toLowerCase();
  const vt = String(vendor?.vendor_type ?? "").toLowerCase();
  return cat === "food" || vt === "food";
}

function truncateText(input: string, max = 160) {
  const s = String(input ?? "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

async function getSiteOrigin() {
  // Prefer env (stable across builds)
  const envBase = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, "");

  // Fallback: derive from request headers (works on Vercel / SSR)
  const h = await headers();
  const host =
    h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  const proto =
    h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (!host) return "";
  return `${proto}://${host}`;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { id } = await params;

  const { data } = await supabase
    .from("listings")
    .select("id,title,description,image_url,price_label,price,location")
    .eq("id", id)
    .maybeSingle();

  const origin = await getSiteOrigin();
  const url = origin ? `${origin}/listing/${id}` : `/listing/${id}`;

  if (!data) {
    return {
      title: "Listing — Jabumarket",
      description: "See listing details on Jabumarket.",
      alternates: { canonical: url },
      openGraph: {
        title: "Listing — Jabumarket",
        description: "See listing details on Jabumarket.",
        url,
        siteName: "Jabumarket",
        type: "website",
      },
      twitter: { card: "summary_large_image" },
    };
  }

  const t = data.title ? `${data.title} — Jabumarket` : "Listing — Jabumarket";
  const d = data.description
    ? truncateText(data.description, 160)
    : "See listing details on Jabumarket.";

  const images = data.image_url ? [data.image_url] : undefined;

  return {
    title: t,
    description: d,
    alternates: { canonical: url },
    openGraph: {
      title: t,
      description: d,
      url,
      siteName: "Jabumarket",
      type: "website",
      images,
    },
    twitter: images
      ? { card: "summary_large_image", title: t, description: d, images }
      : { card: "summary_large_image", title: t, description: d },
  };
}

export default async function ListingPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { id } = await params;

  const { data, error } = await supabase
    .from("listings")
    .select(
      `
      id,title,description,listing_type,category,price,price_label,location,image_url,image_urls,negotiable,status,created_at,vendor_id,
      vendor:vendors(id,name,whatsapp,phone,verified,vendor_type,location)
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  // Supabase join shape can vary:
  // - sometimes `vendor` is an object
  // - sometimes it's an array
  // Normalize + fallback fetch by vendor_id.
  const row = data as ListingRow & { vendor?: any };
  const joinedVendor = (row as any).vendor;

  let vendor: VendorRow | null =
    Array.isArray(joinedVendor) ? joinedVendor[0] ?? null : joinedVendor ?? null;

  if (!vendor && (row as any).vendor_id) {
    const { data: v2 } = await supabase
      .from("vendors")
      .select("id,name,whatsapp,phone,verified,vendor_type,location")
      .eq("id", (row as any).vendor_id)
      .maybeSingle();
    vendor = (v2 as any) ?? null;
  }

  const listing: ListingRow & { vendor?: VendorRow | null } = {
    ...(row as ListingRow),
    vendor,
  };

  const isSold = listing.status === "sold";
  const isInactive = listing.status === "inactive";
  const isActive = listing.status === "active";
  const isVerified = Boolean(vendor?.verified);

  const postedAt = formatDateTime(listing.created_at);

  const priceText =
    listing.price !== null
      ? formatNaira(listing.price)
      : listing.price_label?.trim() || "Contact for price";

  const typeLabel = listing.listing_type === "product" ? "Product" : "Service";
  const isFoodListing = isFoodLike(listing, vendor);

  const heroSrc = listing.image_url?.trim() || "/images/placeholder.svg";

  // Similar listings — ranked by relevance, not just recency.
  // Strategy: same category + price within ±60% of current price, ordered by
  // view count descending so popular items surface first. Falls back to
  // same-category newest if no price is set, and to all-category if no matches.
  const categorySafe = String((listing as any).category ?? "").trim();
  const currentPrice = typeof listing.price === "number" ? listing.price : null;

  let similar: ListingRow[] = [];

  if (categorySafe.length > 0) {
    // Base query — same category, not this listing, active
    let simQ = supabase
      .from("listings")
      .select(
        "id,title,price,price_label,image_url,category,listing_type,location,status,created_at,negotiable"
      )
      .neq("id", listing.id)
      .eq("status", "active")
      .eq("category", categorySafe);

    // Apply price proximity filter when we have a numeric price
    if (currentPrice !== null && currentPrice > 0) {
      const minP = Math.floor(currentPrice * 0.4);
      const maxP = Math.ceil(currentPrice * 1.6);
      simQ = simQ.gte("price", minP).lte("price", maxP);
    }

    // Join listing_stats to order by views — most-viewed similar items first
    const { data: simData } = await simQ
      .order("created_at", { ascending: false })
      .limit(12); // fetch more, then sort + trim client-side

    if (simData && simData.length > 0) {
      const simIds = simData.map((r: any) => r.id);
      const { data: simStats } = await supabase
        .from("listing_stats")
        .select("listing_id, views")
        .in("listing_id", simIds);

      const viewMap: Record<string, number> = {};
      for (const s of simStats ?? []) viewMap[s.listing_id] = Number(s.views ?? 0);

      similar = (simData as ListingRow[])
        .sort((a, b) => (viewMap[b.id] ?? 0) - (viewMap[a.id] ?? 0))
        .slice(0, 6);
    }

    // Fallback 1: same category without price filter (if price-scoped returned nothing)
    if (similar.length === 0 && currentPrice !== null) {
      const { data: fallback1 } = await supabase
        .from("listings")
        .select("id,title,price,price_label,image_url,category,listing_type,location,status,created_at,negotiable")
        .neq("id", listing.id)
        .eq("status", "active")
        .eq("category", categorySafe)
        .order("created_at", { ascending: false })
        .limit(6);
      similar = (fallback1 ?? []) as ListingRow[];
    }
  }

  // Fallback 2: newest active listings across all categories
  if (similar.length === 0) {
    const { data: fallback2 } = await supabase
      .from("listings")
      .select("id,title,price,price_label,image_url,category,listing_type,location,status,created_at,negotiable")
      .neq("id", listing.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6);
    similar = (fallback2 ?? []) as ListingRow[];
  }

  // Fetch view count + more-from-seller + similar items — all in parallel
  const [statsRes, moreFromSellerRes, similarItemsRes, soldSimilarRes] = await Promise.all([
    supabase
      .from("listing_stats")
      .select("views, saves")
      .eq("listing_id", listing.id)
      .maybeSingle(),
    listing.vendor_id
      ? supabase
          .from("listings")
          .select("id, title, price, price_label, category, image_url, negotiable, status")
          .eq("vendor_id", listing.vendor_id)
          .neq("id", listing.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [] }),
    categorySafe
      ? supabase
          .from("listings")
          .select("id, title, price, price_label, category, image_url, negotiable, status")
          .eq("category", categorySafe)
          .neq("id", listing.id)
          .neq("vendor_id", listing.vendor_id ?? "")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [] }),
    isSold && categorySafe
      ? supabase
          .from("listings")
          .select("id, title, price, price_label, category, image_url, negotiable")
          .eq("category", categorySafe)
          .eq("status", "active")
          .neq("id", listing.id)
          .order("created_at", { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [] }),
  ]);

  const viewCount: number = (statsRes.data as any)?.views ?? 0;
  const saveCount: number = (statsRes.data as any)?.saves ?? 0;
  const moreFromSeller = (moreFromSellerRes.data ?? []) as ListingRow[];
  const similarItems = (similarItemsRes.data ?? []) as ListingRow[];
  const soldSimilar = (soldSimilarRes.data ?? []) as { id: string; title: string; price: number | null; price_label: string | null; image_url: string | null }[];

  // ✅ Improved share link & message (absolute URL + helpful details)
  const origin = await getSiteOrigin();
  const listingUrl = origin
    ? `${origin}/listing/${listing.id}?utm_source=share`
    : `/listing/${listing.id}`;

  const shareTitle = listing.title?.trim() || "Listing on Jabumarket";
  const shareLocation = (listing.location ?? vendor?.location ?? "")
    .toString()
    .trim();

  const shareTextLines = [
    `Check this on Jabumarket: ${shareTitle}`,
    `Price: ${priceText}`,
    shareLocation ? `Location: ${shareLocation}` : null,
    `View: ${listingUrl}`,
  ].filter(Boolean) as string[];

  const shareText = shareTextLines.join("\n");

  const desc = String(listing.description ?? "").trim();
  const longDesc = desc.length > 220;

  return (
    <div className="space-y-4 pb-28 lg:pb-0 overflow-x-hidden">
      <ListingViewTracker listingId={listing.id} title={listing.title ?? undefined} />

      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <BackButton />

        <div className="flex items-center gap-2">
          {categorySafe ? (
            <span className="max-w-[42vw] truncate rounded-full border bg-white px-3 py-2 text-xs font-medium text-zinc-700">
              {categorySafe}
            </span>
          ) : null}
          <span className="rounded-full border bg-white px-3 py-2 text-xs font-medium text-zinc-700">
            {typeLabel}
          </span>
          <ShareButton
            title={shareTitle}
            text={shareText}
            url={listingUrl}
            variant="icon"
          />
        </div>
      </div>

      {/* Mobile-first layout */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Media + similar */}
        <div className="lg:col-span-3 min-w-0">
          {/* Build the resolved image list: prefer image_urls array, fall back to image_url */}
          {(() => {
            const rawUrls = (listing as any).image_urls as string[] | null | undefined;
            const galleryImages: string[] =
              Array.isArray(rawUrls) && rawUrls.length > 0
                ? rawUrls.filter(Boolean)
                : listing.image_url?.trim()
                ? [listing.image_url.trim()]
                : [];

            const statusBadge = isSold ? (
              <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                SOLD
              </span>
            ) : isInactive ? (
              <span className="rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white">
                INACTIVE
              </span>
            ) : undefined;

            const cornerBadges = (
              <>
                <span className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium text-zinc-800 backdrop-blur">
                  {typeLabel}
                </span>
                {listing.negotiable ? (
                  <span className="rounded-full bg-black/80 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
                    Negotiable
                  </span>
                ) : null}
              </>
            );

            if (galleryImages.length === 0) {
              // No images at all — render placeholder
              return (
                <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                  <div className="relative w-full bg-zinc-100 overflow-hidden h-[40svh] max-h-[260px] min-h-[200px] sm:h-[340px] lg:h-[420px] flex items-center justify-center text-zinc-300">
                    {statusBadge ? <div className="absolute left-3 top-3">{statusBadge}</div> : null}
                    <div className="absolute right-3 top-3 flex items-center gap-2">{cornerBadges}</div>
                    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                </div>
              );
            }

            return (
              <ListingGallery
                images={galleryImages}
                alt={listing.title ?? "Listing"}
                statusBadge={statusBadge}
                cornerBadges={cornerBadges}
              />
            );
          })()}

          {/* Similar listings */}
          <div className="mt-4 space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {similar.length ? "More like this" : "Explore more"}
                </p>
                <p className="text-xs text-zinc-600">
                  {similar.length
                    ? categorySafe
                      ? "Newest in the same category."
                      : "Newest listings right now."
                    : "No similar listings yet — try Explore."}
                </p>
              </div>

              {categorySafe ? (
                <Link
                  href={`/explore?category=${encodeURIComponent(categorySafe)}`}
                  className="text-xs font-medium text-zinc-800 hover:underline"
                >
                  See more
                </Link>
              ) : (
                <Link
                  href="/explore"
                  className="text-xs font-medium text-zinc-800 hover:underline"
                >
                  Explore
                </Link>
              )}
            </div>

            {similar.length ? (
              <div className="flex gap-3 overflow-x-auto pb-1 pr-4 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:overflow-visible lg:pr-0">
                <style>{`div::-webkit-scrollbar{display:none}`}</style>

                {similar.map((s) => {
                  const sType =
                    s.listing_type === "product" ? "Product" : "Service";
                  const sSold = s.status === "sold";
                  const sInactive2 = s.status === "inactive";
                  const sImg = s.image_url?.trim() || "/images/placeholder.svg";

                  return (
                    <Link
                      key={s.id}
                      href={`/listing/${s.id}`}
                      className={[
                        "min-w-[220px] overflow-hidden rounded-2xl border bg-white no-underline shadow-sm hover:bg-zinc-50 lg:min-w-0",
                        sSold || sInactive2 ? "opacity-80" : "",
                      ].join(" ")}
                    >
                      <div className="relative aspect-[4/3] bg-zinc-100 overflow-hidden">
                        <ListingImage
                          src={sImg}
                          alt={s.title ?? "Listing image"}
                          className="h-full w-full object-cover"
                        />

                        {sSold ? (
                          <div className="absolute left-3 top-3">
                            <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                              SOLD
                            </span>
                          </div>
                        ) : sInactive2 ? (
                          <div className="absolute left-3 top-3">
                            <span className="rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white">
                              INACTIVE
                            </span>
                          </div>
                        ) : null}

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
                        <p className="line-clamp-1 text-sm font-semibold text-zinc-900">
                          {s.title ?? "Untitled listing"}
                        </p>
                        <p className="text-xs font-semibold text-zinc-900">
                          {s.price !== null
                            ? formatNaira(s.price)
                            : s.price_label?.trim() || "Contact for price"}
                        </p>
                        <p className="line-clamp-1 text-xs text-zinc-500">
                          {s.location ?? "—"}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
                <p className="font-semibold text-zinc-900">
                  Nothing similar yet.
                </p>
                <p className="mt-1 text-xs">
                  Try browsing Explore to find more listings.
                </p>
                <Link
                  href="/explore"
                  className="mt-3 inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-2 text-xs font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                >
                  Go to Explore
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
            {isSold ? (
              <>
                <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-sm font-semibold text-red-700">
                    This listing is sold
                  </p>
                  <p className="text-xs text-red-700/80">
                    Browse similar items below or return to Explore.
                  </p>
                </div>

                <div className="mb-4 rounded-3xl border bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-900">
                    This item has been sold
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    Looking for something similar?
                  </p>
                  <Link
                    href={`/explore?category=${encodeURIComponent(listing.category ?? "")}`}
                    className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 no-underline"
                  >
                    Browse {listing.category ?? "similar"} listings
                    <ArrowRight className="h-4 w-4" />
                  </Link>

                  {soldSimilar.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {soldSimilar.map((s) => (
                        <Link
                          key={s.id}
                          href={`/listing/${s.id}`}
                          className="overflow-hidden rounded-2xl border bg-white hover:bg-zinc-50 no-underline"
                        >
                          <div className="aspect-[4/3] bg-zinc-100">
                            {s.image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={s.image_url}
                                alt={s.title ?? ""}
                                className="h-full w-full object-cover"
                              />
                            )}
                          </div>
                          <div className="p-2">
                            <p className="line-clamp-1 text-xs font-semibold text-zinc-900">
                              {s.title}
                            </p>
                            <p className="text-xs font-bold text-zinc-900">
                              {s.price !== null
                                ? `₦${s.price.toLocaleString("en-NG")}`
                                : s.price_label ?? "Contact"}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : isInactive ? (
              <div className="mb-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                <p className="text-sm font-semibold text-zinc-800">
                  This listing is inactive
                </p>
                <p className="text-xs text-zinc-600">
                  It may be temporarily unavailable.
                </p>
              </div>
            ) : null}

            <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
              {listing.title ?? "Untitled listing"}
            </h1>

            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-2xl font-extrabold text-zinc-900">
                {priceText}
              </p>

              <div className="text-right text-xs text-zinc-500">
                {listing.location ? (
                  <div className="inline-flex items-center justify-end gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="max-w-[44vw] truncate sm:max-w-none">
                      {listing.location}
                    </span>
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

                {viewCount > 0 ? (
                  <div className="mt-1 inline-flex items-center justify-end gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    <span>{viewCount.toLocaleString()} {viewCount === 1 ? "view" : "views"}</span>
                  </div>
                ) : null}

                {saveCount > 0 ? (
                  <div className="mt-1 inline-flex items-center justify-end gap-1">
                    <Bookmark className="h-3.5 w-3.5" />
                    <span>{saveCount.toLocaleString()} {saveCount === 1 ? "save" : "saves"}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                {typeLabel}
              </span>
              {categorySafe ? (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  {categorySafe}
                </span>
              ) : null}
              {listing.negotiable ? (
                <span className="rounded-full bg-black px-2.5 py-1 text-xs font-semibold text-white">
                  Negotiable
                </span>
              ) : null}
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-zinc-700">Description</p>

              {desc ? (
                <div className="mt-2 rounded-2xl border bg-zinc-50 p-3">
                  <p
                    className={[
                      "text-sm leading-relaxed text-zinc-700",
                      longDesc ? "line-clamp-5" : "",
                    ].join(" ")}
                  >
                    {desc}
                  </p>

                  {longDesc ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
                        Read full description
                      </summary>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">
                        {desc}
                      </p>
                    </details>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 rounded-2xl border bg-zinc-50 p-3 text-sm text-zinc-600">
                  No description yet. Contact the seller for more details.
                </div>
              )}
            </div>

            {/* Seller info card */}
            {vendor ? (
              <div className="mt-4 rounded-2xl border bg-zinc-50 p-3">
                <p className="mb-2 text-xs font-semibold text-zinc-500">Sold by</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/vendors/${vendor.id}`}
                    className="text-sm font-semibold text-zinc-900 no-underline hover:underline"
                  >
                    {vendor.name ?? "Vendor"}
                  </Link>

                  {isVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white">
                      <BadgeCheck className="h-3 w-3" />
                      Verified
                    </span>
                  ) : null}

                  {vendor.vendor_type === "mall" ? (
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      Campus Shop
                    </span>
                  ) : vendor.vendor_type === "student" ? (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-700">
                      Student seller
                    </span>
                  ) : vendor.vendor_type === "other" ? (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-700">
                      Vendor
                    </span>
                  ) : null}

                  <VendorRatingBadge vendorId={vendor.id} />
                </div>

                <Link
                  href={`/vendors/${vendor.id}#reviews`}
                  className="mt-2 inline-flex text-xs font-medium text-zinc-600 no-underline hover:text-zinc-900"
                >
                  View all reviews →
                </Link>
              </div>
            ) : null}

            {/* Contact / share */}
            <ListingContactActions
              listingId={listing.id}
              shareTitle={shareTitle}
              shareText={shareText}
              shareUrl={listingUrl}
              variant="desktop"
            />

            {/* In-app message + callback */}
            {listing.vendor_id ? (
              <>
                <AskSellerButton
                  listingId={listing.id}
                  vendorId={listing.vendor_id}
                  listingTitle={listing.title ?? undefined}
                  listingPrice={listing.price}
                  negotiable={listing.negotiable ?? false}
                  isSold={isSold}
                  className="mt-2"
                />
                {!isSold ? (
                  <div className="mt-2">
                    <RequestCallbackButton
                      vendorId={listing.vendor_id}
                      listingId={listing.id}
                      listingTitle={listing.title ?? undefined}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            {/* Delivery CTA — available on all active listings */}
            {!isSold && isActive ? (
              <div className="mt-2">
                <Link
                  href={`/delivery?listing=${listing.id}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                >
                  <Truck className="h-4 w-4" />
                  Request Delivery
                </Link>
                <p className="mt-1.5 text-xs text-zinc-400 text-center">
                  We&apos;ll connect you with a campus delivery rider
                </p>
              </div>
            ) : null}
          </div>

          <OwnerActions
            listingId={listing.id}
            listingVendorId={listing.vendor_id}
            status={listing.status}
          />

          <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
            <p className="text-sm font-semibold text-zinc-900">Safety tips</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-600">
              <li>Meet in a public place on/around campus.</li>
              <li>Inspect item before paying. Avoid full prepayment.</li>
              <li>For services, agree on price and timeline upfront.</li>
              <li>Report suspicious listings to help keep the market safe.</li>
            </ul>
          </div>

          {/* More from this seller */}
          {moreFromSeller.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-900">More from {vendor?.name ?? "this seller"}</p>
                {vendor ? (
                  <Link href={`/vendors/${vendor.id}`} className="text-xs font-medium text-zinc-600 no-underline hover:underline">
                    View all
                  </Link>
                ) : null}
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
                {moreFromSeller.map((s) => (
                  <Link
                    key={s.id}
                    href={`/listing/${s.id}`}
                    className="min-w-[140px] overflow-hidden rounded-2xl border bg-white no-underline shadow-sm hover:bg-zinc-50"
                  >
                    <div className="relative h-28 w-full bg-zinc-100 overflow-hidden">
                      {s.image_url ? (
                        <ListingImage src={s.image_url} alt={s.title ?? ""} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="p-2">
                      <p className="line-clamp-2 text-xs font-semibold text-zinc-900">{s.title ?? "Listing"}</p>
                      <p className="mt-1 text-xs font-bold text-zinc-900">
                        {s.price !== null ? `₦${s.price.toLocaleString("en-NG")}` : s.price_label?.trim() || "—"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* Similar items */}
          {similarItems.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-900">Similar items</p>
                {categorySafe ? (
                  <Link href={`/explore?category=${encodeURIComponent(categorySafe)}`} className="text-xs font-medium text-zinc-600 no-underline hover:underline">
                    See more
                  </Link>
                ) : null}
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
                {similarItems.map((s) => (
                  <Link
                    key={s.id}
                    href={`/listing/${s.id}`}
                    className="min-w-[140px] overflow-hidden rounded-2xl border bg-white no-underline shadow-sm hover:bg-zinc-50"
                  >
                    <div className="relative h-28 w-full bg-zinc-100 overflow-hidden">
                      {s.image_url ? (
                        <ListingImage src={s.image_url} alt={s.title ?? ""} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="p-2">
                      <p className="line-clamp-2 text-xs font-semibold text-zinc-900">{s.title ?? "Listing"}</p>
                      <p className="mt-1 text-xs font-bold text-zinc-900">
                        {s.price !== null ? `₦${s.price.toLocaleString("en-NG")}` : s.price_label?.trim() || "—"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile bottom action bar */}
      <div className="fixed bottom-16 left-0 right-0 z-40 px-4 lg:hidden">
        <div className="mx-auto max-w-6xl rounded-3xl border bg-white/90 p-2 shadow-lg backdrop-blur">
          <ListingContactActions
            listingId={listing.id}
            shareTitle={shareTitle}
            shareText={shareText}
            shareUrl={listingUrl}
            variant="mobile"
          />
          {listing.vendor_id ? (
            <>
              <AskSellerButton
                listingId={listing.id}
                vendorId={listing.vendor_id}
                listingTitle={listing.title ?? undefined}
                listingPrice={listing.price}
                negotiable={listing.negotiable ?? false}
                isSold={isSold}
                className="mt-2"
              />
              {!isSold ? (
                <div className="mt-2">
                  <RequestCallbackButton
                    vendorId={listing.vendor_id}
                    listingId={listing.id}
                    listingTitle={listing.title ?? undefined}
                  />
                </div>
              ) : null}
            </>
          ) : null}
          {!isSold && isActive ? (
            <Link
              href={`/delivery?listing=${listing.id}`}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
            >
              <Truck className="h-4 w-4" />
              Request Delivery
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}