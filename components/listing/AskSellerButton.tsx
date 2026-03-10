"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { MessageCircle, Loader2 } from "lucide-react";

interface Props {
  listingId: string;
  vendorId: string;
  /** If the current user IS the vendor, hide the button */
  isOwner?: boolean;
  isSold?: boolean;
  variant?: "pill" | "icon";
  className?: string;
}

export default function AskSellerButton({
  listingId,
  vendorId,
  isOwner = false,
  isSold = false,
  variant = "pill",
  className = "",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (isOwner) return null;

  async function handleClick() {
    if (loading) return;
    setLoading(true);

    try {
      // 1. Auth check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?next=/listing/${listingId}`);
        return;
      }

      // 2. Upsert conversation — ON CONFLICT(listing_id, buyer_id) returns existing row
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", listingId)
        .eq("buyer_id", user.id)
        .maybeSingle();

      if (existing?.id) {
        router.push(`/inbox/${existing.id}`);
        return;
      }

      const { data: created, error } = await supabase
        .from("conversations")
        .insert({
          listing_id: listingId,
          buyer_id: user.id,
          vendor_id: vendorId,
        })
        .select("id")
        .single();

      if (error || !created) {
        // Maybe race condition — try fetching again
        const { data: retry } = await supabase
          .from("conversations")
          .select("id")
          .eq("listing_id", listingId)
          .eq("buyer_id", user.id)
          .maybeSingle();
        if (retry?.id) {
          router.push(`/inbox/${retry.id}`);
        }
        return;
      }

      router.push(`/inbox/${created.id}`);
    } catch {
      // fail silently — button just stops spinning
    } finally {
      setLoading(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || isSold}
        aria-label="Message seller"
        className={[
          "grid h-10 w-10 place-items-center rounded-full border transition",
          isSold ? "opacity-40 cursor-not-allowed bg-zinc-50 text-zinc-400" : "bg-white text-zinc-700 hover:bg-zinc-50",
          className,
        ].filter(Boolean).join(" ")}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || isSold}
      className={[
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
        isSold
          ? "bg-zinc-50 text-zinc-400 cursor-not-allowed"
          : "bg-white text-zinc-900 hover:bg-zinc-50",
        className,
      ].filter(Boolean).join(" ")}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
      {loading ? "Opening…" : "Message seller"}
    </button>
  );
}