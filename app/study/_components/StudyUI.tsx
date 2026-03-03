// app/study/_components/StudyUI.tsx
"use client";

// Small shared UI primitives to keep Study pages consistent (mobile-first).

import Link from "next/link";
import * as React from "react";
import {
  ArrowRight,
  ShieldCheck,
  UploadCloud,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";

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
  /**
   * Accepts either a React element (e.g. <ShieldCheck className="..." />)
   * or a component type (e.g. ShieldCheck).
   */
  icon?: React.ReactNode | React.ElementType;
  variant?: "default" | "compact";
}) {
  const compact = variant === "compact";

  const renderIcon = () => {
    if (!icon) return null;

    if (React.isValidElement(icon)) return icon;

    const maybeType = icon as any;
    const isElementType =
      typeof maybeType === "function" ||
      (typeof maybeType === "object" &&
        maybeType !== null &&
        "$$typeof" in maybeType);

    if (isElementType) {
      const Icon = icon as React.ElementType;
      return <Icon className="h-5 w-5" />;
    }

    return icon as React.ReactNode;
  };

  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-card text-center shadow-sm",
        compact ? "p-4" : "p-6"
      )}
    >
      {icon ? (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border bg-background">
          {renderIcon()}
        </div>
      ) : null}

      <p
        className={cn(
          "text-base font-semibold text-foreground",
          compact && "text-[15px]"
        )}
      >
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
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-sm",
        "animate-pulse",
        className
      )}
    >
      <div className="h-4 w-2/3 rounded bg-muted" />
      {lines >= 2 ? <div className="mt-2 h-3 w-1/2 rounded bg-muted" /> : null}
      {lines >= 3 ? <div className="mt-2 h-3 w-1/3 rounded bg-muted" /> : null}
      <div className="mt-4 h-9 w-28 rounded-2xl bg-muted" />
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  className?: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : tone === "danger"
          ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-border bg-background text-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5",
        "text-xs font-semibold",
        toneClass,
        className
      )}
    >
      {children}
    </span>
  );
}

export type ContributorRole = "course_rep" | "dept_librarian" | null;
export type ContributorStatus =
  | "not_applied"
  | "pending"
  | "approved"
  | "rejected";
export type ContributorScope =
  | {
      faculty_id: string | null;
      department_id: string | null;
      levels: number[] | null;
      all_levels: boolean;
    }
  | null;

function roleLabel(role: ContributorRole) {
  if (role === "course_rep") return "Course Rep";
  if (role === "dept_librarian") return "Departmental Librarian";
  return "Contributor";
}

function formatLevels(levels: number[] | null) {
  if (!levels || levels.length === 0) return "";
  return levels.map((n) => `${n}L`).join(", ");
}

function HowItWorks() {
  return (
    <details className="group mt-3">
      <summary
        className={cn(
          "inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
          "text-xs font-semibold text-muted-foreground",
          "hover:bg-secondary/50 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      >
        <Info className="h-4 w-4" />
        How it works
      </summary>

      <div className="mt-3 rounded-2xl border border-border bg-background p-3 text-sm">
        <ol className="space-y-2 text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border bg-card text-xs font-bold">
              1
            </span>
            Apply to contribute (Course Rep or Departmental Librarian).
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border bg-card text-xs font-bold">
              2
            </span>
            Your request is reviewed by moderators.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border bg-card text-xs font-bold">
              3
            </span>
            Once approved, you can upload materials.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border bg-card text-xs font-bold">
              4
            </span>
            Uploads are reviewed before they go live for students.
          </li>
        </ol>
        <div className="mt-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Course Rep</span> =
          selected level(s).
          <span className="mx-1">•</span>
          <span className="font-semibold text-foreground">
            Departmental Librarian
          </span>{" "}
          = all levels.
        </div>
      </div>
    </details>
  );
}

/**
 * Dismiss behavior:
 * localStorage study_contributor_hub_dismissed:
 *  - "0"/null => show full card (not applied)
 *  - "1"      => show small banner
 *  - "2"      => hide everything
 */
type DismissMode = "none" | "banner" | "all";

export function ContributorStatusHub({
  loading,
  status,
  role,
  scope,
}: {
  loading: boolean;
  status: ContributorStatus;
  role: ContributorRole;
  scope: ContributorScope;
}) {
  const canUpload = status === "approved";

  const [dismissMode, setDismissMode] = React.useState<DismissMode>("none");

  React.useEffect(() => {
    try {
      const v = localStorage.getItem("study_contributor_hub_dismissed");
      if (v === "2") setDismissMode("all");
      else if (v === "1") setDismissMode("banner");
      else setDismissMode("none");
    } catch {
      setDismissMode("none");
    }
  }, []);

  function dismissToBanner() {
    setDismissMode("banner");
    try {
      localStorage.setItem("study_contributor_hub_dismissed", "1");
    } catch {}
  }

  function dismissAll() {
    setDismissMode("all");
    try {
      localStorage.setItem("study_contributor_hub_dismissed", "2");
    } catch {}
  }

  // ✅ No hooks below this point (safe early returns)

  const scopeLine = (() => {
    if (status !== "approved" || !scope) return null;
    const levelText =
      role === "dept_librarian" || scope.all_levels
        ? "All levels"
        : formatLevels(scope.levels);
    const deptText = scope.department_id ? "Department" : null;
    return [roleLabel(role), deptText, levelText].filter(Boolean).join(" • ");
  })();

  // Hide everything if user fully dismissed
  if (!loading && status === "not_applied" && dismissMode === "all") {
    return null;
  }

  // Show the small banner if user dismissed the full card (but didn't fully hide it)
  if (!loading && status === "not_applied" && dismissMode === "banner") {
    return (
      <Card className="rounded-3xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Want to contribute?
            </p>
            <p className="text-xs text-muted-foreground">
              Apply anytime to upload materials for your department. Uploads are
              reviewed before they go live.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={dismissAll}
              className={cn(
                "inline-flex items-center rounded-2xl border border-border bg-background px-3 py-2",
                "text-sm font-semibold text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              Dismiss
            </button>

            <Link
              href="/study/apply-rep"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2",
                "text-sm font-semibold text-foreground hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              Apply <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-extrabold tracking-tight text-foreground">
            Contributor
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Help your department by uploading materials. Uploads are reviewed
            before they go live.
          </p>
        </div>

        <div className="shrink-0">
          {loading ? (
            <span className="inline-flex h-9 w-32 animate-pulse rounded-2xl bg-muted" />
          ) : canUpload ? (
            <Link
              href="/study/materials/upload"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2",
                "text-sm font-semibold text-foreground hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              <UploadCloud className="h-4 w-4" />
              Upload
            </Link>
          ) : (
            <Link
              href="/study/apply-rep"
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2",
                "text-sm font-semibold text-foreground hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              Apply
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {loading ? (
          <>
            <span className="h-8 w-36 animate-pulse rounded-full bg-muted" />
            <span className="h-8 w-44 animate-pulse rounded-full bg-muted" />
          </>
        ) : status === "approved" ? (
          <>
            <Badge tone="success">
              <CheckCircle2 className="h-4 w-4" />
              Approved
            </Badge>
            <Badge className="truncate">{scopeLine ?? roleLabel(role)}</Badge>
            <span className="text-xs text-muted-foreground">
              Tip: rejected uploads will show in “My uploads”.
            </span>
          </>
        ) : status === "pending" ? (
          <>
            <Badge tone="warning">
              <Clock className="h-4 w-4" />
              Under review
            </Badge>
            <Link
              href="/study/apply-rep"
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2",
                "text-xs font-semibold text-foreground hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              View application <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-xs text-muted-foreground">
              You can still browse materials while waiting.
            </span>
          </>
        ) : status === "rejected" ? (
          <>
            <Badge tone="danger">
              <XCircle className="h-4 w-4" />
              Not approved
            </Badge>
            <span className="text-xs text-muted-foreground">
              You can reapply with clearer proof (e.g. course rep appointment or
              department approval).
            </span>
            <Link
              href="/study/apply-rep"
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2",
                "text-xs font-semibold text-foreground hover:bg-secondary/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              Reapply <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <>
            <Badge>
              <ShieldCheck className="h-4 w-4" />
              Not applied
            </Badge>

            {/* ✅ real choice: collapse full card -> banner */}
            <button
              type="button"
              onClick={dismissToBanner}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2",
                "text-xs font-semibold text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              )}
            >
              Not now
            </button>

            <span className="text-xs text-muted-foreground">
              You can apply later anytime.
            </span>

            <div className="w-full">
              <HowItWorks />
            </div>
          </>
        )}
      </div>

      {loading ? null : status !== "approved" && status !== "not_applied" ? (
        <HowItWorks />
      ) : null}
    </Card>
  );
}