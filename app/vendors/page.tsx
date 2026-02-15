import Link from "next/link";
import { supabase } from "@/lib/supabase/server";

type VendorRow = {
  id: string;
  name: string | null;
  whatsapp: string | null;
  phone: string | null;
  location: string | null;
  verified: boolean;
  vendor_type: "food" | "mall" | "student" | "other";
};

const LABELS: Record<VendorRow["vendor_type"], string> = {
  food: "Food Vendors",
  mall: "JABU Mall Shops",
  student: "Verified Students",
  other: "Other Vendors",
};

export default async function VendorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const sp = (searchParams ? await searchParams : {}) as { q?: string };
  const q = (sp.q ?? "").trim();

  // Public: verified only (your RLS already enforces this)
  let query = supabase
    .from("vendors")
    .select("id, name, whatsapp, phone, location, verified, vendor_type")
    .order("vendor_type", { ascending: true })
    .order("name", { ascending: true });

  if (q) {
    query = query.or(
      `name.ilike.%${q}%,location.ilike.%${q}%,vendor_type.ilike.%${q}%`
    );
  }

  const { data } = await query;
  const vendors = (data ?? []) as VendorRow[];

  const groups: Record<VendorRow["vendor_type"], VendorRow[]> = {
    food: [],
    mall: [],
    student: [],
    other: [],
  };

  for (const v of vendors) groups[v.vendor_type]?.push(v);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Vendors</h1>
          <p className="text-sm text-zinc-600">
            {vendors.length} result{vendors.length === 1 ? "" : "s"}
            {q ? (
              <>
                {" "}for <span className="font-medium text-zinc-900">“{q}”</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {(Object.keys(groups) as VendorRow["vendor_type"][]).map((type) => {
          const list = groups[type];
          if (!list.length) return null;

          return (
            <section key={type} className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-800">{LABELS[type]}</h2>

              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((v) => (
                  <Link
                    key={v.id}
                    href={`/vendors/${v.id}`}
                    className="rounded-2xl border bg-white p-4 no-underline hover:bg-zinc-50"
                  >
                    <p className="font-medium text-zinc-900">{v.name ?? "Vendor"}</p>
                    <p className="text-sm text-zinc-600">
                      {v.location ?? "—"}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">
                      WhatsApp: +{v.whatsapp ?? "—"}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
