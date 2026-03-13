"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, BookOpen, MessageCircle, User, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

function useInboxUnread() {
  const [count, setCount] = useState(0);
  const pathname = usePathname();
  // Stores the refresh fn so it can be called from the pathname-change effect below.
  const refreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanupChannel: (() => void) | undefined;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: vendorData } = await supabase
        .from("vendors")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const vid = (vendorData as any)?.id ?? null;

      // refresh() only fetches counts — does NOT re-subscribe.
      async function refresh() {
        if (cancelled) return;
        const [buyerRes, vendorRes] = await Promise.all([
          supabase.from("conversations").select("buyer_unread").eq("buyer_id", user!.id),
          vid
            ? supabase.from("conversations").select("vendor_unread").eq("vendor_id", vid)
            : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;
        const buyerTotal = ((buyerRes.data ?? []) as any[]).reduce((s: number, r: any) => s + (r.buyer_unread ?? 0), 0);
        const vendorTotal = ((vendorRes.data ?? []) as any[]).reduce((s: number, r: any) => s + (r.vendor_unread ?? 0), 0);
        setCount(buyerTotal + vendorTotal);
      }

      // Expose refresh so the pathname effect can call it.
      refreshRef.current = refresh;
      await refresh();

      // Subscribe once — on any conversation change, only re-fetch counts.
      const channel = supabase
        .channel(`bottomnav:inbox:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
        .subscribe();

      cleanupChannel = () => { supabase.removeChannel(channel); };
    }

    load();
    return () => {
      cancelled = true;
      cleanupChannel?.();
      refreshRef.current = null;
    };
  }, []);

  // Re-fetch on every navigation. This guarantees the badge reflects the true
  // unread count even if a realtime event was missed (e.g. after reading a conversation).
  useEffect(() => {
    refreshRef.current?.();
  }, [pathname]);

  return count;
}


export default function BottomNav() {
  const pathname = usePathname();
  const inboxUnread = useInboxUnread();

  const items = [
    { href: "/", label: "Home", icon: Home, badge: null },
    { href: "/explore", label: "Explore", icon: Search, badge: null },
    { href: "/study", label: "Study", icon: BookOpen, badge: null },
    {
      href: "/inbox",
      label: "Messages",
      icon: MessageCircle,
      badge: inboxUnread > 0 ? (inboxUnread > 99 ? "99+" : String(inboxUnread)) : null,
    },
    { href: "/me", label: "Me", icon: User, badge: null },
  ];

  return (
    <>
      {/* Floating Post button — anchored above the nav, does not occupy a nav slot */}
      <Link
        href="/post"
        className="md:hidden fixed bottom-16 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg active:scale-95 transition-transform"
        aria-label="Post listing"
      >
        <Plus className="h-6 w-6" />
      </Link>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background">
        <div className="mx-auto max-w-6xl px-2">
          <div className="grid grid-cols-5 h-14">
            {items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex flex-col items-center justify-center gap-1 text-xs no-underline",
                    active ? "text-primary font-medium" : "text-muted-foreground",
                  ].join(" ")}
                >
                  <span className="relative">
                    <Icon className="h-5 w-5" />
                    {item.badge ? (
                      <span className="absolute -right-2 -top-1.5 min-w-[16px] rounded-full bg-red-600 px-1 py-px text-[9px] font-bold leading-none text-white text-center">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}