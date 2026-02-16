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

function SectionCard({
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
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-3">
        <Link href={ctaHref} className="btn-primary">
          {ctaLabel} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function ListingSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-5 w-14 rounded-full bg-muted" />
      </div>
      <div className="mt-3 h-4 w-44 rounded bg-muted" />
      <div className="mt-2 h-3 w-28 rounded bg-muted" />
      <div className="mt-4 h-9 w-28 rounded-xl bg-muted" />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
        {/* soft brand glow */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
            <span className="badge-success">Campus</span>
            <span>Fast deals • Trusted vendors • Services</span>
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight">
            Buy, Sell & Find Services in JABU
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse student deals, vendor menus, and verified couriers — then chat on WhatsApp.
          </p>

          {/* Search */}
          <form action="/explore" method="GET" className="mt-4">
            <label className="sr-only" htmlFor="q">
              Search listings
            </label>

            <div className="flex items-center gap-2 rounded-2xl border border-border bg-background p-2 shadow-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                id="q"
                name="q"
                placeholder="Search phones, food, services…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                autoComplete="off"
              />
              <button type="submit" className="btn-primary">
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
                className="rounded-full border border-border bg-background px-3 py-2 text-xs text-foreground/80 no-underline hover:bg-secondary"
              >
                {x.label}
              </Link>
            ))}
          </div>

          {/* CTAs */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/explore" className="btn-primary">
              Explore listings <ArrowRight className="h-4 w-4" />
            </Link>

            <Link href="/post" className="btn-outline">
              <PlusSquare className="h-4 w-4" />
              Post a listing
            </Link>

            <Link href="/vendors" className="btn-outline">
              Browse vendors <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Trust note */}
          <div className="mt-3 text-xs text-muted-foreground">
            Tip: Always meet in public on campus • Inspect before paying.
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground/80">Categories</h2>
          <Link href="/explore" className="link-primary text-sm">
            See all →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map(({ name, icon: Icon }) => (
            <Link
              key={name}
              href={`/explore?category=${encodeURIComponent(name)}`}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 no-underline shadow-sm transition
                         hover:-translate-y-0.5 hover:bg-secondary/60 hover:shadow"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
                <Icon className="h-4 w-4 text-foreground/80" />
              </div>

              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{name}</div>
                <div className="text-xs text-muted-foreground">Tap to explore</div>
              </div>

              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>

      {/* NEW TODAY */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground/80">New today</h2>
          <Link href="/explore?sort=newest" className="link-primary text-sm">
            View more →
          </Link>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <ListingSkeleton />
          <ListingSkeleton />
        </div>

        <p className="text-xs text-muted-foreground">
          Next step: replace these with real “latest listings” from Supabase.
        </p>
      </section>

      {/* COURIERS */}
      <SectionCard
        title="Need a courier?"
        desc="Find verified riders and message them on WhatsApp (contact-only, no in-app delivery system)."
        ctaHref="/couriers"
        ctaLabel="View couriers"
      />

      {/* HOW IT WORKS */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">How it works</h2>
          <Link href="/explore" className="link-primary text-sm">
            Start browsing →
          </Link>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background p-3">
            <div className="text-sm font-semibold">Browse</div>
            <div className="mt-1 text-xs text-muted-foreground">Explore listings or vendors.</div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-3">
            <div className="text-sm font-semibold">Chat</div>
            <div className="mt-1 text-xs text-muted-foreground">Tap WhatsApp to message.</div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-3">
            <div className="text-sm font-semibold">Meet safely</div>
            <div className="mt-1 text-xs text-muted-foreground">Meet in public on campus.</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          Safety tips: meet in public • inspect before paying • avoid rushing deals
        </div>
      </section>
    </div>
  );
}
