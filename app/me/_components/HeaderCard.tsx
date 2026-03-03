"use client";

import Link from "next/link";
import { BadgeCheck, BookOpen, Building2, Settings, ShieldCheck, Store, User } from "lucide-react";
import type { RoleFlags } from "./types";
import { cn, pillTone } from "./utils";

export default function HeaderCard(props: {
  name: string;
  sub: string;
  avatarText: string;
  roles: RoleFlags;
  vendorName: string | null;
}) {
  const { roles } = props;

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-lg font-semibold text-zinc-700">
          {props.avatarText}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-zinc-900">{props.name}</h1>

            {roles.isVendor ? (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", pillTone("base"))}>
                <Store className="h-3.5 w-3.5" />
                Vendor
              </span>
            ) : (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", pillTone("base"))}>
                <User className="h-3.5 w-3.5" />
                Student
              </span>
            )}

            {roles.studyLoading ? (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", pillTone("base"))}>
                <BookOpen className="h-3.5 w-3.5" />
                Study…
              </span>
            ) : roles.isStudyContributor ? (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", pillTone("good"))}>
                <BookOpen className="h-3.5 w-3.5" />
                {roles.studyRole === "dept_librarian" ? "Dept Librarian" : "Course Rep"}
              </span>
            ) : roles.studyStatus && roles.studyStatus !== "not_applied" ? (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", pillTone("warn"))}>
                <BookOpen className="h-3.5 w-3.5" />
                {roles.studyStatus === "pending" ? "Rep application: pending" : "Rep application: rejected"}
              </span>
            ) : null}

            {roles.isVerifiedVendor ? (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", pillTone("good"))}>
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified
              </span>
            ) : roles.isVendor ? (
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", pillTone("warn"))}>
                <ShieldCheck className="h-3.5 w-3.5" />
                Not verified
              </span>
            ) : null}
          </div>

          <p className="mt-1 truncate text-sm text-zinc-600">{props.sub}</p>

          {roles.isVendor && props.vendorName ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
              <Building2 className="h-3.5 w-3.5" />
              Store: <span className="font-medium text-zinc-700">{props.vendorName}</span>
            </p>
          ) : null}
        </div>

        <Link
          href="/settings"
          className="inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Link>
      </div>
    </div>
  );
}