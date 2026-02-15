// app/me/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type VendorType = "food" | "mall" | "student" | "other";

type Vendor = {
  id: string;
  name: string;
  whatsapp: string | null;
  phone: string | null;
  location: string | null;

  vendor_type: VendorType;
  verified: boolean;
  verification_requested: boolean;
};

function isNoRowError(err: any) {
  const msg = String(err?.message ?? "");
  const code = String(err?.code ?? "");
  return code === "PGRST116" || msg.toLowerCase().includes("0 rows");
}

function isAbortError(err: any) {
  const name = String(err?.name ?? "");
  const msg = String(err?.message ?? "");
  return name === "AbortError" || msg.toLowerCase().includes("aborted");
}

function defaultVendorNameFromEmail(email?: string | null) {
  if (!email) return "New Vendor";
  const prefix = email.split("@")[0]?.trim();
  return prefix ? prefix : "New Vendor";
}

function normalizePhone(s: string) {
  return s.replace(/[^\d]/g, "");
}

export default function MePage() {
  const router = useRouter();
  const aliveRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    if (!aliveRef.current) return;

    setMsg(null);
    setLoading(true);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const user = userData.user;

      if (!user) {
        setLoading(false);
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? null);

      // 1) Try to fetch vendor profile for this user
      const { data: v, error } = await supabase
        .from("vendors")
        .select(
          "id, name, whatsapp, phone, location, vendor_type, verified, verification_requested"
        )
        .eq("user_id", user.id)
        .single();

      // 2) If no vendor row exists, auto-create it
      if (error && isNoRowError(error)) {
        const name = defaultVendorNameFromEmail(user.email);

        const { data: created, error: createErr } = await supabase
          .from("vendors")
          .insert({
            user_id: user.id,
            name,
            whatsapp: null,
            phone: null,
            location: null,
            vendor_type: "student",
            verified: false,
            verification_requested: false,
          })
          .select(
            "id, name, whatsapp, phone, location, vendor_type, verified, verification_requested"
          )
          .single();

        if (createErr) throw createErr;

        setVendor(created as Vendor);
        return;
      }

      if (error) throw error;

      setVendor((v ?? null) as Vendor | null);
    } catch (err: any) {
      if (isAbortError(err)) return;

      console.error(err);
      if (aliveRef.current) {
        setMsg(err?.message ?? "Something went wrong.");
        setVendor(null);
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    aliveRef.current = true;

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      aliveRef.current = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile() {
    if (!vendor) return;
    setMsg(null);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return router.replace("/login");

    const { error } = await supabase
      .from("vendors")
      .update({
        name: vendor.name,
        whatsapp: vendor.whatsapp,
        phone: vendor.phone,
        location: vendor.location,
        vendor_type: vendor.vendor_type,
      })
      .eq("user_id", user.id);

    if (error) setMsg(error.message);
    else setMsg("Profile saved ✅");
  }

  async function requestVerification() {
    if (!vendor) return;
    setMsg(null);

    // ✅ require WhatsApp before requesting verification
    const phone = normalizePhone(vendor.whatsapp ?? "");
    if (!phone || phone.length < 7) {
      setMsg("Add your WhatsApp number before requesting verification.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return router.replace("/login");

    const { error } = await supabase
      .from("vendors")
      .update({ verification_requested: true })
      .eq("user_id", user.id);

    if (error) setMsg(error.message);
    else {
      setVendor({ ...vendor, verification_requested: true });
      setMsg("Verification request sent ✅");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (loading) return <div className="text-sm text-zinc-600">Loading…</div>;

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Me</h1>
          <p className="text-sm text-zinc-600">{email}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/my-listings")}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
          >
            My Listings
          </button>

          <button
            onClick={logout}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      {msg ? (
        <div className="rounded-2xl border bg-white p-3 text-sm">{msg}</div>
      ) : null}

      {vendor ? (
        <div className="rounded-2xl border bg-white p-4 space-y-4">
          <p className="text-sm font-semibold">Vendor profile</p>

          <div>
            <label className="text-xs text-zinc-600">Name</label>
            <input
              value={vendor.name}
              onChange={(e) => setVendor({ ...vendor, name: e.target.value })}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-zinc-600">WhatsApp</label>
              <input
                value={vendor.whatsapp ?? ""}
                onChange={(e) =>
                  setVendor({ ...vendor, whatsapp: e.target.value })
                }
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-600">Phone</label>
              <input
                value={vendor.phone ?? ""}
                onChange={(e) => setVendor({ ...vendor, phone: e.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-600">Location</label>
            <input
              value={vendor.location ?? ""}
              onChange={(e) =>
                setVendor({ ...vendor, location: e.target.value })
              }
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-600">Vendor type</label>
            <select
              value={vendor.vendor_type}
              onChange={(e) =>
                setVendor({
                  ...vendor,
                  vendor_type: e.target.value as VendorType,
                })
              }
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm bg-white"
            >
              <option value="student">Student</option>
              <option value="food">Food</option>
              <option value="mall">Mall</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="rounded-xl border bg-zinc-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">Verification</p>
              {vendor.verified ? (
                <span className="rounded-full bg-black px-2 py-1 text-xs text-white">
                  Verified
                </span>
              ) : (
                <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs text-zinc-700">
                  Not verified
                </span>
              )}
            </div>

            {!vendor.verified ? (
              <div className="mt-2">
                {vendor.verification_requested ? (
                  <p className="text-xs text-zinc-700">
                    Request pending. You’ll be verified after review.
                  </p>
                ) : (
                  <button
                    onClick={requestVerification}
                    className="rounded-xl bg-black px-3 py-2 text-xs text-white"
                  >
                    Request verification
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <button
            onClick={saveProfile}
            className="rounded-xl bg-black px-4 py-2 text-white text-sm"
          >
            Save
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
          No vendor profile found yet.
        </div>
      )}
    </div>
  );
}
