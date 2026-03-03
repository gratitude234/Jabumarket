"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

type Tab = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

function isActive(pathname: string, tab: Tab) {
  if (tab.match === "exact") return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(tab.href + "/");
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ContributorStatus = "not_applied" | "pending" | "approved" | "rejected";

export default function StudyTabs({
  showUploadTab = false,
  contributorStatus,
}: {
  showUploadTab?: boolean;
  contributorStatus?: ContributorStatus;
}) {
  const pathname = usePathname();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const tabs: Tab[] = useMemo(() => {
    const base: Tab[] = [
      { href: "/study", label: "Home", match: "exact" },
      { href: "/study/materials", label: "Materials", match: "prefix" },
      { href: "/study/practice", label: "Practice", match: "prefix" },
      { href: "/study/library", label: "Library", match: "prefix" },
      { href: "/study/history", label: "History", match: "prefix" },
      { href: "/study/questions", label: "Questions", match: "prefix" },
    ];

    // Only show upload if user is approved Course Rep / Dept Librarian
    if (showUploadTab) {
      base.splice(2, 0, { href: "/study/materials/upload", label: "Upload", match: "prefix" });
    }

    // If not approved yet, surface the workflow as a first-class tab
    if (!showUploadTab && contributorStatus && contributorStatus !== "approved") {
      base.splice(1, 0, { href: "/study/apply-rep", label: "Contribute", match: "prefix" });
    }

    return base;
  }, [showUploadTab, contributorStatus]);

  const activeHref = useMemo(() => {
    const t = tabs.find((tab) => isActive(pathname, tab));
    return t?.href ?? "/study";
  }, [pathname, tabs]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const el = scroller.querySelector<HTMLAnchorElement>(`a[data-tab="${activeHref}"]`);
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeHref]);

  return (
    <nav
      aria-label="Study navigation"
      className={cn(
        "sticky top-0 z-30 -mx-4 border-b border-border bg-background/80 backdrop-blur",
        "md:static md:mx-0 md:rounded-2xl md:border md:bg-card"
      )}
    >
      <div className="relative px-4 py-3 md:px-4 md:py-2">
        <div className="pointer-events-none absolute left-4 top-0 h-full w-6 bg-gradient-to-r from-background/90 to-transparent md:from-card/90" />
        <div className="pointer-events-none absolute right-4 top-0 h-full w-6 bg-gradient-to-l from-background/90 to-transparent md:from-card/90" />

        <div
          ref={scrollerRef}
          className={cn(
            "flex items-center gap-2 overflow-x-auto",
            "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          )}
        >
          {tabs.map((t) => {
            const active = t.href === activeHref;

            return (
              <Link
                key={t.href}
                href={t.href}
                data-tab={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 select-none rounded-full border px-3 py-2 text-sm font-semibold transition",
                  "leading-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "md:focus-visible:ring-offset-card",
                  active
                    ? "border-border bg-secondary text-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}