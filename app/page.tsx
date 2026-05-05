// app/page.tsx
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Bookmark,
  Cpu,
  Image as ImageIcon,
  Laptop,
  MapPin,
  MessageCircle,
  PackageCheck,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Truck,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ListingImage from "@/components/ListingImage";

export const revalidate = 120;

function formatNaira(amount: number | null | undefined) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "\u20A60";
  return `\u20A6${n.toLocaleString("en-NG")}`;
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
  avatar_url?: string | null;
};

const categories = [
  { name: "Phones", icon: Smartphone, href: "/explore?category=Phones" },
  { name: "Laptops", icon: Laptop, href: "/explore?category=Laptops" },
  { name: "Electronics", icon: Cpu, href: "/explore?category=Electronics" },
  { name: "Fashion", icon: Shirt, href: "/explore?category=Fashion" },
  { name: "Provisions", icon: ShoppingBasket, href: "/explore?category=Provisions" },
  { name: "Books", icon: BookOpen, href: "/explore?category=Books+%26+Stationery" },
  { name: "Beauty", icon: Sparkles, href: "/explore?category=Beauty" },
  { name: "Services", icon: Wrench, href: "/explore?category=Services&type=service" },
];

const marketActions = [
  {
    title: "Browse listings",
    desc: "Phones, fashion, provisions, repairs and student services.",
    href: "/explore",
    icon: Store,
    tone: "bg-orange-50 text-orange-700 border-orange-100",
  },
  {
    title: "Order food",
    desc: "See open vendors, menu previews and delivery availability.",
    href: "/food",
    icon: UtensilsCrossed,
    tone: "bg-amber-50 text-amber-700 border-amber-100",
  },
  {
    title: "Get delivery",
    desc: "Find riders and transport options around campus.",
    href: "/delivery",
    icon: Truck,
    tone: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
];

function isVendorVerified(v: VendorPreview) {
  return v.verified === true || v.verification_status === "verified";
}

function ScrollRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {children}
    </div>
  );
}

function SectionHeader({
  title,
  href,
  cta,
}: {
  title: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
      {href && (
        <Link
          href={href}
          className="shrink-0 rounded-full border bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          {cta ?? "See all"}
        </Link>
      )}
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const [
    latestListingsRes,
    featuredVendorsRes,
    featuredListingsRes,
    activeListingCountRes,
    foodVendorCountRes,
  ] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, title, price, price_label, category, listing_type, location, image_url, negotiable, created_at, status",
      )
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("vendors")
      .select("id, name, location, verified, verification_status, vendor_type, avatar_url")
      .or("verified.eq.true,verification_status.eq.verified")
      .not("name", "is", null)
      .order("created_at", { ascending: false })
      .limit(18),
    supabase
      .from("listings")
      .select(
        "id, title, price, price_label, category, listing_type, location, image_url, negotiable, created_at, status",
      )
      .eq("featured", true)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("vendors")
      .select("id", { count: "exact", head: true })
      .eq("vendor_type", "food")
      .eq("accepts_orders", true)
      .or("verified.eq.true,verification_status.eq.verified")
      .is("suspended_at", null),
  ]);

  const listings = ((latestListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);
  const rawVendors = ((featuredVendorsRes.data ?? []) as VendorPreview[]).filter(Boolean);
  const featuredListings = ((featuredListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);

  const homepageVendorIds = rawVendors.map((v) => v.id);
  const homepageListingIds = Array.from(
    new Set([...listings.map((l) => l.id), ...featuredListings.map((l) => l.id)]),
  );

  const [homepageReviewsRes, homepageStatsRes] = await Promise.all([
    homepageVendorIds.length > 0
      ? supabase.from("vendor_reviews").select("vendor_id, rating").in("vendor_id", homepageVendorIds)
      : { data: [] as { vendor_id: string; rating: number }[] },
    homepageListingIds.length > 0
      ? supabase.from("listing_stats").select("listing_id, saves").in("listing_id", homepageListingIds)
      : { data: [] as { listing_id: string; saves: number }[] },
  ]);

  const homeRatingMap: Record<string, { avg: number; count: number }> = {};
  for (const r of homepageReviewsRes.data ?? []) {
    const e = homeRatingMap[r.vendor_id];
    homeRatingMap[r.vendor_id] = e
      ? { avg: (e.avg * e.count + r.rating) / (e.count + 1), count: e.count + 1 }
      : { avg: r.rating, count: 1 };
  }

  const homeSavesMap: Record<string, number> = {};
  for (const s of homepageStatsRes.data ?? []) {
    homeSavesMap[s.listing_id] = Number(s.saves ?? 0);
  }

  const vendors = rawVendors
    .map((v) => ({
      ...v,
      _score: (homeRatingMap[v.id] ? 2 : 0) + (v.avatar_url ? 1 : 0),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 6);

  const activeListingCount = activeListingCountRes.count ?? listings.length;
  const foodVendorCount = foodVendorCountRes.count ?? 0;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-28 pt-5 sm:pb-10 sm:pt-8">
      <section className="space-y-4">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
            <PackageCheck className="h-3.5 w-3.5" />
            Campus buying, selling and delivery
          </div>
          <div>
            <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">
              Find what you need on JABU Market.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
              Search trusted student sellers, verified stores, food vendors and delivery options in one place.
            </p>
          </div>
        </div>

        <form action="/explore" method="GET">
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm sm:p-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100">
              <Search className="h-5 w-5 text-zinc-500" />
            </div>
            <input
              name="q"
              placeholder="Search iPhone, rice, laundry, hair, charger..."
              list="home-suggestions"
              aria-label="Search JABU Market"
              className="h-10 w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-zinc-900 px-4 py-3 text-xs font-semibold text-white hover:bg-zinc-700 sm:px-5"
            >
              Search
            </button>
          </div>
          <datalist id="home-suggestions">
            <option value="Phones" />
            <option value="Laptops" />
            <option value="Fashion" />
            <option value="Provisions" />
            <option value="Food" />
            <option value="Beauty" />
            <option value="Services" />
            <option value="Repairs" />
            <option value="Tutoring" />
            <option value="iPhone" />
            <option value="Android" />
            <option value="Charger" />
            <option value="Rice" />
            <option value="Indomie" />
            <option value="Laundry" />
            <option value="Hair" />
            <option value="Sneakers" />
            <option value="Power bank" />
          </datalist>
        </form>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {[
            { label: "New today", href: "/explore?sort=newest" },
            { label: "Open food vendors", href: "/explore?tab=food&open=1" },
            { label: "Services", href: "/explore?type=service" },
            { label: "Verified vendors", href: "/explore?tab=vendors" },
            { label: "Delivery", href: "/explore?tab=delivery" },
          ].map((q) => (
            <Link
              key={q.label}
              href={q.href}
              className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {q.label}
            </Link>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {marketActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4 transition hover:border-zinc-200 hover:bg-zinc-50"
              >
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border", action.tone)}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900">{action.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-zinc-500">{action.desc}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-zinc-500" />
              </Link>
            );
          })}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { label: "Active listings", value: activeListingCount.toLocaleString("en-NG") },
            { label: "Food vendors taking orders", value: foodVendorCount.toLocaleString("en-NG") },
            { label: "Verified vendor directory", value: vendors.length > 0 ? "Live" : "Ready" },
          ].map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-zinc-100 bg-white px-4 py-3">
              <div className="text-lg font-bold text-zinc-950">{metric.value}</div>
              <div className="text-xs text-zinc-500">{metric.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Categories" href="/explore" cta="View all" />
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.name}
                href={c.href}
                className="group flex min-w-[72px] flex-col items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-3 py-4 text-center transition hover:border-zinc-200 hover:bg-zinc-50 sm:min-w-0"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 transition group-hover:bg-zinc-200/70">
                  <Icon className="h-5 w-5 text-zinc-700" />
                </div>
                <span className="text-[11px] font-medium text-zinc-700">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {featuredListings.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Featured listings" href="/explore" cta="See all" />
          <ScrollRow>
            {featuredListings.map((l) => (
              <ListingCard key={l.id} listing={l} saves={homeSavesMap[l.id]} featured />
            ))}
          </ScrollRow>
        </section>
      )}

      <section className="space-y-3">
        <SectionHeader title="Latest listings" href="/explore?sort=newest" cta="See more" />

        {listings.length === 0 ? (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">No listings yet</div>
            <p className="mt-1 text-sm text-zinc-500">Be the first to post an item or service.</p>
            <Link
              href="/post"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Post now <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <ScrollRow>
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} saves={homeSavesMap[l.id]} />
            ))}
          </ScrollRow>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Verified vendors" href="/explore?tab=vendors" cta="Browse all" />

        {vendors.length === 0 ? (
          <div className="rounded-2xl border bg-white p-5 text-sm text-zinc-500 shadow-sm">
            Verified vendors will appear here as soon as they are approved.
          </div>
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {vendors.map((v) => {
              const verified = isVendorVerified(v);
              const rating = homeRatingMap[v.id];
              const initial = (v.name ?? "V")[0].toUpperCase();

              return (
                <Link
                  key={v.id}
                  href={`/vendors/${v.id}`}
                  className="group flex min-w-[220px] items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-3.5 transition hover:border-zinc-200 hover:bg-zinc-50 sm:min-w-0"
                >
                  {v.avatar_url ? (
                    <Image
                      src={v.avatar_url}
                      alt={v.name ?? "Vendor"}
                      width={44}
                      height={44}
                      className="h-11 w-11 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-100 text-sm font-bold text-zinc-500">
                      {initial}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {v.name ?? "Unnamed vendor"}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{v.location ?? "Campus"}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      {verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <BadgeCheck className="h-3 w-3" />
                          Verified
                        </span>
                      )}
                      {rating && (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          <span className="font-semibold text-zinc-800">{rating.avg.toFixed(1)}</span>
                          <span className="text-zinc-400">({rating.count})</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-zinc-400" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100">
            <ShieldCheck className="h-5 w-5 text-zinc-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Trade with confidence</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Look for verified vendors, meet publicly and report suspicious activity quickly.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100">
            <MessageCircle className="h-5 w-5 text-zinc-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Chat before buying</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Ask questions, make offers and keep order updates inside your inbox.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100">
            <Truck className="h-5 w-5 text-zinc-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Delivery when needed</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Use campus riders for food, pickups and transport around school.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function ListingCard({
  listing: l,
  saves,
  featured = false,
}: {
  listing: ListingPreview;
  saves?: number;
  featured?: boolean;
}) {
  const title = l.title ?? "Untitled listing";
  const img = (l.image_url ?? "").trim();
  const hasImg = img.length > 0;

  return (
    <Link
      href={`/listing/${l.id}`}
      className="group min-w-[220px] overflow-hidden rounded-2xl border border-zinc-100 bg-white transition hover:border-zinc-200 hover:bg-zinc-50 sm:min-w-0"
    >
      <div className="relative h-44 w-full bg-zinc-100">
        {hasImg ? (
          <ListingImage src={img} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-300">
            <ImageIcon className="h-7 w-7" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />

        {l.category && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-900">
            {l.category}
          </span>
        )}

        {featured && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Star className="h-2.5 w-2.5 fill-white" />
            Featured
          </span>
        )}

        {l.negotiable && !featured && (
          <span className="absolute right-3 top-3 rounded-full bg-zinc-900/70 px-2 py-0.5 text-[11px] font-medium text-white">
            Negotiable
          </span>
        )}

        {l.created_at && (
          <span className="absolute bottom-3 left-3 text-[11px] font-medium text-white/90">
            {timeAgo(l.created_at)}
          </span>
        )}

        {(saves ?? 0) > 0 && (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <Bookmark className="h-3 w-3" />
            {saves}
          </span>
        )}
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
            {l.location && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{l.location}</span>
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="text-sm font-bold text-zinc-900">
              {l.price !== null ? formatNaira(l.price) : l.price_label?.trim() || "Contact"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
