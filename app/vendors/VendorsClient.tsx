"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Search,
  X,
  SlidersHorizontal,
  BadgeCheck,
  MapPin,
  Phone,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type VendorType = "food" | "mall" | "student" | "other";

type VendorRow = {
  id: string;
  name: string | null;
  whatsapp: string | null;
  phone: string | null;
  location: string | null;
  verified: boolean;
  vendor_type: VendorType;
};

const LABELS: Record<VendorType, string> = {
  food: "Food",
  mall: "Mall",
  student: "Students",
  other: "Other",
};

const SECTION_TITLES: Record<VendorType, string> = {
  food: "Food Vendors",
  mall: "JABU Mall Shops",
  student: "Students",
  other: "Other Vendors",
};

const SORTS = [
  { key: "type", label: "By Type" },
  { key: "name_asc", label: "A–Z" },
  { key: "name_desc", label: "Z–A" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

const PER_PAGE = 18;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normalizePhone(input?: string | null) {
  if (!input) return "";
  return input.replace(/[^\d]/g, "");
}

function waLink(phone?: string | null, text?: string) {
  const p = normalizePhone(phone);
  if (!p) return "";
  const msg = encodeURIComponent(text ?? "Hi, I found you on Jabu Market.");
  return `https://wa.me/${p}?text=${msg}`;
}

function updateParams(
  pathname: string,
  sp: URLSearchParams,
  patch: Record<string, string | null | undefined>
) {
  const next = new URLSearchParams(sp.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="h-4 w-2/3 rounded bg-zinc-100" />
      <div className="mt-2 h-3 w-1/2 rounded bg-zinc-100" />
      <div className="mt-4 flex gap-2">
        <div className="h-9 w-28 rounded-xl bg-zinc-100" />
        <div className="h-9 w-20 rounded-xl bg-zinc-100" />
      </div>
    </div>
  );
}

function Pill({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
        "focus:outline-none focus:ring-2 focus:ring-black/10",
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
      )}
    >
      {children}
    </button>
  );
}

export default function VendorsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const qParam = (sp.get("q") ?? "").trim();
  const typeParam = (sp.get("type") ?? "all").trim() as "all" | VendorType;
  const sortParam = (sp.get("sort") ?? "type").trim() as SortKey;

  const pageParamRaw = (sp.get("page") ?? "1").trim();
  const pageParam = Math.max(
    1,
    Number.isFinite(Number(pageParamRaw)) ? Number(pageParamRaw) : 1
  );

  const [q, setQ] = useState(qParam);
  const [showFilters, setShowFilters] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => setQ(qParam), [qParam]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PER_PAGE)),
    [total]
  );

  const debouncedRef = useRef<number | null>(null);

  function pushPatch(patch: Record<string, string | null | undefined>) {
    router.push(updateParams(pathname, sp, patch));
  }

  function applySearch(nextQ: string) {
    pushPatch({ q: nextQ.trim() || null, page: "1" });
  }

  function clearSearch() {
    setQ("");
    pushPatch({ q: null, page: "1" });
  }

  function setType(next: "all" | VendorType) {
    pushPatch({ type: next === "all" ? null : next, page: "1" });
  }

  function setSort(next: SortKey) {
    pushPatch({ sort: next === "type" ? null : next, page: "1" });
  }

  function goPage(nextPage: number) {
    const safe = Math.min(Math.max(1, nextPage), totalPages);
    pushPatch({ page: String(safe) });
  }

  const grouped = useMemo(() => {
    const groups: Record<VendorType, VendorRow[]> = {
      food: [],
      mall: [],
      student: [],
      other: [],
    };
    for (const v of vendors) groups[v.vendor_type]?.push(v);
    return groups;
  }, [vendors]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErrorMsg(null);

      const start = (pageParam - 1) * PER_PAGE;
      const end = start + PER_PAGE - 1;

      async function fetchOnce() {
        // If there is an auth session and it's expired, try to refresh it.
        // If refresh fails (common when cookies/storage are cleared), fall back to signed-out state.
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;

        if (session?.expires_at && session.expires_at * 1000 < Date.now()) {
          const refreshed = await supabase.auth.refreshSession().catch(() => null);
          if (!refreshed?.data?.session) {
            await supabase.auth.signOut().catch(() => {});
          }
        }

        // ✅ Only VERIFIED vendors are allowed on this page
        let query = supabase
          .from("vendors")
          .select(
            "id, name, whatsapp, phone, location, verified, verification_status, vendor_type",
            { count: "exact" }
          )
          .or("verification_status.eq.verified,verified.eq.true");

        if (typeParam !== "all") query = query.eq("vendor_type", typeParam);

        if (qParam) {
          const safe = qParam.replaceAll(",", " ");
          query = query.or(`name.ilike.%${safe}%,location.ilike.%${safe}%`);
        }

        if (sortParam === "name_asc") {
          query = query.order("name", { ascending: true, nullsFirst: false });
        } else if (sortParam === "name_desc") {
          query = query.order("name", { ascending: false, nullsFirst: false });
        } else {
          query = query
            .order("vendor_type", { ascending: true })
            .order("name", { ascending: true, nullsFirst: false });
        }

        query = query.range(start, end);

        return await query;
      }

      try {
        let res = await fetchOnce();

        // If the stored token is expired, Supabase can still throw "JWT expired".
        // We sign out (clears the bad token) and retry once with anon access.
        if (res.error?.message?.toLowerCase().includes("jwt expired")) {
          await supabase.auth.signOut().catch(() => {});
          res = await fetchOnce();
        }

        if (res.error) throw res.error;

        if (!cancelled) {
          setVendors((res.data ?? []) as VendorRow[]);
          setTotal(res.count ?? 0);
        }
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.message ?? "Failed to load vendors.";
          setErrorMsg(
            msg.toLowerCase().includes("jwt expired")
              ? "Session expired. Please refresh the page or sign in again."
              : msg
          );
          setVendors([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [qParam, typeParam, sortParam, pageParam]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="rounded-3xl border bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Vendors</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {loading
                ? "Loading…"
                : `${total.toLocaleString()} verified vendor${
                    total === 1 ? "" : "s"
                  } found`}
              {qParam ? (
                <>
                  {" "}
                  for{" "}
                  <span className="font-medium text-zinc-900">“{qParam}”</span>
                </>
              ) : null}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm",
              "hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-black/10"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
        </div>

        {/* Search */}
        <div className="mt-4">
          <div className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-black/10">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => {
                const next = e.target.value;
                setQ(next);

                if (debouncedRef.current)
                  window.clearTimeout(debouncedRef.current);
                debouncedRef.current = window.setTimeout(
                  () => applySearch(next),
                  350
                );
              }}
              placeholder="Search verified vendors by name or location…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
            />
            {q?.trim() ? (
              <button
                type="button"
                onClick={clearSearch}
                className="rounded-xl p-2 hover:bg-zinc-100"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-zinc-600" />
              </button>
            ) : null}
          </div>

          {/* Filter chips */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill active={typeParam === "all"} onClick={() => setType("all")}>
              All
            </Pill>
            {(Object.keys(LABELS) as VendorType[]).map((t) => (
              <Pill key={t} active={typeParam === t} onClick={() => setType(t)}>
                {LABELS[t]}
              </Pill>
            ))}
          </div>

          {/* Sort row */}
          <div className={cn("mt-3", showFilters ? "" : "hidden sm:block")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Sort</span>
              {SORTS.map((s) => (
                <Pill
                  key={s.key}
                  active={sortParam === s.key}
                  onClick={() => setSort(s.key)}
                >
                  {s.label}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Error */}
      {errorMsg ? (
        <div className="rounded-3xl border bg-white p-5">
          <p className="text-sm font-medium text-zinc-900">
            Couldn’t load vendors
          </p>
          <p className="mt-1 text-sm text-zinc-600">{errorMsg}</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-4 inline-flex items-center justify-center rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Results */}
      <div className="space-y-8">
        {loading ? (
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </section>
        ) : total === 0 ? (
          <div className="rounded-3xl border bg-white p-6 text-center">
            <p className="text-sm font-semibold text-zinc-900">
              No verified vendors found
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Try a different search, or switch the vendor type filter.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setType("all")}
                className="rounded-2xl border px-4 py-2 text-sm hover:bg-zinc-50"
              >
                View all types
              </button>
              {qParam ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white"
                >
                  Clear search
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {(Object.keys(grouped) as VendorType[]).map((type) => {
              const list = grouped[type];
              if (!list.length) return null;

              return (
                <section key={type} className="space-y-3">
                  <h2 className="text-sm font-semibold text-zinc-800">
                    {SECTION_TITLES[type]}{" "}
                    <span className="text-zinc-400">({list.length})</span>
                  </h2>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((v) => {
                      const phone = normalizePhone(v.phone);
                      const whatsapp = normalizePhone(v.whatsapp);
                      const hasWA = Boolean(whatsapp);
                      const hasPhone = Boolean(phone);

                      return (
                        <div
                          key={v.id}
                          className="rounded-2xl border bg-white p-4 transition hover:bg-zinc-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <Link
                                href={`/vendors/${v.id}`}
                                className="block no-underline"
                              >
                                <p className="truncate text-base font-semibold text-zinc-900">
                                  {v.name ?? "Vendor"}
                                </p>
                              </Link>

                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-700">
                                  {LABELS[v.vendor_type]}
                                </span>

                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  <BadgeCheck className="h-3.5 w-3.5" />
                                  Verified
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-start gap-2 text-sm text-zinc-600">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                            <p className="line-clamp-2">
                              {v.location ?? "Location not provided"}
                            </p>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Link
                              href={`/vendors/${v.id}`}
                              className="inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium text-zinc-900 no-underline hover:bg-white"
                            >
                              View profile
                            </Link>

                            {hasWA ? (
                              <a
                                href={waLink(
                                  whatsapp,
                                  "Hi, I found you on Jabu Market. I'm interested in your services."
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-3 py-2 text-sm font-medium text-white no-underline"
                              >
                                <MessageCircle className="h-4 w-4" />
                                WhatsApp
                              </a>
                            ) : (
                              <span className="inline-flex items-center justify-center rounded-xl border border-dashed px-3 py-2 text-xs text-zinc-500">
                                No WhatsApp
                              </span>
                            )}

                            {hasPhone ? (
                              <a
                                href={`tel:${phone}`}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-zinc-900 no-underline hover:bg-white"
                              >
                                <Phone className="h-4 w-4" />
                                Call
                              </a>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 ? (
        <div className="flex items-center justify-between rounded-3xl border bg-white p-4">
          <p className="text-sm text-zinc-600">
            Page{" "}
            <span className="font-medium text-zinc-900">{pageParam}</span> of{" "}
            <span className="font-medium text-zinc-900">{totalPages}</span>
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goPage(pageParam - 1)}
              disabled={pageParam <= 1}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm",
                pageParam <= 1
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-zinc-50"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>

            <button
              type="button"
              onClick={() => goPage(pageParam + 1)}
              disabled={pageParam >= totalPages}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm",
                pageParam >= totalPages
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-zinc-50"
              )}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
