// app/delivery/DeliveryClient.tsx
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
  ShieldCheck,
  Sparkles,
  X,
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
  listingId: string;
  dropoff: string;
  buyerPhone: string;
  note: string;
  baseMessage: string;
  pickupLocation: string;
  listingTitle: string | null;
};

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

  const [dropoff, setDropoff] = useState(initial.dropoff);
  const [buyerPhone, setBuyerPhone] = useState(initial.buyerPhone);
  const [note, setNote] = useState(initial.note);

  const [message, setMessage] = useState(initial.baseMessage);

  const [toast, setToast] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

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

  const computedMessage = useMemo(() => {
    // Keep message builder smart but editable: if user edits message manually, we respect it.
    // This recompute only if user hasn't modified message away from base.
    // Here: we just provide a "Regenerate" button instead of overriding.
    return message;
  }, [message]);

  const helpfulMessageTemplate = useMemo(() => {
    const parts = [
      initial.listingTitle
        ? `Hi, I need delivery for an order on JABU MARKET.\nItem: ${initial.listingTitle}\nPickup: ${initial.pickupLocation}`
        : `Hi, I need a delivery agent.`,
      dropoff ? `Drop-off: ${dropoff}` : `Drop-off: (my location)`,
      buyerPhone ? `My Phone: ${buyerPhone}` : "",
      note ? `Note: ${note}` : "",
    ].filter(Boolean);

    return parts.join("\n");
  }, [dropoff, buyerPhone, note, initial.listingTitle, initial.pickupLocation]);

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
      {/* Controls */}
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">Find a delivery agent</p>
            <p className="mt-1 text-xs text-zinc-600">
              Search, filter, then message. The message is editable.
            </p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-2xl border bg-zinc-50">
            <Filter className="h-4 w-4 text-zinc-800" />
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_180px]">
          <div className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5">
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

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border bg-white p-1">
          {(["all", "available", "busy"] as Availability[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAvailability(t)}
              className={cn(
                "rounded-xl px-3 py-2 text-xs font-semibold capitalize",
                availability === t ? "bg-black text-white" : "text-zinc-800 hover:bg-zinc-50"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border bg-zinc-50 px-3 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-900">Verified only</p>
            <p className="text-[11px] text-zinc-600">Show only delivery agents verified by admin.</p>
          </div>
          <button
            type="button"
            onClick={() => setVerifiedOnly((v) => !v)}
            className={cn(
              "h-9 w-16 rounded-full border p-1 transition",
              verifiedOnly ? "bg-black" : "bg-white"
            )}
            aria-pressed={verifiedOnly}
          >
            <span
              className={cn(
                "block h-7 w-7 rounded-full bg-white shadow transition",
                verifiedOnly ? "translate-x-7" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {/* Message builder */}
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Message details</p>
            <p className="mt-1 text-xs text-zinc-600">
              Fill these fields or just edit the message directly.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setMessage(helpfulMessageTemplate)}
            className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
            title="Regenerate message from fields"
          >
            <Sparkles className="h-4 w-4" />
            Regenerate
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700">Drop-off</label>
            <input
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              placeholder="e.g. Male Hostel 4, Gate B"
              className="h-11 w-full rounded-2xl border bg-white px-3 text-sm outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700">Your phone (optional)</label>
            <input
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              className="h-11 w-full rounded-2xl border bg-white px-3 text-sm outline-none"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-semibold text-zinc-700">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Call when you get to the gate..."
              className="h-11 w-full rounded-2xl border bg-white px-3 text-sm outline-none"
            />
          </div>
        </div>

        <div className="mt-4 rounded-3xl border bg-zinc-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-zinc-900">Message preview (editable)</p>
            <button
              type="button"
              onClick={() => copyText(computedMessage)}
              className="inline-flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
              disabled={copying}
            >
              {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Copy
            </button>
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={7}
            className="mt-2 w-full resize-none rounded-2xl border bg-white p-3 text-sm text-zinc-900 outline-none"
          />
        </div>
      </div>

      {/* Results */}
      <div className="rounded-3xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-900">
              Delivery Agents <span className="text-xs text-zinc-500">({filtered.length})</span>
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-zinc-900">No delivery agents found</p>
            <p className="mt-1 text-sm text-zinc-600">
              Try removing filters or searching by phone/WhatsApp.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {filtered.map((r) => {
              const wa = (r.whatsapp ?? r.phone)?.trim() || "";
              const canWhatsApp = !!wa;
              const msg = computedMessage;
              const href = canWhatsApp ? getWhatsAppLink(wa, msg) : null;

              return (
                <div key={r.id} className="rounded-3xl border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900">
                        {r.name ?? "Unnamed delivery agent"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Zone: {r.zone ?? "—"} • {r.is_available ? "Available" : "Busy"}
                      </p>
                      {r.fee_note ? (
                        <p className="mt-2 text-xs text-zinc-700">{r.fee_note}</p>
                      ) : null}

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
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-zinc-500">Phone</p>
                      <p className="text-xs font-semibold text-zinc-900">
                        {r.phone ? `+${r.phone}` : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <a
                      href={href ?? "#"}
                      onClick={(e) => {
                        if (!href) e.preventDefault();
                      }}
                      target={href ? "_blank" : undefined}
                      rel={href ? "noreferrer" : undefined}
                      className={cn(
                        "rounded-2xl px-3 py-2 text-center text-sm font-semibold no-underline",
                        href ? "bg-black text-white hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500"
                      )}
                    >
                      WhatsApp
                    </a>

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
                      onClick={() => copyText(r.phone ? `+${r.phone}` : wa ? `+${wa}` : "")}
                      disabled={!r.phone && !wa}
                      className={cn(
                        "col-span-2 rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50",
                        (!r.phone && !wa) && "opacity-50"
                      )}
                    >
                      Copy number
                    </button>
                  </div>

                  {!canWhatsApp ? (
                    <p className="mt-3 text-xs text-amber-700">
                      No WhatsApp number set for this delivery agent.
                    </p>
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
