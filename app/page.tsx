// app/page.tsx
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Cpu,
  FileText,
  MessageCircleQuestion,
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
  BadgeCheck,
  MapPin,
  Image as ImageIcon,
  Star,
  Zap,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ListingImage from "@/components/ListingImage";

export const revalidate = 120;

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
};

const categories = [
  { name: "Food",        icon: UtensilsCrossed, href: "/food",                                   bg: "bg-orange-100", icon_color: "text-orange-600" },
  { name: "Phones",      icon: Smartphone,      href: "/explore?category=Phones",                bg: "bg-blue-100",   icon_color: "text-blue-600"   },
  { name: "Laptops",     icon: Laptop,          href: "/explore?category=Laptops",               bg: "bg-violet-100", icon_color: "text-violet-600" },
  { name: "Fashion",     icon: Shirt,           href: "/explore?category=Fashion",               bg: "bg-pink-100",   icon_color: "text-pink-600"   },
  { name: "Electronics", icon: Cpu,             href: "/explore?category=Electronics",           bg: "bg-cyan-100",   icon_color: "text-cyan-600"   },
  { name: "Provisions",  icon: ShoppingBasket,  href: "/explore?category=Provisions",            bg: "bg-green-100",  icon_color: "text-green-600"  },
  { name: "Books",       icon: BookOpen,        href: "/explore?category=Books+%26+Stationery", bg: "bg-amber-100",  icon_color: "text-amber-600"  },
  { name: "Services",    icon: Wrench,          href: "/explore?category=Services&type=service", bg: "bg-zinc-100",   icon_color: "text-zinc-600"   },
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
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-zinc-100">
              {icon}
            </span>
          )}
          <h2 className="truncate text-base font-semibold text-zinc-900 sm:text-lg">{title}</h2>
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500 sm:text-sm">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 sm:text-sm"
        >
          {cta ?? "See all"}
        </Link>
      )}
    </div>
  );
}

function ScrollRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {children}
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-600">
      {children}
    </span>
  );
}

function isVendorVerified(v: VendorPreview) {
  return v.verified === true || v.verification_status === "verified";
}

function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  return fullName.trim().split(" ")[0];
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [latestListingsRes, featuredVendorsRes, featuredListingsRes, profileRes] =
    await Promise.all([
      supabase
        .from("listings")
        .select("id, title, price, price_label, category, listing_type, location, image_url, negotiable, created_at, status")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("vendors")
        .select("id, name, location, verified, verification_status, vendor_type, avatar_url")
        .or("verified.eq.true,verification_status.eq.verified")
        .not("name", "is", null)
        .order("avatar_url", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(18),
      supabase
        .from("listings")
        .select("id, title, price, price_label, category, listing_type, location, image_url, negotiable, created_at, status")
        .eq("featured", true)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(6),
      user
        ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const listings = ((latestListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);
  const rawVendors = ((featuredVendorsRes.data ?? []) as (VendorPreview & { avatar_url?: string | null })[]).filter(Boolean);
  const featuredListings = ((featuredListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);
  const firstName = getFirstName(profileRes.data?.full_name);

  const homepageVendorIds = rawVendors.map((v) => v.id);
  const homepageListingIds = listings.map((l) => l.id);

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

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-28 pt-5 sm:pb-10 sm:pt-8">

      {/* ── HERO ── */}
      <section className="space-y-4">
        <div>
          {user && firstName ? (
            <p className="text-sm text-zinc-500">
              Welcome back, <span className="font-semibold text-zinc-900">{firstName}</span> 👋
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Campus marketplace & study hub</p>
          )}
          <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-4xl">
            Buy, sell & find services around JABU.
          </h1>
        </div>

        <form action="/explore" method="GET">
          <div className="flex items-center gap-2 rounded-2xl border bg-white p-2 shadow-sm">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100">
              <Search className="h-5 w-5 text-zinc-600" />
            </div>
            <input
              name="q"
              placeholder="Search iPhone, rice, laundry, hair…"
              list="home-suggestions"
              aria-label="Search JABU Market"
              className="h-10 w-full bg-transparent px-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <button
              type="submit"
              className="h-10 shrink-0 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Search
            </button>
            <datalist id="home-suggestions">
              <option value="Phones" /><option value="Laptops" /><option value="Fashion" />
              <option value="Provisions" /><option value="Food" /><option value="Beauty" />
              <option value="Services" /><option value="Repairs" /><option value="Tutoring" />
              <option value="iPhone" /><option value="Android" /><option value="Charger" />
              <option value="Rice" /><option value="Laundry" /><option value="Hair" />
              <option value="Sneakers" /><option value="Power bank" />
            </datalist>
          </div>
        </form>

        <div className="flex gap-3">
          <Link
            href="/explore"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 sm:flex-none"
          >
            Explore listings <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/post"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 sm:flex-none"
          >
            <PlusSquare className="h-4 w-4" />
            Post
          </Link>
        </div>
      </section>

      {/* ── CATEGORIES ── */}
      <section className="space-y-3">
        <SectionHeader title="Categories" href="/explore" cta="View all" />
        <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-8">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.name}
                href={c.href}
                className="group flex min-w-[72px] flex-col items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm transition hover:-translate-y-[1px] hover:bg-zinc-50 sm:min-w-0"
              >
                <div className={cn("grid h-11 w-11 place-items-center rounded-2xl", c.bg)}>
                  <Icon className={cn("h-5 w-5", c.icon_color)} />
                </div>
                <span className="text-center text-xs font-medium text-zinc-800">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── FEATURED LISTINGS ── */}
      {featuredListings.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title="Featured listings"
            subtitle="Handpicked from the marketplace."
            href="/explore"
            cta="See all"
            icon={<Star className="h-4 w-4 text-amber-500" />}
          />
          <ScrollRow>
            {featuredListings.map((l) => {
              const title = l.title ?? "Untitled listing";
              const img = (l.image_url ?? "").trim();
              return (
                <Link
                  key={l.id}
                  href={`/listing/${l.id}`}
                  className="group min-w-[280px] overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-[1px] sm:min-w-0"
                >
                  <div className="relative h-40 w-full bg-zinc-100">
                    {img ? (
                      <ListingImage src={img} alt={title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-300">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute right-3 top-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                        <Star className="h-2.5 w-2.5 fill-white" />
                        Featured
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 text-[11px] font-medium text-white/80">
                      {l.created_at ? timeAgo(l.created_at) : ""}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
                        {l.location && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{l.location}</span>
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 rounded-xl bg-zinc-100 px-3 py-1.5 text-sm font-bold text-zinc-900">
                        {l.price ? `₦${l.price.toLocaleString("en-NG")}` : l.price_label?.trim() || "Contact"}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                      <span>View details</span>
                      <ArrowRight className="h-4 w-4 transition group-hover:text-zinc-600" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </ScrollRow>
        </section>
      )}

      {/* ── LATEST LISTINGS ── */}
      <section className="space-y-3">
        <SectionHeader
          title="Latest listings"
          subtitle="Fresh posts from around campus."
          href="/explore?sort=newest"
          cta="See more"
          icon={<Search className="h-4 w-4 text-zinc-600" />}
        />
        {listings.length === 0 ? (
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">No listings yet</div>
            <p className="mt-1 text-sm text-zinc-500">Be the first to post something.</p>
            <Link
              href="/post"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Post now <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <ScrollRow>
            {listings.map((l) => {
              const title = l.title ?? "Untitled listing";
              const img = (l.image_url ?? "").trim();
              return (
                <Link
                  key={l.id}
                  href={`/listing/${l.id}`}
                  className="group min-w-[280px] overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-[1px] sm:min-w-0"
                >
                  <div className="relative h-40 w-full bg-zinc-100">
                    {img ? (
                      <ListingImage src={img} alt={title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-300">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent" />
                    {l.category && (
                      <div className="absolute left-3 top-3">
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-800 backdrop-blur">
                          {l.category}
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 text-[11px] font-medium text-white/80">
                      {l.created_at ? timeAgo(l.created_at) : ""}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
                        {l.location && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{l.location}</span>
                          </div>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-bold text-zinc-900">
                        {l.price !== null ? formatNaira(l.price) : (l.price_label ?? "Contact")}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                      <div className="flex items-center gap-2">
                        {l.negotiable && <span className="text-zinc-500">Negotiable</span>}
                        {(homeSavesMap[l.id] ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 text-zinc-500">
                            <Bookmark className="h-3 w-3" />
                            {homeSavesMap[l.id]}
                          </span>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 transition group-hover:text-zinc-600" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </ScrollRow>
        )}
      </section>

      {/* ── VERIFIED VENDORS ── */}
      <section className="space-y-3">
        <SectionHeader
          title="Verified vendors"
          subtitle="Trusted sellers & services on campus."
          href="/vendors"
          cta="Browse all"
          icon={<ShieldCheck className="h-4 w-4 text-zinc-600" />}
        />
        {vendors.length === 0 ? (
          <div className="rounded-3xl border bg-white p-5 text-sm text-zinc-500 shadow-sm">
            No verified vendors yet.
          </div>
        ) : (
          <ScrollRow>
            {vendors.map((v) => {
              const verified = isVendorVerified(v);
              const rating = homeRatingMap[v.id];
              const avatarUrl = (v as any).avatar_url as string | null | undefined;
              return (
                <Link
                  key={v.id}
                  href={`/vendors/${v.id}`}
                  className="group min-w-[280px] rounded-3xl border bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:bg-zinc-50 sm:min-w-0"
                >
                  <div className="flex items-start gap-3">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover" />
                    ) : (
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-sm font-bold text-zinc-500">
                        {(v.name ?? "V")[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-zinc-900">
                        {v.name ?? "Unnamed vendor"}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{v.location ?? "Location not set"}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {v.vendor_type && <Tag>{v.vendor_type}</Tag>}
                        {verified && (
                          <span className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs text-zinc-600">
                            <ShieldCheck className="h-3 w-3" />
                            Verified
                          </span>
                        )}
                        {rating && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span className="text-xs font-semibold text-zinc-900">
                              {rating.avg.toFixed(1)}
                            </span>
                            <span className="text-xs text-zinc-400">({rating.count})</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-zinc-500" />
                  </div>
                </Link>
              );
            })}
          </ScrollRow>
        )}
      </section>

      {/* ── STUDY HUB ── */}
      <section className="space-y-3">
        <SectionHeader
          title="Study Hub"
          subtitle="Materials, practice sets, Q&A and more."
          href="/study"
          cta="Open"
          icon={<BookOpen className="h-4 w-4 text-zinc-600" />}
        />
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/study/materials", icon: <FileText className="h-5 w-5 text-violet-600" />, bg: "bg-violet-50", title: "Course Materials", desc: "Notes, past questions & resources." },
            { href: "/study/practice",  icon: <Zap className="h-5 w-5 text-amber-600" />,       bg: "bg-amber-50",  title: "MCQ Practice",      desc: "Timed quizzes with AI explanations." },
            { href: "/study/questions", icon: <MessageCircleQuestion className="h-5 w-5 text-blue-600" />, bg: "bg-blue-50", title: "Q&A Forum", desc: "Ask questions, get peer answers." },
            { href: "/study/ai-plan",   icon: <Sparkles className="h-5 w-5 text-emerald-600" />, bg: "bg-emerald-50", title: "AI Study Plan", desc: "Personalised weekly schedule." },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:bg-zinc-50"
            >
              <div className={cn("grid h-9 w-9 place-items-center rounded-xl", card.bg)}>
                {card.icon}
              </div>
              <div className="mt-3 text-sm font-semibold text-zinc-900">{card.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-500">{card.desc}</div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-700">
                Open <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── DELIVERY + SAFETY ── */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-100">
              <Truck className="h-5 w-5 text-zinc-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Delivery & transport</h3>
              <p className="text-xs text-zinc-500">Agents, keke & car rides</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/delivery" className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
              Find agents <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link href="/couriers" className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700">
              Find transport <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-100">
              <ShieldCheck className="h-5 w-5 text-zinc-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Stay safe</h3>
              <p className="text-xs text-zinc-500">Meet in public, verify details</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/report" className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
              Report issue <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link href="/vendors" className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700">
              Verified vendors <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
