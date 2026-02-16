"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { CourierRow } from "@/lib/types";

type AdminCourier = CourierRow;

export default function AdminCouriersPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [couriers, setCouriers] = useState<AdminCourier[]>([]);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = couriers;

    if (tab === "pending") {
      list = list.filter((c) => !c.verified);
    }

    if (!query) return list;

    return list.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      const phone = (c.phone ?? "").toLowerCase();
      const wa = (c.whatsapp ?? "").toLowerCase();
      const base = (c.base_location ?? "").toLowerCase();
      const areas = (c.areas_covered ?? "").toLowerCase();
      const hours = (c.hours ?? "").toLowerCase();
      const price = (c.price_note ?? "").toLowerCase();

      return (
        name.includes(query) ||
        phone.includes(query) ||
        wa.includes(query) ||
        base.includes(query) ||
        areas.includes(query) ||
        hours.includes(query) ||
        price.includes(query)
      );
    });
  }, [couriers, tab, q]);

  async function checkAdminAndLoad() {
    setLoading(true);
    setMsg(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setIsAdmin(false);
      setUserEmail(null);
      setCouriers([]);
      setLoading(false);
      return;
    }

    setUserEmail(user.email ?? null);

    // Same admin gate as other admin pages
    const { data: adminRow, error: adminErr } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminErr || !adminRow) {
      setIsAdmin(false);
      setCouriers([]);
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    const { data, error } = await supabase
      .from("couriers")
      .select(
        "id,name,whatsapp,phone,base_location,areas_covered,hours,price_note,verified,active,featured,created_at"
      )
      .order("verified", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setCouriers([]);
    } else {
      setCouriers((data ?? []) as AdminCourier[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    checkAdminAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patchCourier(courierId: string, patch: Partial<AdminCourier>) {
    setMsg(null);

    const { error } = await supabase.from("couriers").update(patch).eq("id", courierId);

    if (error) {
      setMsg(error.message);
      return;
    }

    setCouriers((prev) => prev.map((c) => (c.id === courierId ? { ...c, ...patch } : c)));
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold">Admin • Couriers</h1>
        <p className="text-sm text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold">Admin • Couriers</h1>
        <p className="text-sm text-zinc-600">You must be logged in.</p>
        <Link
          href="/login"
          className="inline-block rounded-xl bg-black px-4 py-2 text-sm text-white no-underline"
        >
          Go to login
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold">Admin • Couriers</h1>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-sm font-medium">Access denied</p>
          <p className="text-sm text-zinc-600 mt-1">Your account isn’t an admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Admin • Couriers</h1>
          <p className="text-sm text-zinc-600">
            Signed in as <span className="font-medium">{userEmail}</span>
          </p>
        </div>

        <button
          onClick={checkAdminAndLoad}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>

      {msg ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {msg}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setTab("pending")}
              className={[
                "rounded-xl px-3 py-2 text-sm border",
                tab === "pending"
                  ? "bg-black text-white border-black"
                  : "hover:bg-zinc-50",
              ].join(" ")}
            >
              Pending
            </button>
            <button
              onClick={() => setTab("all")}
              className={[
                "rounded-xl px-3 py-2 text-sm border",
                tab === "all" ? "bg-black text-white border-black" : "hover:bg-zinc-50",
              ].join(" ")}
            >
              All
            </button>
          </div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search couriers…"
            className="h-10 rounded-xl border px-3 text-sm outline-none"
          />
        </div>

        <div className="text-xs text-zinc-500">
          {filtered.length} courier{filtered.length === 1 ? "" : "s"} shown
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
            No couriers found.
          </div>
        ) : (
          filtered.map((c) => (
            <div key={c.id} className="rounded-2xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    WhatsApp: +{c.whatsapp}
                    {c.phone ? ` • Phone: +${c.phone}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Base: {c.base_location ?? "—"} • Covers: {c.areas_covered ?? "—"}
                  </div>
                  {c.price_note ? (
                    <div className="mt-1 text-xs text-zinc-600">{c.price_note}</div>
                  ) : null}
                  <div className="mt-1 text-[11px] text-zinc-400">
                    Added: {c.created_at ? new Date(c.created_at).toLocaleString() : "—"}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[10px]",
                        c.verified ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {c.verified ? "Verified" : "Not verified"}
                    </span>
                    <span
                      className={[
                        "rounded-full px-2 py-1 text-[10px]",
                        c.active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {c.active ? "Active" : "Inactive"}
                    </span>
                    {c.featured ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] text-amber-900">
                        Featured
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => patchCourier(c.id, { verified: !c.verified })}
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      {c.verified ? "Unverify" : "Verify"}
                    </button>

                    <button
                      onClick={() => patchCourier(c.id, { active: !c.active })}
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      {c.active ? "Deactivate" : "Activate"}
                    </button>

                    <button
                      onClick={() => patchCourier(c.id, { featured: !c.featured })}
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      {c.featured ? "Unfeature" : "Feature"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
        Tip: To show a courier publicly on <span className="font-medium">/couriers</span>, they must be
        <span className="font-medium"> verified</span> and <span className="font-medium">active</span>.
      </div>
    </div>
  );
}
