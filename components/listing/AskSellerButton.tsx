"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { MessageCircle, Loader2, Tag, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  listingId: string;
  vendorId: string;
  listingTitle?: string;
  listingPrice?: number | null;
  negotiable?: boolean;
  isOwner?: boolean;
  isSold?: boolean;
  variant?: "pill" | "icon";
  className?: string;
}

function formatNaira(n: number) {
  return `₦${n.toLocaleString("en-NG")}`;
}

function onlyDigits(s: string) {
  return s.replace(/[^\d]/g, "");
}

export default function AskSellerButton({
  listingId,
  vendorId,
  listingTitle,
  listingPrice,
  negotiable = false,
  isOwner = false,
  isSold = false,
  variant = "pill",
  className = "",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authWall, setAuthWall] = useState(false);

  // Offer panel state
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerDigits, setOfferDigits] = useState("");
  const [offerNote, setOfferNote] = useState("");
  const [offerLoading, setOfferLoading] = useState(false);

  if (isOwner) return null;

  // ── Core: open or find conversation ───────────────────────────────────────

  async function openConversation(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAuthWall(true);
      return null;
    }

    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("listing_id", listingId)
      .eq("buyer_id", user.id)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error: insertErr } = await supabase
      .from("conversations")
      .insert({ listing_id: listingId, buyer_id: user.id, vendor_id: vendorId })
      .select("id")
      .single();

    if (insertErr || !created) {
      const { data: retry } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", listingId)
        .eq("buyer_id", user.id)
        .maybeSingle();
      return retry?.id ?? null;
    }

    // Fire-and-forget: notify seller of first contact (new conversation only)
    void fetch("/api/marketplace/notify-seller", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: created.id,
        listing_id: listingId,
        vendor_id: vendorId,
      }),
    }).catch(() => {});

    return created.id;
  }

  // ── Message seller (plain) ────────────────────────────────────────────────

  async function handleMessage() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const convId = await openConversation();
      if (convId) router.push(`/inbox/${convId}`);
      else setError("Couldn't open chat. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Make an offer ─────────────────────────────────────────────────────────

  async function handleOffer() {
    const offerAmount = parseInt(offerDigits, 10);
    if (!offerDigits || !Number.isFinite(offerAmount) || offerAmount <= 0) return;

    setOfferLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthWall(true);
        return;
      }

      const convId = await openConversation();
      if (!convId) {
        setError("Couldn't open chat. Please try again.");
        return;
      }

      // Build the offer message
      const titlePart = listingTitle ? `"${listingTitle}"` : "this listing";
      const askingPart = listingPrice ? ` (asking ${formatNaira(listingPrice)})` : "";
      const notePart = offerNote.trim() ? `\n\n${offerNote.trim()}` : "";
      const body =
        `Hi! I'd like to offer ${formatNaira(offerAmount)} for ${titlePart}${askingPart}.` +
        notePart;

      await supabase.from("messages").insert({
        conversation_id: convId,
        sender_id: user.id,
        body,
        type: "text",
      });

      // Update conversation preview
      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: body.slice(0, 120),
          vendor_unread: 1,
        })
        .eq("id", convId);

      setOfferOpen(false);
      router.push(`/inbox/${convId}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setOfferLoading(false);
    }
  }

  // ── Icon variant ──────────────────────────────────────────────────────────

  if (variant === "icon") {
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={handleMessage}
          disabled={loading || isSold}
          aria-label="Message seller"
          className={cn(
            "grid h-10 w-10 place-items-center rounded-full border transition",
            isSold
              ? "opacity-40 cursor-not-allowed bg-zinc-50 text-zinc-400"
              : "bg-white text-zinc-700 hover:bg-zinc-50",
            className
          )}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        </button>
        {error && <p className="text-[10px] text-red-500 text-center">{error}</p>}
      </div>
    );
  }

  // ── Pill variant ──────────────────────────────────────────────────────────

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Primary CTA row */}
      <div className="flex gap-2">
        {/* Message seller */}
        <button
          type="button"
          onClick={handleMessage}
          disabled={loading || isSold}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
            isSold
              ? "bg-zinc-50 text-zinc-400 cursor-not-allowed"
              : "bg-white text-zinc-900 hover:bg-zinc-50"
          )}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          {loading ? "Opening…" : "Message seller"}
        </button>

        {/* Make an offer — only shown when negotiable */}
        {negotiable && !isSold && (
          <button
            type="button"
            onClick={() => setOfferOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
              offerOpen
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "bg-white text-zinc-900 hover:bg-zinc-50"
            )}
          >
            <Tag className="h-4 w-4" />
            Offer
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", offerOpen && "rotate-180")} />
          </button>
        )}
      </div>

      {/* Offer panel — slides open below */}
      {offerOpen && !isSold && (
        <div className="rounded-2xl border bg-zinc-50 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-700">
              Your offer
              {listingPrice
                ? ` — asking ${formatNaira(listingPrice)}`
                : ""}
            </p>
            <button
              type="button"
              onClick={() => setOfferOpen(false)}
              className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700"
              aria-label="Close offer panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Price input */}
          <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 focus-within:ring-2 focus-within:ring-black/10">
            <span className="shrink-0 text-sm font-semibold text-zinc-500">₦</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder={listingPrice ? (listingPrice * 0.85).toFixed(0) : "Enter amount"}
              value={offerDigits ? parseInt(offerDigits, 10).toLocaleString("en-NG") : ""}
              onChange={(e) => setOfferDigits(onlyDigits(e.target.value))}
              className="w-full bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-zinc-400"
              autoFocus
            />
          </div>

          {/* Optional note */}
          <textarea
            placeholder="Add a note (optional) — e.g. pickup location, condition question…"
            value={offerNote}
            onChange={(e) => setOfferNote(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/10 placeholder:text-zinc-400"
          />

          <button
            type="button"
            onClick={handleOffer}
            disabled={offerLoading || !offerDigits}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition",
              !offerDigits
                ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                : "bg-zinc-900 text-white hover:bg-zinc-700"
            )}
          >
            {offerLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
              : <><Tag className="h-4 w-4" /> Send offer</>
            }
          </button>
        </div>
      )}

      {/* Auth wall — shown instead of redirecting when user is not logged in */}
      {authWall && (
        <div className="rounded-2xl border bg-zinc-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-900">
              Sign in to message this seller
            </p>
            <button type="button" onClick={() => setAuthWall(false)}>
              <X className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
          <p className="text-xs text-zinc-600">
            Create a free account in under a minute. No spam.
          </p>
          <div className="flex gap-2">
            <Link
              href={`/signup?next=/listing/${listingId}`}
              className="flex-1 rounded-2xl bg-black px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Sign up free
            </Link>
            <Link
              href={`/login?next=/listing/${listingId}`}
              className="flex-1 rounded-2xl border bg-white px-4 py-2.5 text-center text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              Log in
            </Link>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
    </div>
  );
}