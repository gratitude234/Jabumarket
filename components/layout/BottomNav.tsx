"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, MessageCircle, PlusSquare, User, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function useInboxUnread() {
  const [count, setCount] = useState(0);

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

      const [buyerRes, vendorRes] = await Promise.all([
        supabase.from("conversations").select("buyer_unread").eq("buyer_id", user.id),
        vid
          ? supabase.from("conversations").select("vendor_unread").eq("vendor_id", vid)
          : Promise.resolve({ data: [] }),
      ]);

      if (cancelled) return;

      const buyerTotal = ((buyerRes.data ?? []) as any[]).reduce((s: number, r: any) => s + (r.buyer_unread ?? 0), 0);
      const vendorTotal = ((vendorRes.data ?? []) as any[]).reduce((s: number, r: any) => s + (r.vendor_unread ?? 0), 0);
      setCount(buyerTotal + vendorTotal);

      const channel = supabase
        .channel(`bottomnav:inbox:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
        .subscribe();

      cleanupChannel = () => { supabase.removeChannel(channel); };
    }

    load();
    return () => {
      cancelled = true;
      cleanupChannel?.();
    };
  }, []);

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
    { href: "/post", label: "Post", icon: PlusSquare, badge: null },
    { href: "/me", label: "Me", icon: User, badge: null },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-2">
        <div className="grid grid-cols-6 h-14">
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
  );
}