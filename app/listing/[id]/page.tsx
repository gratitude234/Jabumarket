// app/listing/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase/server";
import type { ListingRow, VendorRow } from "@/lib/types";
import OwnerActions from "@/components/listing/OwnerActions";
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
      vendor:vendors(id,name,whatsapp,verified,vendor_type,phone,location)
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  // ✅ Normalize `vendor` from VendorRow[] -> VendorRow | null
  const row = data as ListingRow & { vendor?: VendorRow[] | null };
  const listing: ListingRow & { vendor?: VendorRow | null } = {
    ...(row as ListingRow),
    vendor: row.vendor?.[0] ?? null,
  };

  const priceText =
    listing.price !== null
      ? formatNaira(listing.price)
      : listing.price_label ?? "Contact for price";

  const typeLabel = listing.listing_type === "product" ? "Product" : "Service";

  const isSold = listing.status === "sold";
  const isInactive = listing.status === "inactive";
  const isVerified = Boolean(listing.vendor?.verified);

  const sellerName = listing.vendor?.name ?? "Unknown";
  const vendorId = listing.vendor?.id ?? listing.vendor_id;

  const whatsappRaw = String(listing.vendor?.whatsapp ?? "").trim();
  const hasWhatsApp = whatsappRaw.length >= 8;
  const waText = `Hi, I'm interested in: ${listing.title} (on Jabumarket). Is it still available?`;
  const waLink = hasWhatsApp ? getWhatsAppLink(whatsappRaw, waText) : "";

  const isFoodListing =
    String(listing.category ?? "").toLowerCase() === "food" ||
    String(listing.vendor?.vendor_type ?? "").toLowerCase() === "food";

  const { data: similarData } = await supabase
    .from("listings")
    .select(
      "id,title,price,price_label,image_url,category,listing_type,location,status,created_at,negotiable"
    )
    .eq("category", listing.category ?? "")
    .neq("id", listing.id)
    .in("status", ["active"])
    .order("created_at", { ascending: false })
    .limit(6);

  const similar = (similarData ?? []) as ListingRow[];
  const postedAt = formatDateTime(listing.created_at);

  return (
    // ✅ FIX: prevent any horizontal overshoot on real phones
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
          {listing.category ? (
            <span className="rounded-full border bg-white px-3 py-2 text-xs font-medium text-zinc-700">
              {listing.category}
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
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            {/* ✅ FIX: responsive to viewport height so it never feels too tall */}
            <div className="relative w-full bg-zinc-100 overflow-hidden h-[40svh] max-h-[260px] min-h-[200px] sm:h-[340px] sm:max-h-none lg:h-[420px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  listing.image_url ??
                  "https://placehold.co/1200x900?text=Jabumarket"
                }
                alt={listing.title ?? "Listing"}
                className={[
                  "h-full w-full max-w-full object-cover",
                  isSold || isInactive ? "" : "transition-transform duration-200",
                ].join(" ")}
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
          {similar.length ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    More like this
                  </p>
                  <p className="text-xs text-zinc-600">
                    Newest in the same category.
                  </p>
                </div>
                <Link
                  href={`/explore?category=${encodeURIComponent(
                    String(listing.category ?? "")
                  )}`}
                  className="text-xs font-medium text-zinc-800 hover:underline"
                >
                  See more
                </Link>
              </div>

              {/* ✅ FIX: remove -mx-4 (it causes overflow on mobile) */}
              <div className="flex gap-3 overflow-x-auto pb-1 pr-4 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:overflow-visible lg:pr-0">
                <style>{`div::-webkit-scrollbar{display:none}`}</style>

                {similar.map((s) => {
                  const sType =
                    s.listing_type === "product" ? "Product" : "Service";
                  const sSold = s.status === "sold";
                  const sInactive2 = s.status === "inactive";

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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={
                            s.image_url ??
                            "https://placehold.co/1200x900?text=Jabumarket"
                          }
                          alt={s.title ?? "Listing"}
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
                            : s.price_label ?? "Contact for price"}
                        </p>
                        <p className="line-clamp-1 text-xs text-zinc-500">
                          {s.location ?? "—"}
                        </p>
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
          <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
            {isSold ? (
              <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm font-semibold text-red-700">
                  This listing is sold
                </p>
                <p className="text-xs text-red-700/80">
                  You can browse similar items below or return to Explore.
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
              {listing.category ? (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  {listing.category}
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
              <details className="mt-2 rounded-2xl border bg-zinc-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-zinc-900">
                  Tap to {`read ${listing.description ? "more" : "details"}`}
                </summary>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">
                  {listing.description ??
                    "No description yet. Contact the seller for more details."}
                </p>
              </details>
            </div>
          </div>

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
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">
                    Contact not available
                  </p>
                )}
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
              <Link
                href={`/report?listing=${listing.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
              >
                <Flag className="h-4 w-4" />
                Report
              </Link>

              {!isSold && hasWhatsApp ? (
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
                  Unavailable
                </span>
              )}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              {!isSold && hasWhatsApp ? (
                <a
                  href={`tel:+${whatsappRaw}`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                >
                  <Phone className="h-4 w-4" />
                  Call
                </a>
              ) : (
                <span className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-400">
                  Call
                </span>
              )}

              {!isSold && isFoodListing ? (
                <Link
                  href={`/couriers?listing=${listing.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                >
                  <Truck className="h-4 w-4" />
                  Delivery
                </Link>
              ) : (
                <span className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-400">
                  Delivery
                </span>
              )}
            </div>

            {isFoodListing && !isSold ? (
              <p className="mt-2 text-xs text-zinc-500">
                Tip: tell the courier your drop-off and budget before sending.
              </p>
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
        </div>
      </div>

      {/* Mobile bottom action bar */}
      <div className="fixed bottom-16 left-0 right-0 z-40 px-4 lg:hidden">
        <div className="mx-auto max-w-6xl rounded-3xl border bg-white/90 p-2 shadow-lg backdrop-blur">
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={`/report?listing=${listing.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
            >
              <Flag className="h-4 w-4" />
              Report
            </Link>

            {!isSold && hasWhatsApp ? (
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
                Unavailable
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
