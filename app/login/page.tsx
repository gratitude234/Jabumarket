"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "password" | "magic";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/me";

  const [mode, setMode] = useState<Mode>("password");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function loginWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);
    if (error) return setMsg(error.message);
    router.replace(next);
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    setLoading(false);
    if (error) return setMsg(error.message);
    setSent(true);
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Login</h1>
        <p className="text-sm text-zinc-600">Sign in to manage your profile and listings.</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("password");
            setSent(false);
            setMsg(null);
          }}
          className={
            mode === "password"
              ? "rounded-xl bg-black px-3 py-2 text-sm text-white"
              : "rounded-xl border px-3 py-2 text-sm"
          }
        >
          Email + Password
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("magic");
            setSent(false);
            setMsg(null);
          }}
          className={
            mode === "magic"
              ? "rounded-xl bg-black px-3 py-2 text-sm text-white"
              : "rounded-xl border px-3 py-2 text-sm"
          }
        >
          Magic link
        </button>
      </div>

      {msg ? <div className="rounded-2xl border bg-white p-3 text-sm text-red-600">{msg}</div> : null}

      {mode === "password" ? (
        <form onSubmit={loginWithPassword} className="space-y-3">
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
              placeholder="Your password"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              required
              autoComplete="current-password"
              minLength={6}
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-black px-4 py-3 text-white font-medium disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Login"}
          </button>

          <p className="text-sm text-zinc-600">
            New here?{" "}
            <Link href="/signup" className="underline">
              Create an account
            </Link>
          </p>
        </form>
      ) : sent ? (
        <div className="rounded-2xl border bg-white p-4 space-y-2">
          <p className="text-sm font-medium">Check your email 📩</p>
          <p className="text-sm text-zinc-600">Open the magic link to finish signing in.</p>
          <button onClick={() => router.push("/")} className="rounded-xl bg-black px-4 py-2 text-white text-sm">
            Go Home
          </button>
        </div>
      ) : (
        <form onSubmit={sendMagicLink} className="space-y-3">
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

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-black px-4 py-3 text-white font-medium disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send magic link"}
          </button>

          <p className="text-sm text-zinc-600">
            Prefer password?{" "}
            <button type="button" className="underline" onClick={() => setMode("password")}
            >
              Use email + password
            </button>
          </p>
        </form>
      )}
    </div>
  );
}
