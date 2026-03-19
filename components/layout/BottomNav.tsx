"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, BookOpen, MessageCircle, User, Plus, Store, UtensilsCrossed } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── Inbox unread count ─────────────────────────────────────────────────────────

function useInboxUnread() {
  const [count, setCount] = useState(0);
  const pathname = usePathname();
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

      async function refresh() {
        if (cancelled) return;
        const [buyerRes, vendorRes] = await Promise.all([
          supabase.from("conversations").select("buyer_unread").eq("buyer_id", user!.id),
          vid
            ? supabase.from("conversations").select("vendor_unread").eq("vendor_id", vid)
            : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;
        const buyerTotal  = ((buyerRes.data ?? []) as any[]).reduce((s: number, r: any) => s + (r.buyer_unread ?? 0), 0);
        const vendorTotal = ((vendorRes.data ?? []) as any[]).reduce((s: number, r: any) => s + (r.vendor_unread ?? 0), 0);
        setCount(buyerTotal + vendorTotal);
      }

      refreshRef.current = refresh;
      await refresh();

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

  useEffect(() => { refreshRef.current?.(); }, [pathname]);

  return count;
}

// ── Vendor mode: detect approved food vendor + live pending order count ────────

function useVendorMode() {
  const [vendorId, setVendorId]       = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const pathname = usePathname();
  const refreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanupChannel: (() => void) | undefined;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: vendor } = await supabase
        .from("vendors")
        .select("id, verification_status")
        .eq("user_id", user.id)
        .eq("vendor_type", "food")
        .maybeSingle();

      if (!vendor || cancelled) return;
      // Only show vendor nav when approved
      if (!["approved", "verified"].includes(vendor.verification_status ?? "")) return;

      setVendorId(vendor.id);

      async function refresh() {
        if (cancelled) return;
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", vendor!.id)
          .eq("status", "pending");
        if (!cancelled) setPendingCount(count ?? 0);
      }

      refreshRef.current = refresh;
      await refresh();

      // Realtime: update badge on any order change for this vendor
      const channel = supabase
        .channel(`bottomnav:vendor:${vendor.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `vendor_id=eq.${vendor.id}` },
          refresh
        )
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

  // Re-check count on navigation
  useEffect(() => { refreshRef.current?.(); }, [pathname]);

  return { isVendor: Boolean(vendorId), pendingCount };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const pathname    = usePathname();
  const inboxUnread = useInboxUnread();
  const { isVendor, pendingCount } = useVendorMode();

  const studentItems = [
    { href: "/",        label: "Home",     icon: Home,            badge: null },
    { href: "/explore", label: "Explore",  icon: Search,          badge: null },
    { href: "/food",    label: "Food",     icon: UtensilsCrossed, badge: null },
    { href: "/study",   label: "Study",    icon: BookOpen,        badge: null },
    {
      href: "/inbox",
      label: "Messages",
      icon: MessageCircle,
      badge: inboxUnread > 0 ? (inboxUnread > 99 ? "99+" : String(inboxUnread)) : null,
    },
    { href: "/me",      label: "Me",       icon: User,            badge: null },
  ];

  // For approved vendors: swap Explore slot → Vendor Orders
  const vendorItems = [
    { href: "/",              label: "Home",     icon: Home,          badge: null },
    {
      href: "/vendor/orders",
      label: "Orders",
      icon: Store,
      badge: pendingCount > 0 ? (pendingCount > 9 ? "9+" : String(pendingCount)) : null,
      badgeUrgent: pendingCount > 0,
    },
    { href: "/study",         label: "Study",    icon: BookOpen,      badge: null },
    {
      href: "/inbox",
      label: "Messages",
      icon: MessageCircle,
      badge: inboxUnread > 0 ? (inboxUnread > 99 ? "99+" : String(inboxUnread)) : null,
      badgeUrgent: false,
    },
    { href: "/me",            label: "Me",       icon: User,          badge: null },
  ];

  const items = isVendor ? vendorItems : studentItems;
  const hidePostFab = pathname.startsWith("/study");

  return (
    <>
      {/* Floating Post button */}
      {!hidePostFab && (
        <Link
          href="/post"
          className="md:hidden fixed bottom-16 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg active:scale-95 transition-transform"
          aria-label="Post listing"
        >
          <Plus className="h-6 w-6" />
        </Link>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background">
        <div className="mx-auto max-w-6xl px-2">
          <div className={`grid ${items.length === 6 ? 'grid-cols-6' : 'grid-cols-5'} h-14`}>
            {items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              const urgent = (item as any).badgeUrgent === true;

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
                      <span
                        className={[
                          "absolute -right-2 -top-1.5 min-w-[16px] rounded-full px-1 py-px text-[9px] font-bold leading-none text-white text-center",
                          urgent ? "bg-amber-500" : "bg-red-600",
                        ].join(" ")}
                      >
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