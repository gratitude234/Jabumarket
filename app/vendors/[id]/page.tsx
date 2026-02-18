// app/vendors/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ListingRow, VendorRow } from "@/lib/types";
import {
  ArrowLeft,
  BadgeCheck,
  MapPin,
  Phone,
  MessageCircle,
  Share2,
  ArrowRight,
  Search,
} from "lucide-react";

type SortKey = "newest" | "price_asc" | "price_desc";

function formatNaira(amount: number | null | undefined) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "₦0";
  return `₦${n.toLocaleString("en-NG")}`;
}

function getWhatsAppLink(phone: string, text: string) {
  const safe = phone.replace(/[^\d]/g, "");
  const msg = encodeURIComponent(text);
  return `https://wa.me/${safe}?text=${msg}`;
}

function escapeLike(input: string) {
  return input.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function clampPage(n: number) {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 999) return 999;
  return Math.floor(n);
}

function vendorTypeLabel(t?: VendorRow["vendor_type"] | null) {
  switch (t) {
    case "food":
      return "Food vendor";
    case "mall":
      return "Mall shop";
    case "student":
      return "Verified student";
    case "other":
      return "Vendor";
    default:
      return "Vendor";
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "V";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

function buildHref(params: { id: string; q?: string; sort?: SortKey; page?: number }) {
  const sp = new URLSearchParams();
  const q = (params.q ?? "").trim();
  const sort = (params.sort ?? "newest").trim() as SortKey;
  const page = params.page ?? 1;

  if (q) sp.set("q", q);
  if (sort && sort !== "newest") sp.set("sort", sort);
  if (page && page !== 1) sp.set("page", String(page));

  const qs = sp.toString();
  return qs ? `/vendors/${params.id}?${qs}` : `/vendors/${params.id}`;
}

function ListingCard({ l }: { l: ListingRow }) {
  const priceText =
    l.price !== null ? formatNaira(l.price) : l.price_label ?? "Contact for price";

  return (
    <Link
      href={`/listing/${l.id}`}
      className="group overflow-hidden rounded-3xl border bg-white no-underline shadow-sm hover:bg-zinc-50"
    >
      <div className="relative aspect-[4/3] w-full bg-zinc-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={l.image_url ?? "https://placehold.co/900x675?text=JABU+Market"}
          alt={l.title ?? "Listing"}
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
        />

        {/* price badge */}
        <div className="absolute bottom-3 left-3">
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-900 backdrop-blur">
            {priceText}
          </span>
        </div>

        {/* negotiable */}
        {l.negotiable ? (
          <div className="absolute bottom-3 right-3">
            <span className="rounded-full bg-black/90 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              Negotiable
            </span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-700">
            {l.listing_type === "product" ? "Product" : "Service"}
          </span>
          {l.category ? (
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-700">
              {l.category}
            </span>
          ) : null}
        </div>

        <p className="line-clamp-2 text-sm font-semibold text-zinc-900">
          {l.title ?? "Untitled listing"}
        </p>

        <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
          <span className="truncate">{l.location ?? "—"}</span>
          <span>
            {l.created_at ? new Date(l.created_at).toLocaleDateString("en-NG", { month: "short", day: "2-digit" }) : ""}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function VendorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ q?: string; sort?: SortKey; page?: string }>;
}) {
  const supabase = createSupabaseServerClient();

  const { id } = await params;
  const sp = (searchParams ? await searchParams : {}) as {
    q?: string;
    sort?: SortKey;
    page?: string;
  };

  const q = (sp.q ?? "").trim();
  const sort = ((sp.sort ?? "newest").trim() as SortKey) || "newest";
  const page = clampPage(Number(sp.page ?? "1"));

  const PAGE_SIZE = 24;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Vendor
  const { data: vendorData, error: vErr } = await supabase
    .from("vendors")
    .select("id,name,whatsapp,phone,location,verified,verification_status,vendor_type")
    .eq("id", id)
    .single();

  if (vErr || !vendorData) return notFound();
  const vendor = vendorData as VendorRow;

  // Listings (active only, from this vendor)
  let lq = supabase
    .from("listings")
    .select(
      "id,title,price,price_label,image_url,category,listing_type,location,negotiable,created_at,status",
      { count: "exact" }
    )
    .eq("vendor_id", id)
    .eq("status", "active");

  if (q) {
    const safe = escapeLike(q);
    lq = lq.or(`title.ilike.%${safe}%,description.ilike.%${safe}%,location.ilike.%${safe}%`);
  }

  if (sort === "price_asc") {
    lq = lq.order("price", { ascending: true }).order("created_at", { ascending: false });
  } else if (sort === "price_desc") {
    lq = lq.order("price", { ascending: false }).order("created_at", { ascending: false });
  } else {
    lq = lq.order("created_at", { ascending: false });
  }

  lq = lq.range(from, to);

  const { data: listingsData, count } = await lq;
  const listings = (listingsData ?? []) as ListingRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const name = vendor.name ?? "Vendor";
  const isVerified =
    (vendor as any).verification_status === "verified" || vendor.verified === true;
  const safeWA = String(vendor.whatsapp ?? "").trim().replace(/[^\d]/g, "");
  const safePhone = String(vendor.phone ?? "").trim().replace(/[^\d]/g, "");
  const hasWA = safeWA.length >= 8;
  const hasPhone = safePhone.length >= 8;

  const waText = `Hi ${name}, I found your shop on JABU Market. Please I’m interested in your listings.`;
  const waLink = hasWA ? getWhatsAppLink(safeWA, waText) : "";

  const shopShareUrl = `/vendors/${vendor.id}`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-24">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/vendors"
          className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-medium text-zinc-800 no-underline hover:bg-zinc-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <Link
          href="/post"
          className="hidden rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-zinc-800 sm:inline-flex"
        >
          Post
        </Link>
      </div>

      {/* Vendor header */}
      <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-white to-zinc-50" />
          <div className="p-4 sm:p-6">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-sm font-bold text-zinc-900">
                {initials(name)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-lg font-bold text-zinc-900 sm:text-2xl">{name}</h1>

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

                  <span className="rounded-full border bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700">
                    {vendorTypeLabel(vendor.vendor_type)}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{vendor.location ?? "Location not set"}</span>
                  </span>

                  <span className="text-zinc-400">•</span>
                  <span className="text-zinc-600">{total} active listing{total === 1 ? "" : "s"}</span>
                </div>
              </div>

              {/* Desktop actions */}
              <div className="hidden items-center gap-2 sm:flex">
                <Link
                  href={shopShareUrl}
                  className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                  title="Copy link from address bar to share"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </Link>

                {hasPhone ? (
                  <a
                    href={`tel:+${safePhone}`}
                    className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
                  >
                    <Phone className="h-4 w-4" />
                    Call
                  </a>
                ) : null}

                {hasWA ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl bg-black px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-zinc-800"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-2xl bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-500">
                    WhatsApp N/A
                  </span>
                )}
              </div>
            </div>

            {/* Small trust note */}
            <div className="mt-4 rounded-2xl border bg-white p-3 text-xs text-zinc-600">
              Tip: Always confirm price and meeting point before paying. Meet in public places around campus.
            </div>
          </div>
        </div>
      </section>

      {/* Shop controls */}
      <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900">Shop listings</h2>
            <p className="mt-0.5 text-xs text-zinc-600">Search and sort this vendor’s listings.</p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <form method="GET" action={`/vendors/${id}`} className="flex w-full items-center gap-2 sm:w-[360px]">
              <div className="flex w-full items-center gap-2 rounded-2xl border bg-white p-2">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100">
                  <Search className="h-5 w-5 text-zinc-700" />
                </div>

                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search this shop…"
                  className="h-10 w-full bg-transparent px-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />

                {sort !== "newest" ? <input type="hidden" name="sort" value={sort} /> : null}

                <button
                  type="reset"
                  className="h-10 rounded-xl px-3 text-sm text-zinc-600 hover:bg-zinc-100"
                  aria-label="Clear search"
                  title="Clear"
                >
                  ×
                </button>

                <button
                  type="submit"
                  className="h-10 rounded-xl bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Go
                </button>
              </div>
            </form>

            <form method="GET" action={`/vendors/${id}`} className="flex items-center gap-2">
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <select
                name="sort"
                defaultValue={sort}
                className="h-[52px] w-full rounded-2xl border bg-white px-3 text-sm sm:w-[220px]"
              >
                <option value="newest">Newest</option>
                <option value="price_asc">Price: Low → High</option>
                <option value="price_desc">Price: High → Low</option>
              </select>

              <button className="hidden h-[52px] rounded-2xl bg-black px-4 text-sm font-semibold text-white hover:bg-zinc-800 sm:inline-flex">
                Apply
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Listings */}
      {listings.length === 0 ? (
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">No active listings</p>
          <p className="mt-1 text-sm text-zinc-600">
            {q
              ? "No matches for your search. Try clearing the search."
              : "This vendor has no active listings right now."}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={buildHref({ id, q: "", sort, page: 1 })}
              className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-zinc-800"
            >
              Clear search
            </Link>
            <Link
              href="/explore"
              className="rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
            >
              Browse Explore
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.id} l={l} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <Link
                href={buildHref({ id, q, sort, page: Math.max(1, page - 1) })}
                className={[
                  "inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-semibold no-underline",
                  page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-zinc-50",
                ].join(" ")}
              >
                ← Prev
              </Link>

              <div className="text-xs text-zinc-600 sm:text-sm">
                Page <span className="font-semibold text-zinc-900">{page}</span> of{" "}
                <span className="font-semibold text-zinc-900">{totalPages}</span>
              </div>

              <Link
                href={buildHref({ id, q, sort, page: Math.min(totalPages, page + 1) })}
                className={[
                  "inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-semibold no-underline",
                  page >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-zinc-50",
                ].join(" ")}
              >
                Next <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </>
      )}

      {/* Mobile sticky action bar (kept above your bottom nav) */}
      <div className="sm:hidden fixed bottom-16 left-0 right-0 z-40 px-4">
        <div className="mx-auto max-w-6xl rounded-3xl border bg-white/90 p-2 shadow-lg backdrop-blur">
          <div className="grid grid-cols-3 gap-2">
            <Link
              href={shopShareUrl}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-3 py-3 text-sm font-semibold text-zinc-900 no-underline"
              title="Copy link from address bar to share"
            >
              <Share2 className="h-4 w-4" />
              Share
            </Link>

            {hasPhone ? (
              <a
                href={`tel:+${safePhone}`}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-3 py-3 text-sm font-semibold text-zinc-900 no-underline"
              >
                <Phone className="h-4 w-4" />
                Call
              </a>
            ) : (
              <span className="inline-flex items-center justify-center rounded-2xl border bg-white px-3 py-3 text-sm font-semibold text-zinc-400">
                Call
              </span>
            )}

            {hasWA ? (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-3 py-3 text-sm font-semibold text-white no-underline"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            ) : (
              <span className="inline-flex items-center justify-center rounded-2xl bg-zinc-100 px-3 py-3 text-sm font-semibold text-zinc-500">
                WhatsApp N/A
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
