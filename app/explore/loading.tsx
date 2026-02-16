export default function LoadingExplore() {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="h-6 w-24 rounded bg-zinc-100" />
          <div className="mt-2 h-4 w-56 rounded bg-zinc-100" />
        </div>
        <div className="hidden sm:block h-10 w-32 rounded-xl bg-zinc-100" />
      </div>

      <div className="sticky top-0 z-10 -mx-2 border-b bg-zinc-50/80 px-2 py-3 backdrop-blur">
        <div className="space-y-3">
          <div className="h-11 w-full rounded-2xl bg-zinc-100" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 w-20 rounded-full bg-zinc-100" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-9 w-24 rounded-full bg-zinc-100" />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border bg-white">
            <div className="aspect-[4/3] w-full bg-zinc-100" />
            <div className="space-y-3 p-3">
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded-full bg-zinc-100" />
                <div className="h-5 w-20 rounded-full bg-zinc-100" />
              </div>
              <div className="h-4 w-full rounded bg-zinc-100" />
              <div className="h-4 w-24 rounded bg-zinc-100" />
              <div className="h-3 w-32 rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
