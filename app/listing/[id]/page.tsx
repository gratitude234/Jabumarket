// app/listing/[id]/page.tsx
// Public listing details page (DO NOT put edit form here)

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase/server";
import type { ListingRow, VendorRow } from "@/lib/types";
import ListingImage from "@/components/ListingImage";
import OwnerActions from "@/components/listing/OwnerActions";
import { getWhatsAppLink } from "@/lib/whatsapp";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  MapPin,
  Phone,
  Store,
  Tag,
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
      minute: "numeric",
    });
  } catch {
    return "";
  }
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function StatusPill({ status }: { status: ListingRow["status"] }) {
  const cls =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "sold"
      ? "border-zinc-200 bg-zinc-100 text-zinc-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium", cls)}>
      {status.toUpperCase()}
    </span>
  );
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
      "id,vendor_id,title,description,listing_type,category,price,price_label,location,image_url,negotiable,status,created_at, vendors:vendors(id,name,whatsapp,phone,location,verified,vendor_type)"
    )
    .eq("id", id)
    .single();

  if (error || !data) return notFound();

  const listing = data as unknown as ListingRow & { vendors?: VendorRow | null };
  const vendor = (listing as any).vendors as VendorRow | null | undefined;

  const title = listing.title ?? "Listing";
  const showPrice = listing.price !== null && listing.price !== undefined;
  const created = formatDateTime(listing.created_at);

  const vendorName = vendor?.name ?? "Vendor";
  const vendorPhone = vendor?.whatsapp || vendor?.phone || "";
  const waText = `Hi ${vendorName}, I saw your listing on JabuMarket: “${title}”. Is it still available?`;
  const waHref = vendorPhone ? getWhatsAppLink(vendorPhone, waText) : "";

  return (
    <div className="pb-24">
      {/* soft background */}
      <div className="absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-emerald-50 via-white to-white" />

      <div className="mx-auto w-full max-w-3xl px-4">
        {/* Top bar */}
        <div className="sticky top-0 z-20 -mx-4 border-b bg-white/85 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-medium text-zinc-800 no-underline hover:bg-zinc-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>

            <div className="flex items-center gap-2">
              <StatusPill status={listing.status} />
            </div>
          </div>
        </div>

        {/* Header card */}
        <section className="mt-4 rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-zinc-900 sm:text-2xl">{title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1">
                  <Tag className="h-3.5 w-3.5" />
                  {listing.category}
                </span>

                {listing.location ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {listing.location}
                  </span>
                ) : null}

                {created ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1">
                    <Clock className="h-3.5 w-3.5" />
                    {created}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="text-lg font-semibold text-zinc-900 sm:text-xl">
                {listing.price_label?.trim()
                  ? listing.price_label
                  : showPrice
                  ? formatNaira(Number(listing.price))
                  : "—"}
              </div>
              {listing.negotiable ? <p className="mt-1 text-xs text-zinc-500">Negotiable</p> : null}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-3xl border bg-zinc-50">
            <div className="aspect-[4/3] w-full">
              <ListingImage src={listing.image_url ?? "/images/placeholder.svg"} alt={title} className="h-full w-full" />
            </div>
          </div>
        </section>

        {/* Description */}
        <section className="mt-4 rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Details</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
            {listing.description?.trim() ? listing.description : "No description provided."}
          </p>
        </section>

        {/* Vendor + contact */}
        <section className="mt-4 rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">Seller</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-sm text-zinc-800">
                  <Store className="h-4 w-4" />
                  <span className="truncate">{vendorName}</span>
                  {vendor?.verified ? <BadgeCheck className="h-4 w-4 text-emerald-600" /> : null}
                </span>
              </div>
              {vendor?.location ? <p className="mt-2 text-xs text-zinc-600">{vendor.location}</p> : null}
            </div>

            <div className="shrink-0">
              {vendor?.id ? (
                <Link
                  href={`/vendors/${vendor.id}`}
                  className="rounded-full border bg-white px-3 py-2 text-sm font-medium text-zinc-800 no-underline hover:bg-zinc-50"
                >
                  View profile
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white no-underline"
              >
                <Phone className="h-4 w-4" />
                Chat on WhatsApp
              </a>
            ) : (
              <div className="rounded-2xl border bg-zinc-50 p-3 text-sm text-zinc-600">
                No contact info on this vendor yet.
              </div>
            )}

            <Link
              href="/report"
              className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-800 no-underline hover:bg-zinc-50"
            >
              Report this listing
            </Link>
          </div>
        </section>

        {/* Owner-only actions (client component will hide itself if not owner) */}
        <div className="mt-4">
          <OwnerActions listingId={listing.id} listingVendorId={listing.vendor_id} status={listing.status} />
        </div>
      </div>
    </div>
  );
}
