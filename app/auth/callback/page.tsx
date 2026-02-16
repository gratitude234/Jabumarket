"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/me";

  useEffect(() => {
    (async () => {
      // This ensures Supabase picks up the session from the magic-link redirect
      await supabase.auth.getSession();
      router.replace(next);
    })();
  }, [router, next]);

  return (
    <div className="max-w-md space-y-2">
      <h1 className="text-lg font-semibold">Signing you in…</h1>
      <p className="text-sm text-zinc-600">Please wait.</p>
    </div>
  );
}
