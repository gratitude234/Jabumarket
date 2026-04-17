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
  avatar_url?: string | null;
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
  return v.verified === true || v.verification_status === "verified";
}

// Horizontal scroll row — switches to grid on sm+
function ScrollRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {children}
    </div>
  );
}

function SectionHeader({
  title,
  href,
  cta,
}: {
  title: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
      {href && (
        <Link
          href={href}
          className="shrink-0 rounded-full border bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
        >
          {cta ?? "See all"}
        </Link>
      )}
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const [latestListingsRes, featuredVendorsRes, featuredListingsRes, studyCountRes] =
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
        .order("created_at", { ascending: false })
        .limit(18),
      supabase
        .from("listings")
        .select("id, title, price, price_label, category, listing_type, location, image_url, negotiable, created_at, status")
        .eq("featured", true)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("study_courses")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
    ]);

  const listings = ((latestListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);
  const rawVendors = ((featuredVendorsRes.data ?? []) as VendorPreview[]).filter(Boolean);
  const featuredListings = ((featuredListingsRes.data ?? []) as ListingPreview[]).filter(Boolean);
  const studyCourseCount = studyCountRes.count ?? 0;

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
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-28 pt-5 sm:pb-10 sm:pt-8">

      {/* ── APP HEADER ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        {/* Greeting row */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Good day 👋
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">What are you looking for?</p>
        </div>

        {/* Search bar */}
        <form action="/explore" method="GET">
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <Search className="h-5 w-5 shrink-0 text-zinc-400" />
            <input
              name="q"
              placeholder="iPhone, rice, laundry, hair…"
              list="home-suggestions"
              aria-label="Search JABU Market"
              className="h-full w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700"
              aria-label="Search"
            >
              Search
            </button>
          </div>
          <datalist id="home-suggestions">
            <option value="Phones" /><option value="Laptops" /><option value="Fashion" />
            <option value="Provisions" /><option value="Food" /><option value="Beauty" />
            <option value="Services" /><option value="Repairs" /><option value="Tutoring" />
            <option value="iPhone" /><option value="Android" /><option value="Charger" />
            <option value="Rice" /><option value="Indomie" /><option value="Laundry" />
            <option value="Hair" /><option value="Sneakers" /><option value="Power bank" />
          </datalist>
        </form>

        {/* Filter chips */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {[
            { label: "New today", href: "/explore?sort=newest" },
            { label: "Food vendors", href: "/vendors?type=food" },
            { label: "Services", href: "/explore?type=service" },
            { label: "Verified only", href: "/vendors" },
          ].map((q) => (
            <Link
              key={q.label}
              href={q.href}
              className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              {q.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ── FOOD STRIP ──────────────────────────────────────────────── */}
      <Link
        href="/food"
        className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 transition hover:bg-amber-100"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-lg">
            🍽
          </div>
          <div>
            <div className="text-sm font-semibold text-amber-900">Order campus food</div>
            <div className="text-xs text-amber-700">Jollof, snacks, drinks — fast pickup</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-xl bg-amber-900 px-3 py-2 text-xs font-semibold text-amber-50">
          Order <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </Link>

      {/* ── CATEGORIES ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="Categories" href="/explore" cta="View all" />
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.name}
                href={c.href}
                className="group flex min-w-[72px] flex-col items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-3 py-4 text-center transition hover:border-zinc-200 hover:bg-zinc-50 sm:min-w-0"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 transition group-hover:bg-zinc-200/70">
                  <Icon className="h-5 w-5 text-zinc-700" />
                </div>
                <span className="text-[11px] font-medium text-zinc-700">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── FEATURED LISTINGS ───────────────────────────────────────── */}
      {featuredListings.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title="Featured listings"
            href="/explore"
            cta="See all"
          />
          <ScrollRow>
            {featuredListings.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                saves={homeSavesMap[l.id]}
                featured
              />
            ))}
          </ScrollRow>
        </section>
      )}

      {/* ── LATEST LISTINGS ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader
          title="Latest listings"
          href="/explore?sort=newest"
          cta="See more"
        />

        {listings.length === 0 ? (
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">No listings yet</div>
            <p className="mt-1 text-sm text-zinc-500">Be the first to post an item or service.</p>
            <Link
              href="/post"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Post now <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <ScrollRow>
            {listings.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                saves={homeSavesMap[l.id]}
              />
            ))}
          </ScrollRow>
        )}
      </section>

      {/* ── FEATURED VENDORS ────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader
          title="Verified vendors"
          href="/vendors"
          cta="Browse all"
        />

        {vendors.length === 0 ? (
          <div className="rounded-3xl border bg-white p-5 shadow-sm text-sm text-zinc-500">
            No featured vendors right now.
          </div>
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {vendors.map((v) => {
              const verified = isVendorVerified(v);
              const rating = homeRatingMap[v.id];
              const initial = (v.name ?? "V")[0].toUpperCase();

              return (
                <Link
                  key={v.id}
                  href={`/vendors/${v.id}`}
                  className="group flex min-w-[220px] items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-3.5 transition hover:border-zinc-200 hover:bg-zinc-50 sm:min-w-0"
                >
                  {v.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.avatar_url}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-100 text-sm font-bold text-zinc-500">
                      {initial}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {v.name ?? "Unnamed vendor"}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{v.location ?? "Campus"}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      {verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <BadgeCheck className="h-3 w-3" />
                          Verified
                        </span>
                      )}
                      {rating && (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          <span className="font-semibold text-zinc-800">{rating.avg.toFixed(1)}</span>
                          <span className="text-zinc-400">({rating.count})</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-zinc-400" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── STUDY HUB ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="Study Hub" href="/study" cta="Open Hub" />

        {/* Live course count banner */}
        {studyCourseCount > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3">
            <p className="text-xs text-zinc-600">
              <span className="font-semibold text-zinc-900">
                {studyCourseCount} courses
              </span>{" "}
              available this semester
            </p>
            <Link
              href="/study/materials"
              className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Browse →
            </Link>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            {
              href: "/study/materials",
              icon: <FileText className="h-5 w-5 text-zinc-700" />,
              title: "Course Materials",
              desc: "Notes & past questions from course reps.",
            },
            {
              href: "/study/practice",
              icon: <Zap className="h-5 w-5 text-zinc-700" />,
              title: "MCQ Practice",
              desc: "Timed quizzes with AI explanations.",
            },
            {
              href: "/study/questions",
              icon: <MessageCircleQuestion className="h-5 w-5 text-zinc-700" />,
              title: "Q&A Forum",
              desc: "Ask peers, upvote best answers.",
            },
            {
              href: "/study/ai-plan",
              icon: <Sparkles className="h-5 w-5 text-zinc-700" />,
              title: "AI Study Plan",
              desc: "Weekly schedule powered by Gemini.",
            },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-2xl border border-zinc-100 bg-white p-4 transition hover:border-zinc-200 hover:bg-zinc-50"
            >
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-100">
                {card.icon}
              </div>
              <div className="mt-3 text-sm font-semibold text-zinc-900">{card.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-zinc-500">{card.desc}</div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-600">
                Open <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── DELIVERY / TRANSPORT ────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100">
            <Truck className="h-5 w-5 text-zinc-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Need delivery?</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Delivery agents and transport riders available on campus.
            </p>
            <div className="mt-3 flex gap-2">
              <Link
                href="/delivery"
                className="inline-flex items-center gap-1 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Delivery <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/couriers"
                className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700"
              >
                Transport <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100">
            <ShieldCheck className="h-5 w-5 text-zinc-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Trade safely</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Verified vendors, public meetups. Report suspicious activity fast.
            </p>
            <div className="mt-3 flex gap-2">
              <Link
                href="/vendors"
                className="inline-flex items-center gap-1 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Verified vendors <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}

// ── Listing card ─────────────────────────────────────────────────────────────

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
      className="group min-w-[220px] overflow-hidden rounded-2xl border border-zinc-100 bg-white transition hover:border-zinc-200 hover:bg-zinc-50 sm:min-w-0"
    >
      {/* Image */}
      <div className="relative h-44 w-full bg-zinc-100">
        {hasImg ? (
          <ListingImage src={img} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-300">
            <ImageIcon className="h-7 w-7" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Category badge */}
        {l.category && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-900">
            {l.category}
          </span>
        )}

        {/* Featured badge */}
        {featured && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Star className="h-2.5 w-2.5 fill-white" />
            Featured
          </span>
        )}

        {/* Negotiable badge */}
        {l.negotiable && !featured && (
          <span className="absolute right-3 top-3 rounded-full bg-zinc-900/70 px-2 py-0.5 text-[11px] font-medium text-white">
            Negotiable
          </span>
        )}

        {/* Timestamp */}
        {l.created_at && (
          <span className="absolute bottom-3 left-3 text-[11px] font-medium text-white/90">
            {timeAgo(l.created_at)}
          </span>
        )}

        {/* Saves */}
        {(saves ?? 0) > 0 && (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <Bookmark className="h-3 w-3" />
            {saves}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
            {l.location && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{l.location}</span>
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="text-sm font-bold text-zinc-900">
              {l.price !== null ? formatNaira(l.price) : (l.price_label?.trim() || "Contact")}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
