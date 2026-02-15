import Link from "next/link";
import { supabase } from "@/lib/supabase/server";
import type { ListingRow, ListingType } from "@/lib/types";
import ExploreSort from "@/components/explore/ExploreSort";

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function buildExploreHref(params: { q?: string; type?: string; category?: string; sort?: string }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.type && params.type !== "all") sp.set("type", params.type);
  if (params.category && params.category !== "all") sp.set("category", params.category);
  if (params.sort && params.sort !== "newest") sp.set("sort", params.sort);
  const qs = sp.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

type SortKey = "newest" | "price_asc" | "price_desc";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; type?: string; category?: string; sort?: string }>;
}) {
  const sp = (searchParams ? await searchParams : {}) as {
    q?: string;
    type?: string;
    category?: string;
    sort?: string;
  };

  const q = (sp.q ?? "").trim();
  const type = (sp.type ?? "all") as "all" | ListingType;
  const category = (sp.category ?? "all").trim();
  const sort = (sp.sort ?? "newest").trim() as SortKey;

  // Build query (includes active + sold + inactive)
  let query = supabase.from("listings").select("*");

  if (type !== "all") query = query.eq("listing_type", type);
  if (category !== "all") query = query.eq("category", category);

  if (q) {
    query = query.or(
      `title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%,category.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  const listingsRaw = (data ?? []) as ListingRow[];

  // Status ranking: active first, inactive next, sold last
  const statusRank: Record<string, number> = { active: 0, inactive: 1, sold: 2 };

  const getCreatedAt = (l: ListingRow) => (l.created_at ? new Date(l.created_at).getTime() : 0);
  const getPriceAsc = (l: ListingRow) => (typeof l.price === "number" ? l.price : Number.POSITIVE_INFINITY);
  const getPriceDesc = (l: ListingRow) => (typeof l.price === "number" ? l.price : -1);

  const listings = listingsRaw.slice().sort((a, b) => {
    const ar = statusRank[a.status] ?? 99;
    const br = statusRank[b.status] ?? 99;
    if (ar !== br) return ar - br;

    if (sort === "price_asc") {
      const ap = getPriceAsc(a);
      const bp = getPriceAsc(b);
      if (ap !== bp) return ap - bp;
      return getCreatedAt(b) - getCreatedAt(a);
    }

    if (sort === "price_desc") {
      const ap = getPriceDesc(a);
      const bp = getPriceDesc(b);
      if (ap !== bp) return bp - ap;
      return getCreatedAt(b) - getCreatedAt(a);
    }

    // newest
    return getCreatedAt(b) - getCreatedAt(a);
  });

  const filteredCount = listings.length;

  // Count statuses for the helper label (optional but nice)
  const activeCount = listings.filter((l) => l.status === "active").length;
  const soldCount = listings.filter((l) => l.status === "sold").length;
  const inactiveCount = listings.filter((l) => l.status === "inactive").length;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Explore</h1>
          <p className="text-sm text-zinc-600">
            {filteredCount} result{filteredCount === 1 ? "" : "s"}{" "}
            {q ? (
              <>
                for <span className="font-medium text-zinc-900">“{q}”</span>
              </>
            ) : null}
          </p>

          {/* Tiny helper label */}
          <div className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-full border bg-white px-3 py-1">
            <span className="text-xs text-zinc-600">
              Showing <span className="font-medium text-zinc-900">active first</span> (sold last)
            </span>
            <span className="text-xs text-zinc-400">•</span>
            <span className="text-xs text-zinc-600">
              Active: <span className="font-medium text-zinc-900">{activeCount}</span>
            </span>
            <span className="text-xs text-zinc-400">•</span>
            <span className="text-xs text-zinc-600">
              Inactive: <span className="font-medium text-zinc-900">{inactiveCount}</span>
            </span>
            <span className="text-xs text-zinc-400">•</span>
            <span className="text-xs text-zinc-600">
              Sold: <span className="font-medium text-zinc-900">{soldCount}</span>
            </span>
          </div>

          {error ? (
            <p className="mt-1 text-xs text-red-600">
              Couldn’t load listings from Supabase. Check console + env vars.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <ExploreSort />
          <Link
            href="/post"
            className="hidden sm:inline-flex rounded-xl bg-black px-4 py-2 text-sm text-white no-underline"
          >
            Post Listing
          </Link>
        </div>
      </div>

      {/* Type pills */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill href={buildExploreHref({ q, type: "all", category, sort })} active={type === "all"} label="All" />
        <Pill
          href={buildExploreHref({ q, type: "product", category, sort })}
          active={type === "product"}
          label="Products"
        />
        <Pill
          href={buildExploreHref({ q, type: "service", category, sort })}
          active={type === "service"}
          label="Services"
        />
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        <Chip
          href={buildExploreHref({ q, type, category: "all", sort })}
          active={category === "all"}
          label="All categories"
        />
        {[
          "Phones",
          "Laptops",
          "Fashion",
          "Provisions",
          "Food",
          "Beauty",
          "Services",
          "Repairs",
          "Tutoring",
          "Others",
        ].map((c) => (
          <Chip
            key={c}
            href={buildExploreHref({ q, type, category: c, sort })}
            active={category.toLowerCase() === c.toLowerCase()}
            label={c}
          />
        ))}
      </div>

      {/* Grid */}
      {listings.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <p className="text-sm text-zinc-700 font-medium">No results found</p>
          <p className="mt-1 text-sm text-zinc-600">Try a different search or clear your filters.</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/explore" className="rounded-xl bg-black px-4 py-2 text-sm text-white no-underline">
              Clear filters
            </Link>
            <Link href="/post" className="rounded-xl border px-4 py-2 text-sm text-black no-underline">
              Post a listing
            </Link>
          </div>
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

function Pill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full px-3 py-2 text-sm no-underline border",
        active ? "bg-black text-white border-black" : "bg-white text-zinc-700 hover:bg-zinc-50",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full px-3 py-2 text-sm no-underline border",
        active ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 hover:bg-zinc-50",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function ListingCard({ listing }: { listing: ListingRow }) {
  const priceText =
    listing.price !== null ? formatNaira(listing.price) : listing.price_label ?? "Contact for price";

  const typeLabel = listing.listing_type === "product" ? "Product" : "Service";
  const isSold = listing.status === "sold";
  const isInactive = listing.status === "inactive";

  return (
    <Link
      href={`/listing/${listing.id}`}
      className={[
        "group overflow-hidden rounded-2xl border bg-white no-underline transition-shadow hover:shadow-sm",
        isSold || isInactive ? "opacity-80" : "",
      ].join(" ")}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={listing.image_url ?? "https://placehold.co/1200x900?text=Jabumarket"}
          alt={listing.title}
          className={[
            "h-full w-full object-cover transition-transform",
            isSold || isInactive ? "" : "group-hover:scale-[1.02]",
          ].join(" ")}
          loading="lazy"
        />

        {/* Status badge */}
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
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{typeLabel}</span>
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{listing.category}</span>
          {listing.negotiable ? (
            <span className="ml-auto rounded-full bg-zinc-900 px-2 py-1 text-xs text-white">Negotiable</span>
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
