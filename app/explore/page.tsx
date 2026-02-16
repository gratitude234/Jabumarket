// app/explore/page.tsx
import Link from "next/link";
import { Search, SlidersHorizontal, X, ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase/server";

function formatNaira(amount: number | null | undefined) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "₦0";
  return `₦${n.toLocaleString("en-NG")}`;
}

type ListingRow = {
  id: string;
  title: string | null;
  price: number | null;
  category: string | null;
  listing_type: string | null; // "product" | "service" etc
  created_at: string | null;
  image_url?: string | null;
  status?: string | null; // "active" | "sold" | "inactive" (if your schema has it)
};

const CATEGORIES = ["All", "Phones", "Laptops", "Fashion", "Provisions", "Food", "Beauty", "Services", "Others"] as const;
const TYPES = ["all", "product", "service"] as const;
const SORTS = ["newest", "price_low", "price_high"] as const;
const STATUSES = ["active", "active_sold", "active_inactive", "all"] as const;

function buildExploreHref(params: {
  q?: string;
  type?: string;
  category?: string;
  sort?: string;
  status?: string;
  page?: string | number;
}) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.type && params.type !== "all") sp.set("type", params.type);
  if (params.category && params.category !== "all" && params.category !== "All") sp.set("category", params.category);
  if (params.sort && params.sort !== "newest") sp.set("sort", params.sort);
  if (params.status && params.status !== "active") sp.set("status", params.status);
  if (params.page && String(params.page) !== "1") sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/explore?${qs}` : "/explore";
}

function countActiveFilters(sp: {
  q?: string;
  type?: string;
  category?: string;
  sort?: string;
  status?: string;
}) {
  let n = 0;
  if ((sp.q ?? "").trim()) n++;
  if ((sp.type ?? "all") !== "all") n++;
  if ((sp.category ?? "all") !== "all" && (sp.category ?? "all") !== "All") n++;
  if ((sp.sort ?? "newest") !== "newest") n++;
  if ((sp.status ?? "active") !== "active") n++;
  return n;
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    type?: string;
    category?: string;
    sort?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const q = (sp.q ?? "").trim();
  const type = (sp.type ?? "all").trim();
  const category = (sp.category ?? "all").trim();
  const sort = (sp.sort ?? "newest").trim();
  const status = (sp.status ?? "active").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const perPage = 12;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const activeFilters = countActiveFilters({ q, type, category, sort, status });

  // ---- Query
  let query = supabase
    .from("listings")
    .select("id, title, price, category, listing_type, created_at, image_url, status", { count: "exact" });

  // Status filter (safe default: only active)
  // If your table doesn't have "status", remove these filters.
  if (status === "active") query = query.eq("status", "active");
  else if (status === "active_sold") query = query.in("status", ["active", "sold"]);
  else if (status === "active_inactive") query = query.in("status", ["active", "inactive"]);
  // else "all" => no filter

  // Type/category filters
  if (type !== "all") query = query.eq("listing_type", type);
  if (category !== "all" && category !== "All") query = query.eq("category", category);

  // Search (title/category)
  if (q) {
    // If you have description column, add it here too
    query = query.or(`title.ilike.%${q}%,category.ilike.%${q}%`);
  }

  // Sort
  if (sort === "price_low") query = query.order("price", { ascending: true, nullsFirst: false });
  else if (sort === "price_high") query = query.order("price", { ascending: false, nullsFirst: false });
  else query = query.order("created_at", { ascending: false });

  // Pagination range
  query = query.range(from, to);

  const { data, error, count } = await query;
  const listings = (data ?? []) as ListingRow[];

  const total = Number(count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const clearHref = "/explore";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 sm:pb-10 sm:pt-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Explore</h1>
          <p className="mt-1 text-sm text-muted-foreground">Find products and services around campus.</p>
        </div>

        <div className="flex gap-2">
          <Link href="/post" className="btn-primary">
            + Post
          </Link>
          <Link href="/vendors" className="btn-outline">
            Vendors
          </Link>
        </div>
      </div>

      {/* Sticky mobile toolbar + Filter drawer (no JS, mobile-first) */}
      <details className="group mt-4 rounded-3xl border bg-card shadow-sm sm:mt-6">
        {/* Sticky toolbar */}
        <div className="sticky top-0 z-20 rounded-3xl bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:p-4">
          {/* Search */}
          <form action="/explore" method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Keep existing filters when searching */}
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="category" value={category} />
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="status" value={status} />

            <div className="flex flex-1 items-center gap-2 rounded-2xl border bg-background p-2 shadow-sm">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>

              <input
                name="q"
                defaultValue={q}
                placeholder="Search products & services…"
                list="explore-suggestions"
                className="h-10 w-full bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />

              {q ? (
                <Link
                  href={buildExploreHref({ q: "", type, category, sort, status, page: 1 })}
                  className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-secondary"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="reset"
                  className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-secondary"
                  aria-label="Reset form"
                  title="Reset"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <button type="submit" className="btn-primary h-10 px-4 py-0">
                Search
              </button>

              <datalist id="explore-suggestions">
                <option value="iPhone" />
                <option value="laptop" />
                <option value="rice" />
                <option value="laundry" />
                <option value="hair" />
                <option value="repairs" />
              </datalist>
            </div>

            {/* Filter toggle (summary) */}
            <summary className="list-none sm:hidden">
              <span className="btn-outline inline-flex w-full justify-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilters > 0 ? <span className="badge-success ml-1">+{activeFilters}</span> : null}
              </span>
            </summary>

            {/* Desktop inline controls */}
            <div className="hidden items-center gap-2 sm:flex">
              <Link href={clearHref} className="btn-outline">
                Clear
              </Link>

              <div className="rounded-2xl border bg-background px-3 py-2 text-sm text-muted-foreground">
                {total.toLocaleString("en-NG")} result{total === 1 ? "" : "s"}
              </div>
            </div>
          </form>

          {/* Mobile: small “active filters” line */}
          <div className="mt-3 flex items-center justify-between gap-2 sm:hidden">
            <div className="text-xs text-muted-foreground">
              {total.toLocaleString("en-NG")} result{total === 1 ? "" : "s"}
              {activeFilters > 0 ? <span className="ml-2">• {activeFilters} filter(s)</span> : null}
            </div>
            {activeFilters > 0 ? (
              <Link href={clearHref} className="text-xs font-medium text-primary hover:underline underline-offset-4">
                Clear all
              </Link>
            ) : null}
          </div>

          {/* Category chips (horizontal scroll, mobile-first) */}
          <div className="mt-3 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
            <style>{`div::-webkit-scrollbar{display:none}`}</style>
            {CATEGORIES.map((c) => {
              const isActive =
                (c === "All" && (category === "all" || category === "All" || !category)) || category === c;
              return (
                <Link
                  key={c}
                  href={buildExploreHref({
                    q,
                    type,
                    category: c === "All" ? "all" : c,
                    sort,
                    status,
                    page: 1,
                  })}
                  className={[
                    "shrink-0 rounded-full border px-3 py-2 text-xs font-medium",
                    isActive
                      ? "bg-primary text-primary-foreground border-transparent shadow-sm"
                      : "bg-background text-foreground hover:bg-secondary",
                  ].join(" ")}
                >
                  {c}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Drawer content (opens on mobile via summary; always visible on desktop) */}
        <div className="p-3 pt-0 sm:p-4 sm:pt-0">
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {/* Type */}
            <div className="rounded-2xl border bg-background p-3">
              <div className="text-sm font-semibold text-foreground">Type</div>
              <div className="mt-2 grid gap-2">
                {TYPES.map((t) => {
                  const isActive = type === t;
                  return (
                    <Link
                      key={t}
                      href={buildExploreHref({ q, type: t, category, sort, status, page: 1 })}
                      className={[
                        "rounded-xl border px-3 py-2 text-sm",
                        isActive ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-secondary",
                      ].join(" ")}
                    >
                      {t === "all" ? "All" : t === "product" ? "Products" : "Services"}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Sort */}
            <div className="rounded-2xl border bg-background p-3">
              <div className="text-sm font-semibold text-foreground">Sort</div>
              <div className="mt-2 grid gap-2">
                {SORTS.map((s) => {
                  const isActive = sort === s;
                  const label =
                    s === "newest" ? "Newest" : s === "price_low" ? "Price: Low → High" : "Price: High → Low";
                  return (
                    <Link
                      key={s}
                      href={buildExploreHref({ q, type, category, sort: s, status, page: 1 })}
                      className={[
                        "rounded-xl border px-3 py-2 text-sm",
                        isActive ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-secondary",
                      ].join(" ")}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Status */}
            <div className="rounded-2xl border bg-background p-3">
              <div className="text-sm font-semibold text-foreground">Status</div>
              <div className="mt-2 grid gap-2">
                {STATUSES.map((st) => {
                  const isActive = status === st;
                  const label =
                    st === "active"
                      ? "Active only"
                      : st === "active_sold"
                      ? "Active + Sold"
                      : st === "active_inactive"
                      ? "Active + Inactive"
                      : "All";
                  return (
                    <Link
                      key={st}
                      href={buildExploreHref({ q, type, category, sort, status: st, page: 1 })}
                      className={[
                        "rounded-xl border px-3 py-2 text-sm",
                        isActive ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-secondary",
                      ].join(" ")}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile close row */}
          <div className="mt-3 flex items-center justify-between sm:hidden">
            <span className="text-xs text-muted-foreground">
              {activeFilters > 0 ? `${activeFilters} filter(s) active` : "No filters active"}
            </span>
            <div className="flex gap-2">
              <Link href={clearHref} className="btn-outline">
                Clear
              </Link>
              {/* Closing details without JS: clicking summary toggles */}
              <summary className="list-none">
                <span className="btn-primary inline-flex justify-center">Done</span>
              </summary>
            </div>
          </div>
        </div>
      </details>

      {/* Results */}
      <section className="mt-6">
        {error ? (
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Something went wrong</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We couldn’t load listings right now. Try clearing filters or refreshing.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={clearHref} className="btn-outline">
                    Clear filters
                  </Link>
                  <Link href={buildExploreHref({ q, type, category, sort, status, page })} className="btn-primary">
                    Retry
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold text-foreground">No results</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try removing filters or searching a different keyword.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={clearHref} className="btn-primary">
                Clear all
              </Link>
              <Link href={buildExploreHref({ q: "food", type: "all", category: "all", sort: "newest", status: "active", page: 1 })} className="btn-outline">
                Try “food”
              </Link>
              <Link href={buildExploreHref({ q: "laundry", type: "service", category: "Services", sort: "newest", status: "active", page: 1 })} className="btn-outline">
                Try “laundry”
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => (
                <Link
                  key={l.id}
                  href={`/listing/${l.id}`}
                  className="group rounded-2xl border bg-card p-4 shadow-sm transition hover:bg-secondary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {l.title ?? "Untitled listing"}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {l.category ? (
                          <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-xs text-foreground">
                            {l.category}
                          </span>
                        ) : null}
                        {l.listing_type ? (
                          <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-xs text-foreground">
                            {l.listing_type}
                          </span>
                        ) : null}
                        {l.status && l.status !== "active" ? (
                          <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                            {l.status}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0 rounded-xl bg-background px-3 py-2 text-sm font-semibold text-foreground">
                      {formatNaira(l.price)}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Tap to view</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                Page <span className="font-medium text-foreground">{page}</span> of{" "}
                <span className="font-medium text-foreground">{totalPages}</span>
              </div>

              <div className="flex gap-2">
                {canPrev ? (
                  <Link
                    href={buildExploreHref({ q, type, category, sort, status, page: page - 1 })}
                    className="btn-outline"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Prev
                  </Link>
                ) : (
                  <span className="btn-outline pointer-events-none opacity-50">
                    <ArrowLeft className="h-4 w-4" />
                    Prev
                  </span>
                )}

                {canNext ? (
                  <Link
                    href={buildExploreHref({ q, type, category, sort, status, page: page + 1 })}
                    className="btn-primary"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className="btn-primary pointer-events-none opacity-50">
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
