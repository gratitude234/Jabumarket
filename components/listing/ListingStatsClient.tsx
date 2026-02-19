"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Phone, Flag } from "lucide-react";

function shouldCount(key: string, windowMs: number) {
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(key) ?? "0");
    if (!Number.isFinite(last) || last <= 0) {
      localStorage.setItem(key, String(now));
      return true;
    }
    if (now - last > windowMs) {
      localStorage.setItem(key, String(now));
      return true;
    }
    return false;
  } catch {
    return true; // if storage blocked, just count
  }
}


/**
 * Counts a listing view (throttled per device).
 */
export function ListingViewTracker({
  listingId,
  throttleMinutes = 30,
}: {
  listingId: string;
  throttleMinutes?: number;
}) {
  useEffect(() => {
    if (!listingId) return;
    const key = `jm_view_${listingId}`;
    const ok = shouldCount(key, throttleMinutes * 60_000);
    if (!ok) return;

    // Fire-and-forget (but log errors so it's debuggable)
    void supabase
      .rpc("listing_stats_increment", {
        p_listing_id: listingId,
        p_event: "view",
        p_amount: 1,
      })
      .then(({ error }) => {
        if (error) console.error("listing_stats_increment(view) failed:", error);
      });
  }, [listingId, throttleMinutes]);

  return null;
}

/**
 * CTA buttons with click tracking for ranking.
 */
export function ListingContactActions({
  listingId,
  isSold,
  isActive,
  hasWhatsApp,
  hasPhone,
  waLink,
  contactPhone,
  variant,
}: {
  listingId: string;
  isSold: boolean;
  isActive: boolean;
  hasWhatsApp: boolean;
  hasPhone: boolean;
  waLink: string;
  contactPhone: string;
  variant: "desktop" | "mobile";
}) {
  const canContact = !isSold && isActive;

  const onContactClick = () => {
    // Fire-and-forget (don't block navigation)
    void supabase
      .rpc("listing_stats_increment", {
        p_listing_id: listingId,
        p_event: "contact",
        p_amount: 1,
      })
      .then(({ error }) => {
        if (error) console.error("listing_stats_increment(contact) failed:", error);
      });
  };

  if (variant === "desktop") {
    return (
      <div className="mt-4 grid grid-cols-2 gap-2">
        {canContact && hasWhatsApp ? (
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            onClick={onContactClick}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white no-underline hover:bg-zinc-800"
          >
            WhatsApp
          </a>
        ) : (
          <span className="inline-flex items-center justify-center rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-500">
            WhatsApp
          </span>
        )}

        {canContact && hasPhone ? (
          <a
            href={`tel:+${contactPhone}`}
            onClick={onContactClick}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
          >
            <Phone className="h-4 w-4" />
            Call
          </a>
        ) : (
          <span className="inline-flex items-center justify-center rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-400">
            <Phone className="h-4 w-4" />
            Call
          </span>
        )}
      </div>
    );
  }

  // mobile bottom action bar layout (WhatsApp + Call or Report)
  return (
    <div className="grid grid-cols-2 gap-2">
      {canContact && hasWhatsApp ? (
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          onClick={onContactClick}
          className="inline-flex items-center justify-center rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white no-underline hover:bg-zinc-800"
        >
          WhatsApp
        </a>
      ) : (
        <span className="inline-flex items-center justify-center rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-500">
          WhatsApp
        </span>
      )}

      {canContact && hasPhone ? (
        <a
          href={`tel:+${contactPhone}`}
          onClick={onContactClick}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
        >
          <Phone className="h-4 w-4" />
          Call
        </a>
      ) : (
        <Link
          href={`/report?listing=${listingId}`}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-semibold text-zinc-900 no-underline hover:bg-zinc-50"
        >
          <Flag className="h-4 w-4" />
          Report
        </Link>
      )}
    </div>
  );
}
