"use client";

// app/study/_components/StudyTabs.tsx

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookMarked,
  BookOpen,
  Calculator,
  GraduationCap,
  History,
  Home,
  MessageCircleQuestion,
  MoreHorizontal,
  Trophy,
  UploadCloud,
  UserCheck,
  X,
  Zap,
  BrainCircuit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StudyPrefsProvider, useStudyPrefs } from "./StudyPrefsContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContributorStatus =
  | "not_applied"
  | "pending"
  | "approved"
  | "rejected";

type Tab = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: "exact" | "prefix";
};

type OverflowItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
  /** Tailwind bg + text classes for the icon bubble */
  color: string;
  badge?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isActive(pathname: string, tab: Pick<Tab, "href" | "match">) {
  if (tab.match === "exact") return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(tab.href + "/");
}

const OVERFLOW_PREFIXES = [
  "/study/history",
  "/study/library",
  "/study/gpa",
  "/study/tutors",
  "/study/leaderboard",
  "/study/apply-rep",
  "/study/materials/upload",
  "/study/ai-plan",
];

function isOverflowActive(pathname: string) {
  return OVERFLOW_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

// ─── More sheet ───────────────────────────────────────────────────────────────

function MoreSheet({
  open,
  onClose,
  items,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  items: OverflowItem[];
  pathname: string;
}) {
  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!open) {
      setDragOffset(0);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setDragOffset(delta);
  };

  const handleTouchEnd = () => {
    if (dragOffset > 120) {
      onClose();
    } else {
      setDragOffset(0);
    }
    isDragging.current = false;
    dragStartY.current = null;
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] transition-opacity duration-200",
        open
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      )}
      inert={!open || undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More study tools"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: open
            ? `translateY(${dragOffset}px)`
            : "translateY(100%)",
          transition: isDragging.current
            ? "none"
            : open
            ? "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)"
            : "transform 0.25s ease-in",
          maxHeight: "85dvh",
        }}
        className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-[28px] border-t border-border bg-card shadow-2xl"
      >
        {/* Drag handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-2">
          <div>
            <p className="text-base font-extrabold tracking-tight text-foreground">
              More
            </p>
            <p className="text-xs text-muted-foreground">
              Tools, calculators, rankings and extras
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close More sheet"
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground",
              "hover:bg-secondary hover:text-foreground transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable grid */}
        <div
          className="grid grid-cols-1 gap-2 overflow-y-auto overscroll-contain px-4 pt-1 sm:grid-cols-2"
          style={{
            paddingBottom:
              "max(1.5rem, env(safe-area-inset-bottom, 0px) + 1rem)",
          }}
        >
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3.5 rounded-2xl border p-3.5 transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  "active:scale-[0.98]",
                  active
                    ? "border-primary/20 bg-primary/5"
                    : "border-border/60 bg-background hover:bg-secondary/50 hover:border-border"
                )}
              >
                {/* Colored icon bubble */}
                <div
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
                    item.color
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        "text-sm font-bold",
                        active ? "text-primary" : "text-foreground"
                      )}
                    >
                      {item.label}
                    </p>
                    {item.badge ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                          item.badge === "Pending"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                            : item.badge === "Reapply"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
                            : "bg-foreground text-background"
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>

                {/* Active dot */}
                {active && (
                  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Onboarding Banner ────────────────────────────────────────────────────────

function useStudyOnboardingBanner() {
  const { loading, hasPrefs } = useStudyPrefs();
  return { shouldShowBanner: !loading && !hasPrefs };
}

function StudyOnboardingBannerInner() {
  const { shouldShowBanner } = useStudyOnboardingBanner();
  if (!shouldShowBanner) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
      <p className="text-sm text-amber-800">Complete your study profile to get personalised content.</p>
      <Link
        href="/study/onboarding"
        className="shrink-0 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white no-underline hover:bg-amber-700"
      >
        Set up →
      </Link>
    </div>
  );
}

function StudyOnboardingBanner() {
  return (
    <StudyPrefsProvider>
      <StudyOnboardingBannerInner />
    </StudyPrefsProvider>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const DESKTOP_TABS: Tab[] = [
  {
    href: "/study",
    label: "Home",
    icon: <Home className="h-3.5 w-3.5" />,
    match: "exact",
  },
  {
    href: "/study/materials",
    label: "Materials",
    icon: <BookOpen className="h-3.5 w-3.5" />,
    match: "prefix",
  },
  {
    href: "/study/practice",
    label: "Practice",
    icon: <Zap className="h-3.5 w-3.5" />,
    match: "prefix",
  },
  {
    href: "/study/questions",
    label: "Q&A",
    icon: <MessageCircleQuestion className="h-3.5 w-3.5" />,
    match: "prefix",
  },
  {
    href: "/study/history",
    label: "History",
    icon: <History className="h-3.5 w-3.5" />,
    match: "prefix",
  },
];

const MOBILE_TABS: Tab[] = [
  {
    href: "/study",
    label: "Home",
    icon: <Home className="h-3.5 w-3.5" />,
    match: "exact",
  },
  {
    href: "/study/materials",
    label: "Materials",
    icon: <BookOpen className="h-3.5 w-3.5" />,
    match: "prefix",
  },
  {
    href: "/study/practice",
    label: "Practice",
    icon: <Zap className="h-3.5 w-3.5" />,
    match: "prefix",
  },
  {
    href: "/study/questions",
    label: "Q&A",
    icon: <MessageCircleQuestion className="h-3.5 w-3.5" />,
    match: "prefix",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function StudyTabs({
  contributorStatus,
}: {
  contributorStatus?: ContributorStatus;
}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const overflowActive = isOverflowActive(pathname);

  const overflowItems: OverflowItem[] = [
    {
      href: "/study/history",
      label: "History",
      description: "Review your recent study activity",
      icon: History,
      color:
        "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
    },
    {
      href: "/study/library",
      label: "Bookmarks",
      description: "Your saved materials, sets and questions",
      icon: BookMarked,
      color:
        "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
    },
    {
      href: "/study/gpa",
      label: "GPA Calculator",
      description: "Track your CGPA across semesters",
      icon: Calculator,
      color:
        "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
    },
    {
      href: "/study/tutors",
      label: "Tutors",
      description: "Find verified tutors for your courses",
      icon: GraduationCap,
      color:
        "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
    },
    {
      href: "/study/leaderboard",
      label: "Leaderboard",
      description: "Top contributors and practice streaks",
      icon: Trophy,
      color:
        "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
    },
    {
      href: "/study/ai-plan",
      label: "AI Study Plan",
      description: "Generate a personalised study schedule with Gemini",
      icon: BrainCircuit,
      color:
        "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
      badge: "AI",
    },
    contributorStatus === "approved"
      ? {
          href: "/study/materials/upload",
          label: "Upload",
          description: "Upload materials for your department",
          icon: UploadCloud,
          color:
            "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
          badge: "Rep",
        }
      : {
          href: "/study/apply-rep",
          label: "Contribute",
          description: "Apply to become a Course Rep or Librarian",
          icon: UserCheck,
          color:
            "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400",
          badge:
            contributorStatus === "pending"
              ? "Pending"
              : contributorStatus === "rejected"
              ? "Reapply"
              : undefined,
        },
  ];

  return (
    <>
      <StudyOnboardingBanner />
      <nav
        aria-label="Study navigation"
        className={cn(
          "sticky top-0 z-30 -mx-4 border-b border-border bg-background/80 backdrop-blur",
          "md:static md:mx-0 md:rounded-2xl md:border md:bg-card"
        )}
      >
        <div className="px-2 py-2 md:px-4">
          {/* Mobile */}
          <div className="flex items-center justify-between gap-1 md:hidden">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              {MOBILE_TABS.map((tab) => {
                const active = isActive(pathname, tab);

                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border px-2 py-2 text-xs font-semibold transition-all",
                      "leading-none select-none",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    )}
                  >
                    {tab.icon}
                    <span className="truncate">{tab.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* More button — shows active dot when an overflow route is current */}
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label="More study tools"
              aria-expanded={sheetOpen}
              className={cn(
                "relative ml-1 flex shrink-0 items-center justify-center rounded-full border px-3 py-2 text-xs font-semibold transition-all",
                "leading-none select-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                overflowActive
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
              {overflowActive && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </button>
          </div>

          {/* Desktop */}
          <div className="hidden items-center gap-1 md:flex">
            {DESKTOP_TABS.map((tab) => {
              const active = isActive(pathname, tab);

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-all",
                    "leading-none select-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    active
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label="More study tools"
              aria-expanded={sheetOpen}
              className={cn(
                "relative ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-all",
                "leading-none select-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                overflowActive
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
              <span>More</span>
              {overflowActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          </div>
        </div>
      </nav>

      <MoreSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        items={overflowItems}
        pathname={pathname}
      />
    </>
  );
}