// app/page.tsx
import Link from "next/link";
import {
  Search,
  Sparkles,
  ShieldCheck,
  Truck,
  ArrowRight,
  Smartphone,
  Laptop,
  Shirt,
  ShoppingBasket,
  UtensilsCrossed,
  Wrench,
  Star,
} from "lucide-react";
import { supabase } from "@/lib/supabase/server";

function formatNaira(amount: number | null | undefined) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "₦0";
  return `₦${n.toLocaleString("en-NG")}`;
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
  { name: "Provisions", icon: ShoppingBasket, href: "/explore?category=Provisions" },
  { name: "Food", icon: UtensilsCrossed, href: "/explore?category=Food" },
  { name: "Beauty", icon: Sparkles, href: "/explore?category=Beauty" },
  { name: "Services", icon: Wrench, href: "/explore?category=Services&type=service" },
];

const quickChips = [
  { label: "New today", href: "/explore?sort=newest" },
  { label: "Food vendors", href: "/vendors?type=food" },
  { label: "Services", href: "/explore?type=service" },
  { label: "Verified", href: "/vendors" },
];

export default async function HomePage() {
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
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:pt-8">
      {/* Mobile-first page header */}
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm">
              <Sparkles className="h-4 w-4" />
              <span className="truncate">JABU Market</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Buy, Sell & Services — fast on campus.
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600 sm:text-base">
              Find trusted vendors, student listings, and services. Chat quickly and meet safely.
            </p>
          </div>

          {/* Desktop-only helper CTAs */}
          <div className="hidden items-center gap-2 sm:flex">
            <Link
              href="/post"
              className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Post
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/vendors"
              className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Vendors
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Trust badges (mobile-friendly, wraps nicely) */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-zinc-700">
            <ShieldCheck className="h-4 w-4" />
            Verified vendors
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-zinc-700">
            <Truck className="h-4 w-4" />
            Couriers available
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-zinc-700">
            <Star className="h-4 w-4" />
            Quick WhatsApp chat
          </span>
        </div>
      </header>

      {/* Sticky mobile search bar (mobile-first UX win) */}
      <section className="sticky top-0 z-20 -mx-4 mt-4 border-b bg-white/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-b-0 sm:bg-transparent sm:px-0 sm:py-0">
        <form action="/explore" method="GET" className="w-full">
          <div className="flex items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100">
              <Search className="h-5 w-5 text-zinc-700" />
            </div>

            <input
              name="q"
              placeholder="Search: iPhone, rice, laundry…"
              list="home-search-suggestions"
              className="h-10 w-full bg-transparent px-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              aria-label="Search listings"
            />

            <button
              type="reset"
              className="h-10 rounded-xl px-3 text-sm text-zinc-600 hover:bg-zinc-100"
              aria-label="Clear search"
              title="Clear"
            >
              ×
            </button>

            <button
              type="submit"
              className="h-10 rounded-xl bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Go
            </button>

            <datalist id="home-search-suggestions">
              <option value="iPhone" />
              <option value="laptop" />
              <option value="rice" />
              <option value="laundry" />
              <option value="hair" />
              <option value="repairs" />
              <option value="food" />
            </datalist>
          </div>
        </form>

        {/* Mobile chips row (horizontal scroll, one-hand friendly) */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:mt-4 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {quickChips.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="shrink-0 rounded-full border bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm hover:bg-zinc-50"
            >
              {c.label}
            </Link>
          ))}
        </div>

        {/* Mobile primary CTAs (bottom-ish feel, but still on top) */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
          <Link
            href="/explore"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Explore <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/post"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Post <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Content sections */}
      <div className="mt-6 space-y-10">
        {/* Categories (mobile: 2 cols, desktop: 4) */}
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">Categories</h2>
              <p className="text-sm text-zinc-600">Tap to browse fast.</p>
            </div>
            <Link href="/explore" className="text-sm text-zinc-700 hover:underline">
              View all
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => {
              const Icon = c.icon;
              return (
                <Link
                  key={c.name}
                  href={c.href}
                  className="group rounded-2xl border bg-white p-4 shadow-sm active:scale-[0.99] hover:bg-zinc-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100 group-hover:bg-zinc-200">
                      <Icon className="h-5 w-5 text-zinc-800" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{c.name}</div>
                      <div className="truncate text-xs text-zinc-600">Browse</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Latest listings (mobile-first cards) */}
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">Latest listings</h2>
              <p className="text-sm text-zinc-600">Fresh posts from campus.</p>
            </div>
            <Link href="/explore?sort=newest" className="text-sm text-zinc-700 hover:underline">
              See more
            </Link>
          </div>

          {listings.length === 0 ? (
            <div className="rounded-2xl border bg-white p-5 text-sm text-zinc-600 shadow-sm">
              No recent listings yet.
              <div className="mt-3">
                <Link
                  href="/explore?sort=newest"
                  className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Explore newest <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => (
                <Link
                  key={l.id}
                  href={`/listing/${l.id}`}
                  className="group rounded-2xl border bg-white p-4 shadow-sm active:scale-[0.99] hover:bg-zinc-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">
                        {l.title ?? "Untitled listing"}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
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
                      </div>
                    </div>

                    <div className="shrink-0 rounded-2xl bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900">
                      {formatNaira(l.price)}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                    <span>Tap to view</span>
                    <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Featured vendors (mobile-first) */}
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">Verified vendors</h2>
              <p className="text-sm text-zinc-600">Trusted sellers and services.</p>
            </div>
            <Link href="/vendors" className="text-sm text-zinc-700 hover:underline">
              Browse all
            </Link>
          </div>

          {vendors.length === 0 ? (
            <div className="rounded-2xl border bg-white p-5 text-sm text-zinc-600 shadow-sm">
              No verified vendors available right now.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.map((v) => (
                <Link
                  key={v.id}
                  href={`/vendors/${v.id}`}
                  className="group rounded-2xl border bg-white p-4 shadow-sm active:scale-[0.99] hover:bg-zinc-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">
                        {v.name ?? "Unnamed vendor"}
                      </div>
                      <div className="mt-1 truncate text-xs text-zinc-600">
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

                    <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Two CTAs - stacked on mobile */}
        <section className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100">
                <ShieldCheck className="h-5 w-5 text-zinc-800" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-900 sm:text-base">Stay safe</h3>
                <p className="text-sm text-zinc-600">
                  Meet in public places, confirm details, and report suspicious activity.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/report"
                    className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    Report <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/vendors"
                    className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
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
                <h3 className="text-sm font-semibold text-zinc-900 sm:text-base">Need a courier?</h3>
                <p className="text-sm text-zinc-600">
                  Message couriers directly to help you pick up food or deliver items.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/couriers"
                    className="inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    Find couriers <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/rider/apply"
                    className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    Become a rider <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works - mobile cards */}
        <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-zinc-900 sm:text-lg">How it works</h2>
          <p className="mt-1 text-sm text-zinc-600">Simple steps. One-hand friendly.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link href="/explore" className="rounded-2xl border bg-white p-4 hover:bg-zinc-50 active:scale-[0.99]">
              <div className="text-sm font-semibold text-zinc-900">1) Browse</div>
              <div className="mt-1 text-sm text-zinc-600">Search listings, categories, and services.</div>
            </Link>

            <Link href="/vendors" className="rounded-2xl border bg-white p-4 hover:bg-zinc-50 active:scale-[0.99]">
              <div className="text-sm font-semibold text-zinc-900">2) Chat</div>
              <div className="mt-1 text-sm text-zinc-600">Contact sellers/vendors quickly.</div>
            </Link>

            <Link href="/post" className="rounded-2xl border bg-white p-4 hover:bg-zinc-50 active:scale-[0.99]">
              <div className="text-sm font-semibold text-zinc-900">3) Post</div>
              <div className="mt-1 text-sm text-zinc-600">Sell items or advertise your service.</div>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
