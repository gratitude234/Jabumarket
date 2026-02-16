"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function CallbackClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const [status, setStatus] = useState("Signing you in…");

  const next = useMemo(() => {
    const raw = sp.get("next") ?? "/me";
    // prevent open-redirects
    if (!raw.startsWith("/")) return "/me";
    return raw;
  }, [sp]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Covers magic-link/session-in-url flows
        await supabase.auth.getSession();

        // If you're using OAuth code flow, this will finalize the session.
        const code = sp.get("code");
        if (code && (supabase.auth as any).exchangeCodeForSession) {
          // exchangeCodeForSession exists in newer supabase-js
          const { error } = await (supabase.auth as any).exchangeCodeForSession(code);
          if (error) throw error;
        }

        if (!cancelled) {
          setStatus("Redirecting…");
          router.replace(next);
        }
      } catch (e: any) {
        if (!cancelled) {
          setStatus(`Sign-in failed${e?.message ? `: ${e.message}` : "."}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, next, sp]);

  return (
    <div className="max-w-md space-y-2">
      <h1 className="text-lg font-semibold">{status}</h1>
      <p className="text-sm text-zinc-600">Please wait.</p>
    </div>
  );
}
