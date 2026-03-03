"use client";

import type { TabKey } from "./types";
import { cn } from "./utils";

export default function Tabs(props: { active: TabKey; onChange: (t: TabKey) => void }) {
  const items: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "profile", label: "Profile" },
    { key: "verification", label: "Verification" },
    { key: "account", label: "Account" },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto border-b p-2">
      {items.map((it) => {
        const isActive = props.active === it.key;
        return (
          <button
            key={it.key}
            onClick={() => props.onChange(it.key)}
            className={cn(
              "whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium",
              isActive ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}