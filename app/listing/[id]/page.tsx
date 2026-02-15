import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase/server";
import type { ListingRow, VendorRow } from "@/lib/types";
import OwnerActions from "@/components/listing/OwnerActions";

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function getWhatsAppLink(phone: string, text: string) {
  const safe = phone.replace(/[^\d]/g, "");
  const msg = encodeURIComponent(text);
  return `https://wa.me/${safe}?text=${msg}`;
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("listings")
    // ✅ include verified + vendor_type so we can display badge + gate shop link
    .select("*, vendor:vendors(id, name, whatsapp, verified, vendor_type)")
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  const listing = data as ListingRow & { vendor?: VendorRow | null };

  const priceText =
    listing.price !== null
      ? formatNaira(listing.price)
      : listing.price_label ?? "Contact for price";

  const typeLabel = listing.listing_type === "product" ? "Product" : "Service";

  const whatsapp = listing.vendor?.whatsapp ?? "2348012345678";
  const sellerName = listing.vendor?.name ?? "Unknown";
  const vendorId = listing.vendor?.id ?? listing.vendor_id;

  const isSold = listing.status === "sold";

  // ✅ verified flag (works even if vendor row is null)
  const isVerified = Boolean((listing.vendor as any)?.verified);

  const waText = `Hi, I'm interested in: ${listing.title} (on Jabumarket). Is it still available?`;
  const waLink = getWhatsAppLink(whatsapp, waText);

  return (
    <div className="space-y-4">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/explore"
          className="text-sm text-zinc-600 hover:text-black no-underline"
        >
          ← Back to Explore
        </Link>
        <span className="text-xs text-zinc-400">/</span>
        <span className="text-sm text-zinc-600">{listing.category}</span>
      </div>

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Image */}
        <div className="lg:col-span-3 overflow-hidden rounded-2xl border bg-white">
          <div className="aspect-[4/3] w-full bg-zinc-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                listing.image_url ??
                "https://placehold.co/1200x900?text=Jabumarket"
              }
              alt={listing.title}
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        {/* Details */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border bg-white p-4">
            {/* SOLD banner */}
            {isSold ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm font-semibold text-red-700">SOLD</p>
                <p className="text-xs text-red-700/80">
                  This item has been marked as sold by the seller.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                {typeLabel}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                {listing.category}
              </span>
              {listing.negotiable ? (
                <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs text-white">
                  Negotiable
                </span>
              ) : null}
            </div>

            <h1 className="mt-3 text-xl font-semibold">{listing.title}</h1>

            <div className="mt-2 flex items-end justify-between">
              <p className="text-lg font-bold">{priceText}</p>
              <div className="text-xs text-zinc-500 text-right">
                <div>{listing.location ?? "—"}</div>
                <div>
                  {listing.created_at
                    ? new Date(listing.created_at).toLocaleString()
                    : ""}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-sm text-zinc-700 leading-relaxed">
                {listing.description ??
                  "No description yet. Contact the seller for more details."}
              </p>
            </div>
          </div>

          {/* Seller card */}
          <div className="rounded-2xl border bg-white p-4">
            <p className="text-sm font-semibold">Seller / Provider</p>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                {/* ✅ Name + Verified badge */}
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-900">
                    {sellerName}
                  </p>
                  {isVerified ? (
                    <span className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] text-white">
                      Verified
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-700">
                      Not verified
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-500">WhatsApp: +{whatsapp}</p>
              </div>

              {/* WhatsApp CTA (hidden/disabled if sold) */}
              {isSold ? (
                <span className="rounded-xl bg-zinc-100 px-4 py-2 text-sm text-zinc-500">
                  Unavailable
                </span>
              ) : (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-black px-4 py-2 text-sm text-white no-underline"
                >
                  Chat on WhatsApp
                </a>
              )}
            </div>

            {/* ✅ ACTION BUTTONS */}
            <div className="mt-3 flex gap-2">
              {/* ✅ Only show shop link if verified */}
              {vendorId && isVerified ? (
                <Link
                  href={`/vendors/${vendorId}`}
                  className="w-full rounded-xl border px-4 py-2 text-center text-sm hover:bg-zinc-50 no-underline"
                >
                  View Shop
                </Link>
              ) : (
                <div className="w-full rounded-xl border px-4 py-2 text-center text-sm text-zinc-500">
                  Shop page available after verification
                </div>
              )}

              {/* ✅ Delivery CTA (hidden if sold) */}
              {isSold ? null : (
                <Link
                  href={`/delivery?listing=${listing.id}`}
                  className="w-full rounded-xl border px-4 py-2 text-center text-sm hover:bg-zinc-50 no-underline"
                >
                  Request Delivery
                </Link>
              )}

              {/* Call CTA (hidden if sold) */}
              {isSold ? null : (
                <a
                  href={`tel:+${whatsapp}`}
                  className="w-full rounded-xl border px-4 py-2 text-center text-sm text-black no-underline hover:bg-zinc-50"
                >
                  Call
                </a>
              )}

              <Link
                href={`/report?listing=${listing.id}`}
                className="w-full rounded-xl border px-4 py-2 text-center text-sm hover:bg-zinc-50 no-underline"
              >
                Report
              </Link>
            </div>

            {isSold ? (
              <p className="mt-3 text-xs text-zinc-500">
                This listing is sold, so contact options are disabled.
              </p>
            ) : null}
          </div>

          <OwnerActions
            listingId={listing.id}
            listingVendorId={listing.vendor_id}
            status={listing.status}
          />

          {/* Safety tips */}
          <div className="rounded-2xl border bg-white p-4">
            <p className="text-sm font-semibold">Safety tips</p>
            <ul className="mt-2 space-y-2 text-sm text-zinc-600 list-disc pl-5">
              <li>Meet in a public place on/around campus.</li>
              <li>Inspect item before paying. Avoid full prepayment.</li>
              <li>For services, agree on price and timeline upfront.</li>
              <li>Report suspicious listings to help keep the market safe.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Sticky CTA (mobile) */}
      {!isSold ? (
        <div className="lg:hidden fixed bottom-16 left-0 right-0 z-40 px-4">
          <div className="mx-auto max-w-6xl">
            <div className="flex gap-2">
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center rounded-2xl bg-black px-4 py-3 text-white font-medium no-underline shadow-sm"
              >
                Chat seller
              </a>

              <Link
                href={`/delivery?listing=${listing.id}`}
                className="flex-1 flex items-center justify-center rounded-2xl border bg-white px-4 py-3 text-black font-medium no-underline shadow-sm"
              >
                Delivery
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
