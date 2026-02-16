import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md space-y-2">
          <h1 className="text-xl font-semibold">Login</h1>
          <p className="text-sm text-zinc-600">Loading…</p>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
