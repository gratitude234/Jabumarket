// app/vendors/page.tsx
import Link from "next/link";
import { supabase } from "@/lib/supabase/server";
import {
  Search,
  BadgeCheck,
  MapPin,
  Phone,
  MessageCircle,
  Store,
} from "lucide-react";

type VendorRow = {
  id: string;
  name: string | null;
  whatsapp: string | null;
  phone: string | null;
  location: string | null;
  verified: boolean;
  vendor_type: "food" | "mall" | "student" | "other";
};

const LABELS: Record<VendorRow["vendor_type"], string> = {
  food: "Food Vendors",
  mall: "JABU Mall Shops",
  student: "Verified Students",
  other: "Other Vendors",
};

const TYPE_ORDER: VendorRow["vendor_type"][] = ["food", "mall", "student", "other"];

function normalizePhone(input?: string | null) {
  if (!input) return "";
  return input.replace(/[^\d+]/g, "").trim();
}

function getWhatsAppLink(phone: string, text: string) {
  const safe = phone.replace(/[^\d]/g, "");
  const msg = encodeURIComponent(text);
  return safe ? `https://wa.me/${safe}?text=${msg}` : "";
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const sp = (searchParams ? await searchParams : {}) as { q?: string };
  const q = (sp.q ?? "").trim();

  // ✅ Always enforce verified-only at query level (even if RLS policy is too permissive)
  let query = supabase
    .from("vendors")
    .select("id, name, whatsapp, phone, location, verified, vendor_type")
    .eq("verified", true)
    .order("vendor_type", { ascending: true })
    .order("name", { ascending: true });

  if (q) {
    // Search name/location/phone/whatsapp
    const escaped = q.replace(/[%_]/g, "\\$&");
    query = query.or(
      `name.ilike.%${escaped}%,location.ilike.%${escaped}%,phone.ilike.%${escaped}%,whatsapp.ilike.%${escaped}%`
    );
  }

  const { data, error } = await query;

  const vendors = (data ?? []) as VendorRow[];

  // Group by type, in a stable order
  const grouped = new Map<VendorRow["vendor_type"], VendorRow[]>();
  for (const t of TYPE_ORDER) grouped.set(t, []);
  for (const v of vendors) {
    const t = v.vendor_type ?? "other";
    if (!grouped.has(t)) grouped.set(t, []);
    grouped.get(t)!.push(v);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-10 pt-4 sm:px-6">
      {/* Header */}
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Vendors Directory
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Browse verified vendors around campus.
            </p>
          </div>

          <Link
            href="/vendors/new"
            className="inline-flex items-center justify-center rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            <Store className="mr-2 h-4 w-4" />
            Become a vendor
          </Link>
        </div>

        {/* Search */}
        <form action="/vendors" className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search vendors by name, location, phone..."
                className="w-full rounded-2xl border bg-white px-10 py-2.5 text-sm outline-none ring-0 transition focus:border-zinc-400"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-black px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
              >
                Search
              </button>

              {q ? (
                <Link
                  href="/vendors"
                  className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span className="inline-flex items-center gap-1 rounded-full border bg-zinc-50 px-2 py-1">
              <BadgeCheck className="h-3.5 w-3.5" />
              Verified only
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border bg-zinc-50 px-2 py-1">
              <Store className="h-3.5 w-3.5" />
              {vendors.length} vendor{vendors.length === 1 ? "" : "s"}
            </span>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Could not load vendors. {error.message}
            </div>
          ) : null}
        </form>
      </div>

      {/* Empty state */}
      {!error && vendors.length === 0 ? (
        <div className="rounded-3xl border bg-white p-6 text-center shadow-sm">
          <p className="text-base font-medium">No verified vendors found.</p>
          <p className="mt-1 text-sm text-zinc-600">
            Try a different search, or clear filters.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {q ? (
              <Link
                href="/vendors"
                className="rounded-2xl border bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Clear search
              </Link>
            ) : null}
            <Link
              href="/vendors/new"
              className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Become a vendor
            </Link>
          </div>
        </div>
      ) : null}

      {/* Groups */}
      <div className="space-y-6">
        {TYPE_ORDER.map((t) => {
          const items = grouped.get(t) ?? [];
          if (!items.length) return null;

          return (
            <section key={t} className="space-y-3">
              <div className="flex items-end justify-between">
                <h2 className="text-lg font-semibold tracking-tight">
                  {LABELS[t]}
                </h2>
                <span className="text-xs text-zinc-600">
                  {items.length} vendor{items.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((v) => {
                  const name = (v.name ?? "Unnamed vendor").trim();
                  const location = (v.location ?? "").trim();
                  const phone = normalizePhone(v.phone);
                  const wa = normalizePhone(v.whatsapp) || phone;

                  const waHref = wa
                    ? getWhatsAppLink(wa, `Hi ${name}, I found you on JabuMarket.`)
                    : "";

                  return (
                    <div
                      key={v.id}
                      className="group rounded-3xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/vendors/${v.id}`}
                            className="block truncate text-base font-semibold tracking-tight hover:underline"
                          >
                            {name}
                          </Link>

                          {location ? (
                            <div className="mt-1 flex items-center gap-1.5 text-sm text-zinc-600">
                              <MapPin className="h-4 w-4" />
                              <span className="truncate">{location}</span>
                            </div>
                          ) : (
                            <div className="mt-1 text-sm text-zinc-500">
                              Location not set
                            </div>
                          )}
                        </div>

                        <span className="inline-flex items-center gap-1 rounded-full border bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                          <BadgeCheck className="h-3.5 w-3.5" />
                          Verified
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Link
                          href={`/vendors/${v.id}`}
                          className="inline-flex items-center justify-center rounded-2xl border bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
                        >
                          View
                        </Link>

                        {waHref ? (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-2xl bg-black px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                          >
                            <MessageCircle className="mr-2 h-4 w-4" />
                            WhatsApp
                          </a>
                        ) : phone ? (
                          <a
                            href={`tel:${phone}`}
                            className="inline-flex items-center justify-center rounded-2xl bg-black px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                          >
                            <Phone className="mr-2 h-4 w-4" />
                            Call
                          </a>
                        ) : (
                          <button
                            disabled
                            className="inline-flex cursor-not-allowed items-center justify-center rounded-2xl bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600"
                          >
                            No contact
                          </button>
                        )}
                      </div>

                      <div className="mt-3 text-xs text-zinc-500">
                        Tip: Click <span className="font-medium">View</span> to see more details.
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="rounded-3xl border bg-white p-4 text-sm text-zinc-600 shadow-sm">
        Seeing an unverified vendor here means either:
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your RLS has a permissive SELECT policy (like <code>using (true)</code>), or</li>
          <li>You’re using a service role key somewhere by mistake.</li>
        </ul>
        <p className="mt-2">
          This page is already enforcing <span className="font-medium">verified-only</span> in the query.
        </p>
      </div>
    </div>
  );
}
