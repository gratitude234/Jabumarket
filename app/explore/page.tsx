// app/explore/page.tsx
import Link from "next/link";
import { supabase } from "@/lib/supabase/server";
import type { ListingRow, ListingType } from "@/lib/types";
import ListingImage from "@/components/ListingImage";
import { Search, SlidersHorizontal, X, ArrowRight, ArrowLeft } from "lucide-react";

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

type SortKey = "newest" | "price_asc" | "price_desc";
type StatusKey = "active" | "inactive" | "sold";

function buildExploreHref(params: {
  q?: string;
  type?: string;
  category?: string;
  sort?: string;
  page?: string | number;
  sold?: string;
  inactive?: string;
}) {
  const sp = new URLSearchParams();

  if (params.q) sp.set("q", params.q);
  if (params.type && params.type !== "all") sp.set("type", params.type);
  if (params.category && params.category !== "all") sp.set("category", params.category);
  if (params.sort && params.sort !== "newest") sp.set("sort", params.sort);

  if (params.sold === "1") sp.set("sold", "1");
  if (params.inactive === "1") sp.set("inactive", "1");

  const pageStr = String(params.page ?? "");
  if (pageStr && pageStr !== "1") sp.set("page", pageStr);

  const qs = sp.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

function clampPage(n: number) {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 999) return 999;
  return Math.floor(n);
}

// reduce weird LIKE behavior
function escapeLike(input: string) {
  return input.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

const CATEGORIES = [
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
];

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    type?: string;
    category?: string;
    sort?: string;
    page?: string;
    sold?: string;
    inactive?: string;
  }>;
}) {
  const sp = (searchParams ? await searchParams : {}) as {
    q?: string;
    type?: string;
    category?: string;
    sort?: string;
    page?: string;
    sold?: string;
    inactive?: string;
  };

  const q = (sp.q ?? "").trim();
  const type = (sp.type ?? "all") as "all" | ListingType;
  const category = (sp.category ?? "all").trim();
  const sort = ((sp.sort ?? "newest").trim() as SortKey) || "newest";

  const includeSold = sp.sold === "1";
  const includeInactive = sp.inactive === "1";

  const page = clampPage(Number(sp.page ?? "1"));
  const PAGE_SIZE = 24;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("listings")
    .select(
      "id,title,description,listing_type,category,price,price_label,location,image_url,negotiable,status,created_at",
      { count: "exact" }
    );

  if (type !== "all") query = query.eq("listing_type", type);
  if (category !== "all") query = query.eq("category", category);

  const statuses: StatusKey[] = ["active"];
  if (includeInactive) statuses.push("inactive");
  if (includeSold) statuses.push("sold");
  query = query.in("status", statuses);

  if (q) {
    const safe = escapeLike(q);
    query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%,location.ilike.%${safe}%`);
  }

  if (sort === "price_asc") {
    query = query.order("price", { ascending: true }).order("created_at", { ascending: false });
  } else if (sort === "price_desc") {
    query = query.order("price", { ascending: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.range(from, to);

  const { data, error, count } = await query;

  const listings = (data ?? []) as ListingRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : from + 1;
  const showingTo = Math.min(total, to + 1);

  const activeFilters = {
    q,
    type,
    category,
    sort,
    sold: includeSold ? "1" : "",
    inactive: includeInactive ? "1" : "",
  };

  const hasAnyFilter =
    !!q ||
    type !== "all" ||
    category !== "all" ||
    sort !== "newest" ||
    includeSold ||
    includeInactive;

  return (
    <div className="space-y-4">
      {/* Top header (mobile-first) */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-zinc-900">Explore</h1>

          {error ? (
            <p className="mt-1 text-sm text-red-600">
              Couldn’t load listings. Check Supabase env vars + server logs.
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-600 sm:text-sm">
              Showing <span className="font-medium text-zinc-900">{showingFrom}</span>–
              <span className="font-medium text-zinc-900">{showingTo}</span> of{" "}
              <span className="font-medium text-zinc-900">{total}</span>
              {q ? (
                <>
                  {" "}
                  for <span className="font-medium text-zinc-900">“{q}”</span>
                </>
              ) : null}
            </p>
          )}
        </div>

        <Link
          href="/post"
          className="hidden sm:inline-flex rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white no-underline hover:bg-zinc-800"
        >
          Post
        </Link>
      </div>

      {/* Sticky controls: compact on mobile, “filters drawer” via details */}
      <div className="sticky top-0 z-10 -mx-4 border-b bg-white/85 px-4 py-3 backdrop-blur">
        {/* Search row */}
        <div className="flex items-center gap-2">
          <form method="GET" action="/explore" className="flex w-full items-center gap-2">
            <div className="flex w-full items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100">
                <Search className="h-5 w-5 text-zinc-700" />
              </div>

              <input
                name="q"
                defaultValue={q}
                placeholder="Search phones, food, services…"
                className="h-10 w-full bg-transparent px-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              />

              {/* preserve filters */}
              {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
              {category !== "all" ? <input type="hidden" name="category" value={category} /> : null}
              {sort !== "newest" ? <input type="hidden" name="sort" value={sort} /> : null}
              {includeSold ? <input type="hidden" name="sold" value="1" /> : null}
              {includeInactive ? <input type="hidden" name="inactive" value="1" /> : null}

              <button
                type="reset"
                className="h-10 rounded-xl px-3 text-sm text-zinc-600 hover:bg-zinc-100"
                aria-label="Clear search input"
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

          {/* Filters drawer toggle (no JS needed) */}
          <details className="relative shrink-0">
            <summary className="list-none">
              <span className="inline-flex h-[52px] items-center gap-2 rounded-2xl border bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                <span className="sm:hidden">Filter</span>
              </span>
            </summary>

            {/* Drawer panel */}
            <div className="absolute right-0 mt-2 w-[min(92vw,520px)] rounded-3xl border bg-white p-4 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Filters</p>
                  <p className="text-xs text-zinc-600">Refine results without losing your place.</p>
                </div>
                <span className="rounded-full border bg-white p-2 text-zinc-700">
                  <X className="h-4 w-4" />
                </span>
              </div>

              {/* Type pills */}
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-zinc-700">Type</p>
                <div className="flex flex-wrap gap-2">
                  <Pill
                    href={buildExploreHref({ ...activeFilters, type: "all", page: 1 })}
                    active={type === "all"}
                    label="All"
                  />
                  <Pill
                    href={buildExploreHref({ ...activeFilters, type: "product", page: 1 })}
                    active={type === "product"}
                    label="Products"
                  />
                  <Pill
                    href={buildExploreHref({ ...activeFilters, type: "service", page: 1 })}
                    active={type === "service"}
                    label="Services"
                  />
                </div>
              </div>

              {/* Sort */}
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-zinc-700">Sort</p>
                <form method="GET" action="/explore" className="flex items-center gap-2">
                  {q ? <input type="hidden" name="q" value={q} /> : null}
                  {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
                  {category !== "all" ? <input type="hidden" name="category" value={category} /> : null}
                  {includeSold ? <input type="hidden" name="sold" value="1" /> : null}
                  {includeInactive ? <input type="hidden" name="inactive" value="1" /> : null}

                  <select
                    name="sort"
                    defaultValue={sort}
                    className="w-full rounded-2xl border bg-white px-3 py-2 text-sm"
                  >
                    <option value="newest">Newest</option>
                    <option value="price_asc">Price: Low → High</option>
                    <option value="price_desc">Price: High → Low</option>
                  </select>

                  <button className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                    Apply
                  </button>
                </form>
              </div>

              {/* Status toggles */}
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-zinc-700">Visibility</p>
                <div className="flex flex-wrap items-center gap-2">
                  <SmallToggle
                    href={buildExploreHref({ ...activeFilters, sold: includeSold ? "" : "1", page: 1 })}
                    active={includeSold}
                    label="Include sold"
                  />
                  <SmallToggle
                    href={buildExploreHref({
                      ...activeFilters,
                      inactive: includeInactive ? "" : "1",
                      page: 1,
                    })}
                    active={includeInactive}
                    label="Include inactive"
                  />
                  {!includeSold && !includeInactive ? (
                    <span className="text-xs text-zinc-500">Default: active only</span>
                  ) : null}
                </div>
              </div>

              {/* Clear */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <Link
                  href="/explore"
                  className="rounded-2xl border bg-white px-4 py-2 text-sm text-zinc-800 no-underline hover:bg-zinc-50"
                >
                  Reset all
                </Link>
                <span className="text-xs text-zinc-500">Tip: categories are below</span>
              </div>
            </div>
          </details>
        </div>

        {/* Active filter chips row */}
        {hasAnyFilter ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {q ? (
              <ActiveChip label={`“${q}”`} href={buildExploreHref({ ...activeFilters, q: "", page: 1 })} />
            ) : null}

            {type !== "all" ? (
              <ActiveChip
                label={type === "product" ? "Products" : "Services"}
                href={buildExploreHref({ ...activeFilters, type: "all", page: 1 })}
              />
            ) : null}

            {category !== "all" ? (
              <ActiveChip
                label={category}
                href={buildExploreHref({ ...activeFilters, category: "all", page: 1 })}
              />
            ) : null}

            {sort !== "newest" ? (
              <ActiveChip
                label={sort === "price_asc" ? "Price ↑" : "Price ↓"}
                href={buildExploreHref({ ...activeFilters, sort: "newest", page: 1 })}
              />
            ) : null}

            {includeSold ? (
              <ActiveChip label="Sold" href={buildExploreHref({ ...activeFilters, sold: "", page: 1 })} />
            ) : null}

            {includeInactive ? (
              <ActiveChip
                label="Inactive"
                href={buildExploreHref({ ...activeFilters, inactive: "", page: 1 })}
              />
            ) : null}

            <Link
              href="/explore"
              className="ml-auto rounded-full border bg-white px-3 py-2 text-xs font-medium text-zinc-700 no-underline hover:bg-zinc-50"
            >
              Clear all
            </Link>
          </div>
        ) : null}

        {/* Categories: mobile horizontal scroll */}
        <div className="mt-3 -mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <style>{`div::-webkit-scrollbar{display:none}`}</style>
          <div className="flex w-max items-center gap-2">
            <Chip
              href={buildExploreHref({ ...activeFilters, category: "all", page: 1 })}
              active={category === "all"}
              label="All"
            />
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                href={buildExploreHref({ ...activeFilters, category: c, page: 1 })}
                active={category.toLowerCase() === c.toLowerCase()}
                label={c}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {listings.length === 0 ? (
        <div className="rounded-3xl border bg-white p-6">
          <p className="text-sm font-semibold text-zinc-900">No results found</p>
          <p className="mt-1 text-sm text-zinc-600">Try a different search, or remove a filter.</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/explore"
              className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white no-underline hover:bg-zinc-800"
            >
              Clear filters
            </Link>
            <Link
              href="/explore?sort=newest"
              className="rounded-2xl border bg-white px-4 py-2 text-sm font-medium text-zinc-900 no-underline hover:bg-zinc-50"
            >
              Browse newest
            </Link>
            <Link
              href="/post"
              className="rounded-2xl border bg-white px-4 py-2 text-sm font-medium text-zinc-900 no-underline hover:bg-zinc-50"
            >
              Post a listing
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile-first grid (2 cols), scales up nicely */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-3">
            <Link
              href={buildExploreHref({ ...activeFilters, page: Math.max(1, page - 1) })}
              className={[
                "inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-medium no-underline",
                page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-zinc-50",
              ].join(" ")}
            >
              <ArrowLeft className="h-4 w-4" />
              Prev
            </Link>

            <div className="text-xs text-zinc-600 sm:text-sm">
              Page <span className="font-medium text-zinc-900">{page}</span> of{" "}
              <span className="font-medium text-zinc-900">{totalPages}</span>
            </div>

            <Link
              href={buildExploreHref({ ...activeFilters, page: Math.min(totalPages, page + 1) })}
              className={[
                "inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2 text-sm font-medium no-underline",
                page >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-zinc-50",
              ].join(" ")}
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}

      {/* Mobile Post CTA */}
      <div className="sm:hidden">
        <Link
          href="/post"
          className="inline-flex w-full justify-center rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white no-underline hover:bg-zinc-800"
        >
          Post Listing
        </Link>
      </div>
    </div>
  );
}

function Pill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full px-3 py-2 text-sm font-medium no-underline border",
        active ? "bg-black text-white border-black" : "bg-white text-zinc-800 hover:bg-zinc-50",
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
        "whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium no-underline border",
        active ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-800 hover:bg-zinc-50",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function SmallToggle({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-3 py-1.5 text-xs font-medium no-underline",
        active ? "bg-black text-white border-black" : "bg-white text-zinc-800 hover:bg-zinc-50",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function ActiveChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-xs font-medium text-zinc-800 no-underline hover:bg-zinc-50"
      title="Remove filter"
    >
      {label}
      <span className="grid h-4 w-4 place-items-center rounded-full bg-zinc-100 text-zinc-700">
        ×
      </span>
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
        "group overflow-hidden rounded-3xl border bg-white no-underline transition-shadow hover:shadow-sm",
        isSold || isInactive ? "opacity-85" : "",
      ].join(" ")}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100">
        <ListingImage
          src={listing.image_url ?? "/images/placeholder.svg"}
          alt={listing.title}
          className={["transition-transform", isSold || isInactive ? "" : "group-hover:scale-[1.02]"]
            .filter(Boolean)
            .join(" ")}
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

        {/* Price badge (helps mobile scanning) */}
        <div className="absolute bottom-3 left-3">
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-900 backdrop-blur">
            {priceText}
          </span>
        </div>
      </div>

      <div className="space-y-2 p-3">
        {/* ✅ FIX: allow wrap so Negotiable never gets cropped on mobile */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
            {typeLabel}
          </span>

          {listing.category ? (
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
              {listing.category}
            </span>
          ) : null}

          {listing.negotiable ? (
            <span className="sm:ml-auto shrink-0 rounded-full bg-black px-2 py-1 text-xs font-semibold text-white">
              Negotiable
            </span>
          ) : null}
        </div>

        <div>
          <p className="line-clamp-2 text-sm font-semibold text-zinc-900">
            {listing.title ?? "Untitled listing"}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
          <span className="truncate">{listing.location ?? "—"}</span>
          <span>{listing.created_at ? new Date(listing.created_at).toLocaleDateString("en-NG") : ""}</span>
        </div>
      </div>
    </Link>
  );
}
