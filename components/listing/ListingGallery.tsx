"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

interface Props {
  images: string[];          // already-resolved list; guaranteed non-empty by caller
  alt: string;
  statusBadge?: React.ReactNode; // e.g. SOLD / INACTIVE chip
  cornerBadges?: React.ReactNode; // e.g. type + negotiable badges
}

export default function ListingGallery({ images, alt, statusBadge, cornerBadges }: Props) {
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const total = images.length;
  const single = total === 1;

  const prev = useCallback(() => setIdx((i) => (i - 1 + total) % total), [total]);
  const next = useCallback(() => setIdx((i) => (i + 1) % total), [total]);

  // keyboard navigation
  useEffect(() => {
    if (single) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [single, prev, next]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (single || touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    // Only swipe horizontally (ignore scrolling)
    if (Math.abs(dx) > 40 && dy < 60) {
      if (dx < 0) next();
      else prev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  const src = images[idx];

  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div
        className="relative w-full bg-zinc-100 overflow-hidden h-[40svh] max-h-[260px] min-h-[200px] sm:h-[340px] sm:max-h-none lg:h-[420px]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Image */}
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt={`${alt} — photo ${idx + 1} of ${total}`}
            className="h-full w-full max-w-full object-cover transition-opacity duration-150"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/images/placeholder.svg";
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-300">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}

        {/* Status badge (top-left) */}
        {statusBadge ? (
          <div className="absolute left-3 top-3">{statusBadge}</div>
        ) : null}

        {/* Corner badges (top-right) */}
        {cornerBadges ? (
          <div className="absolute right-3 top-3 flex items-center gap-2">{cornerBadges}</div>
        ) : null}

        {/* Prev / Next arrows — only shown when multiple images */}
        {!single ? (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60 transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60 transition"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}

        {/* Dot indicators (bottom-center) */}
        {!single ? (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Photo ${i + 1}`}
                className={[
                  "h-2 rounded-full transition-all",
                  i === idx
                    ? "w-5 bg-white shadow"
                    : "w-2 bg-white/50 hover:bg-white/75",
                ].join(" ")}
              />
            ))}
          </div>
        ) : null}

        {/* Photo count chip (top-right when no corner badges) */}
        {!single && !cornerBadges ? (
          <div className="absolute right-3 top-3">
            <span className="rounded-full bg-black/50 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
              {idx + 1} / {total}
            </span>
          </div>
        ) : null}
      </div>

      {/* Thumbnail strip — only when 2+ images */}
      {!single ? (
        <div className="flex gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
          {images.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={[
                "h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition",
                i === idx ? "border-black" : "border-transparent opacity-60 hover:opacity-90",
              ].join(" ")}
              aria-label={`View photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Thumbnail ${i + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/images/placeholder.svg";
                }}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}