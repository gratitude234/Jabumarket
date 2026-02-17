// app/admin/vendors/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { VendorRow, VendorType } from "@/lib/types";
import {
  CheckCircle2,
  Loader2,
  Search,
  X,
  RefreshCcw,
  AlertTriangle,
  Store,
  MapPin,
} from "lucide-react";

type AdminVendor = {
  id: string;
  name: string | null;
  whatsapp: string | null;
  phone: string | null;
  location: string | null;
  verified: boolean | null;
  vendor_type: VendorType | null;
  created_at?: string | null;
};

type Banner = { type: "success" | "error" | "info"; text: string } | null;

const PAGE_SIZE = 25;

const TYPE_LABEL: Record<VendorType, string> = {
  food: "Food",
  mall: "Mall",
  student: "Student",
  other: "Other",
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normalizePhone(input?: string | null) {
  if (!input) return "";
  return input.replace(/[^\d+]/g, "").trim();
}

function BannerView({ banner, onClose }: { banner: Banner; onClose: () => void }) {
  if (!banner) return null;

  const cls =
    banner.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : banner.type === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-zinc-200 bg-zinc-50 text-zinc-800";

  return (
    <div
      className={cn("rounded-2xl border p-3 text-sm flex items-start justify-between gap-3", cls)}
      role="status"
    >
      <span>{banner.text}</span>
      <button
        onClick={onClose}
        className="rounded-xl border bg-white/70 p-2 hover:bg-white"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function StatusPill({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
      <AlertTriangle className="h-3.5 w-3.5" />
      Pending
    </span>
  );
}

export default function AdminVendorsPage() {
  const mounted = useRef(true);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AdminVendor[]>([]);
  const [banner, setBanner] = useState<Banner>(null);

  const [q, setQ] = useState("");
  // "requests" = vendors who explicitly clicked "Request verification" in /me
  // "pending"  = all unverified vendors (includes new signups who haven't requested yet)
  const [tab, setTab] = useState<"requests" | "pending" | "verified" | "all">("requests");
  const [type, setType] = useState<"all" | VendorType>("all");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const [workingIds, setWorkingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function fetchPage(nextPage = page) {
    setLoading(true);
    setBanner(null);

    const from = (nextPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // NOTE:
    // - "created_at" is optional: if your table doesn't have it, remove it from select/order.
    let query = supabase
      .from("vendors")
      .select("id, name, whatsapp, phone, location, verified, vendor_type, created_at", { count: "exact" });

    if (tab === "requests") query = query.eq("verification_requested", true).eq("verified", false);
    if (tab === "pending") query = query.eq("verified", false);
    if (tab === "verified") query = query.eq("verified", true);

    if (type !== "all") query = query.eq("vendor_type", type);

    const needle = q.trim();
    if (needle) {
      query = query.or(
        `name.ilike.%${needle}%,location.ilike.%${needle}%,phone.ilike.%${needle}%,whatsapp.ilike.%${needle}%`
      );
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!mounted.current) return;

    if (error) {
      // If your vendors table DOESN'T have created_at, this is the most likely error.
      // Fix: remove created_at from select() and order().
      setBanner({ type: "error", text: error.message });
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setRows((data ?? []) as AdminVendor[]);
    setTotal(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    fetchPage(1);
    setPage(1);
    setSelected({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, type]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      fetchPage(1);
      setPage(1);
      setSelected({});
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function toggleAll(checked: boolean) {
    if (!checked) return setSelected({});
    const next: Record<string, boolean> = {};
    rows.forEach((r) => (next[r.id] = true));
    setSelected(next);
  }

  async function bulkUpdate(ids: string[], patch: Partial<AdminVendor>, successText: string) {
    if (!ids.length) return;
    setBanner(null);

    const nextWorking: Record<string, boolean> = {};
    ids.forEach((id) => (nextWorking[id] = true));
    setWorkingIds((p) => ({ ...p, ...nextWorking }));

    try {
      const { error } = await supabase.from("vendors").update(patch).in("id", ids);
      if (error) throw error;
      setBanner({ type: "success", text: successText });
      setSelected({});
      await fetchPage(page);
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message ?? "Update failed" });
    } finally {
      setWorkingIds((prev) => {
        const copy = { ...prev };
        ids.forEach((id) => delete copy[id]);
        return copy;
      });
    }
  }

  async function singleUpdate(id: string, patch: Partial<AdminVendor>, successText: string) {
    setBanner(null);
    setWorkingIds((p) => ({ ...p, [id]: true }));
    try {
      const { error } = await supabase.from("vendors").update(patch).eq("id", id);
      if (error) throw error;
      setBanner({ type: "success", text: successText });
      await fetchPage(page);
    } catch (e: any) {
      setBanner({ type: "error", text: e?.message ?? "Update failed" });
    } finally {
      setWorkingIds((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const anySelected = selectedIds.length > 0;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-zinc-900">Vendors</p>
            <p className="mt-1 text-sm text-zinc-600">
              Approve verification requests. New signups are also <span className="font-semibold">Pending</span> until verified.
            </p>
          </div>

          <button
            onClick={() => fetchPage(page)}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_220px]">
          <div className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name / location / phone / WhatsApp…"
              className="w-full bg-transparent text-sm outline-none"
            />
            {q ? (
              <button
                onClick={() => setQ("")}
                className="rounded-xl border bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Clear
              </button>
            ) : null}
          </div>

          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="rounded-2xl border bg-white px-3 py-2.5 text-sm font-semibold text-zinc-900 outline-none"
          >
            <option value="all">All types</option>
            <option value="food">Food</option>
            <option value="mall">Mall</option>
            <option value="student">Student</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-2xl border bg-white p-1">
            {(["requests", "pending", "verified", "all"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-sm font-semibold transition",
                  tab === k ? "bg-black text-white" : "text-zinc-800 hover:bg-zinc-50"
                )}
              >
                {k === "requests"
                  ? "Requests"
                  : k === "pending"
                  ? "Pending"
                  : k === "verified"
                  ? "Verified"
                  : "All"}
              </button>
            ))}
          </div>

          <div className="text-sm text-zinc-600">
            {loading ? "Loading…" : `${total} vendor${total === 1 ? "" : "s"}`}
          </div>
        </div>

        <div className="mt-3">
          <BannerView banner={banner} onClose={() => setBanner(null)} />
        </div>

        {/* Bulk actions */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">
            {anySelected ? (
              <span className="font-semibold text-zinc-900">{selectedIds.length} selected</span>
            ) : (
              <span>Select vendors to bulk verify/unverify.</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => bulkUpdate(selectedIds, { verified: true }, "Vendors verified.")}
              disabled={!anySelected || loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              Verify selected
            </button>

            <button
              onClick={() => bulkUpdate(selectedIds, { verified: false }, "Vendors moved to pending.")}
              disabled={!anySelected || loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              <AlertTriangle className="h-4 w-4" />
              Mark pending
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="w-[48px] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((r) => selected[r.id])}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300"
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10">
                    <div className="flex items-center justify-center gap-2 text-zinc-600">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading vendors…
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10">
                    <div className="text-center">
                      <p className="text-sm font-semibold text-zinc-900">No vendors found</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        Try switching tabs, clearing search, or changing the type filter.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((v) => {
                  const name = (v.name ?? "Unnamed vendor").trim();
                  const verified = Boolean(v.verified);

                  const phone = normalizePhone(v.phone);
                  const wa = normalizePhone(v.whatsapp);

                  const isWorking = Boolean(workingIds[v.id]);

                  return (
                    <tr key={v.id} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-4 align-top">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[v.id])}
                          onChange={(e) => setSelected((p) => ({ ...p, [v.id]: e.target.checked }))}
                          className="h-4 w-4 rounded border-zinc-300"
                          aria-label={`Select ${name}`}
                        />
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border bg-white">
                            <Store className="h-4 w-4 text-zinc-700" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-zinc-900">{name}</div>
                            <div className="mt-0.5 text-xs text-zinc-500">ID: {v.id}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <span className="inline-flex rounded-full border bg-white px-2 py-1 text-xs font-semibold text-zinc-800">
                          {v.vendor_type ? TYPE_LABEL[v.vendor_type] : "—"}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        {v.location ? (
                          <div className="flex items-start gap-2 text-zinc-800">
                            <MapPin className="mt-0.5 h-4 w-4 text-zinc-500" />
                            <span className="line-clamp-2">{v.location}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="space-y-1 text-xs text-zinc-700">
                          <div>
                            <span className="text-zinc-500">Phone:</span> {phone || "—"}
                          </div>
                          <div>
                            <span className="text-zinc-500">WhatsApp:</span> {wa || "—"}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <StatusPill verified={verified} />
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/vendors/${v.id}`}
                            className="rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                          >
                            View
                          </Link>

                          {verified ? (
                            <button
                              onClick={() => singleUpdate(v.id, { verified: false }, "Vendor marked as pending.")}
                              disabled={isWorking}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                            >
                              {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                              Pending
                            </button>
                          ) : (
                            <button
                              onClick={() => singleUpdate(v.id, { verified: true }, "Vendor verified.")}
                              disabled={isWorking}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                            >
                              {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              Verify
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col gap-2 border-t bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-600">
            Page <span className="font-semibold text-zinc-900">{page}</span> of{" "}
            <span className="font-semibold text-zinc-900">{pages}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = Math.max(1, page - 1);
                setPage(next);
                setSelected({});
                fetchPage(next);
              }}
              disabled={loading || page <= 1}
              className="rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              Prev
            </button>
            <button
              onClick={() => {
                const next = Math.min(pages, page + 1);
                setPage(next);
                setSelected({});
                fetchPage(next);
              }}
              disabled={loading || page >= pages}
              className="rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Reminder */}
      <div className="rounded-3xl border bg-white p-4 text-sm text-zinc-600 shadow-sm">
        If you still can’t see pending vendors after this update, it’s your RLS SELECT policy.
        You need: <span className="font-semibold">Admins can SELECT all vendors</span> (using your{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5">public.admins</code> table).
      </div>
    </div>
  );
}
