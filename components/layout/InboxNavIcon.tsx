// components/layout/InboxNavIcon.tsx
"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function InboxNavIcon({ className }: { className?: string }) {
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cleanupChannel: (() => void) | undefined;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setReady(true); return; }

      const { data: vendorData } = await supabase
        .from("vendors")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const vid = (vendorData as any)?.id ?? null;

      async function refresh() {
        if (cancelled) return;
        const [buyerRes, vendorRes] = await Promise.all([
          supabase.from("conversations").select("buyer_unread").eq("buyer_id", user!.id),
          vid
            ? supabase.from("conversations").select("vendor_unread").eq("vendor_id", vid)
            : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;
        const b = ((buyerRes.data ?? []) as any[]).reduce((s: number, r: any) => s + (r.buyer_unread ?? 0), 0);
        const v = ((vendorRes.data ?? []) as any[]).reduce((s: number, r: any) => s + (r.vendor_unread ?? 0), 0);
        setCount(b + v);
        setReady(true);
      }

      await refresh();

      const channel = supabase
        .channel(`topnav:inbox:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
        .subscribe();

      cleanupChannel = () => { supabase.removeChannel(channel); };
    }

    load();
    return () => {
      cancelled = true;
      cleanupChannel?.();
    };
  }, []);

  const icon = (
    <span className="relative inline-flex items-center justify-center">
      <MessageCircle className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </span>
  );

  if (!ready) {
    return (
      <button
        type="button"
        className={`inline-flex items-center justify-center rounded-xl border border-border bg-background px-3 py-2 shadow-sm hover:bg-secondary ${className ?? ""}`}
        aria-label="Messages"
      >
        {icon}
      </button>
    );
  }

  return (
    <Link
      href="/inbox"
      className={`inline-flex items-center justify-center rounded-xl border border-border bg-background px-3 py-2 shadow-sm hover:bg-secondary ${className ?? ""}`}
      aria-label="Messages"
    >
      {icon}
    </Link>
  );
}