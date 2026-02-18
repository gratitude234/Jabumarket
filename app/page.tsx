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
  TrendingUp,
  Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase/server";

function formatNaira(amount: number | null | undefined) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "₦0";
  return `₦${n.toLocaleString("en-NG")}`;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
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
  { label: "New today", href: "/explore?sort=newest", icon: Clock },
  { label: "Trending", href: "/explore?sort=newest", icon: TrendingUp },
  { label: "Food vendors", href: "/vendors?type=food", icon: UtensilsCrossed },
  { label: "Verified vendors", href: "/vendors", icon: ShieldCheck },
];

function SectionHeader({
  title,
  subtitle,
  href,
  cta,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-zinc-900 sm:text-lg">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-zinc-600 sm:text-sm">{subtitle}</p>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="shrink-0 text-xs font-medium text-zinc-800 hover:underline sm:text-sm"
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

function SkeletonCard() {
  return (
    <div className="min-w-[260px] rounded-2xl border bg-white p-4 shadow-sm sm:min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="h-4 w-3/4 rounded bg-zinc-100" />
          <div className="mt-3 flex gap-2">
            <div className="h-5 w-16 rounded-full bg-zinc-100" />
            <div className="h-5 w-20 rounded-full bg-zinc-100" />
          </div>
        </div>
        <div className="h-9 w-20 rounded-xl bg-zinc-100" />
      </div>
      <div className="mt-4 h-3 w-24 rounded bg-zinc-100" />
    </div>
  );
}

export default async function HomePage() {
  const [{ data: latestListings }, { data: featuredVendors }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, title, price, category, listing_type, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("vendors")
      .select("id, name, location, verified, vendor_type")
      .eq("verified", true)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const listings = (latestListings ?? []) as ListingPreview[];
  const vendors = (featuredVendors ?? []) as VendorPreview[];

  const listingCount = listings.length;
  const vendorCount = vendors.length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-24 pt-5 sm:pb-10 sm:pt-8">
      {/* HERO — upgraded size + hierarchy */}
      <section className="relative overflow-hidden rounded-3xl border bg-white shadow-sm">
        {/* background layers */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-zinc-100 blur-3xl" />
          <div className="absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-zinc-100 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-zinc-50" />
        </div>

        <div className="p-4 sm:p-7">
          {/* chips */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border bg-white/80 px-3 py-1 text-xs text-zinc-700 backdrop-blur">
              <Sparkles className="h-4 w-4" />
              JABU Market
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border bg-white/80 px-3 py-1 text-xs text-zinc-700 backdrop-blur">
              <ShieldCheck className="h-4 w-4" />
              Verified vendors
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border bg-white/80 px-3 py-1 text-xs text-zinc-700 backdrop-blur">
              <Truck className="h-4 w-4" />
              Couriers available
            </span>
          </div>

          {/* hero content */}
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
            <div className="space-y-3">
              <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight text-zinc-900 sm:text-4xl">
                Buy, sell & find services around JABU.
              </h1>
              <p className="max-w-2xl text-sm text-zinc-600 sm:text-base">
                Discover listings, trusted vendors and services. Chat fast and keep it safe.
              </p>

              {/* micro stats (trust + activity) */}
              <div className="flex flex-wrap gap-2 pt-1">
                <div className="inline-flex items-center gap-2 rounded-2xl border bg-white/70 px-3 py-2 text-xs text-zinc-700">
                  <Flame className="h-4 w-4" />
                  <span className="font-medium text-zinc-900">{listingCount}</span>
                  <span className="text-zinc-600">new listings loaded</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl border bg-white/70 px-3 py-2 text-xs text-zinc-700">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="font-medium text-zinc-900">{vendorCount}</span>
                  <span className="text-zinc-600">verified vendors featured</span>
                </div>
              </div>

              {/* desktop primary CTAs */}
              <div className="hidden flex-wrap gap-2 pt-2 sm:flex">
                <Link
                  href="/explore"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Explore now <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/post"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Post a listing <PlusSquare className="h-4 w-4" />
                </Link>
                <Link
                  href="/vendors"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Browse vendors <Store className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* search card (more “hero”, bigger, clearer) */}
            <div className="rounded-3xl border bg-white/80 p-3 shadow-sm backdrop-blur sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-zinc-900">Search fast</div>
                <Link
                  href="/explore?sort=newest"
                  className="text-xs font-medium text-zinc-700 hover:underline"
                >
                  New today
                </Link>
              </div>

              <form action="/explore" method="GET" className="mt-3">
                <div className="flex items-center gap-2 rounded-2xl border bg-white p-2">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100">
                    <Search className="h-5 w-5 text-zinc-700" />
                  </div>

                  <input
                    name="q"
                    placeholder="Search: iPhone, rice, laundry…"
                    list="home-suggestions"
                    className="h-11 w-full bg-transparent px-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                  />

                  <button
                    type="reset"
                    className="h-11 rounded-2xl px-3 text-sm text-zinc-600 hover:bg-zinc-100"
                    aria-label="Clear search"
                    title="Clear"
                  >
                    ×
                  </button>

                  <button
                    type="submit"
                    className="h-11 rounded-2xl bg-black px-4 text-sm font-semibold text-white hover:bg-zinc-800"
                  >
                    Go
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
              </form>

              {/* quick links — better affordance */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {quickLinks.map((q) => {
                  const Icon = q.icon;
                  return (
                    <Link
                      key={q.label}
                      href={q.href}
                      className="inline-flex items-center justify-between gap-2 rounded-2xl border bg-white px-3 py-3 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-xl bg-zinc-100">
                          <Icon className="h-4 w-4 text-zinc-700" />
                        </span>
                        {q.label}
                      </span>
                      <ArrowRight className="h-4 w-4 text-zinc-400" />
                    </Link>
                  );
                })}
              </div>

              <p className="mt-3 text-xs text-zinc-500">
                Tip: Use keywords like <span className="font-medium">“rice”</span>,{" "}
                <span className="font-medium">“hair”</span>, <span className="font-medium">“repair”</span>.
              </p>
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
        />

        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          <style>{`div::-webkit-scrollbar{display:none}`}</style>

          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.name}
                href={c.href}
                className="group min-w-[220px] rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 sm:min-w-0"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100 transition group-hover:scale-[1.02]">
                    <Icon className="h-5 w-5 text-zinc-800" />
                  </div>

                  <div className="min-w-0">
                    <div className="truncate font-semibold text-zinc-900">{c.name}</div>
                    <div className="text-xs text-zinc-600">Browse {c.name.toLowerCase()}</div>
                  </div>

                  <ArrowRight className="ml-auto h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5" />
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
        />

        {listings.length === 0 ? (
          <div className="rounded-3xl border bg-white p-5 text-sm text-zinc-600">
            No recent listings yet.
            <div className="mt-3">
              <Link
                href="/post"
                className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Post the first one <PlusSquare className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : (
          <ScrollRow>
            {listings.map((l) => (
              <Link
                key={l.id}
                href={`/listing/${l.id}`}
                className="group min-w-[260px] rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 sm:min-w-0"
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

                  <div className="shrink-0 rounded-2xl bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900">
                    {formatNaira(l.price)}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-2">
                    Tap to view <ArrowRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5" />
                  </span>
                  <span className="text-zinc-400">Details</span>
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
        />

        {vendors.length === 0 ? (
          <div className="rounded-3xl border bg-white p-5 text-sm text-zinc-600">
            No featured vendors available right now.
          </div>
        ) : (
          <ScrollRow>
            {vendors.map((v) => (
              <Link
                key={v.id}
                href={`/vendors/${v.id}`}
                className="group min-w-[260px] rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-50 sm:min-w-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {v.name ?? "Unnamed vendor"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {v.location ?? "Location not set"}
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

                  <ArrowRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5" />
                </div>

                <div className="mt-4 text-xs text-zinc-500">
                  Tap to view profile
                </div>
              </Link>
            ))}
          </ScrollRow>
        )}
      </section>

      {/* SAFETY + COURIER */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100">
              <ShieldCheck className="h-5 w-5 text-zinc-800" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-zinc-900">Stay safe</h3>
              <p className="text-sm text-zinc-600">
                Meet in public places, verify details, and report suspicious activity.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/report"
                  className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Report <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/vendors"
                  className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
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
              <h3 className="font-semibold text-zinc-900">Need a courier?</h3>
              <p className="text-sm text-zinc-600">
                Message couriers directly for food pickups and quick deliveries.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/couriers"
                  className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Find couriers <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/rider/apply"
                  className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                >
                  Become a rider <ArrowRight className="h-4 w-4" />
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
          <Link href="/explore" className="rounded-2xl border bg-white p-4 hover:bg-zinc-50">
            <div className="text-sm font-semibold text-zinc-900">1) Browse</div>
            <div className="mt-1 text-sm text-zinc-600">Search listings, categories, and services.</div>
          </Link>

          <Link href="/vendors" className="rounded-2xl border bg-white p-4 hover:bg-zinc-50">
            <div className="text-sm font-semibold text-zinc-900">2) Chat</div>
            <div className="mt-1 text-sm text-zinc-600">Contact verified vendors quickly.</div>
          </Link>

          <Link href="/post" className="rounded-2xl border bg-white p-4 hover:bg-zinc-50">
            <div className="text-sm font-semibold text-zinc-900">3) Post</div>
            <div className="mt-1 text-sm text-zinc-600">Sell items or advertise your service.</div>
          </Link>
        </div>
      </section>

      {/* Mobile sticky bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/90 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
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
