// app/admin/vendors/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { VendorRow } from "@/lib/types";
import Link from "next/link";

type AdminVendor = VendorRow & {
  id: string;
  verified?: boolean | null;
  location?: string | null;
  whatsapp?: string | null;
  vendor_type?: string | null;
  verification_requested?: boolean | null;
};

export default function AdminVendorsPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [vendors, setVendors] = useState<AdminVendor[]>([]);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = vendors;

    // ✅ Pending now means: requested AND not verified
    if (tab === "pending") {
      list = list.filter((v) => !v.verified && Boolean(v.verification_requested));
    }

    if (!query) return list;

    return list.filter((v) => {
      const name = (v.name ?? "").toLowerCase();
      const phone = (v.whatsapp ?? "").toLowerCase();
      const loc = (v.location ?? "").toLowerCase();
      const type = (v.vendor_type ?? "").toLowerCase();
      return (
        name.includes(query) ||
        phone.includes(query) ||
        loc.includes(query) ||
        type.includes(query)
      );
    });
  }, [vendors, tab, q]);

  async function checkAdminAndLoad() {
    setLoading(true);
    setMsg(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      setIsAdmin(false);
      setUserEmail(null);
      setVendors([]);
      setLoading(false);
      return;
    }

    setUserEmail(user.email ?? null);

    // Check admin table
    const { data: adminRow, error: adminErr } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminErr || !adminRow) {
      setIsAdmin(false);
      setVendors([]);
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    // Load vendors
    const { data, error } = await supabase
      .from("vendors")
      .select("id, name, whatsapp, location, verified, vendor_type, verification_requested")
      .order("verified", { ascending: true });

    if (error) {
      setMsg(error.message);
      setVendors([]);
    } else {
      setVendors((data ?? []) as AdminVendor[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    checkAdminAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setVerified(vendorId: string, next: boolean) {
    setMsg(null);

    // ✅ Verify clears request, unverify does NOT auto-request
    const payload = next
      ? { verified: true, verification_requested: false }
      : { verified: false };

    const { error } = await supabase.from("vendors").update(payload).eq("id", vendorId);

    if (error) {
      setMsg(error.message);
      return;
    }

    setVendors((prev) =>
      prev.map((v) =>
        v.id === vendorId
          ? {
              ...v,
              ...(next
                ? { verified: true, verification_requested: false }
                : { verified: false }),
            }
          : v
      )
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold">Admin • Vendor Verification</h1>
        <p className="text-sm text-zinc-600">Loading…</p>
      </div>
    );
  }

  // Not logged in
  if (!userEmail) {
    return (
      <div className="max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold">Admin • Vendor Verification</h1>
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

  // Logged in but not admin
  if (!isAdmin) {
    return (
      <div className="max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold">Admin • Vendor Verification</h1>
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
          <h1 className="text-xl font-semibold">Admin • Vendor Verification</h1>
          <p className="text-sm text-zinc-600">
            Signed in as <span className="font-medium">{userEmail}</span>
          </p>
        </div>

        <button
          onClick={checkAdminAndLoad}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>

      {msg ? (
        <div className="rounded-2xl border bg-white p-3 text-sm text-red-600">
          {msg}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTab("pending")}
            className={`rounded-full px-3 py-1 text-sm border ${
              tab === "pending"
                ? "bg-black text-white border-black"
                : "hover:bg-zinc-50"
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setTab("all")}
            className={`rounded-full px-3 py-1 text-sm border ${
              tab === "all" ? "bg-black text-white border-black" : "hover:bg-zinc-50"
            }`}
          >
            All
          </button>

          <div className="flex-1" />

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, WhatsApp, location…"
            className="w-full sm:w-72 rounded-xl border px-3 py-2 text-sm"
          />
        </div>

        <p className="text-xs text-zinc-500">
          Showing <span className="font-medium">{filtered.length}</span> vendors
        </p>
      </div>

      <div className="space-y-3">
        {filtered.map((v) => {
          const verified = Boolean(v.verified);

          return (
            <div key={v.id} className="rounded-2xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{v.name ?? "Unnamed vendor"}</p>
                    {verified ? (
                      <span className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] text-white">
                        Verified
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] text-zinc-700">
                        Not verified
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-zinc-600">
                    WhatsApp:{" "}
                    <span className="font-medium">+{v.whatsapp ?? "—"}</span>
                  </p>
                  <p className="text-sm text-zinc-600">
                    Location:{" "}
                    <span className="font-medium">{v.location ?? "—"}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    Type: {v.vendor_type ?? "—"} • Requested:{" "}
                    {v.verification_requested ? "Yes" : "No"}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {verified ? (
                    <button
                      onClick={() => setVerified(v.id, false)}
                      className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      Unverify
                    </button>
                  ) : (
                    <button
                      onClick={() => setVerified(v.id, true)}
                      className="rounded-xl bg-black px-3 py-2 text-sm text-white"
                    >
                      Verify
                    </button>
                  )}

                  <Link
                    href={`/vendors/${v.id}`}
                    className="rounded-xl border px-3 py-2 text-sm text-center no-underline hover:bg-zinc-50"
                    target="_blank"
                  >
                    View shop
                  </Link>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-zinc-600">
            No vendors found.
          </div>
        ) : null}
      </div>
    </div>
  );
}
