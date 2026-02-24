// app/study/page.tsx
import { Suspense } from "react";
import StudyHomeClient from "./StudyHomeClient";
import { Card, SkeletonCard } from "./_components/StudyUI";

function StudyHomeFallback() {
  return (
    <div className="space-y-4 pb-28 md:pb-6">
      {/* Hero */}
      <Card className="rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="h-6 w-40 rounded bg-muted" />
            <div className="mt-2 h-4 w-72 max-w-full rounded bg-muted" />
            <div className="mt-2 h-3 w-52 rounded bg-muted" />
          </div>
          <div className="h-10 w-28 rounded-2xl bg-muted" />
        </div>

        {/* Search */}
        <div className="mt-4 h-11 w-full rounded-2xl bg-muted" />

        {/* Chips */}
        <div className="mt-4 flex gap-2 overflow-hidden">
          <div className="h-9 w-24 rounded-full bg-muted" />
          <div className="h-9 w-28 rounded-full bg-muted" />
          <div className="h-9 w-24 rounded-full bg-muted" />
          <div className="h-9 w-28 rounded-full bg-muted" />
        </div>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="h-20 rounded-3xl border border-border bg-card shadow-sm" />
        <div className="h-20 rounded-3xl border border-border bg-card shadow-sm" />
        <div className="h-20 rounded-3xl border border-border bg-card shadow-sm" />
        <div className="h-20 rounded-3xl border border-border bg-card shadow-sm" />
      </div>

      {/* Content skeletons */}
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={<StudyHomeFallback />}>
      <StudyHomeClient />
    </Suspense>
  );
}