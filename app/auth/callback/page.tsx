"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      // This ensures Supabase picks up the session from the magic-link redirect
      await supabase.auth.getSession();
      router.replace("/me");
    })();
  }, [router]);

  return (
    <div className="max-w-md space-y-2">
      <h1 className="text-lg font-semibold">Signing you in…</h1>
      <p className="text-sm text-zinc-600">Please wait.</p>
    </div>
  );
}
