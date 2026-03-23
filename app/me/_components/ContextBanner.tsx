"use client";

import Link from "next/link";
import type { RoleFlags, StudyMeResponse, Vendor } from "./types";

export default function ContextBanner({
  roles,
  vendor,
}: {
  roles: RoleFlags;
  vendor: Vendor | null;
}) {
  // Priority order: verification state → study state → sell CTA
  if (roles.isVendor && !roles.isVerifiedVendor) {
    const status = vendor?.verification_status;

    if (status === "under_review" || status === "requested") {
      return (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 text-lg leading-none">⏳</span>
          <div>
            <p className="text-sm font-semibold text-amber-900">Verification {status === "under_review" ? "under review" : "requested"}</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Admins are reviewing your documents. You'll be notified once a decision is made.
            </p>
          </div>
        </div>
      );
    }

    if (status === "rejected") {
      return (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <span className="mt-0.5 text-lg leading-none">❌</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-900">Verification rejected</p>
            <p className="text-xs text-rose-700 mt-0.5">
              {vendor?.rejection_reason ?? "Check the Verification tab for the reason and resubmit."}
            </p>
          </div>
          <Link
            href="/me?tab=verification"
            className="shrink-0 self-center rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
          >
            Retry →
          </Link>
        </div>
      );
    }

    // unverified, no request yet
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <span className="mt-0.5 text-lg leading-none">🛡️</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-900">Get your store verified</p>
          <p className="text-xs text-zinc-500 mt-0.5">Verified vendors earn more trust and visibility from buyers.</p>
        </div>
        <Link
          href="/me?tab=verification"
          className="shrink-0 self-center rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
        >
          Start →
        </Link>
      </div>
    );
  }

  if (roles.isVendor && roles.isVerifiedVendor) {
    // Verified but missing bank details (non-food only)
    if (vendor?.vendor_type !== "food" && !vendor?.bank_account_number) {
      return (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 text-lg leading-none">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Bank details missing</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Buyers cannot finalize deals until you add your bank account number.
            </p>
          </div>
          <Link
            href="/vendor/setup"
            className="shrink-0 self-center rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
          >
            Add now →
          </Link>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="text-lg leading-none">✅</span>
        <p className="text-sm font-semibold text-emerald-900">Your store is verified — customers can trust you!</p>
      </div>
    );
  }

  // Bank details warning for unverified non-food vendors (no active verification in progress)
  if (
    roles.isVendor &&
    vendor?.vendor_type !== "food" &&
    !vendor?.bank_account_number &&
    vendor?.verification_status !== "under_review" &&
    vendor?.verification_status !== "requested" &&
    vendor?.verification_status !== "rejected"
  ) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <span className="mt-0.5 text-lg leading-none">⚠️</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">Bank details missing</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Buyers cannot finalize deals until you add your bank account number.
          </p>
        </div>
        <Link
          href="/vendor/setup"
          className="shrink-0 self-center rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
        >
          Add now →
        </Link>
      </div>
    );
  }

  if (!roles.studyLoading && roles.studyStatus === "pending") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
        <span className="mt-0.5 text-lg leading-none">📚</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-blue-900">Study rep application pending</p>
          <p className="text-xs text-blue-700 mt-0.5">Your application is being reviewed by admins.</p>
        </div>
        <Link
          href="/study/apply-rep"
          className="shrink-0 self-center rounded-xl bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
        >
          View →
        </Link>
      </div>
    );
  }

  if (!roles.isVendor) {
    return (
      <div className="space-y-2">
        {/* Marketplace sell CTA */}
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <span className="mt-0.5 text-lg leading-none">🏪</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-zinc-900">Start selling on JABU Market</p>
            <p className="text-xs text-zinc-500 mt-0.5">Post listings and reach buyers on campus.</p>
          </div>
          <Link
            href="/vendor/create"
            className="shrink-0 self-center rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            Sell now →
          </Link>
        </div>
        {/* Food vendor CTA — separate path */}
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <span className="mt-0.5 text-lg leading-none">🍽</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-zinc-900">Run a canteen or food stall?</p>
            <p className="text-xs text-zinc-500 mt-0.5">Take structured orders — no missed WhatsApp messages.</p>
          </div>
          <Link
            href="/vendor/register"
            className="shrink-0 self-center rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            Register →
          </Link>
        </div>
      </div>
    );
  }

  return null;
}