import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold">Signing you in…</h1>
          <p className="text-sm text-zinc-600">Please wait.</p>
        </div>
      }
    >
      <CallbackClient />
    </Suspense>
  );
}
