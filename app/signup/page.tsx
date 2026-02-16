"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/me";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setNeedsEmailConfirm(false);
    setLoading(true);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectTo },
    });

    setLoading(false);

    if (error) return setMsg(error.message);

    // If email confirmations are enabled, Supabase may not create a session immediately.
    if (!data.session) {
      setNeedsEmailConfirm(true);
      return;
    }

    router.replace(next);
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Create account</h1>
        <p className="text-sm text-zinc-600">Sign up to post listings and manage your vendor profile.</p>
      </div>

      {msg ? <div className="rounded-2xl border bg-white p-3 text-sm text-red-600">{msg}</div> : null}

      {needsEmailConfirm ? (
        <div className="rounded-2xl border bg-white p-4 space-y-2">
          <p className="text-sm font-medium">Check your email 📩</p>
          <p className="text-sm text-zinc-600">We sent a confirmation link. Open it to finish creating your account.</p>
          <Link href="/login" className="inline-block rounded-xl bg-black px-4 py-2 text-white text-sm no-underline">
            Go to login
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-zinc-600">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@school.com"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-600">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="At least 6 characters"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              required
              autoComplete="new-password"
              minLength={6}
            />
            <p className="mt-1 text-xs text-zinc-500">Use something you can remember. Don’t share it.</p>
          </div>

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-black px-4 py-3 text-white font-medium disabled:opacity-60"
          >
            {loading ? "Creating..." : "Sign up"}
          </button>

          <p className="text-sm text-zinc-600">
            Already have an account?{" "}
            <Link href="/login" className="underline">
              Login
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
