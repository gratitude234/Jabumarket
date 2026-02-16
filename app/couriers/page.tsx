import Link from "next/link";
import { supabase } from "@/lib/supabase/server";
import type { CourierRow, ListingRow } from "@/lib/types";
import { getWhatsAppLink } from "@/lib/whatsapp";

export default async function CouriersPage({
  searchParams,
}: {
  searchParams?: Promise<{ listing?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const listingId = sp.listing;

  // Optional: fetch listing to generate a smarter prefilled message
  let listing: ListingRow | null = null;
  if (listingId) {
    const { data } = await supabase
      .from("listings")
      .select("id,title,location,category,price,price_label")
      .eq("id", listingId)
      .maybeSingle();
    listing = (data as any) ?? null;
  }

  const prefill = listing
    ? `Hi! I need delivery help on campus.\n\nItem: ${listing.title}\nPickup: ${listing.location ?? "(seller location not listed)"}\nDrop-off: (my location)\nBudget: (₦...)\n\nCan you help?`
    : `Hi! I need delivery help on campus.\n\nPickup: (where to pick)\nDrop-off: (my location)\nBudget: (₦...)\n\nCan you help?`;

  const { data, error } = await supabase
    .from("couriers")
    .select("*")
    .eq("active", true)
    .eq("verified", true)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  const couriers = ((data ?? []) as CourierRow[]) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Delivery guys</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Message a verified courier on WhatsApp. No delivery tracking inside Jabumarket.
          </p>
        </div>

        <Link
          href={listingId ? `/listing/${listingId}` : "/"}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50 no-underline"
        >
          ← Back
        </Link>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm font-semibold">What to send</p>
        <p className="mt-1 text-sm text-zinc-600">
          Copy this format (or tap any courier and we’ll prefill it for you).
        </p>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-xs text-zinc-800 border">
          {prefill}
        </pre>
        <p className="mt-2 text-xs text-zinc-500">
          Always confirm price before sending money.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">Couldn’t load couriers</p>
          <p className="mt-1 text-sm text-red-700/80">
            Create the <code className="font-mono">couriers</code> table in Supabase and add verified couriers.
          </p>
        </div>
      ) : null}

      {couriers.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <p className="text-sm font-semibold">No couriers yet</p>
          <p className="mt-1 text-sm text-zinc-600">
            Add verified couriers in Supabase to show them here.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {couriers.map((c) => {
            const wa = getWhatsAppLink(c.whatsapp, prefill);
            return (
              <div key={c.id} className="rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{c.name}</p>
                    <p className="text-xs text-zinc-500">WhatsApp: +{c.whatsapp}</p>
                  </div>
                  <span className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] text-white">
                    Verified
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm text-zinc-700">
                  {c.base_location ? (
                    <p>
                      <span className="text-zinc-500">Base:</span> {c.base_location}
                    </p>
                  ) : null}
                  {c.areas_covered ? (
                    <p>
                      <span className="text-zinc-500">Covers:</span> {c.areas_covered}
                    </p>
                  ) : null}
                  {c.hours ? (
                    <p>
                      <span className="text-zinc-500">Hours:</span> {c.hours}
                    </p>
                  ) : null}
                  {c.price_note ? (
                    <p>
                      <span className="text-zinc-500">Price:</span> {c.price_note}
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 flex gap-2">
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full rounded-xl bg-black px-4 py-2 text-center text-sm text-white no-underline"
                  >
                    Message on WhatsApp
                  </a>
                  {c.phone ? (
                    <a
                      href={`tel:+${c.phone}`}
                      className="w-full rounded-xl border px-4 py-2 text-center text-sm text-black no-underline hover:bg-zinc-50"
                    >
                      Call
                    </a>
                  ) : (
                    <div className="w-full rounded-xl border px-4 py-2 text-center text-sm text-zinc-500">
                      Call N/A
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <Link
                    href={`/report?courier=${c.id}`}
                    className="text-xs text-zinc-500 hover:text-black no-underline"
                  >
                    Report courier
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
