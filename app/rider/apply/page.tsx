"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const ZONES = ["Campus", "Male Hostels", "Female Hostels", "Town"];

function normalizePhone(input: string) {
  // Keep digits only
  const digits = input.replace(/[^\d]/g, "");
  // If user types 080..., you can later convert; for now keep digits
  return digits;
}

export default function RiderApplyPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [zone, setZone] = useState(ZONES[0]);
  const [feeNote, setFeeNote] = useState("");
  const [loading, setLoading] = useState(false);

  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && normalizePhone(phone).length >= 10;
  }, [name, phone]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setOk(null);
    setErr(null);

    if (!canSubmit) {
      setErr("Please enter your name and a valid phone number.");
      return;
    }

    setLoading(true);

    const payload = {
      name: name.trim(),
      phone: normalizePhone(phone),
      whatsapp: whatsapp.trim() ? normalizePhone(whatsapp) : null,
      zone: zone ?? null,
      fee_note: feeNote.trim() ? feeNote.trim() : null,
      // verified stays false by RLS policy
      // is_available defaults true
    };

    const { error } = await supabase.from("riders").insert(payload);

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setOk("Application submitted ✅. You'll appear after admin verification.");
    setName("");
    setPhone("");
    setWhatsapp("");
    setZone(ZONES[0]);
    setFeeNote("");
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/delivery" className="text-sm text-zinc-600 hover:text-black no-underline">
          ← Back to Delivery
        </Link>
        <span className="text-xs text-zinc-500">Rider Application</span>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <h1 className="text-xl font-semibold">Become a Dispatch Rider</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Fill this form. Admin will verify you before you show on the delivery list.
        </p>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {ok ? (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {ok}
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium">Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tobi A."
              className="mt-1 h-11 w-full rounded-xl border px-3 text-sm outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Phone number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              className="mt-1 h-11 w-full rounded-xl border px-3 text-sm outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">Use the number customers can call.</p>
          </div>

          <div>
            <label className="text-sm font-medium">WhatsApp number (optional)</label>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="If different from phone"
              className="mt-1 h-11 w-full rounded-xl border px-3 text-sm outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Coverage zone</label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border px-3 text-sm outline-none"
            >
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Delivery fee note (optional)</label>
            <input
              value={feeNote}
              onChange={(e) => setFeeNote(e.target.value)}
              placeholder='e.g. "₦300–₦600 depending distance"'
              className="mt-1 h-11 w-full rounded-xl border px-3 text-sm outline-none"
            />
          </div>

          <button
            disabled={loading || !canSubmit}
            className={[
              "w-full h-11 rounded-xl text-sm font-medium",
              loading || !canSubmit
                ? "bg-zinc-200 text-zinc-500"
                : "bg-black text-white hover:opacity-90",
            ].join(" ")}
          >
            {loading ? "Submitting..." : "Submit application"}
          </button>

          <p className="text-xs text-zinc-500">
            By applying, you agree to be contacted by buyers/vendors for delivery.
          </p>
        </form>
      </div>
    </div>
  );
}
