import Link from "next/link";
import { supabase } from "@/lib/supabase/server";
import type { ListingRow, VendorRow, RiderRow } from "@/lib/types";

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function getWhatsAppLink(phone: string, text: string) {
  const safe = phone.replace(/[^\d]/g, "");
  const msg = encodeURIComponent(text);
  return `https://wa.me/${safe}?text=${msg}`;
}

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    zone?: string;
    listing?: string;
    dropoff?: string;
    phone?: string;
    note?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const q = (sp.q ?? "").trim();
  const zone = (sp.zone ?? "all").trim();
  const listingId = (sp.listing ?? "").trim();

  const dropoff = (sp.dropoff ?? "").trim();
  const buyerPhone = (sp.phone ?? "").trim();
  const note = (sp.note ?? "").trim();

  // If coming from a listing, fetch it to build a better delivery message.
  let listing: (ListingRow & { vendor?: VendorRow | null }) | null = null;

  if (listingId) {
    const { data } = await supabase
      .from("listings")
      .select(
        "*, vendor:vendors(id, name, whatsapp, phone, location, verified, vendor_type)"
      )
      .eq("id", listingId)
      .single();

    if (data) listing = data as any;
  }

  let ridersQuery = supabase
    .from("riders")
    .select("*")
    .order("verified", { ascending: false })
    .order("is_available", { ascending: false })
    .order("created_at", { ascending: false });

  if (q) ridersQuery = ridersQuery.ilike("name", `%${q}%`);
  if (zone && zone !== "all") ridersQuery = ridersQuery.eq("zone", zone);

  const { data: ridersData } = await ridersQuery;
  const riders = (ridersData ?? []) as RiderRow[];

  const pickupLocation =
    listing?.vendor?.location ?? listing?.location ?? "Pickup location to be confirmed";

  const priceText =
    listing?.price != null
      ? formatNaira(listing.price)
      : listing?.price_label ?? "Contact for price";

  const message = listing
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
        "Hi, I need a delivery rider.",
        dropoff ? `Drop-off: ${dropoff}` : "",
        buyerPhone ? `My Phone: ${buyerPhone}` : "",
        note ? `Note: ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Delivery (Dispatch)</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Choose a rider and message them on WhatsApp.
            </p>
          </div>
          <Link
            href={listing ? `/listing/${listing.id}` : "/explore"}
            className="text-sm text-zinc-600 hover:text-black no-underline"
          >
            {listing ? "← Back to listing" : "← Back"}
          </Link>
        </div>

        {listing ? (
          <div className="mt-3 rounded-xl border bg-zinc-50 p-3 text-sm">
            <div className="font-medium">Order:</div>
            <div className="text-zinc-700">{listing.title}</div>
            <div className="text-zinc-500">Pickup: {pickupLocation}</div>
          </div>
        ) : null}

        <form className="mt-4 grid gap-2 md:grid-cols-4" method="get">
          <input type="hidden" name="listing" value={listingId} />

          <input
            name="q"
            defaultValue={q}
            placeholder="Search riders (name)"
            className="h-10 rounded-xl border px-3 text-sm"
          />

          <select
            name="zone"
            defaultValue={zone}
            className="h-10 rounded-xl border px-3 text-sm"
          >
            <option value="all">All zones</option>
            <option value="Campus">Campus</option>
            <option value="Male Hostels">Male Hostels</option>
            <option value="Female Hostels">Female Hostels</option>
            <option value="Town">Town</option>
          </select>

          <input
            name="dropoff"
            defaultValue={dropoff}
            placeholder="Drop-off (e.g. Male Hostel 4)"
            className="h-10 rounded-xl border px-3 text-sm"
          />

          <input
            name="phone"
            defaultValue={buyerPhone}
            placeholder="Your phone (optional)"
            className="h-10 rounded-xl border px-3 text-sm md:col-span-2"
          />

          <input
            name="note"
            defaultValue={note}
            placeholder="Note (optional: no pepper, call at gate...)"
            className="h-10 rounded-xl border px-3 text-sm md:col-span-2"
          />

          <button className="h-10 rounded-xl bg-black px-4 text-sm text-white md:col-span-4">
            Apply
          </button>
        </form>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {riders.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
            No riders found yet. Add riders in Supabase (table:{" "}
            <span className="font-medium">riders</span>).
          </div>
        ) : (
          riders.map((r) => {
            const wa = r.whatsapp ?? r.phone;
            const href = getWhatsAppLink(wa, message);

            return (
              <div key={r.id} className="rounded-2xl border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Zone: {r.zone ?? "—"} • {r.is_available ? "Available" : "Busy"}
                    </div>
                    {r.fee_note ? (
                      <div className="mt-1 text-xs text-zinc-600">{r.fee_note}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-zinc-500">Phone: +{r.phone}</div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {r.verified ? (
                      <span className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] text-white">
                        Verified
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-700">
                        Not verified
                      </span>
                    )}

                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-black px-4 py-2 text-sm text-white no-underline"
                    >
                      Message rider
                    </a>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm font-semibold">How it works</p>
        <ul className="mt-2 space-y-2 text-sm text-zinc-600 list-disc pl-5">
          <li>Pick a rider and message them on WhatsApp with your order details.</li>
          <li>Confirm delivery fee and ETA directly with the rider.</li>
          <li>Pay safely—avoid full prepayment unless you trust the vendor/rider.</li>
        </ul>
      </div>
    </div>
  );
}
