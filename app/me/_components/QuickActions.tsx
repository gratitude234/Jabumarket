"use client";

import Link from "next/link";
import { BookOpen, ChevronRight, FileText, LayoutDashboard, ShieldCheck, Store } from "lucide-react";
import type { RoleFlags } from "./types";

export default function QuickActions({ roles }: { roles: RoleFlags }) {
  const cards = [
    {
      href: roles.isVendor ? "/my-listings" : "/market",
      icon: <LayoutDashboard className="h-4 w-4" />,
      title: roles.isVendor ? "My Listings" : "Explore Market",
      desc: roles.isVendor ? "Manage your products" : "Browse products & vendors",
    },
    roles.isStudyContributor
      ? { href: "/study/materials/upload", icon: <FileText className="h-4 w-4" />, title: "Upload Material", desc: "Add course files" }
      : { href: "/study", icon: <BookOpen className="h-4 w-4" />, title: "Study", desc: "Materials & practice" },
    roles.isStudyContributor
      ? { href: "/study/materials/my", icon: <BookOpen className="h-4 w-4" />, title: "My Uploads", desc: "Track approval status" }
      : roles.studyStatus && roles.studyStatus !== "not_applied"
      ? {
          href: "/study/apply-rep",
          icon: <ShieldCheck className="h-4 w-4" />,
          title: "My Application",
          desc: roles.studyStatus === "pending" ? "Waiting for review" : "See rejection reason",
        }
      : { href: "/study/apply-rep", icon: <ShieldCheck className="h-4 w-4" />, title: "Become a Rep", desc: "Apply for upload access" },
    roles.isVendor
      ? { href: "/me?tab=verification", icon: <Store className="h-4 w-4" />, title: "Verification", desc: "Upload docs & request" }
      : { href: "/support", icon: <ChevronRight className="h-4 w-4" />, title: "Help & Support", desc: "Get assistance fast" },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <Link key={c.title} href={c.href} className="rounded-2xl border bg-white p-3 shadow-sm transition hover:bg-zinc-50">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl border bg-white p-2">{c.icon}</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900">{c.title}</div>
              <div className="mt-0.5 text-xs text-zinc-600">{c.desc}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}