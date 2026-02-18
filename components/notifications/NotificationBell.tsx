// components/notifications/NotificationBell.tsx
"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  className?: string;
};

export default function NotificationBell({ className }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [count, setCount] = useState<number>(0);
  const [ready, setReady] = useState(false);

  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
    setReady(true);
  }

  async function refreshCount(uid: string) {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("is_read", false);

    setCount(count ?? 0);
  }

  useEffect(() => {
    loadUser();
  }, []);

  // fetch count + realtime updates
  useEffect(() => {
    if (!userId) return;

    refreshCount(userId);

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          refreshCount(userId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const icon = useMemo(() => {
    return (
      <span className="relative inline-flex items-center justify-center">
        <Bell className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute -right-2 -top-2 min-w-[18px] rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
    );
  }, [count]);

  // If auth isn't ready yet, render a stable button.
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

  // If user not logged in, send them to login.
  const href = userId ? "/notifications" : "/login";

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-xl border border-border bg-background px-3 py-2 shadow-sm hover:bg-secondary ${className ?? ""}`}
      aria-label="Notifications"
    >
      {icon}
    </Link>
  );
}
