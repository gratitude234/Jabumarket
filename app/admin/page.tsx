// app/admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function AdminHomePage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!mounted) return;

      if (!user) {
        setIsAdmin(false);
        setUserEmail(null);
        setLoading(false);
        return;
      }

      setUserEmail(user.email ?? null);

      const { data: adminRow, error: adminErr } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (adminErr || !adminRow) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      setLoading(false);
    }

    run();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage vendors, couriers, and riders.
          </p>
        </div>

        <Link
          href="/"
          className="rounded-xl border px-3 py-2 text-sm text-black no-underline"
        >
          ← Home
        </Link>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
          Checking admin access…
        </div>
      ) : !isAdmin ? (
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-sm text-zinc-700">
            You don&apos;t have admin access{userEmail ? ` (${userEmail})` : ""}.
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href="/"
              className="rounded-xl bg-black px-4 py-2 text-sm text-white no-underline"
            >
              Go home
            </Link>
            <Link
              href="/login"
              className="rounded-xl border px-4 py-2 text-sm text-black no-underline"
            >
              Login
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/admin/vendors"
            className="rounded-2xl border bg-white p-4 no-underline transition hover:bg-zinc-50"
          >
            <div className="text-base font-semibold text-black">Vendors</div>
            <div className="mt-1 text-sm text-zinc-600">
              Verify vendors and manage shop profiles.
            </div>
          </Link>

          <Link
            href="/admin/couriers"
            className="rounded-2xl border bg-white p-4 no-underline transition hover:bg-zinc-50"
          >
            <div className="text-base font-semibold text-black">Couriers</div>
            <div className="mt-1 text-sm text-zinc-600">
              Approve delivery guys and manage visibility.
            </div>
          </Link>

          <Link
            href="/admin/riders"
            className="rounded-2xl border bg-white p-4 no-underline transition hover:bg-zinc-50"
          >
            <div className="text-base font-semibold text-black">Riders</div>
            <div className="mt-1 text-sm text-zinc-600">
              Manage riders (legacy / existing module).
            </div>
          </Link>

          <Link
            href="/couriers"
            className="rounded-2xl border bg-white p-4 no-underline transition hover:bg-zinc-50"
          >
            <div className="text-base font-semibold text-black">View Delivery Directory</div>
            <div className="mt-1 text-sm text-zinc-600">
              Preview what students see on the couriers page.
            </div>
          </Link>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-4 text-xs text-zinc-600">
        Tip: Keep couriers <span className="font-medium">active</span> and{" "}
        <span className="font-medium">verified</span> to show them publicly.
      </div>
    </div>
  );
}
