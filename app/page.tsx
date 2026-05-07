// app/page.tsx
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  Image as ImageIcon,
  Laptop,
  Search,
  Shirt,
  ShoppingBag,
  Smartphone,
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

type FoodVendorPreview = {
  id: string;
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  opens_at: string | null;
  closes_at: string | null;
  accepts_delivery: boolean | null;
  delivery_fee?: number | null;
  day_schedule: DayEntry[] | null;
};

type MenuPreviewItem = {
  vendor_id: string;
  name: string | null;
  emoji: string | null;
  stock_count: number | null;
};

const categoryChips = [
  { name: "Phones", href: "/explore?category=Phones", active: true },
  { name: "Laptops", href: "/explore?category=Laptops" },
  { name: "Fashion", href: "/explore?category=Fashion" },
  { name: "Books", href: "/explore?category=Books+%26+Stationery" },
  { name: "Services", href: "/explore?category=Services&type=service" },
];

function getFoodStatus(open: boolean | null, opensAt: string | null) {
  if (open === true) return { label: "Open", tone: "open" as const };
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

function displayFirstName(name: string | null | undefined, email: string | null | undefined) {
  const value = name?.trim() || email?.split("@")[0]?.trim() || "Jabu student";
  return value.split(/\s+/)[0] || "Jabu student";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "J";
}

function SectionHeader({
  title,
  href,
  cta = "See all",
}: {
  title: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">{title}</h2>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-market hover:text-orange-700"
        >
          {cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const userRes = await supabase.auth.getUser();
  const user = userRes.data.user;
  const metadata = user?.user_metadata ?? {};
  let displayName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;

  if (user?.id && !displayName) {
    const profileRes = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const profile = profileRes.data as { full_name: string | null; email: string | null } | null;
    displayName = profile?.full_name?.trim() || profile?.email?.split("@")[0] || null;
  }

  const firstName = displayFirstName(displayName, user?.email ?? null);

  const [
    latestListingsRes,
    featuredListingsRes,
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
      .select(
        "id, name, description, avatar_url, opens_at, closes_at, accepts_delivery, delivery_fee, day_schedule",
        { count: "exact" },
      )
      .eq("vendor_type", "food")
      .eq("accepts_orders", true)
      .or("verified.eq.true,verification_status.eq.verified")
      .is("suspended_at", null)
      .order("name", { ascending: true })
      .limit(12),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("vendors")
      .select("id", { count: "exact", head: true })
      .or("verified.eq.true,verification_status.eq.verified")
      .is("suspended_at", null),
  ]);

  const listings = ((latestListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);
  const featuredListings = ((featuredListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);
  const foodVendors = ((foodVendorsRes.data ?? []) as FoodVendorPreview[]).filter(Boolean);

  const foodVendorIds = foodVendors.map((v) => v.id);
  const [reviewsRes, menuRes] = await Promise.all([
    foodVendorIds.length > 0
      ? supabase.from("vendor_reviews").select("vendor_id, rating").in("vendor_id", foodVendorIds)
      : { data: [] as { vendor_id: string; rating: number }[] },
    foodVendorIds.length > 0
      ? supabase
          .from("vendor_menu_items")
          .select("vendor_id, name, emoji, stock_count")
          .in("vendor_id", foodVendorIds)
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .limit(48)
      : { data: [] as MenuPreviewItem[] },
  ]);

  const ratingMap: Record<string, { avg: number; count: number }> = {};
  for (const r of reviewsRes.data ?? []) {
    const current = ratingMap[r.vendor_id];
    ratingMap[r.vendor_id] = current
      ? { avg: (current.avg * current.count + r.rating) / (current.count + 1), count: current.count + 1 }
      : { avg: r.rating, count: 1 };
  }

  const menuMap: Record<string, MenuPreviewItem[]> = {};
  for (const item of (menuRes.data ?? []) as MenuPreviewItem[]) {
    if (!item.vendor_id) continue;
    if (!menuMap[item.vendor_id]) menuMap[item.vendor_id] = [];
    if (menuMap[item.vendor_id].length < 3) menuMap[item.vendor_id].push(item);
  }

  const foodCards = foodVendors
    .map((v) => {
      const open = isOpenNow(v);
      const status = getFoodStatus(open, v.opens_at);
      return {
        ...v,
        open,
        status,
        rating: ratingMap[v.id] ?? null,
        menuItems: menuMap[v.id] ?? [],
      };
    })
    .sort((a, b) => Number(b.open === true) - Number(a.open === true))
    .slice(0, 4);

  const activeListingCount = activeListingCountRes.count ?? listings.length;
  const verifiedVendorCount = verifiedVendorCountRes.count ?? 0;
  const foodVendorCount = foodVendorsRes.count ?? foodVendors.length;
  const openFoodCount = foodVendors.filter((v) => isOpenNow(v) === true).length;
  const primaryListings = (featuredListings.length > 0 ? featuredListings : listings).slice(0, 6);
  const statLine =
    activeListingCount > 0 || verifiedVendorCount > 0
      ? `${activeListingCount.toLocaleString("en-NG")} listings · ${verifiedVendorCount.toLocaleString("en-NG")} verified vendors`
      : "Phones, food, services and study help around JABU";

  const quickActions = [
    {
      title: "Market",
      href: "/explore",
      icon: ShoppingBag,
      tone: "bg-orange-50 text-brand-market",
    },
    {
      title: "Food",
      href: "/food",
      icon: UtensilsCrossed,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      title: "Study Hub",
      href: "/study",
      icon: BookOpen,
      tone: "bg-[#EEEDFE] text-[#5B35D5]",
    },
    {
      title: "Delivery",
      href: "/delivery",
      icon: Truck,
      tone: "bg-rose-50 text-rose-700",
    },
  ];

  return (
    <div className="mx-auto max-w-md space-y-7 pb-4 md:max-w-6xl">
      <section className="space-y-4 md:grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-start md:gap-6 md:space-y-0">
        <div className="space-y-4 md:sticky md:top-20">
          <div className="flex items-center justify-between gap-4">
            <Link href="/me" className="flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-market text-base font-black text-white">
                {initials(firstName)}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-zinc-500">Good morning</span>
                <span className="block truncate text-lg font-black leading-tight text-zinc-950">
                  {firstName}
                </span>
              </span>
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/notifications"
                aria-label="Notifications"
                className="relative grid h-11 w-11 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
              </Link>
              <Link
                href="/me"
                aria-label="Profile"
                className="grid h-11 w-11 place-items-center rounded-full bg-orange-50 text-sm font-black text-brand-market"
              >
                {initials(firstName).slice(0, 1)}
              </Link>
            </div>
          </div>

          <form action="/explore" method="GET">
            <div className="flex h-14 items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 shadow-sm">
              <Search className="h-5 w-5 shrink-0 text-zinc-500" />
              <input
                name="q"
                placeholder="Search listings, food, courses..."
                list="home-suggestions"
                aria-label="Search Jabu Market"
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-zinc-900 outline-none placeholder:text-zinc-500"
              />
              <button
                type="submit"
                className="sr-only"
              >
                Search
              </button>
            </div>
            <datalist id="home-suggestions">
              <option value="Phones" />
              <option value="Laptops" />
              <option value="Fashion" />
              <option value="Books" />
              <option value="Food" />
              <option value="Services" />
              <option value="Delivery" />
              <option value="Study materials" />
            </datalist>
          </form>

          <div className="overflow-hidden rounded-[1.7rem] bg-brand-market p-6 text-white shadow-sm shadow-orange-900/10">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-100">Jabu campus</p>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight md:text-4xl">
              Find anything
              <br />
              on campus.
            </h1>
            <p className="mt-3 max-w-xs text-sm font-medium leading-6 text-orange-50">
              {statLine}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/explore"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-brand-market shadow-sm hover:bg-orange-50"
              >
                Explore
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/post"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/45 px-5 text-sm font-black text-white hover:bg-white/10"
              >
                Post a listing
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-7">
          <section className="space-y-3">
            <SectionHeader title="Quick access" />
            <div className="grid grid-cols-4 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group flex min-w-0 flex-col items-center gap-2 text-center"
                  >
                    <span className={cn("grid h-16 w-16 place-items-center rounded-3xl", action.tone)}>
                      <Icon className="h-7 w-7" />
                    </span>
                    <span className="max-w-full truncate text-xs font-bold text-zinc-800">{action.title}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader title="Categories" />
            <div className="flex flex-wrap gap-2">
              {categoryChips.map((chip) => (
                <Link
                  key={chip.name}
                  href={chip.href}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full border px-4 text-sm font-bold",
                    chip.active
                      ? "border-brand-market bg-brand-market text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-orange-200 hover:bg-orange-50 hover:text-brand-market",
                  )}
                >
                  {chip.name}
                </Link>
              ))}
              <Link
                href="/explore"
                className="inline-flex h-9 items-center gap-1 rounded-full border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 hover:border-orange-200 hover:bg-orange-50 hover:text-brand-market"
              >
                More
                <ChevronDown className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeader title="Recent listings" href="/explore" />
            {primaryListings.length === 0 ? (
              <EmptyState
                icon={Store}
                title="No listings yet"
                desc="Be the first to post an item or service on Jabu Market."
                href="/post"
                cta="Post now"
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {primaryListings.map((listing, index) => (
                  <ListingCard key={listing.id} listing={listing} index={index} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader title="Food vendors" href="/food" />
            {foodCards.length === 0 ? (
              <EmptyState
                icon={UtensilsCrossed}
                title="No food vendors available"
                desc="Verified food vendors will appear here when they start taking orders."
                href="/food"
                cta="Check food"
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {foodCards.map((vendor, index) => (
                  <FoodVendorCard key={vendor.id} vendor={vendor} index={index} />
                ))}
              </div>
            )}
          </section>

          <Link
            href="/study"
            className="block rounded-3xl border border-[#5B35D5]/25 bg-[#EEEDFE] p-5 text-[#24115F] shadow-sm hover:bg-[#E5E0FF]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#5B35D5]">Study Hub</p>
                <h2 className="mt-2 text-xl font-black leading-tight">Keep your streak going</h2>
                <p className="mt-1 text-sm font-semibold text-[#5B35D5]">
                  Practice cards, materials and course help
                </p>
              </div>
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#5B35D5] text-white">
                <BookOpen className="h-7 w-7" />
              </span>
            </div>
            <div className="mt-5">
              <div className="h-2 overflow-hidden rounded-full bg-white/70">
                <div className="h-full w-[68%] rounded-full bg-[#5B35D5]" />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-bold text-[#5B35D5]">
                <span>Today progress</span>
                <span>68%</span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <TrustPrompt
          icon={BadgeCheck}
          title="Verified sellers"
          desc="Approved vendor profiles and marketplace signals help you shop with confidence."
        />
        <TrustPrompt
          icon={ShoppingBag}
          title="Campus pickup"
          desc="Agree on pickup, delivery or order details before money changes hands."
        />
        <TrustPrompt
          icon={Truck}
          title="Delivery ready"
          desc={`${openFoodCount || foodVendorCount} food vendors and campus delivery routes are one tap away.`}
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
    <div className="rounded-3xl border border-dashed border-zinc-200 bg-white p-5 text-center shadow-sm">
      <Icon className="mx-auto h-8 w-8 text-zinc-300" />
      <p className="mt-3 text-sm font-black text-zinc-950">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-zinc-500">{desc}</p>
      <Link
        href={href}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-market px-4 text-sm font-black text-white hover:bg-orange-700"
      >
        {cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function ListingCard({ listing, index }: { listing: ListingPreview; index: number }) {
  const title = listing.title ?? "Untitled listing";
  const img = (listing.image_url ?? "").trim();
  const hasImg = img.length > 0;
  const mediaTone = listingTone(listing.category, index);

  return (
    <Link
      href={`/listing/${listing.id}`}
      className="group min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-orange-200 hover:shadow-md"
    >
      <div className={cn("relative aspect-[1.18/1] w-full overflow-hidden", mediaTone.bg)}>
        {hasImg ? (
          <ListingImage src={img} alt={title} className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <ListingMediaIcon category={listing.category} className={cn("h-9 w-9", mediaTone.icon)} />
          </div>
        )}
        {listing.created_at ? (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-zinc-700">
            {timeAgo(listing.created_at)}
          </span>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        <div className="line-clamp-2 min-h-[2.3rem] text-sm font-black leading-tight text-zinc-950">{title}</div>
        <div className="text-base font-black leading-none text-brand-market">
          {listing.price !== null ? formatNaira(listing.price) : listing.price_label?.trim() || "Contact"}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-semibold text-zinc-500">
            {listing.category ?? listing.location ?? "Campus"}
          </span>
          {listing.negotiable ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
              Deal
            </span>
          ) : (
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-black text-brand-market">
              New
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function FoodVendorCard({
  vendor,
  index,
}: {
  vendor: FoodVendorPreview & {
    open: boolean | null;
    status: ReturnType<typeof getFoodStatus>;
    rating: { avg: number; count: number } | null;
    menuItems: MenuPreviewItem[];
  };
  index: number;
}) {
  const initial = (vendor.name ?? "F")[0].toUpperCase();
  const tone = index % 2 === 0 ? "bg-amber-50 text-amber-700" : "bg-orange-50 text-brand-market";
  const menu = vendor.menuItems
    .map((item) => item.name?.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");

  return (
    <Link
      href={`/vendors/${vendor.id}`}
      className="flex min-w-0 items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40"
    >
      {vendor.avatar_url ? (
        <Image
          src={vendor.avatar_url}
          alt={vendor.name ?? "Food vendor"}
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-base font-black", tone)}>
          {initial}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-base font-black text-zinc-950">{vendor.name ?? "Food vendor"}</p>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black",
              vendor.status.tone === "open"
                ? "bg-lime-100 text-lime-800"
                : vendor.status.tone === "soon"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-zinc-100 text-zinc-500",
            )}
          >
            {vendor.status.tone === "open" ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            {vendor.status.label}
          </span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-zinc-600">
          {menu || vendor.description || "Menu preview coming soon"}
        </p>
        <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-zinc-600">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          <span>{vendor.rating ? vendor.rating.avg.toFixed(1) : "New"}</span>
          <span>·</span>
          <span>
            {vendor.accepts_delivery
              ? `${formatNaira(vendor.delivery_fee ?? 0)} delivery`
              : "Pickup available"}
          </span>
        </div>
      </div>
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
    <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-50">
        <Icon className="h-5 w-5 text-brand-market" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-black text-zinc-950">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}

function ListingMediaIcon({
  category,
  className,
}: {
  category: string | null | undefined;
  className?: string;
}) {
  const value = (category ?? "").toLowerCase();
  if (value.includes("phone")) return <Smartphone className={className} />;
  if (value.includes("laptop") || value.includes("electronic")) return <Laptop className={className} />;
  if (value.includes("fashion") || value.includes("cloth")) return <Shirt className={className} />;
  if (value.includes("book") || value.includes("stationery")) return <BookOpen className={className} />;
  if (value.includes("service")) return <Wrench className={className} />;
  return <ImageIcon className={className} />;
}

function listingTone(category: string | null | undefined, index: number) {
  const value = (category ?? "").toLowerCase();
  if (value.includes("phone")) return { bg: "bg-orange-100", icon: "text-brand-market" };
  if (value.includes("laptop") || value.includes("electronic")) {
    return { bg: "bg-lime-100", icon: "text-lime-800" };
  }
  if (value.includes("fashion") || value.includes("cloth")) {
    return { bg: "bg-amber-100", icon: "text-amber-800" };
  }
  if (value.includes("book") || value.includes("stationery")) {
    return { bg: "bg-[#EEEDFE]", icon: "text-[#5B35D5]" };
  }
  const tones = [
    { bg: "bg-orange-100", icon: "text-brand-market" },
    { bg: "bg-amber-100", icon: "text-amber-800" },
    { bg: "bg-lime-100", icon: "text-lime-800" },
    { bg: "bg-[#EEEDFE]", icon: "text-[#5B35D5]" },
  ];
  return tones[index % tones.length];
}
