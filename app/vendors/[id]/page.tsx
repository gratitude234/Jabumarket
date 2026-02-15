import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase/server";
import type { ListingRow } from "@/lib/types";

type VendorType = "food" | "mall" | "student" | "other";

type VendorRowFull = {
  id: string;
  name: string | null;
  whatsapp: string | null;
  phone: string | null;
  location: string | null;
  verified: boolean | null;
  vendor_type: VendorType | null;
};

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function cleanWhatsapp(raw: string) {
  return raw.replace(/[^\d]/g, "");
}

export default async function VendorShopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: vendor, error: vendorErr } = await supabase
    .from("vendors")
    .select("id, name, whatsapp, phone, location, verified, vendor_type")
    .eq("id", id)
    .single();

  if (vendorErr || !vendor) return notFound();

  const v = vendor as VendorRowFull;

  const { data: listingsData, error: listingsErr } = await supabase
    .from("listings")
    .select("*")
    .eq("vendor_id", v.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (listingsErr) {
    // still render vendor page even if listings fail
    console.error(listingsErr);
  }

  const listings = (listingsData ?? []) as ListingRow[];

  const displayName = v.name?.trim() || "Unnamed Vendor";
  const location = v.location?.trim() || "JABU";
  const typeLabel =
    v.vendor_type === "food"
      ? "Food Vendor"
      : v.vendor_type === "mall"
        ? "Mall Shop"
        : v.vendor_type === "student"
          ? "Student Vendor"
          : "Vendor";

  const whatsappDigits = v.whatsapp ? cleanWhatsapp(v.whatsapp) : null;
  const whatsappLink = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
        `Hi ${displayName}, I saw your shop on JABU Market.`
      )}`
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-zinc-900 truncate">{displayName}</h1>
            <p className="mt-1 text-sm text-zinc-600 truncate">{location}</p>

            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                {typeLabel}
              </span>
              {v.verified ? (
                <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs text-white">
                  Verified
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href="/vendors"
              className="rounded-xl border px-3 py-2 text-sm no-underline text-zinc-900"
            >
              Back
            </Link>

            {whatsappLink ? (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-black px-3 py-2 text-sm text-white no-underline"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-3 text-xs text-zinc-500">
          <span>{v.phone ? `Phone: ${v.phone}` : "Phone: —"}</span>
          <span className="mx-2">•</span>
          <span>
            {listings.length} active listing{listings.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">No active listings</p>
          <p className="mt-1 text-sm text-zinc-600">
            This vendor hasn’t posted anything yet (or everything is sold).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function ListingCard({ listing }: { listing: ListingRow }) {
  const priceText =
    listing.price !== null ? formatNaira(listing.price) : listing.price_label ?? "Contact for price";

  const typeLabel = listing.listing_type === "product" ? "Product" : "Service";

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="group overflow-hidden rounded-2xl border bg-white no-underline hover:shadow-sm transition-shadow"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={listing.image_url ?? "https://placehold.co/1200x900?text=JABU+MARKET"}
          alt={listing.title}
          className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform"
          loading="lazy"
        />
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
            {typeLabel}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
            {listing.category}
          </span>
          {listing.negotiable ? (
            <span className="ml-auto rounded-full bg-zinc-900 px-2 py-1 text-xs text-white">
              Negotiable
            </span>
          ) : null}
        </div>

        <div>
          <p className="line-clamp-2 text-sm font-medium text-zinc-900">{listing.title}</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">{priceText}</p>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{listing.location ?? "—"}</span>
          <span>{listing.created_at ? new Date(listing.created_at).toLocaleDateString() : ""}</span>
        </div>
      </div>
    </Link>
  );
}
