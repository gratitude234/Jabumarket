"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function getRecentSearches(): string[] {
  try {
    return (JSON.parse(localStorage.getItem("jm_recent_searches") ?? "[]") as string[]).slice(0, 4);
  } catch {
    return [];
  }
}

export function addRecentSearch(q: string) {
  try {
    const prev = getRecentSearches().filter((s) => s !== q);
    localStorage.setItem("jm_recent_searches", JSON.stringify([q, ...prev].slice(0, 6)));
  } catch {}
}

export default function RecentSearchesBar({
  q,
  buildHref,
}: {
  q: string;
  buildHref: (search: string) => string;
}) {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (q) {
      addRecentSearch(q);
    } else {
      setRecent(getRecentSearches());
    }
  }, [q]);

  if (q || recent.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400">Recent:</span>
      {recent.map((s) => (
        <Link
          key={s}
          href={buildHref(s)}
          className="rounded-full border bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50 no-underline"
        >
          {s}
        </Link>
      ))}
    </div>
  );
}
