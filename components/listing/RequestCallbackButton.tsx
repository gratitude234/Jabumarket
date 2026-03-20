"use client";

import { useState } from "react";
import { Phone, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  vendorId: string;
  listingId: string;
  listingTitle?: string;
}

export default function RequestCallbackButton({ vendorId, listingId }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function handleRequest() {
    if (state !== "idle") return;
    setState("loading");
    setErrMsg(null);
    try {
      const res = await fetch("/api/marketplace/request-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_id: vendorId, listing_id: listingId }),
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        setState("error");
        setErrMsg(json.message ?? "Couldn't send request. Try messaging instead.");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setErrMsg("Couldn't send request. Try messaging instead.");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleRequest}
        disabled={state === "loading" || state === "done"}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
          state === "done"
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 cursor-not-allowed"
            : state === "loading"
            ? "border-zinc-200 bg-zinc-50 text-zinc-400 cursor-not-allowed"
            : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
        )}
      >
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "done" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Phone className="h-4 w-4" />
        )}
        {state === "loading"
          ? "Requesting..."
          : state === "done"
          ? "Callback requested ✓"
          : "Request a callback"}
      </button>
      {state === "error" && errMsg ? (
        <p className="text-center text-xs text-red-500">{errMsg}</p>
      ) : null}
    </div>
  );
}
