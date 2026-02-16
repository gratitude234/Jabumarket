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

const quickLinks = [
  { label: "New today", href: "/explore?sort=newest" },
  { label: "Food vendors", href: "/vendors?type=food" },
  { label: "Services", href: "/explore?type=service" },
  { label: "Verified vendors", href: "/vendors" },
];

export default async function HomePage() {
  // Latest listings (safe: if schema differs, section will just fall back)
  const { data: latestListings } = await supabase
    .from("listings")
    .select("id, title, price, category, listing_type, created_at")
    .order("created_at", { ascending: false })
    .limit(6);

  // Featured vendors (verified)
  const { data: featuredVendors } = await supabase
    .from("vendors")
    .select("id, name, location, verified, vendor_type")
    .eq("verified", true)
    .order("created_at", { ascending: false })
    .limit(6);

  const listings = (latestListings ?? []) as ListingPreview[];
  const vendors = (featuredVendors ?? []) as VendorPreview[];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:py-10">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border bg-white p-5 shadow-sm sm:p-8">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-zinc-50 to-white" />
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-zinc-700">
              <Sparkles className="h-4 w-4" />
              JABU Market
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-zinc-700">
              <ShieldCheck className="h-4 w-4" />
              Verified vendors & students
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs text-zinc-700">
              <Truck className="h-4 w-4" />
              Couriers available
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
              Buy / Sell + Services around JABU — fast and trusted.
            </h1>
            <p className="max-w-2xl text-sm text-zinc-600 sm:text-base">
              Find listings, verified vendors, and services on campus. Chat quickly on WhatsApp and meet safely.
            </p>
          </div>

          {/* SEARCH */}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <form action="/explore" method="GET" className="w-full">
              <div className="flex w-full items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100">
                  <Search className="h-5 w-5 text-zinc-700" />
                </div>

                <input
                  name="q"
                  placeholder="Search: iPhone, rice, laundry, laptop…"
                  list="home-search-suggestions"
                  className="h-10 w-full bg-transparent px-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />

                {/* Reset clears input (no JS needed) */}
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
                  Search
                </button>

                <datalist id="home-search-suggestions">
                  <option value="iPhone" />
                  <option value="laptop" />
                  <option value="rice" />
                  <option value="gas" />
                  <option value="laundry" />
                  <option value="hair" />
                  <option value="repairs" />
                </datalist>
              </div>
            </form>

            <div className="flex flex-wrap gap-2">
              {quickLinks.map((q) => (
                <Link
                  key={q.label}
                  href={q.href}
                  className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  {q.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>

          {/* HERO CTAs */}
          <div className="flex flex-wrap gap-2">
            <Link
              href="/explore"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Explore listings <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/vendors"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Browse vendors <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/post"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Post an item <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Categories</h2>
            <p className="text-sm text-zinc-600">Jump straight to what you need.</p>
          </div>
          <Link href="/explore" className="text-sm text-zinc-700 hover:underline">
            View all
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.name}
                href={c.href}
                className="group flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm hover:bg-zinc-50"
              >
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100 group-hover:bg-zinc-200">
                  <Icon className="h-5 w-5 text-zinc-800" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-900">{c.name}</div>
                  <div className="text-xs text-zinc-600">Browse {c.name.toLowerCase()}</div>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 text-zinc-400 group-hover:text-zinc-700" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* LATEST LISTINGS */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Latest listings</h2>
            <p className="text-sm text-zinc-600">Fresh posts from around campus.</p>
          </div>
          <Link href="/explore?sort=newest" className="text-sm text-zinc-700 hover:underline">
            See more
          </Link>
        </div>

        {listings.length === 0 ? (
          <div className="rounded-2xl border bg-white p-5 text-sm text-zinc-600">
            No recent listings yet. Try exploring the newest feed.
            <div className="mt-3">
              <Link
                href="/explore?sort=newest"
                className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
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
                className="group rounded-2xl border bg-white p-4 shadow-sm hover:bg-zinc-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-zinc-900">
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

                  <div className="shrink-0 rounded-xl bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900">
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

      {/* FEATURED VENDORS */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Featured verified vendors</h2>
            <p className="text-sm text-zinc-600">Trusted sellers and services.</p>
          </div>
          <Link href="/vendors" className="text-sm text-zinc-700 hover:underline">
            Browse all
          </Link>
        </div>

        {vendors.length === 0 ? (
          <div className="rounded-2xl border bg-white p-5 text-sm text-zinc-600">
            No featured vendors available right now.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <Link
                key={v.id}
                href={`/vendors/${v.id}`}
                className="group rounded-2xl border bg-white p-4 shadow-sm hover:bg-zinc-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-zinc-900">{v.name ?? "Unnamed vendor"}</div>
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
                  <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* SAFETY + COURIER CTA */}
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
                  className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Report an issue <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/vendors"
                  className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Browse verified vendors <ArrowRight className="h-4 w-4" />
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
                Message couriers directly to help you pick up food or deliver items.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/couriers"
                  className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Find couriers <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/rider/apply"
                  className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
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
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-zinc-900">How it works</h2>
          <p className="text-sm text-zinc-600">Simple flow. No stress.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link href="/explore" className="rounded-2xl border bg-white p-4 hover:bg-zinc-50">
            <div className="text-sm font-semibold text-zinc-900">1) Browse</div>
            <div className="mt-1 text-sm text-zinc-600">Search listings, categories, and services.</div>
          </Link>

          <Link href="/vendors" className="rounded-2xl border bg-white p-4 hover:bg-zinc-50">
            <div className="text-sm font-semibold text-zinc-900">2) Chat</div>
            <div className="mt-1 text-sm text-zinc-600">Contact sellers and vendors quickly.</div>
          </Link>

          <Link href="/post" className="rounded-2xl border bg-white p-4 hover:bg-zinc-50">
            <div className="text-sm font-semibold text-zinc-900">3) Post</div>
            <div className="mt-1 text-sm text-zinc-600">Sell items or advertise your service.</div>
          </Link>
        </div>
      </section>
    </main>
  );
}
