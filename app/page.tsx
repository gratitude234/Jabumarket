// app/page.tsx
import Link from "next/link";
import {
  ArrowRight,
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
  Store,
  Flame,
  BadgeCheck,
  MapPin,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  category: string | null;
  listing_type: string | null;
  created_at: string | null;
};

type VendorPreview = {
  id: string;
  name: string | null;
  location: string | null;
  verified: boolean | null;
  vendor_type: "food" | "mall" | "student" | "other" | null;
};

const categories = [
  { name: "Phones", icon: Smartphone, href: "/explore?category=Phones" },
  { name: "Laptops", icon: Laptop, href: "/explore?category=Laptops" },
  { name: "Fashion", icon: Shirt, href: "/explore?category=Fashion" },
  {
    name: "Provisions",
    icon: ShoppingBasket,
    href: "/explore?category=Provisions",
  },
  { name: "Food", icon: UtensilsCrossed, href: "/explore?category=Food" },
  { name: "Beauty", icon: Sparkles, href: "/explore?category=Beauty" },
  {
    name: "Services",
    icon: Wrench,
    href: "/explore?category=Services&type=service",
  },
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
  icon?: React.ReactNode;
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
          <h2 className="truncate text-base font-semibold text-zinc-900 sm:text-lg">
            {title}
          </h2>
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-zinc-600 sm:text-sm">{subtitle}</p>
        ) : null}
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

function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      <style>{`div::-webkit-scrollbar{display:none}`}</style>
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-3 py-1 text-xs text-zinc-700 backdrop-blur">
      {children}
    </span>
  );
}

export default async function HomePage() {
  const supabase = createSupabaseServerClient();

  const { data: latestListings } = await supabase
    .from("listings")
    .select("id, title, price, category, listing_type, created_at")
    .order("created_at", { ascending: false })
    .limit(6);

  const { data: featuredVendors } = await supabase
    .from("vendors")
    .select("id, name, location, verified, vendor_type")
    .eq("verified", true)
    .order("created_at", { ascending: false })
    .limit(6);

  const listings = (latestListings ?? []) as ListingPreview[];
  const vendors = (featuredVendors ?? []) as VendorPreview[];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-28 pt-5 sm:pb-10 sm:pt-8">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border bg-white p-4 shadow-sm sm:p-7">
        {/* background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-28 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-zinc-100 blur-3xl" />
          <div className="absolute -bottom-28 -right-28 h-80 w-80 rounded-full bg-zinc-100 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-zinc--50" />
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
              Campus Transport
            </Pill>
          </div>

          {/* small "post" shortcut for hero */}
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
              Discover fresh listings, trusted vendors and fast deliveries. Chat
              quickly and keep it safe.
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
                    className="h-10 w-full bg-transparent px-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                  />

                  <button
                    type="submit"
                    className="h-10 rounded-xl bg-black px-4 text-sm font-semibold text-white hover:bg-zinc-800"
                  >
                    Search
                  </button>

                  <datalist id="home-suggestions">
                    <option value="iPhone" />
                    <option value="laptop" />
                    <option value="rice" />
                    <option value="laundry" />
                    <option value="hair" />
                    <option value="repairs" />
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

            {/* CTAs (desktop) */}
            <div className="mt-4 hidden flex-wrap gap-2 sm:flex">
              <Link
                href="/explore"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Explore listings <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href="/vendors"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Browse vendors <ArrowRight className="h-4 w-4" />
              </Link>

              {/* NEW: Delivery Agents CTA */}
              <Link
                href="/delivery"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Find delivery agents <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href="/couriers"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                Find transport <ArrowRight className="h-4 w-4" />
              </Link>
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
                See trusted vendors faster and avoid scams.
              </p>
              <div className="mt-3">
                <Link
                  href="/vendors"
                  className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                >
                  View vendors <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <Flame className="h-4 w-4" />
                Trending today
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                Fresh campus posts—don’t miss the best deals.
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
          <style>{`div::-webkit-scrollbar{display:none}`}</style>

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
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {c.name}
                    </div>
                    <div className="text-xs text-zinc-600">
                      Browse {c.name.toLowerCase()}
                    </div>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 text-zinc-300 transition group-hover:text-zinc-400" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

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
            <div className="text-sm font-semibold text-zinc-900">
              No recent listings yet
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              Be the first to post an item or service.
            </p>
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
            {listings.map((l) => (
              <Link
                key={l.id}
                href={`/listing/${l.id}`}
                className="group min-w-[280px] rounded-3xl border bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:bg-zinc-50 sm:min-w-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {l.title ?? "Untitled listing"}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {l.category ? (
                        <span className="rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-700">
                          {l.category}
                        </span>
                      ) : null}
                      {l.listing_type ? (
                        <span className="rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-700">
                          {l.listing_type}
                        </span>
                      ) : null}
                      {l.created_at ? (
                        <span className="rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-600">
                          {timeAgo(l.created_at)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 rounded-2xl bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-900">
                    {formatNaira(l.price)}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-medium">View details</span>
                  <ArrowRight className="h-4 w-4 text-zinc-300 transition group-hover:text-zinc-400" />
                </div>
              </Link>
            ))}
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
            {vendors.map((v) => (
              <Link
                key={v.id}
                href={`/vendors/${v.id}`}
                className="group min-w-[280px] rounded-3xl border bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:bg-zinc-50 sm:min-w-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {v.name ?? "Unnamed vendor"}
                    </div>

                    <div className="mt-1 flex items-center gap-1 text-xs text-zinc-600">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="truncate">
                        {v.location ?? "Location not set"}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {v.vendor_type ? (
                        <span className="rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-700">
                          {v.vendor_type}
                        </span>
                      ) : null}

                      <span className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Verified
                      </span>
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 text-zinc-300 transition group-hover:text-zinc-400" />
                </div>

                <div className="mt-4 text-xs text-zinc-500">
                  Tap to view profile
                </div>
              </Link>
            ))}
          </ScrollRow>
        )}
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
                Meet in public places, verify details, and report suspicious
                activity.
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
              <h3 className="text-sm font-semibold text-zinc-900">
                Need delivery or transport?
              </h3>
              <p className="text-sm text-zinc-600">
                Contact delivery agents for errands, or transport providers for
                keke & car rides.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {/* NEW: Delivery Agents CTA */}
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
          <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">
            How it works
          </h2>
          <p className="text-sm text-zinc-600">Simple flow. No stress.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/explore"
            className="group rounded-2xl border bg-white p-4 hover:bg-zinc-50"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Search className="h-4 w-4" />
              1) Browse
            </div>
            <div className="mt-1 text-sm text-zinc-600">
              Search listings, categories and services.
            </div>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-700">
              Explore <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/vendors"
            className="group rounded-2xl border bg-white p-4 hover:bg-zinc-50"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <ShieldCheck className="h-4 w-4" />
              2) Chat
            </div>
            <div className="mt-1 text-sm text-zinc-600">
              Contact vendors and negotiate safely.
            </div>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-700">
              Vendors <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/post"
            className="group rounded-2xl border bg-white p-4 hover:bg-zinc-50"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <PlusSquare className="h-4 w-4" />
              3) Post
            </div>
            <div className="mt-1 text-sm text-zinc-600">
              Sell items or advertise your service.
            </div>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-700">
              Post now <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        </div>
      </section>

      {/* Mobile sticky bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/90 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <Link
            href="/explore"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-black px-3 py-3 text-sm font-semibold text-white"
          >
            <Search className="h-4 w-4" />
            Explore
          </Link>

          <Link
            href="/post"
            className="flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900"
          >
            <PlusSquare className="h-4 w-4" />
            Post
          </Link>

          <Link
            href="/vendors"
            className="flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900"
          >
            <Store className="h-4 w-4" />
            Vendors
          </Link>
        </div>
      </nav>
    </main>
  );
}
