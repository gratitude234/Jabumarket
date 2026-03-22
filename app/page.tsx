import { cn } from "@/lib/utils";
// app/page.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Cpu,
  FileText,
  MessageCircleQuestion,
  Search,
  Sparkles,
  ShieldCheck,
  Truck,
  Smartphone,
  Laptop,
  Shirt,
  ShoppingBasket,
  UtensilsCrossed,
  Wrench,
  PlusSquare,
  Flame,
  BadgeCheck,
  MapPin,
  Image as ImageIcon,
  Star,
  Zap,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ListingImage from "@/components/ListingImage";

export const revalidate = 120; // cache homepage briefly for speed

function formatNaira(amount: number | null | undefined) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "₦0";
  return `₦${n.toLocaleString("en-NG")}`;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type ListingPreview = {
  id: string;
  title: string | null;
  price: number | null;
  price_label: string | null;
  category: string | null;
  listing_type: string | null;
  location: string | null;
  image_url: string | null;
  negotiable: boolean | null;
  created_at: string | null;
  status?: string | null;
};

type VendorPreview = {
  id: string;
  name: string | null;
  location: string | null;
  verified: boolean | null;
  verification_status:
    | "unverified"
    | "requested"
    | "under_review"
    | "verified"
    | "rejected"
    | "suspended"
    | null;
  vendor_type: "food" | "mall" | "student" | "other" | null;
};

const categories = [
  { name: "Phones", icon: Smartphone, href: "/explore?category=Phones" },
  { name: "Laptops", icon: Laptop, href: "/explore?category=Laptops" },
  { name: "Electronics", icon: Cpu, href: "/explore?category=Electronics" },
  { name: "Fashion", icon: Shirt, href: "/explore?category=Fashion" },
  { name: "Provisions", icon: ShoppingBasket, href: "/explore?category=Provisions" },
  { name: "Books & Stationery", icon: BookOpen, href: "/explore?category=Books+%26+Stationery" },
  { name: "Food", icon: UtensilsCrossed, href: "/food" },
  { name: "Beauty", icon: Sparkles, href: "/explore?category=Beauty" },
  { name: "Services", icon: Wrench, href: "/explore?category=Services&type=service" },
];

const quickLinks = [
  { label: "New today", href: "/explore?sort=newest" },
  { label: "Food vendors", href: "/vendors?type=food" },
  { label: "Services", href: "/explore?type=service" },
  { label: "Verified vendors", href: "/vendors" },
];


function SectionHeader({
  title,
  subtitle,
  href,
  cta,
  icon,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  cta?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-zinc-100">
              {icon}
            </span>
          ) : null}
          <h2 className="truncate text-base font-semibold text-zinc-900 sm:text-lg">{title}</h2>
        </div>
        {subtitle ? <p className="mt-0.5 text-xs text-zinc-600 sm:text-sm">{subtitle}</p> : null}
      </div>

      {href ? (
        <Link
          href={href}
          className="shrink-0 rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 sm:text-sm"
        >
          {cta ?? "See all"}
        </Link>
      ) : null}
    </div>
  );
}

function ScrollRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {children}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-3 py-1 text-xs text-zinc-700 backdrop-blur">
      {children}
    </span>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-700">
      {children}
    </span>
  );
}

function PriceChip({
  price,
  priceLabel,
}: {
  price: number | null | undefined;
  priceLabel?: string | null;
}) {
  const label = (priceLabel ?? "").trim();
  if (!price && label) {
    return (
      <div className="shrink-0 rounded-2xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-900">
        {label}
      </div>
    );
  }
  if (!price) {
    return (
      <div className="shrink-0 rounded-2xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-900">
        Contact
      </div>
    );
  }
  return (
    <div className="shrink-0 rounded-2xl bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-900">
      {formatNaira(price)}
    </div>
  );
}

function isVendorVerified(v: VendorPreview) {
  return v.verified === true || v.verification_status === "verified";
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  // Run queries in parallel (faster TTFB)
  const [latestListingsRes, featuredVendorsRes, featuredListingsRes] = await Promise.all([
    supabase
      .from("listings")
      .select("id, title, price, price_label, category, listing_type, location, image_url, negotiable, created_at, status")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("vendors")
      .select("id, name, location, verified, verification_status, vendor_type, avatar_url")
      .or("verified.eq.true,verification_status.eq.verified")
      // Quality-weighted: vendors with avatar first (signal of completeness),
      // then by name so the list is stable and not purely newest-registered.
      .not("name", "is", null)
      .order("avatar_url", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(18), // fetch 18, re-rank client-side below
    supabase
      .from("listings")
      .select("id, title, price, price_label, category, listing_type, location, image_url, negotiable, created_at, status")
      .eq("featured", true)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const listings = ((latestListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);
  const rawVendors = ((featuredVendorsRes.data ?? []) as (VendorPreview & { avatar_url?: string | null })[]).filter(Boolean);
  const featuredListings = ((featuredListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);

  // Fetch rating summaries for homepage vendors + listing stats — parallel
  const homepageVendorIds = rawVendors.map((v) => v.id);
  const homepageListingIds = listings.map((l) => l.id);

  const [homepageReviewsRes, homepageStatsRes] = await Promise.all([
    homepageVendorIds.length > 0
      ? supabase.from("vendor_reviews").select("vendor_id, rating").in("vendor_id", homepageVendorIds)
      : { data: [] as { vendor_id: string; rating: number }[] },
    homepageListingIds.length > 0
      ? supabase.from("listing_stats").select("listing_id, saves").in("listing_id", homepageListingIds)
      : { data: [] as { listing_id: string; saves: number }[] },
  ]);

  const homepageReviews = homepageReviewsRes.data;

  // Build rating map
  const homeRatingMap: Record<string, { avg: number; count: number }> = {};
  for (const r of homepageReviews ?? []) {
    const e = homeRatingMap[r.vendor_id];
    homeRatingMap[r.vendor_id] = e
      ? { avg: (e.avg * e.count + r.rating) / (e.count + 1), count: e.count + 1 }
      : { avg: r.rating, count: 1 };
  }

  // Build listing saves map
  const homeSavesMap: Record<string, number> = {};
  for (const s of homepageStatsRes.data ?? []) {
    homeSavesMap[s.listing_id] = Number(s.saves ?? 0);
  }

  // Quality score: has reviews (2pts) + has avatar (1pt) — pick top 6
  const vendors = rawVendors
    .map((v) => ({
      ...v,
      _score:
        (homeRatingMap[v.id] ? 2 : 0) +
        (v.avatar_url ? 1 : 0),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 6);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-28 pt-5 sm:pb-10 sm:pt-8">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border bg-white p-4 shadow-sm sm:p-7">
        {/* background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-28 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-zinc-100 blur-3xl" />
          <div className="absolute -bottom-28 -right-28 h-80 w-80 rounded-full bg-zinc-100 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-zinc-50" />
        </div>

        {/* top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Pill>
              <Sparkles className="h-4 w-4" />
              JABU Market
            </Pill>
            <Pill>
              <ShieldCheck className="h-4 w-4" />
              Verified vendors
            </Pill>
            <Pill>
              <Truck className="h-4 w-4" />
              Delivery & transport
            </Pill>
          </div>

          <Link
            href="/post"
            className="hidden items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 sm:inline-flex"
          >
            <PlusSquare className="h-4 w-4" />
            Post
          </Link>
        </div>

        {/* hero content */}
        <div className="mt-4 grid gap-5 sm:mt-5 sm:grid-cols-[1.3fr_0.7fr] sm:items-start">
          <div className="space-y-3">
            <h1 className="text-[28px] font-bold leading-[1.1] tracking-tight text-zinc-900 sm:text-5xl">
              Buy, sell & find services around JABU.
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
              Discover fresh listings, trusted vendors and fast deliveries. Search fast, chat quickly, keep it safe.
            </p>

            {/* search */}
            <form action="/explore" method="GET" className="mt-4">
              <div className="rounded-2xl border bg-white p-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100">
                    <Search className="h-5 w-5 text-zinc-700" />
                  </div>

                  <input
                    name="q"
                    placeholder="Search iPhone, rice, laundry, hair…"
                    list="home-suggestions"
                    aria-label="Search JABU Market"
                    className="h-10 w-full bg-transparent px-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                  />

                  <button
                    type="submit"
                    className="h-10 rounded-xl bg-black px-4 text-sm font-semibold text-white hover:bg-zinc-800"
                    aria-label="Search"
                  >
                    Search
                  </button>

                  <datalist id="home-suggestions">
                    {/* Categories */}
                    <option value="Phones" />
                    <option value="Laptops" />
                    <option value="Fashion" />
                    <option value="Provisions" />
                    <option value="Food" />
                    <option value="Beauty" />
                    <option value="Services" />
                    <option value="Repairs" />
                    <option value="Tutoring" />
                    {/* Popular campus terms */}
                    <option value="iPhone" />
                    <option value="Android" />
                    <option value="Charger" />
                    <option value="Laptop bag" />
                    <option value="Rice" />
                    <option value="Indomie" />
                    <option value="Laundry" />
                    <option value="Hair" />
                    <option value="Sneakers" />
                    <option value="Jeans" />
                    <option value="Perfume" />
                    <option value="Mattress" />
                    <option value="Fan" />
                    <option value="Power bank" />
                  </datalist>
                </div>
              </div>

              {/* quick links */}
              <div className="mt-3 flex flex-wrap gap-2">
                {quickLinks.map((q) => (
                  <Link
                    key={q.label}
                    href={q.href}
                    className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {q.label}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            </form>

            {/* CTAs */}
            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
              <Link
                href="/explore"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Explore listings <ArrowRight className="h-4 w-4" />
              </Link>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Link
                  href="/vendors"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Vendors <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/delivery"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Delivery <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/couriers"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Transport <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/post"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Post <PlusSquare className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          {/* right side mini highlights */}
          <div className="grid gap-3 sm:mt-1">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <BadgeCheck className="h-4 w-4" />
                Verified-first
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                Prioritize trusted vendors. Report suspicious activity fast.
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/vendors"
                  className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                >
                  View vendors <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/report"
                  className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Report <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <Flame className="h-4 w-4" />
                Hot right now
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                Fresh campus posts — catch the best deals early.
              </p>
              <div className="mt-3">
                <Link
                  href="/explore?sort=newest"
                  className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  See newest <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="space-y-3">
        <SectionHeader
          title="Categories"
          subtitle="Jump straight to what you need."
          href="/explore"
          cta="View all"
          icon={<Sparkles className="h-4 w-4 text-zinc-800" />}
        />

        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.name}
                href={c.href}
                className="group min-w-[180px] rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:bg-zinc-50 sm:min-w-0"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100 transition group-hover:bg-zinc-200/60">
                    <Icon className="h-5 w-5 text-zinc-800" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">{c.name}</div>
                    <div className="text-xs text-zinc-600">Browse {c.name.toLowerCase()}</div>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 text-zinc-300 transition group-hover:text-zinc-400" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* FEATURED LISTINGS */}
      {featuredListings.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            title="Featured listings"
            subtitle="Handpicked listings from the marketplace."
            href="/explore"
            cta="See all"
            icon={<Star className="h-4 w-4 text-amber-500" />}
          />
          <ScrollRow>
            {featuredListings.map((l) => {
              const title = l.title ?? "Untitled listing";
              const img = (l.image_url ?? "").trim();
              const showImg = img.length > 0;

              return (
                <Link
                  key={l.id}
                  href={`/listing/${l.id}`}
                  className="group min-w-[280px] overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-[1px] hover:bg-zinc-50 sm:min-w-0"
                >
                  <div className="relative h-36 w-full bg-zinc-100">
                    {showImg ? (
                      <ListingImage src={img} alt={title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-400">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
                    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      {l.category ? <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-900">{l.category}</span> : null}
                    </div>
                    <div className="absolute right-3 top-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                        <Star className="h-2.5 w-2.5 fill-white" />
                        Featured
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 text-[11px] font-medium text-white">
                      {l.created_at ? timeAgo(l.created_at) : ""}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
                        {l.location ? (
                          <div className="mt-1 flex items-center gap-1 text-xs text-zinc-600">
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="truncate">{l.location}</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 rounded-2xl bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-900">
                        {l.price ? `₦${l.price.toLocaleString("en-NG")}` : l.price_label?.trim() || "Contact"}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                      <span className="font-medium">View details</span>
                      <ArrowRight className="h-4 w-4 text-zinc-300 transition group-hover:text-zinc-400" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </ScrollRow>
        </section>
      ) : null}

      {/* LATEST LISTINGS */}
      <section className="space-y-3">
        <SectionHeader
          title="Latest listings"
          subtitle="Fresh posts from around campus."
          href="/explore?sort=newest"
          cta="See more"
          icon={<Search className="h-4 w-4 text-zinc-800" />}
        />

        {listings.length === 0 ? (
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">No recent listings yet</div>
            <p className="mt-1 text-sm text-zinc-600">Be the first to post an item or service.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/post"
                className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Post now <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/explore?sort=newest"
                className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Explore <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : (
          <ScrollRow>
            {listings.map((l) => {
              const title = l.title ?? "Untitled listing";
              const img = (l.image_url ?? "").trim();
              const showImg = img.length > 0;

              return (
                <Link
                  key={l.id}
                  href={`/listing/${l.id}`}
                  className="group min-w-[280px] overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-[1px] hover:bg-zinc-50 sm:min-w-0"
                >
                  <div className="relative h-36 w-full bg-zinc-100">
                    {showImg ? (
                      <ListingImage src={img} alt={title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-400">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
                    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      {l.category ? <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-900">{l.category}</span> : null}
                      {l.listing_type ? <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-900">{l.listing_type}</span> : null}
                    </div>
                    <div className="absolute bottom-3 left-3 text-[11px] font-medium text-white">
                      {l.created_at ? timeAgo(l.created_at) : ""}
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>

                        {l.location ? (
                          <div className="mt-1 flex items-center gap-1 text-xs text-zinc-600">
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="truncate">{l.location}</span>
                          </div>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-2">
                          {l.category ? <Tag>{l.category}</Tag> : null}
                          {l.listing_type ? <Tag>{l.listing_type}</Tag> : null}
                        </div>
                      </div>

                      <p className="shrink-0 text-base font-bold text-zinc-900">
                        {l.price !== null ? formatNaira(l.price) : (l.price_label ?? "Contact")}
                        {l.negotiable && (
                          <span className="ml-1.5 text-xs font-normal text-zinc-500">· Negotiable</span>
                        )}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                      <span className="font-medium">View details</span>
                      <div className="flex items-center gap-2">
                        {(homeSavesMap[l.id] ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-zinc-600">
                            <Bookmark className="h-3 w-3" />
                            {homeSavesMap[l.id]}
                          </span>
                        ) : null}
                        <ArrowRight className="h-4 w-4 text-zinc-300 transition group-hover:text-zinc-400" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </ScrollRow>
        )}
      </section>

      {/* FEATURED VENDORS */}
      <section className="space-y-3">
        <SectionHeader
          title="Featured verified vendors"
          subtitle="Trusted sellers & services."
          href="/vendors"
          cta="Browse all"
          icon={<ShieldCheck className="h-4 w-4 text-zinc-800" />}
        />

        {vendors.length === 0 ? (
          <div className="rounded-3xl border bg-white p-5 shadow-sm text-sm text-zinc-600">
            No featured vendors available right now.
          </div>
        ) : (
          <ScrollRow>
            {vendors.map((v) => {
              const verified = isVendorVerified(v);
              const rating = homeRatingMap[v.id];
              const avatarUrl = (v as any).avatar_url as string | null | undefined;

              return (
                <Link
                  key={v.id}
                  href={`/vendors/${v.id}`}
                  className="group min-w-[280px] rounded-3xl border bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:bg-zinc-50 sm:min-w-0"
                >
                  <div className="flex items-start gap-3">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100 text-sm font-bold text-zinc-500">
                        {(v.name ?? "V")[0].toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-zinc-900">
                        {v.name ?? "Unnamed vendor"}
                      </div>

                      <div className="mt-1 flex items-center gap-1 text-xs text-zinc-600">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate">{v.location ?? "Location not set"}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {v.vendor_type ? <Tag>{v.vendor_type}</Tag> : null}

                        {verified ? (
                          <span className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-700">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Verified
                          </span>
                        ) : null}

                        {rating && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span className="text-xs font-semibold text-zinc-900">
                              {rating.avg.toFixed(1)}
                            </span>
                            <span className="text-xs text-zinc-400">({rating.count})</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-zinc-400" />
                  </div>
                </Link>
              );
            })}
          </ScrollRow>
        )}
      </section>

      {/* STUDY HUB */}
      <section className="space-y-3">
        <SectionHeader
          title="Study Hub"
          subtitle="Materials, practice sets, Q&A and more."
          href="/study"
          cta="Open Study Hub"
          icon={<BookOpen className="h-4 w-4 text-zinc-800" />}
        />

        <div className="grid grid-cols-2 gap-3">
          {[
            {
              href: "/study/materials",
              icon: <FileText className="h-5 w-5 text-zinc-700" />,
              title: "Course Materials",
              desc: "Lecture notes, past questions, and resources uploaded by course reps.",
            },
            {
              href: "/study/practice",
              icon: <Zap className="h-5 w-5 text-zinc-700" />,
              title: "MCQ Practice",
              desc: "Timed quiz sets with AI-powered explanations and weak-area tracking.",
            },
            {
              href: "/study/questions",
              icon: <MessageCircleQuestion className="h-5 w-5 text-zinc-700" />,
              title: "Q&A Forum",
              desc: "Ask questions, get answers from peers, and upvote the best responses.",
            },
            {
              href: "/study/ai-plan",
              icon: <Sparkles className="h-5 w-5 text-zinc-700" />,
              title: "AI Study Plan",
              desc: "Generate a personalised weekly study schedule powered by Gemini.",
            },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:bg-zinc-50"
            >
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100">{card.icon}</div>
              <div className="mt-3 text-sm font-semibold text-zinc-900">{card.title}</div>
              <div className="mt-1 text-xs text-zinc-600 leading-relaxed">{card.desc}</div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-700">
                Open <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* SAFETY + DELIVERY/TRANSPORT */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100">
              <ShieldCheck className="h-5 w-5 text-zinc-800" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-900">Stay safe</h3>
              <p className="text-sm text-zinc-600">
                Meet in public places, verify details, and report suspicious activity.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/report"
                  className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Report <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/vendors"
                  className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Verified vendors <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100">
              <Truck className="h-5 w-5 text-zinc-800" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-900">Need delivery or transport?</h3>
              <p className="text-sm text-zinc-600">
                Contact delivery agents for errands, or transport providers for keke & car rides.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/delivery"
                  className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Find delivery agents <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/couriers"
                  className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Find transport <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/rider/apply"
                  className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Become a delivery agent <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">How it works</h2>
          <p className="text-sm text-zinc-600">Simple flow. No stress.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link href="/explore" className="group rounded-2xl border bg-white p-4 hover:bg-zinc-50">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Search className="h-4 w-4" />
              1) Browse
            </div>
            <div className="mt-1 text-sm text-zinc-600">Search listings, categories and services.</div>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-700">
              Explore <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link href="/vendors" className="group rounded-2xl border bg-white p-4 hover:bg-zinc-50">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <ShieldCheck className="h-4 w-4" />
              2) Chat
            </div>
            <div className="mt-1 text-sm text-zinc-600">Contact vendors and negotiate safely.</div>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-700">
              Vendors <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link href="/post" className="group rounded-2xl border bg-white p-4 hover:bg-zinc-50">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <PlusSquare className="h-4 w-4" />
              3) Post
            </div>
            <div className="mt-1 text-sm text-zinc-600">Sell items or advertise your service.</div>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-700">
              Post now <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        </div>
      </section>

      {/* Bottom nav is handled globally by BottomNav.tsx — no custom nav needed here */}
    </main>
  );
}