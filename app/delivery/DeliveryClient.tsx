"use client";

import { useMemo, useState } from "react";
import type { RiderRow } from "@/lib/types";
import { getWhatsAppLink } from "@/lib/whatsapp";
import {
  CheckCircle2,
  Copy,
  Filter,
  Loader2,
  Phone,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
} from "lucide-react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const ZONES = ["all", "Campus", "Male Hostels", "Female Hostels", "Town"] as const;
type Availability = "all" | "available" | "busy";

type Initial = {
  q: string;
  zone: string;
  availability: string;
  verifiedOnly: boolean;

  // kept for compatibility (not shown anymore)
  listingId: string;
  dropoff: string;
  buyerPhone: string;
  note: string;

  baseMessage: string;
  pickupLocation: string;
  listingTitle: string | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "D";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

export default function DeliveryClient({
  initial,
  riders,
}: {
  initial: Initial;
  riders: RiderRow[];
}) {
  const [q, setQ] = useState(initial.q);
  const [zone, setZone] = useState(initial.zone || "all");
  const [availability, setAvailability] = useState<Availability>(
    (initial.availability as Availability) || "all"
  );
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(!!initial.verifiedOnly);

  // keep the message but remove the heavy editor UI
  const [message] = useState(initial.baseMessage);

  const [toast, setToast] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  // filters collapse to reduce page “noise”
  const [showFilters, setShowFilters] = useState(false);

  // per-card “More” toggle
  const [openMoreId, setOpenMoreId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return riders.filter((r) => {
      if (verifiedOnly && !r.verified) return false;

      if (availability === "available" && !r.is_available) return false;
      if (availability === "busy" && r.is_available) return false;

      if (zone && zone !== "all" && (r.zone ?? "").trim() !== zone) return false;

      if (!needle) return true;

      const name = (r.name ?? "").toLowerCase();
      const phone = (r.phone ?? "").toLowerCase();
      const wa = (r.whatsapp ?? "").toLowerCase();
      return name.includes(needle) || phone.includes(needle) || wa.includes(needle);
    });
  }, [riders, q, zone, availability, verifiedOnly]);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  }

  async function copyText(text: string) {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(text);
      showToast("Copied ✅");
    } catch {
      showToast("Copy failed — try selecting and copying.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Minimal top bar (search + filter toggle) */}
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">Delivery agents</p>
            <p className="mt-1 text-xs text-zinc-600">
              Tap WhatsApp to message an agent.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            <Filter className="h-4 w-4" />
            Filters
            {showFilters ? (
              <ChevronUp className="h-4 w-4 text-zinc-700" />
            ) : (
              <ChevronDown className="h-4 w-4 text-zinc-700" />
            )}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / phone / WhatsApp…"
            className="w-full bg-transparent text-sm outline-none"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="rounded-xl border bg-white p-2 hover:bg-zinc-50"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {showFilters ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_240px]">
              <div className="grid grid-cols-3 gap-2 rounded-2xl border bg-white p-1">
                {(["all", "available", "busy"] as Availability[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAvailability(t)}
                    className={cn(
                      "rounded-xl px-3 py-2 text-xs font-semibold capitalize",
                      availability === t
                        ? "bg-black text-white"
                        : "text-zinc-800 hover:bg-zinc-50"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="rounded-2xl border bg-white px-3 py-2.5 text-sm font-semibold text-zinc-900"
              >
                {ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z === "all" ? "All zones" : z}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setVerifiedOnly((v) => !v)}
              className={cn(
                "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left",
                verifiedOnly ? "bg-zinc-50" : "bg-white"
              )}
              aria-pressed={verifiedOnly}
            >
              <div>
                <p className="text-xs font-semibold text-zinc-900">Verified only</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">
                  Show only agents verified by admin.
                </p>
              </div>

              <span
                className={cn(
                  "h-9 w-16 rounded-full border p-1 transition",
                  verifiedOnly ? "bg-black" : "bg-white"
                )}
              >
                <span
                  className={cn(
                    "block h-7 w-7 rounded-full bg-white shadow transition",
                    verifiedOnly ? "translate-x-7" : "translate-x-0"
                  )}
                />
              </span>
            </button>
          </div>
        ) : null}
      </div>

      {/* Results */}
      <div className="rounded-3xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold text-zinc-900">
            Agents <span className="text-xs text-zinc-500">({filtered.length})</span>
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-zinc-900">No agents found</p>
            <p className="mt-1 text-sm text-zinc-600">Try clearing filters or searching again.</p>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {filtered.map((r) => {
              const name = r.name ?? "Unnamed delivery agent";
              const wa = (r.whatsapp ?? r.phone)?.trim() || "";
              const canWhatsApp = !!wa;

              const href = canWhatsApp ? getWhatsAppLink(wa, message) : null;
              const numberToCopy = r.phone ? `+${r.phone}` : wa ? `+${wa}` : "";

              const isMoreOpen = openMoreId === r.id;

              return (
                <div key={r.id} className="rounded-3xl border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border bg-zinc-50 text-xs font-extrabold text-zinc-800">
                        {initials(name)}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900">{name}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {r.zone ?? "—"} • {r.is_available ? "Available" : "Busy"}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.verified ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Verified
                            </span>
                          ) : (
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                              Not verified
                            </span>
                          )}

                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                              r.is_available
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                            )}
                          >
                            {r.is_available ? "Available now" : "Currently busy"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setOpenMoreId((cur) => (cur === r.id ? null : r.id))}
                      className={cn(
                        "inline-flex items-center justify-center rounded-2xl border bg-white p-2 hover:bg-zinc-50",
                        (!r.phone && !wa) && "opacity-50"
                      )}
                      disabled={!r.phone && !wa}
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4 text-zinc-800" />
                    </button>
                  </div>

                  {/* Primary action */}
                  <div className="mt-4">
                    <a
                      href={href ?? "#"}
                      onClick={(e) => {
                        if (!href) e.preventDefault();
                      }}
                      target={href ? "_blank" : undefined}
                      rel={href ? "noreferrer" : undefined}
                      className={cn(
                        "block w-full rounded-2xl px-3 py-3 text-center text-sm font-semibold no-underline",
                        href ? "bg-black text-white hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500"
                      )}
                    >
                      WhatsApp
                    </a>

                    {!canWhatsApp ? (
                      <p className="mt-2 text-xs text-amber-700">
                        No WhatsApp number set for this agent.
                      </p>
                    ) : null}
                  </div>

                  {/* “the rest” (Call + Copy) */}
                  {isMoreOpen ? (
                    <div className="mt-3 rounded-2xl border bg-zinc-50 p-2">
                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href={r.phone ? `tel:+${r.phone}` : "#"}
                          onClick={(e) => {
                            if (!r.phone) e.preventDefault();
                          }}
                          className={cn(
                            "rounded-2xl border bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50",
                            !r.phone && "pointer-events-none opacity-50"
                          )}
                        >
                          <span className="inline-flex items-center justify-center gap-2">
                            <Phone className="h-4 w-4" /> Call
                          </span>
                        </a>

                        <button
                          type="button"
                          onClick={() => copyText(numberToCopy)}
                          disabled={!numberToCopy || copying}
                          className={cn(
                            "rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                            (!numberToCopy || copying) && "opacity-50"
                          )}
                        >
                          <span className="inline-flex items-center justify-center gap-2">
                            {copying ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            Copy
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast ? (
        <div className="fixed bottom-20 left-0 right-0 z-50 mx-auto max-w-sm px-4 md:bottom-6">
          <div className="rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}