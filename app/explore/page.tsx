import Link from "next/link";
import { supabase } from "@/lib/supabase/server";
import type { ListingRow, ListingType } from "@/lib/types";
import ListingImage from "@/components/ListingImage";

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

  // advanced toggles
  if (params.sold === "1") sp.set("sold", "1");
  if (params.inactive === "1") sp.set("inactive", "1");

  // pagination
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

// very small escape to reduce weird LIKE behavior
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

  // Base query (only fields used on this page)
  let query = supabase
    .from("listings")
    .select(
      "id,title,description,listing_type,category,price,price_label,location,image_url,negotiable,status,created_at",
      { count: "exact" }
    );

  // Filters
  if (type !== "all") query = query.eq("listing_type", type);
  if (category !== "all") query = query.eq("category", category);

  // Default: active only, unless toggles included
  const statuses: StatusKey[] = ["active"];
  if (includeInactive) statuses.push("inactive");
  if (includeSold) statuses.push("sold");
  query = query.in("status", statuses);

  // Search (server-side)
  if (q) {
    const safe = escapeLike(q);
    query = query.or(
      `title.ilike.%${safe}%,description.ilike.%${safe}%,location.ilike.%${safe}%`
    );
  }

  // SQL ordering
  if (sort === "price_asc") {
    // push null prices to the end by ordering price ascending (nulls last not guaranteed in PostgREST)
    query = query.order("price", { ascending: true }).order("created_at", { ascending: false });
  } else if (sort === "price_desc") {
    query = query.order("price", { ascending: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  // Pagination
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Explore</h1>

          {error ? (
            <p className="mt-1 text-sm text-red-600">
              Couldn’t load listings. Check Supabase env vars + server logs.
            </p>
          ) : (
            <p className="mt-1 text-sm text-zinc-600">
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
          className="hidden sm:inline-flex rounded-xl bg-black px-4 py-2 text-sm text-white no-underline"
        >
          Post Listing
        </Link>
      </div>

      {/* Sticky filters */}
      <div className="sticky top-0 z-10 -mx-2 border-b bg-zinc-50/80 px-2 py-3 backdrop-blur">
        <div className="space-y-3">
          {/* Search */}
          <form method="GET" action="/explore" className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search phones, food, services…"
              className="w-full rounded-2xl border bg-white px-4 py-2 text-sm outline-none placeholder:text-zinc-400"
            />
            {/* preserve filters */}
            {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
            {category !== "all" ? <input type="hidden" name="category" value={category} /> : null}
            {sort !== "newest" ? <input type="hidden" name="sort" value={sort} /> : null}
            {includeSold ? <input type="hidden" name="sold" value="1" /> : null}
            {includeInactive ? <input type="hidden" name="inactive" value="1" /> : null}

            <button className="rounded-2xl bg-black px-4 py-2 text-sm text-white">Search</button>
          </form>

          {/* Row: type + sort + clear */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill href={buildExploreHref({ ...activeFilters, type: "all", page: 1 })} active={type === "all"} label="All" />
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

            <div className="flex items-center gap-2">
              <form method="GET" action="/explore" className="flex items-center gap-2">
                {/* preserve filters */}
                {q ? <input type="hidden" name="q" value={q} /> : null}
                {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
                {category !== "all" ? <input type="hidden" name="category" value={category} /> : null}
                {includeSold ? <input type="hidden" name="sold" value="1" /> : null}
                {includeInactive ? <input type="hidden" name="inactive" value="1" /> : null}

                <select
                  name="sort"
                  defaultValue={sort}
                  className="rounded-xl border bg-white px-3 py-2 text-sm"
                >
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price: Low → High</option>
                  <option value="price_desc">Price: High → Low</option>
                </select>

                <button className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-zinc-50">
                  Apply
                </button>
              </form>

              <Link
                href="/explore"
                className="rounded-xl border bg-white px-3 py-2 text-sm text-zinc-700 no-underline hover:bg-zinc-50"
              >
                Clear
              </Link>
            </div>
          </div>

          {/* Category chips */}
          <div className="flex flex-wrap gap-2">
            <Chip
              href={buildExploreHref({ ...activeFilters, category: "all", page: 1 })}
              active={category === "all"}
              label="All categories"
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

          {/* Status toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <SmallToggle
              href={buildExploreHref({ ...activeFilters, sold: includeSold ? "" : "1", page: 1 })}
              active={includeSold}
              label="Include sold"
            />
            <SmallToggle
              href={buildExploreHref({ ...activeFilters, inactive: includeInactive ? "" : "1", page: 1 })}
              active={includeInactive}
              label="Include inactive"
            />
            {!includeSold && !includeInactive ? (
              <span className="text-xs text-zinc-500">Default: active only</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Results */}
      {listings.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <p className="text-sm font-medium text-zinc-800">No results found</p>
          <p className="mt-1 text-sm text-zinc-600">
            Try a different search, or clear your filters.
          </p>

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
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <Link
              href={buildExploreHref({ ...activeFilters, page: Math.max(1, page - 1) })}
              className={[
                "rounded-xl border bg-white px-4 py-2 text-sm no-underline",
                page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-zinc-50",
              ].join(" ")}
            >
              ← Prev
            </Link>

            <div className="text-sm text-zinc-600">
              Page <span className="font-medium text-zinc-900">{page}</span> of{" "}
              <span className="font-medium text-zinc-900">{totalPages}</span>
            </div>

            <Link
              href={buildExploreHref({ ...activeFilters, page: Math.min(totalPages, page + 1) })}
              className={[
                "rounded-xl border bg-white px-4 py-2 text-sm no-underline",
                page >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-zinc-50",
              ].join(" ")}
            >
              Next →
            </Link>
          </div>
        </>
      )}

      {/* Mobile Post CTA */}
      <div className="sm:hidden">
        <Link
          href="/post"
          className="inline-flex w-full justify-center rounded-2xl bg-black px-4 py-3 text-sm text-white no-underline"
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

function SmallToggle({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-3 py-1 text-xs no-underline",
        active ? "bg-black text-white border-black" : "bg-white text-zinc-700 hover:bg-zinc-50",
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
        <ListingImage
          src={listing.image_url ?? "/images/placeholder.svg"}
          alt={listing.title}
          className={["transition-transform", isSold || isInactive ? "" : "group-hover:scale-[1.02]"]
            .filter(Boolean)
            .join(" ")}
        />

        {isSold ? (
          <div className="absolute left-3 top-3">
            <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">SOLD</span>
          </div>
        ) : isInactive ? (
          <div className="absolute left-3 top-3">
            <span className="rounded-full bg-zinc-700 px-3 py-1 text-xs font-semibold text-white">
              INACTIVE
            </span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
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
          <span className="truncate">{listing.location ?? "—"}</span>
          <span>{listing.created_at ? new Date(listing.created_at).toLocaleDateString("en-NG") : ""}</span>
        </div>
      </div>
    </Link>
  );
}
