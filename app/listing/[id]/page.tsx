// app/listing/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase/server";
import type { ListingRow, VendorRow } from "@/lib/types";
import OwnerActions from "@/components/listing/OwnerActions";
import { getWhatsAppLink } from "@/lib/whatsapp";
import ListingImage from "@/components/ListingImage";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  Flag,
  MapPin,
  Phone,
  Store,
  Truck,
  Share2,
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

function cleanDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/[^\d]/g, "");
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data } = await supabase
    .from("listings")
    .select("id,title,description,image_url,price_label")
    .eq("id", id)
    .single();

  if (!data) return { title: "Listing — Jabumarket" };

  const title = data.title
    ? `${data.title} — Jabumarket`
    : "Listing — Jabumarket";
  const description = data.description
    ? truncateText(data.description, 160)
    : "See listing details on Jabumarket.";

  const images = data.image_url ? [data.image_url] : undefined;

  return {
    title,
    description,
    openGraph: images
      ? { title, description, images }
      : { title, description },
    twitter: images
      ? { card: "summary_large_image", title, description, images }
      : undefined,
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("listings")
    .select(
      `
      id,title,description,listing_type,category,price,price_label,location,image_url,negotiable,status,created_at,vendor_id,
      vendor:vendors(id,name,whatsapp,phone,verified,vendor_type,location)
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  // Supabase join shape can vary by schema:
// - sometimes `vendor` comes back as an object
// - sometimes as an array (rare)
// Normalize defensively, and if it's missing, try a direct fetch by vendor_id.
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

  const sellerName = vendor?.name ?? "Unknown";
  const vendorId = vendor?.id ?? listing.vendor_id ?? null;

  const whatsappRaw = cleanDigits(vendor?.whatsapp);
  const phoneRaw = cleanDigits(vendor?.phone);
  const contactPhone = phoneRaw || whatsappRaw; // best effort fallback

  const hasWhatsApp = whatsappRaw.length >= 8;
  const hasPhone = contactPhone.length >= 8;

  const waText = `Hi, I'm interested in: ${listing.title} (on Jabumarket). Is it still available?`;
  const waLink = hasWhatsApp ? getWhatsAppLink(whatsappRaw, waText) : "";

  const postedAt = formatDateTime(listing.created_at);

  const priceText =
    listing.price !== null
      ? formatNaira(listing.price)
      : listing.price_label?.trim() || "Contact for price";

  const typeLabel = listing.listing_type === "product" ? "Product" : "Service";
  const isFoodListing = isFoodLike(listing, vendor);

  const heroSrc = listing.image_url?.trim() || "/images/placeholder.svg";

  // Better "similar": if category is missing/empty, fallback to latest active listings.
  const categorySafe = String((listing as any).category ?? "").trim();
  const similarQuery = supabase
    .from("listings")
    .select(
      "id,title,price,price_label,image_url,category,listing_type,location,status,created_at,negotiable"
    )
    .neq("id", listing.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(6);

  const { data: similarData } =
    categorySafe.length > 0
      ? await similarQuery.eq("category", categorySafe)
      : await similarQuery;

  const similar = (similarData ?? []) as ListingRow[];

  // Share link (works even without client-side Web Share API)
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
  const listingUrl = base ? `${base}/listing/${listing.id}` : `/listing/${listing.id}`;
  const shareText = `Check this on Jabumarket: ${listing.title}\n${listingUrl}`;
  const waShareLink = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const desc = String(listing.description ?? "").trim();
  const longDesc = desc.length > 220;

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
          {categorySafe ? (
            <span className="max-w-[42vw] truncate rounded-full border bg-white px-3 py-2 text-xs font-medium text-zinc-700">
              {categorySafe}
            </span>
          ) : null}
          <span className="rounded-full border bg-white px-3 py-2 text-xs font-medium text-zinc-700">
            {typeLabel}
          </span>
        </div>
      </div>

      {/* Mobile-first layout */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Media + similar */}
        <div className="lg:col-span-3 min-w-0">
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="relative w-full bg-zinc-100 overflow-hidden h-[40svh] max-h-[260px] min-h-[200px] sm:h-[340px] sm:max-h-none lg:h-[420px]">
              <ListingImage
                src={heroSrc}
                alt={listing.title ?? "Listing image"}
                className="h-full w-full max-w-full object-cover"
              />

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
            </div>
          </div>

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
                <p className="font-semibold text-zinc-900">Nothing similar yet.</p>
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
              <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm font-semibold text-red-700">
                  This listing is sold
                </p>
                <p className="text-xs text-red-700/80">
                  Browse similar items below or return to Explore.
                </p>
              </div>
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
              <p className="text-2xl font-extrabold text-zinc-900">{priceText}</p>

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

            {/* Quick share */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a
                href={waShareLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
              >
                <Share2 className="h-4 w-4" />
                Share
              </a>

              <Link
                href={`/report?listing=${listing.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
              >
                <Flag className="h-4 w-4" />
                Report
              </Link>
            </div>
          </div>

          {/* Seller */}
          <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-700">
                  Seller / Provider
                </p>

                <div className="mt-1 flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {sellerName}
                  </p>
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

                {hasWhatsApp ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    WhatsApp: +{whatsappRaw}
                  </p>
                ) : hasPhone ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Phone: +{contactPhone}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">
                    Contact not available
                  </p>
                )}

                {!isVerified ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Tip: For unverified sellers, avoid full prepayment. Meet in a
                    public place.
                  </p>
                ) : null}
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

            <div className="mt-4 grid grid-cols-2 gap-2">
              {!isSold && isActive && hasWhatsApp ? (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white no-underline hover:bg-zinc-800"
                >
                  WhatsApp
                </a>
              ) : (
                <span className="inline-flex items-center justify-center rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-500">
                  WhatsApp
                </span>
              )}

              {!isSold && isActive && hasPhone ? (
                <a
                  href={`tel:+${contactPhone}`}
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
            </div>

            <div className="mt-2">
              {!isSold && isActive && isFoodListing ? (
                <Link
                  href={`/couriers?listing=${listing.id}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                >
                  <Truck className="h-4 w-4" />
                  Request Delivery
                </Link>
              ) : (
                <div className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-400">
                  <Truck className="h-4 w-4" />
                  Delivery not available
                </div>
              )}

              {isFoodListing && !isSold && isActive ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Tip: tell the driver your drop-off and budget before sending.
                </p>
              ) : null}
            </div>
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
        </div>
      </div>

      {/* Mobile bottom action bar */}
      <div className="fixed bottom-16 left-0 right-0 z-40 px-4 lg:hidden">
        <div className="mx-auto max-w-6xl rounded-3xl border bg-white/90 p-2 shadow-lg backdrop-blur">
          <div className="grid grid-cols-2 gap-2">
            {!isSold && isActive && hasWhatsApp ? (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white no-underline hover:bg-zinc-800"
              >
                WhatsApp
              </a>
            ) : (
              <span className="inline-flex items-center justify-center rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-500">
                WhatsApp
              </span>
            )}

            {!isSold && isActive && hasPhone ? (
              <a
                href={`tel:+${contactPhone}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
              >
                <Phone className="h-4 w-4" />
                Call
              </a>
            ) : (
              <Link
                href={`/report?listing=${listing.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
              >
                <Flag className="h-4 w-4" />
                Report
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
