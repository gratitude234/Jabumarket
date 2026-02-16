// components/layout/TopNav.tsx
"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/vendors", label: "Vendors" },
  { href: "/couriers", label: "Delivery" },
];

function buildNextUrl(pathname: string, sp: URLSearchParams, nextQ: string) {
  const copy = new URLSearchParams(sp.toString());
  const q = nextQ.trim();

  if (q) copy.set("q", q);
  else copy.delete("q");

  const qs = copy.toString();

  if (pathname === "/") return q ? `/explore?q=${encodeURIComponent(q)}` : "/";
  return qs ? `${pathname}?${qs}` : pathname;
}


function currentUrl(pathname: string, sp: URLSearchParams) {
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();

  const showSearch =
    pathname === "/" || pathname.startsWith("/explore") || pathname.startsWith("/vendors");

  const initialQ = useMemo(() => sp.get("q") ?? "", [sp]);
  const [q, setQ] = useState(initialQ);

  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  // ✅ debounced replace
  useEffect(() => {
    if (!showSearch) return;

    const t = setTimeout(() => {
      const spCopy = new URLSearchParams(sp.toString());
      const nextUrl = buildNextUrl(pathname, spCopy, q);

      const cur = currentUrl(pathname, new URLSearchParams(sp.toString()));
      if (nextUrl === cur) return;

      router.replace(nextUrl);
    }, 350);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pathname, showSearch]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextUrl = buildNextUrl(pathname, new URLSearchParams(sp.toString()), q);
    const cur = currentUrl(pathname, new URLSearchParams(sp.toString()));
    if (nextUrl === cur) return;
    router.push(nextUrl);
  }

  function clear() {
    setQ("");
    const nextUrl = buildNextUrl(pathname, new URLSearchParams(sp.toString()), "");
    router.replace(nextUrl);
  }

  return (
    <header className="hidden md:block border-b bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="font-bold text-lg no-underline text-black">
          Jabumarket
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  active
                    ? "font-semibold no-underline text-black"
                    : "text-zinc-600 hover:text-black no-underline"
                }
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {showSearch ? (
            <form onSubmit={onSubmit} className="hidden lg:block">
              <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
                <Search className="h-4 w-4 text-zinc-500" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={
                    pathname.startsWith("/vendors") ? "Search vendors..." : "Search listings..."
                  }
                  className="w-64 bg-transparent text-sm outline-none"
                />

                {/* ✅ Clear */}
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
          ) : null}

          <Link
            href="/post"
            className="rounded-lg bg-black px-3 py-2 text-white text-sm no-underline"
          >
            Post Listing
          </Link>
        </div>
      </div>
    </header>
  );
}
