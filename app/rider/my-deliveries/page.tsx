"use client";
// app/rider/my-deliveries/page.tsx
// Rider dashboard — phone lookup then show assigned deliveries with status update buttons

import { cn } from "@/lib/utils";
import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Loader2, Phone, Package, Truck } from "lucide-react";

type DeliveryStatus = "open" | "accepted" | "picked_up" | "delivered" | "cancelled";

type DeliveryRow = {
  id: string;
  order_id: string | null;
  dropoff: string | null;
  note: string | null;
  status: DeliveryStatus;
  created_at: string;
};

function statusLabel(s: DeliveryStatus): string {
  switch (s) {
    case "open": return "Waiting for pickup";
    case "accepted": return "Accepted";
    case "picked_up": return "Picked up";
    case "delivered": return "Delivered ✓";
    case "cancelled": return "Cancelled";
  }
}

function statusStyles(s: DeliveryStatus): string {
  switch (s) {
    case "open": return "bg-amber-50 text-amber-800 border-amber-200";
    case "accepted": return "bg-blue-50 text-blue-800 border-blue-200";
    case "picked_up": return "bg-violet-50 text-violet-800 border-violet-200";
    case "delivered": return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "cancelled": return "bg-zinc-50 text-zinc-500 border-zinc-200";
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function normalizePhone(input: string) {
  return input.replace(/[^\d]/g, "");
}

export default function RiderMyDeliveriesPage() {
  const [phone, setPhone] = useState("");
  const [looking, setLooking] = useState(false);
  const [riderId, setRiderId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const digits = normalizePhone(phone);
  const canLookup = digits.length >= 10;

  async function lookup() {
    if (!canLookup) return;
    setLooking(true);
    setLookupError(null);
    setRiderId(null);
    setDeliveries([]);

    try {
      const { data, error } = await supabase
        .from("riders")
        .select("id")
        .or(`phone.eq.${digits},whatsapp.eq.${digits}`)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setLookupError("No rider found with that number.");
        return;
      }

      setRiderId(data.id);
      await loadDeliveries(data.id);
    } catch (err: any) {
      setLookupError(err?.message ?? "Lookup failed.");
    } finally {
      setLooking(false);
    }
  }

  async function loadDeliveries(rid: string) {
    setLoadingDeliveries(true);
    const { data } = await supabase
      .from("delivery_requests")
      .select("id, order_id, dropoff, note, status, created_at")
      .eq("rider_id", rid)
      .order("created_at", { ascending: false });
    setDeliveries((data as DeliveryRow[]) ?? []);
    setLoadingDeliveries(false);
  }

  async function updateStatus(deliveryId: string, newStatus: DeliveryStatus) {
    setActing(deliveryId);
    const { error } = await supabase
      .from("delivery_requests")
      .update({ status: newStatus })
      .eq("id", deliveryId);

    if (!error) {
      setDeliveries((prev) =>
        prev.map((d) => d.id === deliveryId ? { ...d, status: newStatus } : d)
      );
    }
    setActing(null);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pb-28 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/rider/status"
          className="grid h-10 w-10 place-items-center rounded-full border bg-white hover:bg-zinc-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-zinc-900">My Deliveries</h1>
          <p className="text-xs text-zinc-500">Manage your assigned orders</p>
        </div>
      </div>

      {/* Phone lookup */}
      {!riderId && (
        <div className="rounded-3xl border bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 rounded-2xl border bg-zinc-50 px-3 py-2.5">
            <Phone className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setLookupError(null); }}
              placeholder="Enter your registered phone number"
              className="w-full bg-transparent text-sm outline-none"
              inputMode="tel"
              onKeyDown={(e) => { if (e.key === "Enter") lookup(); }}
            />
          </div>

          {lookupError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {lookupError}
            </p>
          )}

          <button
            type="button"
            onClick={lookup}
            disabled={!canLookup || looking}
            className={cn(
              "w-full rounded-2xl py-3 text-sm font-semibold transition",
              !canLookup || looking
                ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                : "bg-zinc-900 text-white hover:bg-zinc-700"
            )}
          >
            {looking ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Looking up…
              </span>
            ) : (
              "Find my profile"
            )}
          </button>
        </div>
      )}

      {/* Deliveries */}
      {riderId && (
        loadingDeliveries ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="rounded-3xl border bg-white p-8 text-center shadow-sm">
            <Package className="mx-auto mb-3 h-8 w-8 text-zinc-200" />
            <p className="text-sm text-zinc-400">No deliveries assigned yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deliveries.map((d) => (
              <div key={d.id} className="rounded-3xl border bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 truncate">
                      {d.order_id ? `Order #${d.order_id.slice(-6).toUpperCase()}` : `Delivery #${d.id.slice(-6).toUpperCase()}`}
                    </p>
                    {d.dropoff && (
                      <p className="mt-0.5 text-xs text-zinc-500">📍 {d.dropoff}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-zinc-400">{timeAgo(d.created_at)}</span>
                </div>

                <div className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                  statusStyles(d.status)
                )}>
                  <Truck className="h-3 w-3" />
                  {statusLabel(d.status)}
                </div>

                {d.note && (
                  <p className="text-xs italic text-zinc-400">Note: {d.note}</p>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {d.status === "accepted" && (
                    <button
                      type="button"
                      disabled={acting === d.id}
                      onClick={() => updateStatus(d.id, "picked_up")}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {acting === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Mark as Picked Up
                    </button>
                  )}
                  {d.status === "picked_up" && (
                    <button
                      type="button"
                      disabled={acting === d.id}
                      onClick={() => updateStatus(d.id, "delivered")}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {acting === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Mark as Delivered
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
