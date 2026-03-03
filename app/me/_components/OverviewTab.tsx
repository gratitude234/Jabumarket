"use client";

import Link from "next/link";
import type { RoleFlags, StudyMeResponse, Vendor } from "./types";

export default function OverviewTab({
  roles,
  vendor,
  study,
}: {
  roles: RoleFlags;
  vendor: Vendor | null;
  study: StudyMeResponse | null;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border p-3">
        <div className="text-sm font-semibold text-zinc-900">What you can do here</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
          <li>Manage your profile details</li>
          <li>Track vendor verification (if you sell)</li>
          <li>Track Study contributor status and uploads</li>
        </ul>
      </div>

      <div className="rounded-2xl border p-3">
        <div className="text-sm font-semibold text-zinc-900">JABU Study</div>

        {roles.studyLoading ? (
          <p className="mt-1 text-sm text-zinc-700">Loading your contributor status…</p>
        ) : study && "ok" in study && study.ok ? (
          <div className="mt-2 text-sm text-zinc-800">
            <div>
              <span className="text-zinc-500">Status:</span> <span className="font-semibold">{study.status}</span>
            </div>
            <div className="mt-1">
              <span className="text-zinc-500">Role:</span> <span className="font-semibold">{study.role ?? "—"}</span>
            </div>

            {study.status === "approved" ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/study/materials/upload" className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
                  Upload material
                </Link>
                <Link href="/study/materials/my" className="inline-flex items-center justify-center rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
                  My uploads
                </Link>
              </div>
            ) : (
              <div className="mt-3">
                <Link href="/study/apply-rep" className="inline-flex w-full items-center justify-center rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
                  Manage application
                </Link>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-700">Couldn’t load your study contributor status right now.</p>
        )}
      </div>

      {roles.isVendor ? (
        <div className="rounded-2xl border p-3">
          <div className="text-sm font-semibold text-zinc-900">JabuMarket</div>
          <p className="mt-1 text-sm text-zinc-700">
            Store: <span className="font-medium">{vendor?.name ?? "—"}</span>
          </p>
          <p className="mt-1 text-sm text-zinc-700">
            Verification: <span className="font-medium">{vendor?.verified ? "Verified" : "Not verified"}</span>
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border p-3">
          <div className="text-sm font-semibold text-zinc-900">Want to sell on JabuMarket?</div>
          <p className="mt-1 text-sm text-zinc-700">Create a vendor profile and start posting listings.</p>
          <Link href="/post" className="mt-3 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
            Become a vendor
          </Link>
        </div>
      )}
    </div>
  );
}