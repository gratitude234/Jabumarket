"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, BookOpen, MessageCircle, User, Store, Truck } from "lucide-react";
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

// ── Rider mode: detect linked rider account ────────────────────────────────────

function useRiderMode() {
  const [isRider, setIsRider] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("riders")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled && data) setIsRider(true);
    })();

    return () => { cancelled = true; };
  }, []);

  return isRider;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const pathname    = usePathname();
  const inboxUnread = useInboxUnread();
  const { isVendor, pendingCount } = useVendorMode();
  const isRider = useRiderMode();

  // Full-screen flows that manage their own navigation — hide global bottom nav
  const isConversationPage  = /^\/inbox\/[^/]+$/.test(pathname);
  const isAttemptReviewPage = /^\/study\/history\/[^/]+$/.test(pathname);
  const isUploadPage        = /^\/study\/materials\/upload/.test(pathname);
  if (isConversationPage || isAttemptReviewPage || isUploadPage) return null;

  const meItem    = { href: "/me",               label: "Me",    icon: User,  badge: null };
  const riderItem = { href: "/rider/dashboard",  label: "Rider", icon: Truck, badge: null };

  const studentItems = [
    { href: "/",        label: "Home",     icon: Home,            badge: null },
    { href: "/explore", label: "Explore",  icon: Search,          badge: null },
    { href: "/study",   label: "Study",    icon: BookOpen,        badge: null },
    {
      href: "/inbox",
      label: "Messages",
      icon: MessageCircle,
      badge: inboxUnread > 0 ? (inboxUnread > 99 ? "99+" : String(inboxUnread)) : null,
    },
    ...(isRider ? [riderItem] : []),
    meItem,
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
    ...(isRider ? [riderItem] : []),
    meItem,
  ];

  const items = isVendor ? vendorItems : studentItems;

  return (
    <>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background [[data-hide-nav=true]_&]:hidden">
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
                    active
                      ? item.href === "/study"
                        ? "text-[#5B35D5] font-semibold"
                        : "text-[#FF5C00] font-semibold"
                      : "text-muted-foreground",
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