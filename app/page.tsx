// app/page.tsx
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight, BookOpen, Bookmark, Cpu, FileText,
  MessageCircleQuestion, Search, Sparkles, ShieldCheck,
  Truck, Smartphone, Laptop, Shirt, ShoppingBasket,
  UtensilsCrossed, Wrench, PlusSquare, MapPin,
  Image as ImageIcon, Star, Zap, ChevronRight,
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
  return `${Math.floor(hrs / 24)}d ago`;
}

type ListingPreview = {
  id: string; title: string | null; price: number | null;
  price_label: string | null; category: string | null;
  listing_type: string | null; location: string | null;
  image_url: string | null; negotiable: boolean | null;
  created_at: string | null; status?: string | null;
};

type VendorPreview = {
  id: string; name: string | null; location: string | null;
  verified: boolean | null;
  verification_status: "unverified"|"requested"|"under_review"|"verified"|"rejected"|"suspended"|null;
  vendor_type: "food"|"mall"|"student"|"other"|null;
};

const categories = [
  { name: "Food",        icon: UtensilsCrossed, href: "/food",                                   bg: "bg-orange-500", light: "bg-orange-50",  text: "text-orange-600" },
  { name: "Phones",      icon: Smartphone,      href: "/explore?category=Phones",                bg: "bg-blue-500",   light: "bg-blue-50",    text: "text-blue-600"   },
  { name: "Laptops",     icon: Laptop,          href: "/explore?category=Laptops",               bg: "bg-violet-500", light: "bg-violet-50",  text: "text-violet-600" },
  { name: "Fashion",     icon: Shirt,           href: "/explore?category=Fashion",               bg: "bg-pink-500",   light: "bg-pink-50",    text: "text-pink-600"   },
  { name: "Electronics", icon: Cpu,             href: "/explore?category=Electronics",           bg: "bg-cyan-500",   light: "bg-cyan-50",    text: "text-cyan-600"   },
  { name: "Provisions",  icon: ShoppingBasket,  href: "/explore?category=Provisions",            bg: "bg-green-500",  light: "bg-green-50",   text: "text-green-600"  },
  { name: "Books",       icon: BookOpen,        href: "/explore?category=Books+%26+Stationery", bg: "bg-amber-500",  light: "bg-amber-50",   text: "text-amber-600"  },
  { name: "Services",    icon: Wrench,          href: "/explore?category=Services&type=service", bg: "bg-zinc-700",   light: "bg-zinc-100",   text: "text-zinc-600"   },
];

function getFirstName(name: string | null | undefined) {
  if (!name) return "";
  return name.trim().split(" ")[0];
}

function isVendorVerified(v: VendorPreview) {
  return v.verified === true || v.verification_status === "verified";
}

function SectionRow({ title, href, cta, children }: {
  title: string; href?: string; cta?: string; children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-4 sm:px-0">
        <h2 className="text-base font-bold text-zinc-900 sm:text-lg">{title}</h2>
        {href && (
          <Link href={href} className="flex items-center gap-0.5 text-xs font-semibold text-zinc-500 hover:text-zinc-800">
            {cta ?? "See all"} <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [latestRes, vendorsRes, featuredRes, profileRes] = await Promise.all([
    supabase.from("listings")
      .select("id,title,price,price_label,category,listing_type,location,image_url,negotiable,created_at,status")
      .eq("status", "active").order("created_at", { ascending: false }).limit(6),
    supabase.from("vendors")
      .select("id,name,location,verified,verification_status,vendor_type,avatar_url")
      .or("verified.eq.true,verification_status.eq.verified")
      .not("name", "is", null)
      .order("avatar_url", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }).limit(18),
    supabase.from("listings")
      .select("id,title,price,price_label,category,listing_type,location,image_url,negotiable,created_at,status")
      .eq("featured", true).eq("status", "active")
      .order("created_at", { ascending: false }).limit(4),
    user
      ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const listings = (latestRes.data ?? []) as ListingPreview[];
  const rawVendors = (vendorsRes.data ?? []) as (VendorPreview & { avatar_url?: string | null })[];
  const featuredListings = (featuredRes.data ?? []) as ListingPreview[];
  const firstName = getFirstName(profileRes.data?.full_name);

  const vendorIds = rawVendors.map(v => v.id);
  const listingIds = listings.map(l => l.id);

  const [reviewsRes, statsRes] = await Promise.all([
    vendorIds.length > 0
      ? supabase.from("vendor_reviews").select("vendor_id,rating").in("vendor_id", vendorIds)
      : { data: [] as { vendor_id: string; rating: number }[] },
    listingIds.length > 0
      ? supabase.from("listing_stats").select("listing_id,saves").in("listing_id", listingIds)
      : { data: [] as { listing_id: string; saves: number }[] },
  ]);

  const ratingMap: Record<string, { avg: number; count: number }> = {};
  for (const r of reviewsRes.data ?? []) {
    const e = ratingMap[r.vendor_id];
    ratingMap[r.vendor_id] = e
      ? { avg: (e.avg * e.count + r.rating) / (e.count + 1), count: e.count + 1 }
      : { avg: r.rating, count: 1 };
  }

  const savesMap: Record<string, number> = {};
  for (const s of statsRes.data ?? []) {
    savesMap[s.listing_id] = Number(s.saves ?? 0);
  }

  const vendors = rawVendors
    .map(v => ({ ...v, _score: (ratingMap[v.id] ? 2 : 0) + (v.avatar_url ? 1 : 0) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 6);

  return (
    <main className="w-full pb-28 sm:pb-12">

      {/* ── HERO ── */}
      <div className="bg-zinc-900 px-4 pb-10 pt-6 sm:px-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div>
            <p className="text-sm font-medium text-zinc-400">
              {user && firstName ? `Hey, ${firstName} 👋` : "Campus marketplace & study hub"}
            </p>
            <h1 className="mt-1 text-[26px] font-bold leading-tight text-white sm:text-4xl">
              Buy, sell & find anything around JABU.
            </h1>
          </div>

          {/* Search bar */}
          <form action="/explore" method="GET">
            <div className="flex items-center gap-2 rounded-2xl bg-white p-2 shadow-lg">
              <Search className="ml-1 h-5 w-5 shrink-0 text-zinc-400" />
              <input
                name="q"
                placeholder="Search phones, food, laundry…"
                list="home-suggestions"
                aria-label="Search"
                className="h-10 w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              />
              <button
                type="submit"
                className="h-10 shrink-0 rounded-xl bg-zinc-900 px-5 text-sm font-bold text-white hover:bg-zinc-700"
              >
                Search
              </button>
              <datalist id="home-suggestions">
                <option value="Phones" /><option value="Laptops" /><option value="Fashion" />
                <option value="Food" /><option value="Rice" /><option value="Laundry" />
                <option value="Hair" /><option value="Sneakers" /><option value="Charger" />
                <option value="Power bank" /><option value="Tutoring" /><option value="Repairs" />
              </datalist>
            </div>
          </form>

          {/* Quick action pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: "New today",       href: "/explore?sort=newest" },
              { label: "Food vendors",    href: "/vendors?type=food" },
              { label: "Services",        href: "/explore?type=service" },
              { label: "Verified only",   href: "/vendors" },
            ].map(q => (
              <Link
                key={q.label}
                href={q.href}
                className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white"
              >
                {q.label}
              </Link>
            ))}
          </div>

          {/* Two CTA buttons */}
          <div className="flex gap-3">
            <Link
              href="/explore"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-zinc-900 hover:bg-zinc-100 sm:flex-none"
            >
              Explore listings <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/post"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-bold text-white hover:bg-zinc-700 sm:flex-none"
            >
              <PlusSquare className="h-4 w-4" />
              Post
            </Link>
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="mx-auto max-w-6xl space-y-10 px-4 pt-8 sm:px-6">

        {/* ── CATEGORIES ── */}
        <SectionRow title="Categories" href="/explore" cta="All">
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-8 sm:gap-3 sm:overflow-visible sm:px-0">
            {categories.map(c => {
              const Icon = c.icon;
              return (
                <Link
                  key={c.name}
                  href={c.href}
                  className="group flex min-w-[72px] flex-col items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm transition hover:shadow-md sm:min-w-0"
                >
                  <div className={cn("grid h-12 w-12 place-items-center rounded-2xl", c.bg)}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-center text-xs font-semibold text-zinc-800">{c.name}</span>
                </Link>
              );
            })}
          </div>
        </SectionRow>

        {/* ── FEATURED LISTINGS ── */}
        {featuredListings.length > 0 && (
          <SectionRow title="Featured" href="/explore" cta="See all">
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {featuredListings.map(l => {
                const title = l.title ?? "Untitled";
                const img = (l.image_url ?? "").trim();
                return (
                  <Link
                    key={l.id}
                    href={`/listing/${l.id}`}
                    className="group min-w-[200px] overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md sm:min-w-0"
                  >
                    <div className="relative h-44 w-full bg-zinc-100">
                      {img ? (
                        <ListingImage src={img} alt={title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-300">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
                      <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        Featured
                      </span>
                      <div className="absolute bottom-2 left-3 right-3">
                        <p className="truncate text-sm font-bold text-white">{title}</p>
                        <p className="mt-0.5 text-xs font-semibold text-amber-400">
                          {l.price ? formatNaira(l.price) : l.price_label ?? "Contact"}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </SectionRow>
        )}

        {/* ── LATEST LISTINGS ── */}
        <SectionRow title="Latest listings" href="/explore?sort=newest" cta="See more">
          {listings.length === 0 ? (
            <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">No listings yet</p>
              <p className="mt-1 text-xs text-zinc-500">Be the first to post.</p>
              <Link href="/post" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-700">
                Post now <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
              {listings.map(l => {
                const title = l.title ?? "Untitled";
                const img = (l.image_url ?? "").trim();
                return (
                  <Link
                    key={l.id}
                    href={`/listing/${l.id}`}
                    className="group min-w-[260px] overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md sm:min-w-0"
                  >
                    <div className="relative h-44 w-full bg-zinc-100">
                      {img ? (
                        <ListingImage src={img} alt={title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-200">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
                      {l.category && (
                        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                          {l.category}
                        </span>
                      )}
                      <span className="absolute bottom-2 right-2 text-[10px] font-medium text-white/70">
                        {timeAgo(l.created_at)}
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-bold text-zinc-900">{title}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-sm font-bold text-zinc-900">
                          {l.price !== null ? formatNaira(l.price) : (l.price_label ?? "Contact")}
                        </p>
                        {l.negotiable && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                            Negotiable
                          </span>
                        )}
                      </div>
                      {l.location && (
                        <div className="mt-1.5 flex items-center gap-1 text-xs text-zinc-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{l.location}</span>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </SectionRow>

        {/* ── VERIFIED VENDORS ── */}
        <SectionRow title="Verified vendors" href="/vendors" cta="Browse all">
          {vendors.length === 0 ? (
            <p className="text-sm text-zinc-500">No verified vendors yet.</p>
          ) : (
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
              {vendors.map(v => {
                const rating = ratingMap[v.id];
                const avatarUrl = (v as any).avatar_url as string | null | undefined;
                return (
                  <Link
                    key={v.id}
                    href={`/vendors/${v.id}`}
                    className="group min-w-[260px] rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md sm:min-w-0"
                  >
                    <div className="flex items-center gap-3">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                      ) : (
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-zinc-900 text-base font-bold text-white">
                          {(v.name ?? "V")[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-zinc-900">{v.name ?? "Vendor"}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{v.location ?? "—"}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {isVendorVerified(v) && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              <ShieldCheck className="h-3 w-3" /> Verified
                            </span>
                          )}
                          {v.vendor_type && (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 capitalize">
                              {v.vendor_type}
                            </span>
                          )}
                          {rating && (
                            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-zinc-800">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {rating.avg.toFixed(1)}
                              <span className="text-[10px] font-normal text-zinc-400">({rating.count})</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-zinc-600" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </SectionRow>

        {/* ── STUDY HUB ── */}
        <SectionRow title="Study Hub" href="/study" cta="Open">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { href: "/study/materials", icon: <FileText className="h-5 w-5 text-white" />, bg: "bg-violet-500", title: "Materials",   desc: "Notes & past questions" },
              { href: "/study/practice",  icon: <Zap className="h-5 w-5 text-white" />,      bg: "bg-amber-500",  title: "MCQ Practice", desc: "Timed quizzes + AI" },
              { href: "/study/questions", icon: <MessageCircleQuestion className="h-5 w-5 text-white" />, bg: "bg-blue-500", title: "Q&A Forum", desc: "Ask & answer peers" },
              { href: "/study/ai-plan",   icon: <Sparkles className="h-5 w-5 text-white" />, bg: "bg-emerald-500", title: "AI Plan",    desc: "Weekly study schedule" },
            ].map(card => (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className={cn("grid h-10 w-10 place-items-center rounded-xl", card.bg)}>
                  {card.icon}
                </div>
                <p className="mt-3 text-sm font-bold text-zinc-900">{card.title}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{card.desc}</p>
                <div className="mt-3 flex items-center gap-1 text-xs font-bold text-zinc-700">
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </SectionRow>

        {/* ── DELIVERY + SAFETY ── */}
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-2xl bg-zinc-900 p-5">
            <div>
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-white" />
                <p className="text-sm font-bold text-white">Delivery & transport</p>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">Agents, keke & car rides</p>
              <div className="mt-4 flex gap-2">
                <Link href="/delivery" className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700">
                  Find agents
                </Link>
                <Link href="/couriers" className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-zinc-100">
                  Transport
                </Link>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border bg-white p-5 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-zinc-700" />
                <p className="text-sm font-bold text-zinc-900">Stay safe</p>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">Meet in public, verify sellers</p>
              <div className="mt-4 flex gap-2">
                <Link href="/report" className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
                  Report issue
                </Link>
                <Link href="/vendors" className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-700">
                  Verified vendors
                </Link>
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
