// components/notifications/NotificationBell.tsx
"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NotificationBell({ className }: { className?: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);

  async function refresh(uid: string) {
    try {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("is_read", false);
      setCount(count ?? 0);
    } catch {
      // if table isn't created yet
      setCount(0);
    }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      setReady(true);
      if (uid) {
        await refresh(uid);

        const channel = supabase
          .channel(`notifications:${uid}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
            () => refresh(uid)
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    })();
  }, []);

  const icon = useMemo(
    () => (
      <span className="relative inline-flex items-center justify-center">
        <Bell className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
    ),
    [count]
  );

  if (!ready) {
    return (
      <button
        type="button"
        className={`inline-flex items-center justify-center rounded-xl border border-border bg-background px-3 py-2 shadow-sm hover:bg-secondary ${className ?? ""}`}
        aria-label="Notifications"
      >
        {icon}
      </button>
    );
  }

  return (
    <Link
      href={userId ? "/notifications" : "/login"}
      className={`inline-flex items-center justify-center rounded-xl border border-border bg-background px-3 py-2 shadow-sm hover:bg-secondary ${className ?? ""}`}
      aria-label="Notifications"
    >
      {icon}
    </Link>
  );
}
