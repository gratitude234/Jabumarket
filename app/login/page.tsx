"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const redirectTo = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Login</h1>
      <p className="text-sm text-zinc-600">
        Enter your email. We’ll send you a magic link to sign in.
      </p>

      {msg ? <div className="rounded-2xl border bg-white p-3 text-sm text-red-600">{msg}</div> : null}

      {sent ? (
        <div className="rounded-2xl border bg-white p-4 space-y-2">
          <p className="text-sm font-medium">Check your email 📩</p>
          <p className="text-sm text-zinc-600">
            Open the magic link to finish signing in.
          </p>
          <button
            onClick={() => router.push("/")}
            className="rounded-xl bg-black px-4 py-2 text-white text-sm"
          >
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
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-black px-4 py-3 text-white font-medium disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send magic link"}
          </button>
        </form>
      )}
    </div>
  );
}
