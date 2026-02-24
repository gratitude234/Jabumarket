// app/study/_components/StudyUI.tsx
// Small shared UI primitives to keep Study pages consistent (mobile-first).

import Link from "next/link";
import type React from "react";
import { ArrowRight } from "lucide-react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-sm",
        "sm:p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  variant = "default",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  variant?: "default" | "compact";
}) {
  const compact = variant === "compact";

  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-card text-center shadow-sm",
        compact ? "p-4" : "p-6"
      )}
    >
      {icon ? (
        <div className={cn("mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border bg-background")}>
          {icon}
        </div>
      ) : null}

      <p className={cn("text-base font-semibold text-foreground", compact && "text-[15px]")}>
        {title}
      </p>

      {description ? (
        <p
          className={cn(
            "mx-auto mt-2 max-w-md text-sm text-muted-foreground",
            compact && "mt-1"
          )}
        >
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function SkeletonCard({
  className,
  lines = 2,
}: {
  className?: string;
  lines?: 1 | 2 | 3;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm", "animate-pulse", className)}>
      <div className="h-4 w-2/3 rounded bg-muted" />
      {lines >= 2 ? <div className="mt-2 h-3 w-1/2 rounded bg-muted" /> : null}
      {lines >= 3 ? <div className="mt-2 h-3 w-1/3 rounded bg-muted" /> : null}
      <div className="mt-4 h-9 w-28 rounded-2xl bg-muted" />
    </div>
  );
}

// Optional helper: a neutral CTA button/link (mobile-first, accessible)
export function GhostCta({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2",
        "text-sm font-semibold text-foreground no-underline",
        "hover:bg-secondary/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}