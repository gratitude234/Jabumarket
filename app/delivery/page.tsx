// app/delivery/page.tsx
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ListingRow, VendorRow, RiderRow } from "@/lib/types";
import DeliveryClient from "./DeliveryClient";

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    zone?: string;
    availability?: string; // "available" | "busy" | "all"
    verified?: string; // "1" | "0"
    listing?: string;
    dropoff?: string;
    phone?: string;
    note?: string;
  }>;
}) {
  const supabase = createSupabaseServerClient();

  const sp = (await searchParams) ?? {};
  const q = (sp.q ?? "").trim();
  const zone = (sp.zone ?? "all").trim();
  const availability = (sp.availability ?? "all").trim();
  const verifiedOnly = (sp.verified ?? "0").trim() === "1";

  const listingId = (sp.listing ?? "").trim();
  const dropoff = (sp.dropoff ?? "").trim();
  const buyerPhone = (sp.phone ?? "").trim();
  const note = (sp.note ?? "").trim();

  // Optional: fetch listing + vendor to build message
  let listing: (ListingRow & { vendor?: VendorRow | null }) | null = null;
  if (listingId) {
    const { data } = await supabase
      .from("listings")
      .select(
        "id,title,location,price,price_label,vendor:vendors(id,name,whatsapp,phone,location,verified,vendor_type)"
      )
      .eq("id", listingId)
      .maybeSingle();

    listing = (data as any) ?? null;
  }

  // Riders (keep query light)
  const { data: ridersData } = await supabase
    .from("riders")
    .select("id,name,phone,whatsapp,zone,fee_note,is_available,verified,created_at")
    .order("verified", { ascending: false })
    .order("is_available", { ascending: false })
    .order("created_at", { ascending: false });

  const riders = (ridersData ?? []) as RiderRow[];

  const pickupLocation =
    listing?.vendor?.location ?? listing?.location ?? "Pickup location to be confirmed";

  const priceText =
    listing?.price != null ? formatNaira(listing.price) : listing?.price_label ?? "Contact for price";

  const baseMessage = listing
    ? [
        "Hi, I need delivery for an order on JABU MARKET.",
        `Item: ${listing.title}`,
        `Price: ${priceText}`,
        `Pickup: ${pickupLocation}`,
        dropoff ? `Drop-off: ${dropoff}` : "Drop-off: (please ask me)",
        buyerPhone ? `Buyer Phone: ${buyerPhone}` : "",
        note ? `Note: ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        "Hi, I need a delivery agent.",
        dropoff ? `Drop-off: ${dropoff}` : "Drop-off: (my location)",
        buyerPhone ? `My Phone: ${buyerPhone}` : "",
        note ? `Note: ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n");

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">Delivery (Dispatch)</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Choose a delivery agent and message them on WhatsApp. No tracking inside Jabumarket.
            </p>
          </div>

          <Link
            href={listing ? `/listing/${listing.id}` : "/explore"}
            className="rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 no-underline"
          >
            ← Back
          </Link>
        </div>

        {listing ? (
          <div className="mt-4 rounded-3xl border bg-zinc-50 p-4">
            <p className="text-xs font-semibold text-zinc-700">From listing</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">{listing.title}</p>
            <p className="mt-1 text-xs text-zinc-600">Pickup: {pickupLocation}</p>
          </div>
        ) : null}
      </div>

      <DeliveryClient
        initial={{
          q,
          zone,
          availability,
          verifiedOnly,
          listingId,
          dropoff,
          buyerPhone,
          note,
          baseMessage,
          pickupLocation,
          listingTitle: listing?.title ?? null,
        }}
        riders={riders}
      />

      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <p className="text-sm font-semibold text-zinc-900">Safety tips</p>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>Confirm delivery fee + ETA before sending money.</li>
          <li>Avoid paying full upfront unless you trust the delivery agent/vendor.</li>
          <li>Use clear drop-off details (hostel name, gate, landmark).</li>
        </ul>
      </div>
    </div>
  );
}
