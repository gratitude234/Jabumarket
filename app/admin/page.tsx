// app/admin/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Bike, Store, Truck } from "lucide-react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function StatCard({
  title,
  value,
  subtitle,
  href,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="block rounded-3xl border bg-white p-4 shadow-sm hover:bg-zinc-50 no-underline">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-zinc-600">{title}</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl border bg-zinc-50">{icon}</div>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
        Open <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}

export default function AdminHomePage() {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({
    vendorsPending: 0,
    vendorsAll: 0,
    ridersPending: 0,
    ridersAll: 0,
    couriersPending: 0,
    couriersAll: 0,
  });

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);

      // Vendors
      const vAll = await supabase.from("vendors").select("id", { count: "exact", head: true });

      // Pending = requests waiting or under review (fallbacks to legacy columns if needed)
      let vPending = await supabase
        .from("vendor_verification_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["requested", "under_review"]);

      if (vPending.error) {
        vPending = await supabase
          .from("vendors")
          .select("id", { count: "exact", head: true })
          .eq("verification_requested", true)
          .eq("verified", false);
      }

      // Riders
      const rAll = await supabase.from("riders").select("id", { count: "exact", head: true });
      const rPending = await supabase.from("riders").select("id", { count: "exact", head: true }).eq("verified", false);

      // Couriers
      const cAll = await supabase.from("couriers").select("id", { count: "exact", head: true });
      const cPending = await supabase.from("couriers").select("id", { count: "exact", head: true }).eq("verified", false);

      if (!mounted) return;

      setCounts({
        vendorsPending: vPending.count ?? 0,
        vendorsAll: vAll.count ?? 0,
        ridersPending: rPending.count ?? 0,
        ridersAll: rAll.count ?? 0,
        couriersPending: cPending.count ?? 0,
        couriersAll: cAll.count ?? 0,
      });

      setLoading(false);
    }

    run();
    return () => {
      mounted = false;
    };
  }, []);

  const cards = useMemo(() => {
    return [
      {
        title: "Vendors",
        value: loading ? "…" : `${counts.vendorsPending}`,
        subtitle: loading ? "Pending requests" : `Pending • ${counts.vendorsAll} total`,
        href: "/admin/vendors",
        icon: <Store className="h-5 w-5 text-zinc-800" />,
      },
      {
        title: "Delivery Agents",
        value: loading ? "…" : `${counts.ridersPending}`,
        subtitle: loading ? "Pending verifications" : `Pending • ${counts.ridersAll} total`,
        href: "/admin/riders",
        icon: <Bike className="h-5 w-5 text-zinc-800" />,
      },
      {
        title: "Campus Transport",
        value: loading ? "…" : `${counts.couriersPending}`,
        subtitle: loading ? "Pending verifications" : `Pending • ${counts.couriersAll} total`,
        href: "/admin/couriers",
        icon: <Truck className="h-5 w-5 text-zinc-800" />,
      },
    ];
  }, [loading, counts]);

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
        <p className="text-lg font-semibold text-zinc-900">Admin dashboard</p>
        <p className="mt-1 text-sm text-zinc-600">Quick stats + shortcuts.</p>
      </div>

      <div className={cn("grid gap-3", "sm:grid-cols-2", "lg:grid-cols-3")}>
        {cards.map((c) => (
          <StatCard key={c.title} title={c.title} value={c.value} subtitle={c.subtitle} href={c.href} icon={c.icon} />
        ))}
      </div>
    </div>
  );
}
