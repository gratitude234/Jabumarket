"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ListingRow } from "@/lib/types";

type Tab = "active" | "sold" | "inactive";

function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

export default function MyListingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("active");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [listings, setListings] = useState<ListingRow[]>([]);

  async function load(currentTab: Tab) {
    setMsg(null);
    setLoading(true);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setMsg(userErr.message);
      setLoading(false);
      return;
    }

    const user = userData.user;
    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: vendor, error: vendorErr } = await supabase
      .from("vendors")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (vendorErr) {
      setMsg(vendorErr.message);
      setLoading(false);
      return;
    }

    setVendorId(vendor.id);

    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq("vendor_id", vendor.id)
      .eq("status", currentTab)
      .order("created_at", { ascending: false });

    if (error) setMsg(error.message);

    setListings((data ?? []) as ListingRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function markSold(id: string) {
    if (!vendorId) return;
    setMsg(null);

    const { error } = await supabase
      .from("listings")
      .update({ status: "sold" })
      .eq("id", id)
      .eq("vendor_id", vendorId);

    if (error) setMsg(error.message);
    else load(tab);
  }

  async function reactivate(id: string) {
    if (!vendorId) return;
    setMsg(null);

    const { error } = await supabase
      .from("listings")
      .update({ status: "active" })
      .eq("id", id)
      .eq("vendor_id", vendorId);

    if (error) setMsg(error.message);
    else load(tab);
  }

  async function remove(id: string) {
    if (!vendorId) return;
    const ok = window.confirm("Delete this listing permanently?");
    if (!ok) return;

    setMsg(null);

    const { error } = await supabase
      .from("listings")
      .delete()
      .eq("id", id)
      .eq("vendor_id", vendorId);

    if (error) setMsg(error.message);
    else load(tab);
  }

  const emptyText = useMemo(() => {
    if (tab === "active") return "No active listings yet.";
    if (tab === "sold") return "No sold listings yet.";
    return "No inactive listings yet.";
  }, [tab]);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My Listings</h1>
          <p className="text-sm text-zinc-600">Manage what you’ve posted.</p>
        </div>

        <Link
          href="/post"
          className="rounded-xl bg-black px-4 py-2 text-sm text-white no-underline"
        >
          Post Listing
        </Link>
      </div>

      {msg ? <div className="rounded-2xl border bg-white p-3 text-sm">{msg}</div> : null}

      <div className="flex flex-wrap gap-2">
        <TabBtn active={tab === "active"} onClick={() => setTab("active")}>
          Active
        </TabBtn>
        <TabBtn active={tab === "sold"} onClick={() => setTab("sold")}>
          Sold
        </TabBtn>
        <TabBtn active={tab === "inactive"} onClick={() => setTab("inactive")}>
          Inactive
        </TabBtn>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-600">Loading…</div>
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">{emptyText}</p>
          <p className="mt-1 text-sm text-zinc-600">Post a listing to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((l) => {
            const priceText =
              l.price !== null ? formatNaira(l.price) : l.price_label ?? "Contact for price";

            return (
              <div key={l.id} className="rounded-2xl border bg-white overflow-hidden">
                <div className="grid grid-cols-[96px_1fr] gap-3 p-3">
                  <div className="h-24 w-24 overflow-hidden rounded-xl bg-zinc-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={l.image_url ?? "https://placehold.co/1200x900?text=Jabumarket"}
                      alt={l.title}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/listing/${l.id}`} className="no-underline">
                          <p className="text-sm font-semibold text-zinc-900 line-clamp-2">
                            {l.title}
                          </p>
                        </Link>
                        <p className="mt-1 text-sm font-bold">{priceText}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {l.category} • {l.location ?? "—"}
                        </p>
                      </div>

                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                        {l.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/listing/${l.id}/edit`}
                        className="rounded-xl border px-3 py-2 text-xs no-underline hover:bg-zinc-50"
                      >
                        Edit
                      </Link>

                      {l.status === "active" ? (
                        <button
                          onClick={() => markSold(l.id)}
                          className="rounded-xl bg-black px-3 py-2 text-xs text-white"
                        >
                          Mark as Sold
                        </button>
                      ) : (
                        <button
                          onClick={() => reactivate(l.id)}
                          className="rounded-xl bg-black px-3 py-2 text-xs text-white"
                        >
                          Re-activate
                        </button>
                      )}

                      <button
                        onClick={() => remove(l.id)}
                        className="rounded-xl border px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-3 py-2 text-sm border",
        active ? "bg-black text-white border-black" : "bg-white text-zinc-700 hover:bg-zinc-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
