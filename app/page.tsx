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
        <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="link-primary shrink-0 text-xs font-medium sm:text-sm">
          {cta ?? "See all"}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Mobile-first horizontal scroll row that becomes a grid on larger screens.
 * (No JS, no extra libs.)
 */
function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      <style>{`div::-webkit-scrollbar{display:none}`}</style>
      {children}
    </div>
  );
}

export default async function HomePage() {
  // Latest listings
  const { data: latestListings } = await supabase
    .from("listings")
    .select("id, title, price, category, listing_type, created_at")
    .order("created_at", { ascending: false })
    .limit(6);

  // Featured verified vendors
  const { data: featuredVendors } = await supabase
    .from("vendors")
    .select("id, name, location, verified, vendor_type")
    .eq("verified", true)
    .order("created_at", { ascending: false })
    .limit(6);

  const listings = (latestListings ?? []) as ListingPreview[];
  const vendors = (featuredVendors ?? []) as VendorPreview[];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-24 pt-5 sm:pb-10 sm:pt-8">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border bg-card p-4 shadow-sm sm:p-7">
        {/* soft background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-card via-card to-background" />
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-foreground backdrop-blur">
            <Sparkles className="h-4 w-4 text-primary" />
            JABU Market
          </span>

          <span className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-foreground backdrop-blur">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Verified vendors
          </span>

          <span className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-foreground backdrop-blur">
            <Truck className="h-4 w-4 text-primary" />
            Couriers available
          </span>
        </div>

        <div className="mt-3 space-y-2">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
            Buy, sell & find services around JABU.
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Discover listings, trusted vendors and services. Chat fast and keep it safe.
          </p>
        </div>

        {/* Search */}
        <div className="mt-4">
          <form action="/explore" method="GET">
            <div className="flex items-center gap-2 rounded-2xl border bg-background p-2 shadow-sm">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>

              <input
                name="q"
                placeholder="Search: iPhone, rice, laundry…"
                list="home-suggestions"
                className="h-10 w-full bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />

              <button
                type="reset"
                className="h-10 rounded-xl px-3 text-sm text-muted-foreground hover:bg-secondary"
                aria-label="Clear search"
                title="Clear"
              >
                ×
              </button>

              {/* Primary action uses design system */}
              <button type="submit" className="btn-primary h-10 px-4 py-0">
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

          {/* Quick links */}
          <div className="mt-3 flex flex-wrap gap-2">
            {quickLinks.map((q) => (
              <Link
                key={q.label}
                href={q.href}
                className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs text-foreground hover:bg-secondary"
              >
                {q.label}
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>

        {/* Desktop CTAs (mobile gets sticky bar) */}
        <div className="mt-4 hidden flex-wrap gap-2 sm:flex">
          <Link href="/explore" className="btn-primary">
            Explore listings <ArrowRight className="h-4 w-4" />
          </Link>

          <Link href="/vendors" className="btn-outline">
            Browse vendors <ArrowRight className="h-4 w-4" />
          </Link>

          <Link href="/post" className="btn-outline">
            Post an item <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="space-y-3">
        <SectionHeader title="Categories" subtitle="Jump straight to what you need." href="/explore" cta="View all" />

        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          <style>{`div::-webkit-scrollbar{display:none}`}</style>

          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.name}
                href={c.href}
                className="min-w-[220px] rounded-2xl border bg-card p-4 shadow-sm hover:bg-secondary sm:min-w-0"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground">Browse {c.name.toLowerCase()}</div>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
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
          <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground shadow-sm">
            No recent listings yet.
            <div className="mt-3">
              <Link href="/explore?sort=newest" className="btn-primary">
                Explore newest <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : (
          <ScrollRow>
            {listings.map((l) => (
              <Link
                key={l.id}
                href={`/listing/${l.id}`}
                className="min-w-[260px] rounded-2xl border bg-card p-4 shadow-sm hover:bg-secondary sm:min-w-0"
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
                    </div>
                  </div>

                  <div className="shrink-0 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-foreground">
                    {formatNaira(l.price)}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Tap to view</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </ScrollRow>
        )}
      </section>

      {/* FEATURED VENDORS */}
      <section className="space-y-3">
        <SectionHeader title="Featured verified vendors" subtitle="Trusted sellers & services." href="/vendors" cta="Browse all" />

        {vendors.length === 0 ? (
          <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground shadow-sm">
            No featured vendors available right now.
          </div>
        ) : (
          <ScrollRow>
            {vendors.map((v) => (
              <Link
                key={v.id}
                href={`/vendors/${v.id}`}
                className="min-w-[260px] rounded-2xl border bg-card p-4 shadow-sm hover:bg-secondary sm:min-w-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{v.name ?? "Unnamed vendor"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{v.location ?? "Location not set"}</div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {v.vendor_type ? (
                        <span className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-xs text-foreground">
                          {v.vendor_type}
                        </span>
                      ) : null}

                      {/* Verified uses accent */}
                      <span className="badge-success inline-flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Verified
                      </span>
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </ScrollRow>
        )}
      </section>

      {/* SAFETY + COURIER */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary">
              <ShieldCheck className="h-5 w-5 text-accent" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">Stay safe</h3>
              <p className="text-sm text-muted-foreground">
                Meet in public places, verify details, and report suspicious activity.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/report" className="btn-outline">
                  Report <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/vendors" className="btn-primary">
                  Verified vendors <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">Need a courier?</h3>
              <p className="text-sm text-muted-foreground">
                Message couriers directly for food pickups and quick deliveries.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/couriers" className="btn-primary">
                  Find couriers <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/rider/apply" className="btn-outline">
                  Become a rider <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">How it works</h2>
          <p className="text-sm text-muted-foreground">Simple flow. No stress.</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link href="/explore" className="rounded-2xl border bg-background p-4 hover:bg-secondary">
            <div className="text-sm font-semibold text-foreground">1) Browse</div>
            <div className="mt-1 text-sm text-muted-foreground">Search listings, categories, and services.</div>
          </Link>

          <Link href="/vendors" className="rounded-2xl border bg-background p-4 hover:bg-secondary">
            <div className="text-sm font-semibold text-foreground">2) Chat</div>
            <div className="mt-1 text-sm text-muted-foreground">Contact verified vendors quickly.</div>
          </Link>

          <Link href="/post" className="rounded-2xl border bg-background p-4 hover:bg-secondary">
            <div className="text-sm font-semibold text-foreground">3) Post</div>
            <div className="mt-1 text-sm text-muted-foreground">Sell items or advertise your service.</div>
          </Link>
        </div>
      </section>

      {/* Mobile sticky bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <Link
            href="/explore"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          >
            <Search className="h-4 w-4" />
            Explore
          </Link>

          <Link
            href="/post"
            className="flex items-center justify-center gap-2 rounded-2xl border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            <PlusSquare className="h-4 w-4" />
            Post
          </Link>

          <Link
            href="/vendors"
            className="flex items-center justify-center gap-2 rounded-2xl border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            <Store className="h-4 w-4" />
            Vendors
          </Link>
        </div>
      </nav>
    </main>
  );
}
