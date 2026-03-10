"use client";

import Link from "next/link";
import { BadgeCheck, BookOpen, Settings, ShieldCheck, Store, User } from "lucide-react";
import type { RoleFlags } from "./types";
import { cn, pillTone, avatarGradient } from "./utils";

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border bg-zinc-50 px-4 py-2.5 min-w-[60px]">
      <span className="text-base font-bold text-zinc-900 tabular-nums">{value}</span>
      <span className="text-[11px] text-zinc-500 font-medium">{label}</span>
    </div>
  );
}

export default function HeaderCard(props: {
  name: string;
  sub: string;
  avatarText: string;
  roles: RoleFlags;
  vendorName: string | null;
  listingsCount?: number;
  materialsCount?: number;
}) {
  const { roles } = props;
  const grad = avatarGradient(props.name);

  return (
    <div className="rounded-2xl border bg-white shadow-sm px-4 py-5">
      {/* Top row: avatar + settings */}
      <div className="flex items-center justify-between mb-4">
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center text-lg font-bold text-white select-none shrink-0"
          style={{ background: grad }}
        >
          {props.avatarText}
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Link>
      </div>

      {/* Name + email */}
      <h1 className="text-lg font-bold text-zinc-900 leading-tight">{props.name}</h1>
      <p className="text-sm text-zinc-400 mt-0.5 truncate">{props.sub}</p>

      {/* Role badges */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {roles.isVendor ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", pillTone("base"))}>
            <Store className="h-3 w-3" /> Vendor
          </span>
        ) : (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", pillTone("base"))}>
            <User className="h-3 w-3" /> Student
          </span>
        )}

        {roles.isVerifiedVendor && (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", pillTone("good"))}>
            <BadgeCheck className="h-3 w-3" /> Verified
          </span>
        )}

        {roles.isVendor && !roles.isVerifiedVendor && (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", pillTone("warn"))}>
            <ShieldCheck className="h-3 w-3" /> Not verified
          </span>
        )}

        {!roles.studyLoading && roles.isStudyContributor && (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", pillTone("good"))}>
            <BookOpen className="h-3 w-3" />
            {roles.studyRole === "dept_librarian" ? "Dept Librarian" : "Course Rep"}
          </span>
        )}

        {!roles.studyLoading && !roles.isStudyContributor && roles.studyStatus === "pending" && (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", pillTone("warn"))}>
            <BookOpen className="h-3 w-3" /> Rep pending
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex gap-2 mt-4">
        <StatPill label="Listings" value={props.listingsCount ?? 0} />
        <StatPill label="Materials" value={props.materialsCount ?? 0} />
        {roles.isVendor && props.vendorName ? (
          <div className="flex flex-col justify-center rounded-xl border bg-zinc-50 px-4 py-2.5 min-w-0 flex-1 overflow-hidden">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Store</span>
            <span className="text-sm font-bold text-zinc-900 truncate">{props.vendorName}</span>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-2.5">
            <span className="text-xs text-zinc-400">No store yet</span>
          </div>
        )}
      </div>
    </div>
  );
}