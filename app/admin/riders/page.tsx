"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RiderRow } from "@/lib/types";
import Link from "next/link";

type AdminRider = RiderRow;

export default function AdminRidersPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = riders;

    if (tab === "pending") {
      list = list.filter((r) => !r.verified);
    }

    if (!query) return list;

    return list.filter((r) => {
      const name = (r.name ?? "").toLowerCase();
      const phone = (r.phone ?? "").toLowerCase();
      const wa = (r.whatsapp ?? "").toLowerCase();
      const zone = (r.zone ?? "").toLowerCase();
      const fee = (r.fee_note ?? "").toLowerCase();
      return (
        name.includes(query) ||
        phone.includes(query) ||
        wa.includes(query) ||
        zone.includes(query) ||
        fee.includes(query)
      );
    });
  }, [riders, tab, q]);

  async function checkAdminAndLoad() {
    setLoading(true);
    setMsg(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setIsAdmin(false);
      setUserEmail(null);
      setRiders([]);
      setLoading(false);
      return;
    }

    setUserEmail(user.email ?? null);

    // Check admins table (same pattern as vendors admin page)
    const { data: adminRow, error: adminErr } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminErr || !adminRow) {
      setIsAdmin(false);
      setRiders([]);
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    const { data, error } = await supabase
      .from("riders")
      .select("id, name, phone, whatsapp, zone, fee_note, is_available, verified, created_at")
      .order("verified", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setRiders([]);
    } else {
      setRiders((data ?? []) as AdminRider[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    checkAdminAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setVerified(riderId: string, next: boolean) {
    setMsg(null);

    const { error } = await supabase
      .from("riders")
      .update({ verified: next })
      .eq("id", riderId);

    if (error) {
      setMsg(error.message);
      return;
    }

    setRiders((prev) =>
      prev.map((r) => (r.id === riderId ? { ...r, verified: next } : r))
    );
  }

  async function setAvailability(riderId: string, next: boolean) {
    setMsg(null);

    const { error } = await supabase
      .from("riders")
      .update({ is_available: next })
      .eq("id", riderId);

    if (error) {
      setMsg(error.message);
      return;
    }

    setRiders((prev) =>
      prev.map((r) => (r.id === riderId ? { ...r, is_available: next } : r))
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold">Admin • Riders</h1>
        <p className="text-sm text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold">Admin • Riders</h1>
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
        <h1 className="text-xl font-semibold">Admin • Riders</h1>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-sm font-medium">Access denied</p>
          <p className="text-sm text-zinc-600 mt-1">
            Your account isn’t an admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Admin • Riders</h1>
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
                tab === "pending" ? "bg-black text-white border-black" : "hover:bg-zinc-50",
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
            placeholder="Search riders…"
            className="h-10 rounded-xl border px-3 text-sm outline-none"
          />
        </div>

        <div className="text-xs text-zinc-500">
          {filtered.length} rider{filtered.length === 1 ? "" : "s"} shown
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
            No riders found.
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Phone: +{r.phone}
                    {r.whatsapp ? ` • WhatsApp: +${r.whatsapp}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Zone: {r.zone ?? "—"} • Availability:{" "}
                    {r.is_available ? "Available" : "Busy"}
                  </div>
                  {r.fee_note ? (
                    <div className="mt-1 text-xs text-zinc-600">{r.fee_note}</div>
                  ) : null}
                  <div className="mt-1 text-[11px] text-zinc-400">
                    Applied:{" "}
                    {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span
                    className={[
                      "rounded-full px-2 py-1 text-[10px]",
                      r.verified ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700",
                    ].join(" ")}
                  >
                    {r.verified ? "Verified" : "Not verified"}
                  </span>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setVerified(r.id, !r.verified)}
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      {r.verified ? "Unverify" : "Verify"}
                    </button>

                    <button
                      onClick={() => setAvailability(r.id, !r.is_available)}
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      {r.is_available ? "Set Busy" : "Set Available"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
        Tip: Share this link with riders to apply:{" "}
        <span className="font-medium">/rider/apply</span>
      </div>
    </div>
  );
}
