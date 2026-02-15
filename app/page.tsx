import Link from "next/link";

const categories = [
  "Phones",
  "Laptops",
  "Fashion",
  "Provisions",
  "Food",
  "Beauty",
  "Services",
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-4">
        <h1 className="text-2xl font-bold">Buy/Sell + Services in JABU</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Find student deals, trusted vendors, and services around campus.
        </p>

        <div className="mt-4 flex gap-2">
          <Link
            href="/explore"
            className="rounded-xl bg-black px-4 py-2 text-sm text-white no-underline"
          >
            Explore listings
          </Link>
          <Link
            href="/vendors"
            className="rounded-xl border px-4 py-2 text-sm text-black no-underline"
          >
            Browse vendors
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700">Categories</h2>
          <Link href="/explore" className="text-sm text-zinc-600 no-underline">
            See all →
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link
              key={c}
              href={`/explore?category=${encodeURIComponent(c)}`}
              className="rounded-full border bg-white px-3 py-2 text-sm text-zinc-700 no-underline hover:bg-zinc-50"
            >
              {c}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="text-base font-semibold">How it works</h2>
        <ol className="mt-2 space-y-2 text-sm text-zinc-600">
          <li>1) Browse listings or vendors</li>
          <li>2) Tap WhatsApp to contact</li>
          <li>3) Meet safely on campus</li>
        </ol>
      </section>
    </div>
  );
}
