"use client";

import { LogOut } from "lucide-react";
import type { Me } from "./types";

export default function AccountTab({ me, onSignOut }: { me: Me | null; onSignOut: () => Promise<void> }) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border p-3">
        <div className="text-sm font-semibold text-zinc-900">Account</div>
        <p className="mt-1 text-sm text-zinc-700">
          Email: <span className="font-medium">{me?.email ?? "—"}</span>
        </p>
      </div>

      <button
        onClick={onSignOut}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-3 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </div>
  );
}