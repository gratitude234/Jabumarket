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
  CheckCircle2,
  Circle,
  Clock,
  Cpu,
  Image as ImageIcon,
  Laptop,
  MapPin,
  MessageCircle,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Truck,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

import ListingImage from "@/components/ListingImage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOpenNow, type DayEntry } from "@/lib/vendorSchedule";

export const revalidate = 120;

function formatNaira(amount: number | null | undefined) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "\u20A60";
  return `\u20A6${n.toLocaleString("en-NG")}`;
}

function formatCompactCount(n: number | null | undefined) {
  const value = Number(n ?? 0);
  if (!Number.isFinite(value)) return "0";
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return value.toLocaleString("en-NG");
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

function formatHour(time: string | null | undefined) {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  if (!Number.isFinite(hour)) return "";
  const minute = m ?? "00";
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return minute === "00" ? `${display}${suffix}` : `${display}:${minute}${suffix}`;
}

function minutesUntilWATTime(time: string | null | undefined) {
  if (!time) return null;
  const [h, m] = time.split(":");
  const targetMinutes = parseInt(h, 10) * 60 + parseInt(m ?? "0", 10);
  if (!Number.isFinite(targetMinutes)) return null;
  const now = new Date();
  const watMinutes = ((now.getUTCHours() + 1) * 60 + now.getUTCMinutes()) % (24 * 60);
  let diff = targetMinutes - watMinutes;
  if (diff < 0) diff += 24 * 60;
  return diff;
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
    | "pending"
    | "approved"
    | null;
  vendor_type: "food" | "mall" | "student" | "other" | null;
  avatar_url?: string | null;
};

type FoodVendorPreview = {
  id: string;
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  opens_at: string | null;
  closes_at: string | null;
  accepts_delivery: boolean | null;
  day_schedule: DayEntry[] | null;
};

type MenuPreviewItem = {
  vendor_id: string;
  name: string | null;
  emoji: string | null;
  stock_count: number | null;
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

function isVendorVerified(v: VendorPreview) {
  return (
    v.verified === true ||
    v.verification_status === "verified" ||
    v.verification_status === "approved"
  );
}

function getFoodStatus(open: boolean | null, opensAt: string | null) {
  if (open === true) return { label: "Open now", tone: "open" as const };
  if (open === false && opensAt) {
    const mins = minutesUntilWATTime(opensAt);
    if (mins !== null && mins <= 120) {
      return { label: `Opens ${formatHour(opensAt)}`, tone: "soon" as const };
    }
    return { label: "Closed", tone: "closed" as const };
  }
  if (open === false) return { label: "Closed", tone: "closed" as const };
  return { label: "Hours vary", tone: "unknown" as const };
}

function ScrollRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
      {children}
    </div>
  );
}

function SectionHeader({
  title,
  href,
  cta,
  subtitle,
}: {
  title: string;
  href?: string;
  cta?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-zinc-950">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"
        >
          {cta ?? "See all"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const [
    latestListingsRes,
    featuredListingsRes,
    verifiedVendorsRes,
    foodVendorsRes,
    activeListingCountRes,
    verifiedVendorCountRes,
  ] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, title, price, price_label, category, listing_type, location, image_url, negotiable, created_at, status",
      )
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("listings")
      .select(
        "id, title, price, price_label, category, listing_type, location, image_url, negotiable, created_at, status",
      )
      .eq("featured", true)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("vendors")
      .select("id, name, location, verified, verification_status, vendor_type, avatar_url")
      .or("verified.eq.true,verification_status.eq.verified")
      .is("suspended_at", null)
      .not("name", "is", null)
      .order("created_at", { ascending: false })
      .limit(18),
    supabase
      .from("vendors")
      .select(
        "id, name, description, avatar_url, opens_at, closes_at, accepts_delivery, day_schedule",
        { count: "exact" },
      )
      .eq("vendor_type", "food")
      .eq("accepts_orders", true)
      .or("verified.eq.true,verification_status.eq.verified")
      .is("suspended_at", null)
      .order("name", { ascending: true })
      .limit(24),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("vendors")
      .select("id", { count: "exact", head: true })
      .or("verified.eq.true,verification_status.eq.verified")
      .is("suspended_at", null),
  ]);

  const listings = ((latestListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);
  const featuredListings = ((featuredListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);
  const rawVendors = ((verifiedVendorsRes.data ?? []) as VendorPreview[]).filter(Boolean);
  const foodVendors = ((foodVendorsRes.data ?? []) as FoodVendorPreview[]).filter(Boolean);

  const foodVendorIds = foodVendors.map((v) => v.id);
  const vendorIds = Array.from(new Set([...rawVendors.map((v) => v.id), ...foodVendorIds]));
  const listingIds = Array.from(
    new Set([...listings.map((l) => l.id), ...featuredListings.map((l) => l.id)]),
  );

  const [reviewsRes, listingStatsRes, menuRes] = await Promise.all([
    vendorIds.length > 0
      ? supabase.from("vendor_reviews").select("vendor_id, rating").in("vendor_id", vendorIds)
      : { data: [] as { vendor_id: string; rating: number }[] },
    listingIds.length > 0
      ? supabase.from("listing_stats").select("listing_id, saves").in("listing_id", listingIds)
      : { data: [] as { listing_id: string; saves: number }[] },
    foodVendorIds.length > 0
      ? supabase
          .from("vendor_menu_items")
          .select("vendor_id, name, emoji, stock_count")
          .in("vendor_id", foodVendorIds)
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .limit(96)
      : { data: [] as MenuPreviewItem[] },
  ]);

  const ratingMap: Record<string, { avg: number; count: number }> = {};
  for (const r of reviewsRes.data ?? []) {
    const current = ratingMap[r.vendor_id];
    ratingMap[r.vendor_id] = current
      ? { avg: (current.avg * current.count + r.rating) / (current.count + 1), count: current.count + 1 }
      : { avg: r.rating, count: 1 };
  }

  const savesMap: Record<string, number> = {};
  for (const s of listingStatsRes.data ?? []) {
    savesMap[s.listing_id] = Number(s.saves ?? 0);
  }

  const menuMap: Record<string, MenuPreviewItem[]> = {};
  for (const item of (menuRes.data ?? []) as MenuPreviewItem[]) {
    if (!item.vendor_id) continue;
    if (!menuMap[item.vendor_id]) menuMap[item.vendor_id] = [];
    if (menuMap[item.vendor_id].length < 4) menuMap[item.vendor_id].push(item);
  }

  const vendors = rawVendors
    .map((v) => ({
      ...v,
      _score: (ratingMap[v.id] ? 2 : 0) + (v.avatar_url ? 1 : 0) + (isVendorVerified(v) ? 1 : 0),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 6);

  const foodCards = foodVendors
    .map((v) => {
      const open = isOpenNow(v);
      const status = getFoodStatus(open, v.opens_at);
      const hours = v.opens_at && v.closes_at ? `${formatHour(v.opens_at)} - ${formatHour(v.closes_at)}` : null;
      return {
        ...v,
        open,
        status,
        hours,
        rating: ratingMap[v.id] ?? null,
        menuItems: menuMap[v.id] ?? [],
      };
    })
    .sort((a, b) => Number(b.open === true) - Number(a.open === true))
    .slice(0, 6);

  const activeListingCount = activeListingCountRes.count ?? listings.length;
  const verifiedVendorCount = verifiedVendorCountRes.count ?? vendors.length;
  const foodVendorCount = foodVendorsRes.count ?? foodVendors.length;
  const openFoodCount = foodVendors.filter((v) => isOpenNow(v) === true).length;
  const primaryListings = featuredListings.length > 0 ? featuredListings : listings;

  const quickActions = [
    {
      title: "Explore",
      desc: `${formatCompactCount(activeListingCount)} listings`,
      href: "/explore",
      icon: Store,
      tone: "border-orange-100 bg-orange-50 text-orange-700",
    },
    {
      title: "Food",
      desc: openFoodCount > 0 ? `${openFoodCount} open now` : `${formatCompactCount(foodVendorCount)} vendors`,
      href: "/food",
      icon: UtensilsCrossed,
      tone: "border-amber-100 bg-amber-50 text-amber-700",
    },
    {
      title: "Delivery",
      desc: "Campus riders",
      href: "/delivery",
      icon: Truck,
      tone: "border-emerald-100 bg-emerald-50 text-emerald-700",
    },
    {
      title: "Post",
      desc: "Sell or offer",
      href: "/post",
      icon: Plus,
      tone: "border-zinc-200 bg-zinc-950 text-white",
    },
  ];

  const statusChips = [
    {
      label: "Active listings",
      value: formatCompactCount(activeListingCount),
      href: "/explore",
    },
    {
      label: "Open food",
      value: formatCompactCount(openFoodCount),
      href: "/food?open=1",
    },
    {
      label: "Verified vendors",
      value: formatCompactCount(verifiedVendorCount),
      href: "/explore?tab=vendors",
    },
  ];

  return (
    <div className="space-y-7 pb-4">
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-700">
              <PackageCheck className="h-3.5 w-3.5" />
              Campus market
            </div>
            <h1 className="mt-3 max-w-xl text-3xl font-black leading-tight tracking-tight text-zinc-950 sm:text-4xl">
              Jabu Market
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-600">
              Buy, sell, order food and find delivery around JABU.
            </p>
          </div>

          <Link
            href="/post"
            aria-label="Post a listing"
            className="mt-1 hidden h-11 shrink-0 items-center gap-2 rounded-2xl bg-zinc-950 px-4 text-sm font-bold text-white shadow-sm hover:bg-zinc-800 sm:inline-flex"
          >
            <Plus className="h-4 w-4" />
            Post
          </Link>
        </div>

        <form action="/explore" method="GET">
          <div className="flex items-center gap-2 rounded-[1.35rem] border border-zinc-200 bg-white p-2 shadow-sm">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-zinc-500">
              <Search className="h-5 w-5" />
            </div>
            <input
              name="q"
              placeholder="Search items, food, services..."
              list="home-suggestions"
              aria-label="Search Jabu Market"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <button
              type="submit"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700"
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

        <div className="grid grid-cols-4 gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group min-w-0 rounded-2xl border border-zinc-100 bg-white p-2.5 shadow-sm transition hover:border-zinc-200 hover:bg-zinc-50"
              >
                <span className={cn("grid h-10 w-10 place-items-center rounded-2xl border", action.tone)}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="mt-2 block truncate text-xs font-bold text-zinc-950">{action.title}</span>
                <span className="mt-0.5 block truncate text-[10px] font-medium text-zinc-500">{action.desc}</span>
              </Link>
            );
          })}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
          {statusChips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              className="flex min-w-[128px] shrink-0 items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-white px-3 py-2.5 shadow-sm hover:bg-zinc-50"
            >
              <span className="min-w-0">
                <span className="block text-base font-black leading-none text-zinc-950">{chip.value}</span>
                <span className="mt-1 block truncate text-[11px] font-medium text-zinc-500">{chip.label}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300" />
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Shop by category" href="/explore" cta="All" />
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-8">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.name}
                href={c.href}
                className="group flex min-w-[76px] snap-start flex-col items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-3 py-3 text-center shadow-sm transition hover:border-zinc-200 hover:bg-zinc-50 md:min-w-0"
              >
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-100 transition group-hover:bg-orange-50">
                  <Icon className="h-5 w-5 text-zinc-700 transition group-hover:text-orange-700" />
                </span>
                <span className="text-[11px] font-bold leading-tight text-zinc-700">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Food vendors"
          subtitle={openFoodCount > 0 ? `${openFoodCount} open right now` : "Menus and delivery options around campus"}
          href="/food"
          cta="Order"
        />

        {foodCards.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="No food vendors available"
            desc="Verified food vendors will appear here when they start taking orders."
            href="/food"
            cta="Check food"
          />
        ) : (
          <ScrollRow>
            {foodCards.map((vendor) => (
              <FoodVendorCard key={vendor.id} vendor={vendor} />
            ))}
          </ScrollRow>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title={featuredListings.length > 0 ? "Featured picks" : "Fresh listings"}
          subtitle="Recently posted items and services from the marketplace"
          href="/explore"
          cta="Browse"
        />

        {primaryListings.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No listings yet"
            desc="Be the first to post an item or service on Jabu Market."
            href="/post"
            cta="Post now"
          />
        ) : (
          <ScrollRow>
            {primaryListings.slice(0, 6).map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                saves={savesMap[l.id]}
                featured={featuredListings.some((item) => item.id === l.id)}
              />
            ))}
          </ScrollRow>
        )}
      </section>

      {featuredListings.length > 0 && listings.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader title="New on campus" href="/explore?sort=newest" cta="Latest" />
          <ScrollRow>
            {listings.slice(0, 6).map((l) => (
              <ListingCard key={l.id} listing={l} saves={savesMap[l.id]} />
            ))}
          </ScrollRow>
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHeader
          title="Verified vendors"
          subtitle="Stores and sellers with approved profiles"
          href="/explore?tab=vendors"
          cta="View all"
        />

        {vendors.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title="Verified vendors coming soon"
            desc="Approved vendors will show up here once their profiles are reviewed."
            href="/explore?tab=vendors"
            cta="Browse vendors"
          />
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3">
            {vendors.map((v) => (
              <VendorCard key={v.id} vendor={v} rating={ratingMap[v.id]} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <TrustPrompt
          icon={ShieldCheck}
          title="Trade with confidence"
          desc="Use verified profiles, public pickup points and reports when something feels off."
        />
        <TrustPrompt
          icon={MessageCircle}
          title="Chat before paying"
          desc="Ask questions, agree on pickup or delivery, and keep updates inside your inbox."
        />
        <TrustPrompt
          icon={Truck}
          title="Use campus delivery"
          desc="Find riders for food, pickups and transport without leaving the app."
        />
      </section>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
  href,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-5 text-center shadow-sm">
      <Icon className="mx-auto h-8 w-8 text-zinc-300" />
      <p className="mt-3 text-sm font-bold text-zinc-950">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-zinc-500">{desc}</p>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-800"
      >
        {cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function FoodVendorCard({
  vendor,
}: {
  vendor: FoodVendorPreview & {
    open: boolean | null;
    status: ReturnType<typeof getFoodStatus>;
    hours: string | null;
    rating: { avg: number; count: number } | null;
    menuItems: MenuPreviewItem[];
  };
}) {
  const initial = (vendor.name ?? "F")[0].toUpperCase();

  return (
    <Link
      href={`/vendors/${vendor.id}`}
      className="group flex min-w-[245px] snap-start flex-col rounded-2xl border border-zinc-100 bg-white p-3.5 shadow-sm transition hover:border-zinc-200 hover:bg-zinc-50 md:min-w-0"
    >
      <div className="flex items-start gap-3">
        {vendor.avatar_url ? (
          <Image
            src={vendor.avatar_url}
            alt={vendor.name ?? "Food vendor"}
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-sm font-black text-amber-700">
            {initial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-bold text-zinc-950">{vendor.name ?? "Food vendor"}</p>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
                vendor.status.tone === "open"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : vendor.status.tone === "soon"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-zinc-200 bg-zinc-100 text-zinc-500",
              )}
            >
              {vendor.status.tone === "open" ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              {vendor.status.label}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {vendor.rating ? (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="font-bold text-zinc-800">{vendor.rating.avg.toFixed(1)}</span>
                <span className="text-zinc-400">({vendor.rating.count})</span>
              </span>
            ) : null}
            {vendor.hours ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {vendor.hours}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {vendor.description ? (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-500">{vendor.description}</p>
      ) : null}

      {vendor.menuItems.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {vendor.menuItems.map((item, index) => (
            <span
              key={`${vendor.id}-${item.name ?? "item"}-${index}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-700"
            >
              <span>{item.emoji?.trim() || <UtensilsCrossed className="h-3 w-3" />}</span>
              <span className="truncate">{item.name ?? "Menu item"}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-400">
          Menu preview coming soon
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-900">
          <ShoppingBag className="h-3.5 w-3.5" />
          View menu
        </span>
        {vendor.accepts_delivery === true && vendor.open === true ? (
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
            Delivery
          </span>
        ) : (
          <ArrowRight className="h-4 w-4 text-zinc-300 transition group-hover:text-zinc-500" />
        )}
      </div>
    </Link>
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
      className="group min-w-[220px] snap-start overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm transition hover:border-zinc-200 hover:bg-zinc-50 md:min-w-0"
    >
      <div className="relative aspect-[4/3] w-full bg-zinc-100">
        {hasImg ? (
          <ListingImage src={img} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-300">
            <ImageIcon className="h-7 w-7" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />

        {l.category ? (
          <span className="absolute left-3 top-3 max-w-[75%] truncate rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-zinc-900">
            {l.category}
          </span>
        ) : null}

        {featured ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500/95 px-2 py-0.5 text-[11px] font-bold text-white">
            <Star className="h-2.5 w-2.5 fill-white" />
            Featured
          </span>
        ) : l.negotiable ? (
          <span className="absolute right-3 top-3 rounded-full bg-zinc-950/75 px-2 py-0.5 text-[11px] font-bold text-white">
            Negotiable
          </span>
        ) : null}

        {l.created_at ? (
          <span className="absolute bottom-3 left-3 text-[11px] font-semibold text-white/90">
            {timeAgo(l.created_at)}
          </span>
        ) : null}

        {(saves ?? 0) > 0 ? (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
            <Bookmark className="h-3 w-3" />
            {saves}
          </span>
        ) : null}
      </div>

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-zinc-950">{title}</div>
            {l.location ? (
              <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{l.location}</span>
              </div>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <span className="text-sm font-black text-zinc-950">
              {l.price !== null ? formatNaira(l.price) : l.price_label?.trim() || "Contact"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function VendorCard({
  vendor,
  rating,
}: {
  vendor: VendorPreview;
  rating?: { avg: number; count: number };
}) {
  const verified = isVendorVerified(vendor);
  const initial = (vendor.name ?? "V")[0].toUpperCase();

  return (
    <Link
      href={`/vendors/${vendor.id}`}
      className="group flex min-w-[230px] snap-start items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-3.5 shadow-sm transition hover:border-zinc-200 hover:bg-zinc-50 md:min-w-0"
    >
      {vendor.avatar_url ? (
        <Image
          src={vendor.avatar_url}
          alt={vendor.name ?? "Vendor"}
          width={46}
          height={46}
          className="h-11 w-11 shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-sm font-black text-zinc-500">
          {initial}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-zinc-950">{vendor.name ?? "Unnamed vendor"}</div>
        <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{vendor.location ?? "Campus"}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <BadgeCheck className="h-3 w-3" />
              Verified
            </span>
          ) : null}
          {rating ? (
            <span className="inline-flex items-center gap-1 text-xs">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="font-bold text-zinc-800">{rating.avg.toFixed(1)}</span>
              <span className="text-zinc-400">({rating.count})</span>
            </span>
          ) : null}
        </div>
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-zinc-500" />
    </Link>
  );
}

function TrustPrompt({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-zinc-100">
        <Icon className="h-5 w-5 text-zinc-700" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-zinc-950">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}
