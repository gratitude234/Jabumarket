import Link from "next/link";
import {
  Smartphone,
  Laptop,
  Shirt,
  ShoppingBasket,
  UtensilsCrossed,
  Sparkles,
  Wrench,
  ArrowRight,
  Search,
  PlusSquare,
} from "lucide-react";

const categories = [
  { name: "Phones", icon: Smartphone },
  { name: "Laptops", icon: Laptop },
  { name: "Fashion", icon: Shirt },
  { name: "Provisions", icon: ShoppingBasket },
  { name: "Food", icon: UtensilsCrossed },
  { name: "Beauty", icon: Sparkles },
  { name: "Services", icon: Wrench },
];

const quickLinks = [
  { label: "Food", href: "/explore?category=Food" },
  { label: "Services", href: "/explore?type=service" },
  { label: "Phones", href: "/explore?category=Phones" },
  { label: "New today", href: "/explore?sort=newest" },
];

function Card({
  title,
  desc,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  desc: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-zinc-600">{desc}</p>
      <div className="mt-3">
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm text-white no-underline hover:opacity-90"
        >
          {ctaLabel} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function ListingSkeleton() {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="h-3 w-24 rounded bg-zinc-100" />
      <div className="mt-3 h-4 w-40 rounded bg-zinc-100" />
      <div className="mt-2 h-3 w-28 rounded bg-zinc-100" />
      <div className="mt-4 h-9 w-28 rounded-xl bg-zinc-100" />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* HERO */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold">Buy/Sell + Services in JABU</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Find student deals, trusted vendors, and services around campus.
        </p>

        {/* Search (no client JS needed) */}
        <form action="/explore" method="GET" className="mt-4">
          <label className="sr-only" htmlFor="q">
            Search listings
          </label>
          <div className="flex items-center gap-2 rounded-2xl border bg-white p-2">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              id="q"
              name="q"
              placeholder="Search phones, food, services…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
              autoComplete="off"
            />
            <button
              type="submit"
              className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Search
            </button>
          </div>
        </form>

        {/* Quick links */}
        <div className="mt-3 flex flex-wrap gap-2">
          {quickLinks.map((x) => (
            <Link
              key={x.label}
              href={x.href}
              className="rounded-full border bg-white px-3 py-2 text-xs text-zinc-700 no-underline hover:bg-zinc-50"
            >
              {x.label}
            </Link>
          ))}
        </div>

        {/* Primary CTAs */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm text-white no-underline hover:opacity-90"
          >
            Explore listings <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/post"
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm text-black no-underline hover:bg-zinc-50"
          >
            <PlusSquare className="h-4 w-4" />
            Post a listing
          </Link>
          <Link
            href="/vendors"
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm text-black no-underline hover:bg-zinc-50"
          >
            Browse vendors <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700">Categories</h2>
          <Link href="/explore" className="text-sm text-zinc-600 no-underline hover:underline">
            See all →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map(({ name, icon: Icon }) => (
            <Link
              key={name}
              href={`/explore?category=${encodeURIComponent(name)}`}
              className="group flex items-center gap-3 rounded-2xl border bg-white p-3 no-underline hover:bg-zinc-50"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white">
                <Icon className="h-4 w-4 text-zinc-700" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-800">{name}</div>
                <div className="text-xs text-zinc-500">Tap to explore</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* NEW TODAY (placeholder cards; later swap to real supabase data) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700">New today</h2>
          <Link
            href="/explore?sort=newest"
            className="text-sm text-zinc-600 no-underline hover:underline"
          >
            View more →
          </Link>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <ListingSkeleton />
          <ListingSkeleton />
        </div>

        <p className="text-xs text-zinc-500">
          (Next step: replace these with real “latest listings” from Supabase.)
        </p>
      </section>

      {/* COURIERS */}
      <Card
        title="Need a courier?"
        desc="Find verified riders and message them on WhatsApp (contact-only, no in-app delivery system)."
        ctaHref="/couriers"
        ctaLabel="View couriers"
      />

      {/* HOW IT WORKS */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">How it works</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-3">
            <div className="text-sm font-semibold">Browse</div>
            <div className="mt-1 text-xs text-zinc-600">Explore listings or vendors.</div>
          </div>
          <div className="rounded-2xl border bg-white p-3">
            <div className="text-sm font-semibold">Chat</div>
            <div className="mt-1 text-xs text-zinc-600">Tap WhatsApp to message.</div>
          </div>
          <div className="rounded-2xl border bg-white p-3">
            <div className="text-sm font-semibold">Meet safely</div>
            <div className="mt-1 text-xs text-zinc-600">Meet in public on campus.</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-zinc-500">
          Safety tips: meet in public • inspect before paying • avoid rushing deals
        </div>
      </section>
    </div>
  );
}
