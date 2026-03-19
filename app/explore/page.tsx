// app/explore/page.tsx
import Link from "next/link";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ListingRow, ListingType, ListingCondition, RiderRow, CourierRow } from "@/lib/types";
import { LISTING_CONDITION_LABELS } from "@/lib/types";
import ListingImage from "@/components/ListingImage";
import { Search, ArrowRight, ArrowLeft } from "lucide-react";
import MobileFilterSheet from "@/components/explore/MobileFilterSheet";
import ExploreNavProgress from "@/components/explore/ExploreNavProgress";
import PriceRangeSlider from "@/components/explore/PriceRangeSlider";
import VendorsClient from "@/app/vendors/VendorsClient";
import DeliveryClient from "@/app/delivery/DeliveryClient";
import CouriersClient from "@/app/couriers/CouriersClient";

type ExploreTab = "listings" | "vendors" | "delivery" | "transport";

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

type SortKey = "smart" | "newest" | "price_asc" | "price_desc";
type StatusKey = "active" | "inactive" | "sold";

function buildExploreHref(params: {
  q?: string;
  type?: string;
  category?: string;
  condition?: string;
  sort?: string;
  page?: string | number;
  sold?: string;
  inactive?: string;
  min_price?: string | number;
  max_price?: string | number;
  negotiable?: string;
}) {
  const sp = new URLSearchParams();

  const q = (params.q ?? "").trim();
  const type = (params.type ?? "all").trim();
  const category = (params.category ?? "all").trim();
  const sort = (params.sort ?? "smart").trim();
  const pageStr = String(params.page ?? "").trim();

  if (q) sp.set("q", q);
  if (type && type !== "all") sp.set("type", type);
  if (category && category !== "all") sp.set("category", category);
  if (sort && sort !== "smart") sp.set("sort", sort);

  if (params.condition) sp.set("condition", params.condition);
  if (params.sold === "1") sp.set("sold", "1");
  if (params.inactive === "1") sp.set("inactive", "1");
  if (params.negotiable === "1") sp.set("negotiable", "1");

  const minP = String(params.min_price ?? "").trim();
  const maxP = String(params.max_price ?? "").trim();
  if (minP && minP !== "0") sp.set("min_price", minP);
  if (maxP) sp.set("max_price", maxP);

  if (pageStr && pageStr !== "1") sp.set("page", pageStr);

  const qs = sp.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

function clampPage(n: number) {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 999) return 999;
  return Math.floor(n);
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
    tab?: string;
    q?: string;
    type?: string;
    category?: string;
    condition?: string;
    sort?: string;
    page?: string;
    sold?: string;
    inactive?: string;
    min_price?: string;
    max_price?: string;
    negotiable?: string;
  }>;
}) {
  const supabase = await createSupabaseServerClient();
  const sp = (searchParams ? await searchParams : {}) as {
    tab?: string;
    q?: string;
    type?: string;
    category?: string;
    condition?: string;
    sort?: string;
    page?: string;
    sold?: string;
    inactive?: string;
    min_price?: string;
    max_price?: string;
    negotiable?: string;
  };

  // ── Tab routing ──────────────────────────────────────────────────────────
  const activeTab = (sp.tab ?? "listings") as ExploreTab;

  // Vendors tab — fetch server-side, same as /vendors/page.tsx
  if (activeTab === "vendors") {
    const PER_PAGE_V = 18;
    type VendorType = "food" | "mall" | "student" | "other";
    type SortKey = "type" | "name_asc" | "name_desc";

    const vQ = (sp.q ?? "").trim();
    const vType = (sp.type ?? "all").trim() as "all" | VendorType;
    const vSort = (sp.sort ?? "type").trim() as SortKey;
    const vPage = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
    const vStart = (vPage - 1) * PER_PAGE_V;
    const vEnd = vStart + PER_PAGE_V - 1;

    let vQuery = supabase
      .from("vendors")
      .select(
        "id, name, whatsapp, phone, location, verified, verification_status, vendor_type, avatar_url",
        { count: "exact" }
      )
      .or("verification_status.eq.verified,verified.eq.true");

    if (vType !== "all") vQuery = vQuery.eq("vendor_type", vType);
    if (vQ) {
      const safe = vQ.replaceAll(",", " ");
      vQuery = vQuery.or(`name.ilike.%${safe}%,location.ilike.%${safe}%`);
    }
    if (vSort === "name_asc") {
      vQuery = vQuery.order("name", { ascending: true, nullsFirst: false });
    } else if (vSort === "name_desc") {
      vQuery = vQuery.order("name", { ascending: false, nullsFirst: false });
    } else {
      vQuery = vQuery
        .order("vendor_type", { ascending: true })
        .order("name", { ascending: true, nullsFirst: false });
    }
    vQuery = vQuery.range(vStart, vEnd);

    const { data: vData, count: vCount, error: vErr } = await vQuery;
    const vVendors = (vData ?? []) as any[];

    // Meta: ratings + listing counts
    type VMeta = { rating: { avg: number; count: number } | null; listingCount: number };
    let vMeta: Record<string, VMeta> = {};
    const vIds = vVendors.map((v: any) => v.id);
    if (vIds.length > 0) {
      const [revRes, lstRes] = await Promise.all([
        supabase.from("vendor_reviews").select("vendor_id, rating").in("vendor_id", vIds),
        supabase.from("listings").select("vendor_id").in("vendor_id", vIds).eq("status", "active"),
      ]);
      const rMap: Record<string, { sum: number; count: number }> = {};
      for (const r of revRes.data ?? []) {
        const e = rMap[r.vendor_id];
        rMap[r.vendor_id] = e ? { sum: e.sum + r.rating, count: e.count + 1 } : { sum: r.rating, count: 1 };
      }
      const lMap: Record<string, number> = {};
      for (const l of lstRes.data ?? []) { lMap[l.vendor_id] = (lMap[l.vendor_id] ?? 0) + 1; }
      for (const id of vIds) {
        const r = rMap[id];
        vMeta[id] = { rating: r ? { avg: r.sum / r.count, count: r.count } : null, listingCount: lMap[id] ?? 0 };
      }
    }

    return (
      <div className="space-y-4">
        <ExploreTabs active="vendors" />
        <VendorsClient
          initialVendors={vVendors}
          initialTotal={vCount ?? 0}
          initialMeta={vMeta}
          initialError={vErr?.message ?? null}
          qParam={vQ}
          typeParam={vType}
          sortParam={vSort}
          pageParam={vPage}
        />
      </div>
    );
  }

  if (activeTab === "delivery") {
    const { data: ridersData } = await supabase
      .from("riders")
      .select("id,name,phone,whatsapp,zone,fee_note,is_available,verified,created_at")
      .order("verified", { ascending: false })
      .order("is_available", { ascending: false })
      .order("created_at", { ascending: false });
    const riders = (ridersData ?? []) as RiderRow[];

    return (
      <div className="space-y-4">
        <ExploreTabs active="delivery" />
        <div className="mx-auto max-w-2xl">
          <DeliveryClient listing={null} riders={riders} />
        </div>
      </div>
    );
  }

  if (activeTab === "transport") {
    const { data: couriersData, error: couriersError } = await supabase
      .from("couriers")
      .select("id,name,whatsapp,phone,base_location,areas_covered,hours,price_note,verified,active,featured,created_at")
      .eq("active", true)
      .eq("verified", true)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false });
    const couriers = (couriersData ?? []) as CourierRow[];

    const prefill = `Hi! I need campus transport.\n\nPickup: (where to pick)\nDrop-off: (my location)\nBudget: (₦...)\n\nCan you help?`;

    return (
      <div className="space-y-4">
        <ExploreTabs active="transport" />
        <CouriersClient
          listingId=""
          listingTitle={null}
          listingPickup={null}
          prefill={prefill}
          couriers={couriers}
          loadError={couriersError?.message ?? null}
        />
      </div>
    );
  }

  const qRaw = (sp.q ?? "").trim();
  const q = qRaw; // keep original for UI
  const type = (sp.type ?? "all") as "all" | ListingType;
  const category = (sp.category ?? "all").trim();
  const sort = ((sp.sort ?? "smart").trim() as SortKey) || "smart";

  const VALID_CONDITIONS: ListingCondition[] = ["new", "fairly_used", "used", "for_parts"];
  const conditionFilter = sp.condition && VALID_CONDITIONS.includes(sp.condition as ListingCondition)
    ? (sp.condition as ListingCondition)
    : null;

  const includeSold = sp.sold === "1";
  const includeInactive = sp.inactive === "1";
  const onlyNegotiable = sp.negotiable === "1";

  const minPrice = sp.min_price ? parseInt(sp.min_price, 10) : null;
  const maxPrice = sp.max_price ? parseInt(sp.max_price, 10) : null;

  const page = clampPage(Number(sp.page ?? "1"));
  const PAGE_SIZE = 24;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const statuses: StatusKey[] = ["active"];
  if (includeInactive) statuses.push("inactive");
  if (includeSold) statuses.push("sold");

  const rpcBaseParams = {
    p_q:         qRaw && qRaw.length >= 2 ? qRaw : null,
    p_type:      type === "all" ? "all" : type,
    p_category:  category,
    p_statuses:  statuses,
    p_min_price: minPrice  ?? null,
    p_max_price: maxPrice  ?? null,
    p_negotiable: onlyNegotiable ? true : null,
    p_condition: conditionFilter ?? null,
  } as const;

  let listings: ListingRow[] = [];
  let error: any = null;
  let count: number | null = null;

  if (sort === "smart") {
    // For smart sort: use the ranking RPC for results AND a matching count RPC
    // so that pagination totals are always based on the same filter logic.
    const [rankedResult, countResult] = await Promise.all([
      supabase.rpc("explore_ranked_listings", { ...rpcBaseParams, p_from: from, p_to: to }),
      supabase.rpc("explore_ranked_count", rpcBaseParams),
    ]);

    listings = (rankedResult.data ?? []) as ListingRow[];
    count    = typeof countResult.data === "number" ? countResult.data : null;
    error    = rankedResult.error ?? countResult.error ?? null;

  } else {
    // For price/newest sorts: plain query + count — no need for the RPC.
    let query = supabase
      .from("listings")
      .select(
        "id,title,description,listing_type,category,condition,price,price_label,location,image_url,negotiable,status,created_at,vendor_id"
      );
    let countQuery = supabase.from("listings").select("id", { count: "exact", head: true });

    const applyFilters = <T extends typeof query | typeof countQuery>(q: T): T => {
      if (type !== "all")   q = (q as typeof query).eq("listing_type", type) as T;
      if (category !== "all") q = (q as typeof query).eq("category", category) as T;
      q = (q as typeof query).in("status", statuses) as T;
      if (minPrice !== null && Number.isFinite(minPrice)) q = (q as typeof query).gte("price", minPrice) as T;
      if (maxPrice !== null && Number.isFinite(maxPrice)) q = (q as typeof query).lte("price", maxPrice) as T;
      if (onlyNegotiable) q = (q as typeof query).eq("negotiable", true) as T;
      if (conditionFilter) q = (q as typeof query).eq("condition", conditionFilter) as T;
      if (qRaw && qRaw.length >= 2) {
        q = (q as typeof query).textSearch("search_vector", qRaw, {
          type: "websearch",
          config: "english",
        }) as T;
      }
      // Exclude listings from food vendors — they are fully siloed to /food
      q = (q as typeof query).not(
        "vendor_id",
        "in",
        `(select id from vendors where vendor_type = 'food')`
      ) as T;
      return q;
    };

    query      = applyFilters(query);
    countQuery = applyFilters(countQuery);

    // Order: when a search query is present, secondary-sort by ts_rank so
    // the most relevant matches rise to the top within the chosen sort order.
    if (sort === "price_asc") {
      query = query
        .order("price", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
    } else if (sort === "price_desc") {
      query = query
        .order("price", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    } else {
      // "newest"
      query = query.order("created_at", { ascending: false });
    }

    query = query.range(from, to);

    const [{ data, error: dataError }, { count: c, error: countError }] = await Promise.all([
      query,
      countQuery,
    ]);

    listings = (data ?? []) as ListingRow[];
    count    = c ?? null;
    error    = dataError ?? countError ?? null;
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : from + 1;
  const showingTo = Math.min(total, to + 1);

  // Secondary fetches: vendor trust signals + listing stats — parallel, small queries.
  type VendorSnippet = { id: string; name: string | null; verified: boolean; verification_status: string | null };
  let vendorMap: Record<string, VendorSnippet> = {};
  let statsMap: Record<string, { views: number; saves: number }> = {};

  const listingIds = listings.map((l) => l.id);
  const vendorIds = [...new Set(listings.map((l) => (l as any).vendor_id).filter(Boolean))] as string[];

  const parallelFetches: Promise<void>[] = [];

  if (vendorIds.length > 0) {
    parallelFetches.push(
      supabase
        .from("vendors")
        .select("id, name, verified, verification_status")
        .in("id", vendorIds)
        .then(({ data }) => {
          for (const v of data ?? []) vendorMap[v.id] = v as VendorSnippet;
        })
    );
  }

  if (listingIds.length > 0) {
    parallelFetches.push(
      supabase
        .from("listing_stats")
        .select("listing_id, views, saves")
        .in("listing_id", listingIds)
        .then(({ data }) => {
          for (const s of data ?? [])
            statsMap[s.listing_id] = { views: Number(s.views ?? 0), saves: Number(s.saves ?? 0) };
        })
    );
  }

  await Promise.all(parallelFetches);

  const activeFilters = {
    q,
    type,
    category,
    condition: conditionFilter ?? "",
    sort,
    sold: includeSold ? "1" : "",
    inactive: includeInactive ? "1" : "",
    negotiable: onlyNegotiable ? "1" : "",
    min_price: minPrice !== null ? String(minPrice) : "",
    max_price: maxPrice !== null ? String(maxPrice) : "",
  };

  const hasAnyFilter =
    !!q ||
    type !== "all" ||
    category !== "all" ||
    !!conditionFilter ||
    sort !== "smart" ||
    includeSold ||
    includeInactive ||
    onlyNegotiable ||
    minPrice !== null ||
    maxPrice !== null;

  const clearSearchHref = buildExploreHref({ ...activeFilters, q: "", page: 1 });

  const resultsSection = (
    <>
      {listings.length === 0 ? (
        <div className="rounded-3xl border bg-white p-6">
          <p className="text-sm font-semibold text-zinc-900">No results found</p>
          <p className="mt-1 text-sm text-zinc-600">
            Try a different search, or remove a filter.
            {qRaw && qRaw.length < 2 ? (
              <span className="ml-1 text-xs text-zinc-500">(Tip: use at least 2 characters.)</span>
            ) : null}
          </p>

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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} vendor={vendorMap[(l as any).vendor_id] ?? null} stats={statsMap[l.id] ?? null} />
            ))}
          </div>

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
    </>
  );

  return (
    <div className="space-y-4">
      {/* Explore section tabs */}
      <ExploreTabs active="listings" />

      {/* Progress bar — shown immediately when a filter link is clicked */}
      <Suspense fallback={null}>
        <ExploreNavProgress />
      </Suspense>

      {/* Header */}
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

      {/* Desktop layout (sidebar + results). Mobile stays exactly the same. */}
      <div className="hidden md:grid md:grid-cols-[320px,1fr] md:gap-6">
        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-3xl border bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-zinc-900">Search</p>
            <form method="GET" action="/explore" className="mt-3 flex w-full items-center gap-2">
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
                {sort !== "smart" ? <input type="hidden" name="sort" value={sort} /> : null}
                {includeSold ? <input type="hidden" name="sold" value="1" /> : null}
                {includeInactive ? <input type="hidden" name="inactive" value="1" /> : null}

                {q ? (
                  <Link
                    href={clearSearchHref}
                    className="grid h-10 w-10 place-items-center rounded-xl text-zinc-600 hover:bg-zinc-100"
                    aria-label="Clear search"
                    title="Clear search"
                  >
                    ×
                  </Link>
                ) : (
                  <span
                    className="grid h-10 w-10 place-items-center rounded-xl text-zinc-300"
                    aria-hidden="true"
                  >
                    ×
                  </span>
                )}

                <button
                  type="submit"
                  className="h-10 rounded-xl bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Go
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-3xl border bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-zinc-900">Filters</p>
            <p className="mt-1 text-xs text-zinc-600">Refine results — desktop stays non-sticky.</p>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
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

              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700">Sort</p>
                <div className="grid grid-cols-2 gap-2">
                  <SortLink
                    href={buildExploreHref({ ...activeFilters, sort: "smart", page: 1 })}
                    active={sort === "smart"}
                    label="Smart"
                  />
                  <SortLink
                    href={buildExploreHref({ ...activeFilters, sort: "newest", page: 1 })}
                    active={sort === "newest"}
                    label="Newest"
                  />
                  <SortLink
                    href={buildExploreHref({ ...activeFilters, sort: "price_asc", page: 1 })}
                    active={sort === "price_asc"}
                    label="Price ↑"
                  />
                  <SortLink
                    href={buildExploreHref({ ...activeFilters, sort: "price_desc", page: 1 })}
                    active={sort === "price_desc"}
                    label="Price ↓"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700">Negotiable</p>
                <SmallToggle
                  href={buildExploreHref({ ...activeFilters, negotiable: onlyNegotiable ? "" : "1", page: 1 })}
                  active={onlyNegotiable}
                  label="Negotiable only"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700">Condition</p>
                <div className="flex flex-wrap gap-2">
                  <Pill
                    href={buildExploreHref({ ...activeFilters, condition: "", page: 1 })}
                    active={!conditionFilter}
                    label="Any"
                  />
                  {(Object.entries(LISTING_CONDITION_LABELS) as [ListingCondition, string][]).map(([value, label]) => (
                    <Pill
                      key={value}
                      href={buildExploreHref({ ...activeFilters, condition: conditionFilter === value ? "" : value, page: 1 })}
                      active={conditionFilter === value}
                      label={label}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700">Price range (₦)</p>
                <PriceRangeSlider
                  currentMin={minPrice}
                  currentMax={maxPrice}
                  baseHref={buildExploreHref({ ...activeFilters, min_price: "", max_price: "", page: 1 })}
                />
              </div>

              <div className="space-y-2">
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
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700">Category</p>
                <div className="grid grid-cols-1 gap-2">
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

              <div className="flex items-center justify-between gap-2">
                <Link
                  href="/explore"
                  className="rounded-2xl border bg-white px-4 py-2 text-sm text-zinc-800 no-underline hover:bg-zinc-50"
                >
                  Reset all
                </Link>
                {hasAnyFilter ? (
                  <span className="text-xs text-zinc-500">Filtered</span>
                ) : (
                  <span className="text-xs text-zinc-500">All listings</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="min-w-0 space-y-4">
          {hasAnyFilter ? (
            <div className="flex flex-wrap items-center gap-2">
              {q ? <ActiveChip label={`“${q}”`} href={clearSearchHref} /> : null}

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

              {sort !== "smart" ? (
                <ActiveChip
                  label={sort === "price_asc" ? "Price ↑" : sort === "price_desc" ? "Price ↓" : "Newest"}
                  href={buildExploreHref({ ...activeFilters, sort: "smart", page: 1 })}
                />
              ) : null}

              {onlyNegotiable ? (
                <ActiveChip label="Negotiable" href={buildExploreHref({ ...activeFilters, negotiable: "", page: 1 })} />
              ) : null}

              {conditionFilter ? (
                <ActiveChip
                  label={LISTING_CONDITION_LABELS[conditionFilter]}
                  href={buildExploreHref({ ...activeFilters, condition: "", page: 1 })}
                />
              ) : null}

              {minPrice !== null || maxPrice !== null ? (
                <ActiveChip
                  label={`₦${minPrice !== null ? minPrice.toLocaleString("en-NG") : "0"} – ${maxPrice !== null ? "₦" + maxPrice.toLocaleString("en-NG") : "any"}`}
                  href={buildExploreHref({ ...activeFilters, min_price: "", max_price: "", page: 1 })}
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

          {resultsSection}
        </div>
      </div>

      {/* Mobile controls (kept as-is, only wrapped in md:hidden) */}
      <div className="md:hidden sticky top-0 z-10 -mx-4 border-b bg-white/90 px-4 py-3 backdrop-blur">
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
              {sort !== "smart" ? <input type="hidden" name="sort" value={sort} /> : null}
              {includeSold ? <input type="hidden" name="sold" value="1" /> : null}
              {includeInactive ? <input type="hidden" name="inactive" value="1" /> : null}

              {/* ✅ Clear now removes q from URL (not just input reset) */}
              {q ? (
                <Link
                  href={clearSearchHref}
                  className="grid h-10 w-10 place-items-center rounded-xl text-zinc-600 hover:bg-zinc-100"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  ×
                </Link>
              ) : (
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl text-zinc-300"
                  aria-hidden="true"
                >
                  ×
                </span>
              )}

              <button
                type="submit"
                className="h-10 rounded-xl bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Go
              </button>
            </div>
          </form>

          {/* ✅ Filters: client-controlled sheet — closes on filter tap */}
          <MobileFilterSheet hasActiveFilters={hasAnyFilter}>
            <div className="space-y-4">
              {/* Type pills */}
              <div className="space-y-2">
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
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700">Sort</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SortLink
                    href={buildExploreHref({ ...activeFilters, sort: "smart", page: 1 })}
                    active={sort === "smart"}
                    label="Smart"
                  />
                  <SortLink
                    href={buildExploreHref({ ...activeFilters, sort: "newest", page: 1 })}
                    active={sort === "newest"}
                    label="Newest"
                  />
                  <SortLink
                    href={buildExploreHref({ ...activeFilters, sort: "price_asc", page: 1 })}
                    active={sort === "price_asc"}
                    label="Price ↑"
                  />
                  <SortLink
                    href={buildExploreHref({ ...activeFilters, sort: "price_desc", page: 1 })}
                    active={sort === "price_desc"}
                    label="Price ↓"
                  />
                </div>
              </div>

              {/* Negotiable */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700">Negotiable</p>
                <SmallToggle
                  href={buildExploreHref({ ...activeFilters, negotiable: onlyNegotiable ? "" : "1", page: 1 })}
                  active={onlyNegotiable}
                  label="Negotiable only"
                />
              </div>

              {/* Condition */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700">Condition</p>
                <div className="flex flex-wrap gap-2">
                  <Pill
                    href={buildExploreHref({ ...activeFilters, condition: "", page: 1 })}
                    active={!conditionFilter}
                    label="Any"
                  />
                  {(Object.entries(LISTING_CONDITION_LABELS) as [ListingCondition, string][]).map(([value, label]) => (
                    <Pill
                      key={value}
                      href={buildExploreHref({ ...activeFilters, condition: conditionFilter === value ? "" : value, page: 1 })}
                      active={conditionFilter === value}
                      label={label}
                    />
                  ))}
                </div>
              </div>

              {/* Price range */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-700">Price range (₦)</p>
                <PriceRangeSlider
                  currentMin={minPrice}
                  currentMax={maxPrice}
                  baseHref={buildExploreHref({ ...activeFilters, min_price: "", max_price: "", page: 1 })}
                />
              </div>

              {/* Status toggles */}
              <div className="space-y-2">
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
              <div className="flex items-center justify-between gap-2">
                <Link
                  href="/explore"
                  className="rounded-2xl border bg-white px-4 py-2 text-sm text-zinc-800 no-underline hover:bg-zinc-50"
                >
                  Reset all
                </Link>
                <span className="text-xs text-zinc-500">Categories are below</span>
              </div>
            </div>
          </MobileFilterSheet>
        </div>

        {/* Active filter chips row */}
        {hasAnyFilter ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {q ? <ActiveChip label={`“${q}”`} href={clearSearchHref} /> : null}

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

            {sort !== "smart" ? (
              <ActiveChip
                label={sort === "price_asc" ? "Price ↑" : sort === "price_desc" ? "Price ↓" : "Newest"}
                href={buildExploreHref({ ...activeFilters, sort: "smart", page: 1 })}
              />
            ) : null}

            {onlyNegotiable ? (
              <ActiveChip label="Negotiable" href={buildExploreHref({ ...activeFilters, negotiable: "", page: 1 })} />
            ) : null}

            {conditionFilter ? (
              <ActiveChip
                label={LISTING_CONDITION_LABELS[conditionFilter]}
                href={buildExploreHref({ ...activeFilters, condition: "", page: 1 })}
              />
            ) : null}

            {minPrice !== null || maxPrice !== null ? (
              <ActiveChip
                label={`₦${minPrice !== null ? minPrice.toLocaleString("en-NG") : "0"} – ${maxPrice !== null ? "₦" + maxPrice.toLocaleString("en-NG") : "any"}`}
                href={buildExploreHref({ ...activeFilters, min_price: "", max_price: "", page: 1 })}
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

        {/* Categories: mobile horizontal scroll (with subtle edge fade) */}
        <div className="relative mt-3 -mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <style>{`div::-webkit-scrollbar{display:none}`}</style>

          {/* fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white/90 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white/90 to-transparent" />

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

      {/* Results (mobile + small screens) */}
      <div className="md:hidden">{resultsSection}</div>

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

function SortLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={[
        "rounded-2xl border px-3 py-2 text-sm font-medium no-underline text-center",
        active ? "bg-black text-white border-black" : "bg-white text-zinc-900 hover:bg-zinc-50",
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

function ListingCard({
  listing,
  vendor,
  stats,
}: {
  listing: ListingRow;
  vendor: { id: string; name: string | null; verified: boolean; verification_status: string | null } | null;
  stats: { views: number; saves: number } | null;
}) {
  const priceText =
    listing.price !== null ? formatNaira(listing.price) : listing.price_label ?? "Contact for price";

  const typeLabel = listing.listing_type === "product" ? "Product" : "Service";
  const isSold = listing.status === "sold";
  const isInactive = listing.status === "inactive";
  const isNew =
    !isSold &&
    !isInactive &&
    !!listing.created_at &&
    Date.now() - new Date(listing.created_at).getTime() < 24 * 60 * 60 * 1000;

  const desc = (listing.description ?? "").trim();

  const isVerified =
    vendor?.verified === true || vendor?.verification_status === "verified";

  return (
    <Link
      href={`/listing/${listing.id}`}
      className={[
        "group overflow-hidden rounded-3xl border bg-white no-underline transition-shadow hover:shadow-sm",
        isSold || isInactive ? "opacity-90" : "",
      ].join(" ")}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100">
        <ListingImage
          src={listing.image_url ?? "/images/placeholder.svg"}
          alt={listing.title ?? "Listing"}
          className={[
            "transition-transform",
            isSold || isInactive ? "" : "group-hover:scale-[1.02]",
          ].join(" ")}
        />

        {/* Status / New badge */}
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
        ) : isNew ? (
          <div className="absolute left-3 top-3">
            <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">
              NEW
            </span>
          </div>
        ) : null}

        {/* Price badge */}
        <div className="absolute bottom-3 left-3">
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-900 backdrop-blur">
            {priceText}
          </span>
        </div>
      </div>

      <div className="space-y-2 p-3">
        {/* tags */}
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

          {desc ? (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{desc}</p>
          ) : null}
        </div>

        {/* Vendor trust row */}
        {vendor?.name ? (
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs text-zinc-500">{vendor.name}</span>
            {isVerified && (
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                ✓ Verified
              </span>
            )}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
          <span className="truncate">{listing.location ?? "—"}</span>
          <div className="flex shrink-0 items-center gap-2">
            {stats && stats.saves > 0 ? (
              <span className="text-zinc-400">{stats.saves} saved</span>
            ) : null}
            <span>
              {listing.created_at ? new Date(listing.created_at).toLocaleDateString("en-NG") : ""}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Explore Tab Bar ──────────────────────────────────────────────────────────

const EXPLORE_TABS: { key: ExploreTab; label: string; emoji: string; desc: string }[] = [
  { key: "listings", label: "Listings", emoji: "🏷️", desc: "Products & services" },
  { key: "vendors", label: "Vendors", emoji: "🏪", desc: "Campus shops" },
  { key: "delivery", label: "Delivery", emoji: "🛵", desc: "For food and marketplace item delivery on campus" },
  { key: "transport", label: "Transport", emoji: "🚗", desc: "Moving goods off-campus or between locations" },
];

function ExploreTabs({ active }: { active: ExploreTab }) {
  return (
    <div className="relative -mx-4 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:mx-0 md:px-0">
      <div className="flex w-max gap-2 md:w-auto">
        {EXPLORE_TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.key === "listings" ? "/explore" : `/explore?tab=${tab.key}`}
              className={[
                "flex items-center gap-2 whitespace-nowrap rounded-2xl border px-4 py-2.5 text-sm font-medium no-underline transition-colors",
                isActive
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
              ].join(" ")}
            >
              <span className="text-base leading-none">{tab.emoji}</span>
              <span>
                {tab.label}
                <span className="block text-[10px] font-normal mt-0.5 opacity-70">{tab.desc}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}