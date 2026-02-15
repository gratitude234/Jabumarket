// components/layout/MobileTopBar.tsx
"use client";

import Link from "next/link";
import { Search, Plus, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function buildNextUrl(pathname: string, sp: URLSearchParams, nextQ: string) {
  const copy = new URLSearchParams(sp.toString());
  const q = nextQ.trim();

  if (q) copy.set("q", q);
  else copy.delete("q");

  const qs = copy.toString();

  // On Home, redirect searches to /explore
  if (pathname === "/") return q ? `/explore?q=${encodeURIComponent(q)}` : "/explore";

  return qs ? `${pathname}?${qs}` : pathname;
}

export default function MobileTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();

  const showSearch =
    pathname === "/" || pathname.startsWith("/explore") || pathname.startsWith("/vendors");

  const initialQ = useMemo(() => sp.get("q") ?? "", [sp]);
  const [q, setQ] = useState(initialQ);

  // keep input in sync when user navigates back/forward
  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  // ✅ debounced navigation (replace, not push)
  useEffect(() => {
    if (!showSearch) return;

    const t = setTimeout(() => {
      const nextUrl = buildNextUrl(pathname, new URLSearchParams(sp.toString()), q);

      // avoid unnecessary replaces
      const current = sp.toString();
      const nextSp = nextUrl.includes("?") ? nextUrl.split("?")[1] : "";
      if (pathname !== "/" && current === nextSp) return;

      router.replace(nextUrl);
    }, 350);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pathname, showSearch]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextUrl = buildNextUrl(pathname, new URLSearchParams(sp.toString()), q);
    router.push(nextUrl);
  }

  function clear() {
    setQ("");
    const nextUrl = buildNextUrl(pathname, new URLSearchParams(sp.toString()), "");
    router.replace(nextUrl);
  }

  return (
    <header className="md:hidden sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="font-bold text-lg no-underline text-black">
            Jabumarket
          </Link>

          <Link
            href="/post"
            className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-white text-sm no-underline"
          >
            <Plus className="h-4 w-4" />
            Post
          </Link>
        </div>

        {showSearch && (
          <form onSubmit={onSubmit} className="mt-3">
            <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm">
              <Search className="h-4 w-4 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products & services..."
                className="w-full bg-transparent text-sm outline-none"
              />

              {/* ✅ Clear (shows only when typing) */}
              {q.trim().length > 0 ? (
                <button
                  type="button"
                  onClick={clear}
                  className="rounded-md p-1 hover:bg-zinc-100"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4 text-zinc-500" />
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </header>
  );
}
