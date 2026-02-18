"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, CheckCheck } from "lucide-react";

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  is_read: boolean;
  created_at: string;
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default function NotificationsClient() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<NotificationRow[]>([]);

  const unread = useMemo(() => rows.filter((r) => !r.is_read).length, [rows]);

  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
  }

  async function loadNotifications(uid: string) {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(60);
      setRows((data as NotificationRow[]) ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    if (!userId) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
  }

  async function markRead(id: string) {
    if (!userId) return;
    await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", userId);
  }

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    loadNotifications(userId);

    const channel = supabase
      .channel(`notifications:list:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => loadNotifications(userId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!userId && !loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="rounded-3xl border bg-white p-5">
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="mt-2 text-sm text-muted-foreground">You need to be logged in to see notifications.</p>
          <Link href="/login" className="btn-primary mt-4 inline-flex">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background hover:bg-secondary"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Notifications</h1>
            <p className="text-xs text-muted-foreground">{unread > 0 ? `${unread} unread` : "All caught up"}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={markAllRead}
          disabled={!userId || unread === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm shadow-sm hover:bg-secondary disabled:opacity-50"
        >
          <CheckCheck className="h-4 w-4" />
          Mark all read
        </button>
      </header>

      <section className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-3xl border bg-white p-5">
            <div className="h-4 w-40 rounded bg-zinc-100" />
            <div className="mt-3 h-3 w-72 rounded bg-zinc-100" />
            <div className="mt-2 h-3 w-56 rounded bg-zinc-100" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border bg-white p-6 text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          rows.map((n) => {
            const Wrapper: any = n.href ? Link : "div";
            const wrapperProps = n.href
              ? { href: n.href, onClick: () => markRead(n.id) }
              : { onClick: () => markRead(n.id) };

            return (
              <Wrapper
                key={n.id}
                {...wrapperProps}
                className={`block rounded-3xl border bg-white p-5 shadow-sm transition hover:bg-secondary/30 ${
                  n.is_read ? "opacity-80" : "border-primary/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{n.title}</p>
                    {n.body ? <p className="mt-1 text-sm text-muted-foreground">{n.body}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                </div>
              </Wrapper>
            );
          })
        )}
      </section>
    </main>
  );
}
