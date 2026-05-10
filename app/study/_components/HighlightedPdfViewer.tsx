"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, LocateFixed } from "lucide-react";
import { cn } from "@/lib/utils";

type HighlightBox = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type HighlightedPdfViewerProps = {
  url: string;
  page: number;
  highlightText?: string;
  onFatalError?: (message: string) => void;
};

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateTexts(value: string | undefined) {
  const normalized = normalizeForMatch(value ?? "");
  if (!normalized) return [];

  const words = normalized.split(" ").filter(Boolean);
  const candidates = [normalized];

  if (words.length > 28) candidates.push(words.slice(0, 28).join(" "));
  if (words.length > 18) candidates.push(words.slice(0, 18).join(" "));
  if (words.length > 12) candidates.push(words.slice(0, 12).join(" "));

  return [...new Set(candidates.filter((candidate) => candidate.length >= 24 || candidate.split(" ").length >= 5))];
}

function findMatchedItemIndexes(items: Array<{ str: string }>, highlightText?: string) {
  const candidates = candidateTexts(highlightText);
  if (candidates.length === 0) return new Set<number>();

  const ranges: Array<{ itemIndex: number; start: number; end: number }> = [];
  let combined = "";

  items.forEach((item, itemIndex) => {
    const normalized = normalizeForMatch(item.str ?? "");
    if (!normalized) return;
    if (combined) combined += " ";
    const start = combined.length;
    combined += normalized;
    ranges.push({ itemIndex, start, end: combined.length });
  });

  for (const candidate of candidates) {
    const start = combined.indexOf(candidate);
    if (start < 0) continue;

    const end = start + candidate.length;
    const matched = new Set<number>();
    ranges.forEach((range) => {
      if (range.end >= start && range.start <= end) matched.add(range.itemIndex);
    });
    if (matched.size > 0) return matched;
  }

  return new Set<number>();
}

function getTextItemBox(pdfjs: any, viewport: any, item: any, index: number): HighlightBox | null {
  const str = String(item?.str ?? "").trim();
  if (!str) return null;

  const tx = pdfjs.Util.transform(viewport.transform, item.transform);
  const fontHeight = Math.hypot(tx[2], tx[3]) || Math.abs(tx[3]) || 10;
  const width = Math.max(8, Number(item.width ?? 0) * viewport.scale);
  const height = Math.max(8, fontHeight * 1.15);
  const left = tx[4];
  const top = tx[5] - height;

  return {
    id: `${index}-${Math.round(left)}-${Math.round(top)}`,
    left,
    top,
    width,
    height,
  };
}

export function HighlightedPdfViewer({
  url,
  page,
  highlightText,
  onFatalError,
}: HighlightedPdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  const [pdfjs, setPdfjs] = useState<any>(null);
  const [pageNumber, setPageNumber] = useState(page);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [highlightBoxes, setHighlightBoxes] = useState<HighlightBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [matched, setMatched] = useState<boolean | null>(null);

  const safeTargetPage = useMemo(() => Math.max(1, Math.floor(page || 1)), [page]);

  useEffect(() => {
    setPageNumber(safeTargetPage);
  }, [safeTargetPage, url]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const mod = await import("pdfjs-dist");
        if (cancelled) return;
        mod.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        setPdfjs(mod);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load PDF renderer.";
        setRenderError(message);
        onFatalError?.(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onFatalError]);

  useEffect(() => {
    if (!pdfjs || !url) return;
    let cancelled = false;

    setLoading(true);
    setRenderError(null);
    setHighlightBoxes([]);
    setMatched(null);

    void (async () => {
      try {
        const loadingTask = pdfjs.getDocument({ url });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy().catch(() => {});
          return;
        }
        pdfRef.current = pdf;
        setPageCount(pdf.numPages ?? null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not open PDF.";
        setRenderError(message);
        onFatalError?.(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
      pdfRef.current?.destroy?.().catch?.(() => {});
      pdfRef.current = null;
    };
  }, [pdfjs, url, onFatalError]);

  useEffect(() => {
    if (!pdfjs || !pdfRef.current || !canvasRef.current) return;
    let cancelled = false;

    async function renderPage() {
      setLoading(true);
      setRenderError(null);
      setHighlightBoxes([]);
      setMatched(null);

      try {
        renderTaskRef.current?.cancel?.();
        const pdf = pdfRef.current;
        const clampedPage = Math.max(1, Math.min(pageNumber, pdf.numPages ?? pageNumber));
        if (clampedPage !== pageNumber) {
          setPageNumber(clampedPage);
          return;
        }

        const pageProxy = await pdf.getPage(clampedPage);
        const baseViewport = pageProxy.getViewport({ scale: 1 });
        const availableWidth = Math.max(280, Math.floor(shellRef.current?.clientWidth ?? baseViewport.width));
        const scale = Math.max(0.7, Math.min(2.2, availableWidth / baseViewport.width));
        const viewport = pageProxy.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setCanvasSize({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) });

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable.");
        context.setTransform(ratio, 0, 0, ratio, 0, 0);

        const renderTask = pageProxy.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (cancelled) return;

        const textContent = await pageProxy.getTextContent();
        const items = (textContent.items ?? []) as Array<any>;
        const matchedIndexes = findMatchedItemIndexes(items, highlightText);
        const boxes = items.flatMap((item, index) => {
          if (!matchedIndexes.has(index)) return [];
          const box = getTextItemBox(pdfjs, viewport, item, index);
          return box ? [box] : [];
        });

        setHighlightBoxes(boxes);
        setMatched(candidateTexts(highlightText).length > 0 ? boxes.length > 0 : null);
      } catch (error: any) {
        if (error?.name === "RenderingCancelledException") return;
        const message = error instanceof Error ? error.message : "Could not render PDF page.";
        setRenderError(message);
        onFatalError?.(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
    };
  }, [pdfjs, pageNumber, highlightText, onFatalError]);

  const canGoPrev = pageNumber > 1;
  const canGoNext = pageCount ? pageNumber < pageCount : false;

  return (
    <div className="flex h-full min-h-[18rem] flex-col rounded-2xl border border-border bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="text-xs font-semibold text-muted-foreground">
          Page <span className="text-foreground">{pageNumber}</span>{pageCount ? ` / ${pageCount}` : ""}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
            disabled={!canGoPrev}
            className={cn(
              "inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-semibold",
              canGoPrev ? "bg-background text-foreground hover:bg-secondary/50" : "cursor-not-allowed bg-secondary text-muted-foreground"
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <button
            type="button"
            onClick={() => setPageNumber(safeTargetPage)}
            disabled={pageNumber === safeTargetPage}
            className={cn(
              "inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-semibold",
              pageNumber === safeTargetPage ? "cursor-not-allowed bg-secondary text-muted-foreground" : "bg-background text-foreground hover:bg-secondary/50"
            )}
          >
            <LocateFixed className="h-3.5 w-3.5" /> Source page
          </button>
          <button
            type="button"
            onClick={() => setPageNumber((value) => Math.min(pageCount ?? value + 1, value + 1))}
            disabled={!canGoNext}
            className={cn(
              "inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-semibold",
              canGoNext ? "bg-background text-foreground hover:bg-secondary/50" : "cursor-not-allowed bg-secondary text-muted-foreground"
            )}
          >
            Next <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div ref={shellRef} className="relative min-h-0 flex-1 overflow-auto p-3">
        {loading ? (
          <div className="absolute inset-0 z-20 grid place-items-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">Rendering PDF...</p>
            </div>
          </div>
        ) : null}

        {renderError ? (
          <div className="grid h-full min-h-[18rem] place-items-center text-center">
            <div>
              <p className="text-sm font-semibold text-foreground">Could not render highlighted PDF</p>
              <p className="mt-1 text-xs text-muted-foreground">{renderError}</p>
            </div>
          </div>
        ) : (
          <div
            className="relative mx-auto bg-white shadow-sm"
            style={{ width: canvasSize.width || undefined, height: canvasSize.height || undefined }}
          >
            <canvas ref={canvasRef} className="block" />
            {highlightBoxes.map((box) => (
              <div
                key={box.id}
                className="pointer-events-none absolute rounded-[3px] bg-yellow-300/55 ring-1 ring-yellow-500/30"
                style={{
                  left: box.left,
                  top: box.top,
                  width: box.width,
                  height: box.height,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {matched === false ? (
        <div className="shrink-0 border-t border-border px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          Couldn't locate the exact text on this page, but this is still the source page to review.
        </div>
      ) : matched === true ? (
        <div className="shrink-0 border-t border-border px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Highlighted the closest matching source text.
        </div>
      ) : null}
    </div>
  );
}
