// app/vendors/page.tsx
import { Suspense } from "react";
import VendorsClient from "./VendorsClient";

function VendorsFallback() {
  return (
    <div className="space-y-5">
      <header className="rounded-3xl border bg-white p-4 sm:p-5">
        <div className="h-6 w-32 rounded bg-zinc-100" />
        <div className="mt-2 h-4 w-56 rounded bg-zinc-100" />
        <div className="mt-4 h-11 w-full rounded-2xl bg-zinc-100" />
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-20 rounded-full bg-zinc-100" />
          ))}
        </div>
      </header>

      <section className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-white p-4">
              <div className="h-4 w-2/3 rounded bg-zinc-100" />
              <div className="mt-2 h-3 w-1/2 rounded bg-zinc-100" />
              <div className="mt-4 flex gap-2">
                <div className="h-9 w-28 rounded-xl bg-zinc-100" />
                <div className="h-9 w-20 rounded-xl bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function VendorsPage() {
  return (
    <Suspense fallback={<VendorsFallback />}>
      <VendorsClient />
    </Suspense>
  );
}
